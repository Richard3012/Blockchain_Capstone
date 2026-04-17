import { AttendanceLog } from '../models/attendance-log.model.js'
import { EmployeeRecord } from '../models/employee-record.model.js'
import { LeaveRequest } from '../models/leave-request.model.js'
import { auditService } from './audit.service.js'
import { blockchainService } from './blockchain.service.js'
import { hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

/* ── helpers ─────────────────────────────────────────────────── */

const businessDays = (start, end) => {
  let count = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count || 1
}

const emitHr = (io, event, payload) => {
  if (io) io.emit(`hr:${event}`, { ...payload, timestamp: new Date().toISOString() })
}

/* ── leave management ────────────────────────────────────────── */

const applyLeave = async ({ companyId, employee, leaveType, startDate, endDate, reason, user, io }) => {
  const emp = await EmployeeRecord.findOne({ _id: employee, companyId })
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) throw Object.assign(new Error('End date must be on or after start date'), { statusCode: 400 })

  const days = businessDays(start, end)

  // Check for overlapping approved/pending leave
  const overlap = await LeaveRequest.findOne({
    employee,
    companyId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: end }, endDate: { $gte: start } },
    ],
  })
  if (overlap) throw Object.assign(new Error('Overlapping leave request exists'), { statusCode: 409 })

  const latest = await LeaveRequest.findOne({ companyId }).sort({ createdAt: -1 }).select('leaveNumber')
  const match = String(latest?.leaveNumber || '').match(/(\d+)$/)
  const next = match ? Number(match[1]) + 1 : 1
  const leaveNumber = `LV-${String(next).padStart(4, '0')}`

  const leave = await LeaveRequest.create({
    companyId,
    leaveNumber,
    employee,
    employeeName: emp.name,
    leaveType,
    startDate: start,
    endDate: end,
    days,
    reason: reason || '',
    status: 'pending',
    appliedBy: user._id,
    version: 0,
  })

  await auditService.record({
    companyId,
    action: 'leave_applied',
    entityType: 'leave_request',
    entityId: leave._id.toString(),
    summary: `${emp.name} applied for ${days} day(s) ${leaveType} leave`,
    actor: user._id,
    metadata: { leaveNumber, leaveType, days },
  })

  emitHr(io, 'leave:applied', { leave })
  logger.info('hr.leave_applied', { leaveNumber, employee: emp.name })
  return leave
}

const processLeave = async ({ companyId, leaveId, action, rejectionReason, user, io }) => {
  const leave = await LeaveRequest.findOne({ _id: leaveId, companyId })
  if (!leave) throw Object.assign(new Error('Leave request not found'), { statusCode: 404 })
  if (leave.status !== 'pending') throw Object.assign(new Error(`Cannot ${action} a ${leave.status} request`), { statusCode: 400 })

  // Optimistic locking
  const current = leave.version
  leave.status = action // 'approved' or 'rejected'
  leave.approvedBy = user._id
  leave.approverName = user.name
  if (action === 'rejected') leave.rejectionReason = rejectionReason || ''
  leave.version = current + 1

  const saved = await LeaveRequest.findOneAndUpdate(
    { _id: leaveId, version: current },
    {
      status: leave.status,
      approvedBy: leave.approvedBy,
      approverName: leave.approverName,
      rejectionReason: leave.rejectionReason,
      version: leave.version,
    },
    { new: true },
  )
  if (!saved) throw Object.assign(new Error('Concurrent update detected, please retry'), { statusCode: 409 })

  // If approved, update employee status
  if (action === 'approved') {
    const now = new Date()
    const leaveStart = new Date(saved.startDate)
    const leaveEnd = new Date(saved.endDate)
    if (now >= leaveStart && now <= leaveEnd) {
      await EmployeeRecord.findByIdAndUpdate(saved.employee, { status: 'on-leave' })
    }
  }

  // Blockchain anchor for leave decisions
  const recordHash = hashRecord({
    action: `leave_${action}`,
    leaveNumber: saved.leaveNumber,
    employee: saved.employee.toString(),
    days: saved.days,
    leaveType: saved.leaveType,
  })
  blockchainService
    .anchorRecord({
      companyId,
      entityType: 'leave_request',
      entityId: saved._id.toString(),
      recordHash,
      ipfsCid: '',
      requestedBy: user._id,
    })
    .catch((err) => logger.warn('hr.blockchain_anchor_failed', { error: err.message }))

  await auditService.record({
    companyId,
    action: `leave_${action}`,
    entityType: 'leave_request',
    entityId: saved._id.toString(),
    summary: `${saved.employeeName}'s ${saved.leaveType} leave ${action} by ${user.name}`,
    actor: user._id,
    metadata: { leaveNumber: saved.leaveNumber, action, days: saved.days },
  })

  emitHr(io, `leave:${action}`, { leave: saved })
  logger.info(`hr.leave_${action}`, { leaveNumber: saved.leaveNumber, by: user.name })
  return saved
}

const cancelLeave = async ({ companyId, leaveId, user, io }) => {
  const leave = await LeaveRequest.findOne({ _id: leaveId, companyId })
  if (!leave) throw Object.assign(new Error('Leave request not found'), { statusCode: 404 })
  if (!['pending', 'approved'].includes(leave.status)) {
    throw Object.assign(new Error('Only pending or approved leave can be cancelled'), { statusCode: 400 })
  }

  leave.status = 'cancelled'
  leave.version += 1
  await leave.save()

  // Restore employee status if the employee was on-leave because of this leave
  const otherActive = await LeaveRequest.findOne({
    employee: leave.employee,
    companyId,
    status: 'approved',
    _id: { $ne: leave._id },
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  })
  if (!otherActive) {
    await EmployeeRecord.findByIdAndUpdate(leave.employee, { status: 'active' })
  }

  await auditService.record({
    companyId,
    action: 'leave_cancelled',
    entityType: 'leave_request',
    entityId: leave._id.toString(),
    summary: `${leave.employeeName}'s leave ${leave.leaveNumber} cancelled`,
    actor: user._id,
    metadata: { leaveNumber: leave.leaveNumber },
  })

  emitHr(io, 'leave:cancelled', { leave })
  logger.info('hr.leave_cancelled', { leaveNumber: leave.leaveNumber })
  return leave
}

/* ── attendance ───────────────────────────────────────────────── */

const markAttendance = async ({ companyId, employee, date, status, checkIn, checkOut, remarks, user, io }) => {
  const emp = await EmployeeRecord.findOne({ _id: employee, companyId })
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 })

  const attendanceDate = new Date(date)
  attendanceDate.setHours(0, 0, 0, 0)

  let hoursWorked = 0
  if (checkIn && checkOut) {
    hoursWorked = Math.round(((new Date(checkOut) - new Date(checkIn)) / 3600000) * 100) / 100
  }
  const overtimeHours = Math.max(0, hoursWorked - 8)

  const record = await AttendanceLog.findOneAndUpdate(
    { companyId, employee, date: attendanceDate },
    {
      $set: {
        employeeName: emp.name,
        status: status || 'present',
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        hoursWorked,
        overtimeHours,
        remarks: remarks || '',
        markedBy: user._id,
      },
      $setOnInsert: { companyId, employee, date: attendanceDate },
    },
    { upsert: true, new: true, runValidators: true },
  )

  // Recalculate employee attendance percentage
  await recalcAttendance(companyId, employee)

  emitHr(io, 'attendance:marked', { attendance: record })
  logger.info('hr.attendance_marked', { employee: emp.name, date: attendanceDate.toISOString(), status: record.status })
  return record
}

const correctAttendance = async ({ companyId, attendanceId, field, newValue, reason, user, io }) => {
  const record = await AttendanceLog.findOne({ _id: attendanceId, companyId })
  if (!record) throw Object.assign(new Error('Attendance record not found'), { statusCode: 404 })

  const oldValue = record[field]
  record[field] = newValue
  record.corrections.push({
    field,
    oldValue,
    newValue,
    editedBy: user._id,
    editedByName: user.name,
    editedAt: new Date(),
    reason: reason || '',
  })

  if (field === 'checkIn' || field === 'checkOut') {
    const cin = field === 'checkIn' ? new Date(newValue) : record.checkIn
    const cout = field === 'checkOut' ? new Date(newValue) : record.checkOut
    if (cin && cout) {
      record.hoursWorked = Math.round(((cout - cin) / 3600000) * 100) / 100
      record.overtimeHours = Math.max(0, record.hoursWorked - 8)
    }
  }
  await record.save()

  // Blockchain anchor for corrections
  const recordHash = hashRecord({
    action: 'attendance_correction',
    attendanceId: record._id.toString(),
    field,
    oldValue,
    newValue,
  })
  blockchainService
    .anchorRecord({
      companyId,
      entityType: 'attendance_log',
      entityId: record._id.toString(),
      recordHash,
      ipfsCid: '',
      requestedBy: user._id,
    })
    .catch((err) => logger.warn('hr.blockchain_anchor_failed', { error: err.message }))

  await auditService.record({
    companyId,
    action: 'attendance_corrected',
    entityType: 'attendance_log',
    entityId: record._id.toString(),
    summary: `Attendance corrected for ${record.employeeName}: ${field} changed by ${user.name}`,
    actor: user._id,
    metadata: { field, oldValue, newValue, reason },
  })

  await recalcAttendance(companyId, record.employee)
  emitHr(io, 'attendance:corrected', { attendance: record })
  logger.info('hr.attendance_corrected', { attendanceId: record._id.toString(), field, by: user.name })
  return record
}

const recalcAttendance = async (companyId, employeeId) => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const logs = await AttendanceLog.find({
    companyId,
    employee: employeeId,
    date: { $gte: thirtyDaysAgo },
  })

  const total = logs.length || 1
  const present = logs.filter((l) => ['present', 'late', 'half-day'].includes(l.status)).length
  const halfDays = logs.filter((l) => l.status === 'half-day').length
  const pct = Math.round(((present - halfDays * 0.5) / total) * 100)

  await EmployeeRecord.findByIdAndUpdate(employeeId, { attendance: Math.min(100, Math.max(0, pct)) })
}

/* ── payroll summary ──────────────────────────────────────────── */

const getPayrollSummary = async (companyId) => {
  const employees = await EmployeeRecord.find({ companyId })
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const attendanceLogs = await AttendanceLog.find({
    companyId,
    date: { $gte: thirtyDaysAgo },
  })

  const logsByEmployee = {}
  for (const log of attendanceLogs) {
    const eid = log.employee.toString()
    if (!logsByEmployee[eid]) logsByEmployee[eid] = []
    logsByEmployee[eid].push(log)
  }

  return employees.map((emp) => {
    const logs = logsByEmployee[emp._id.toString()] || []
    const presentDays = logs.filter((l) => ['present', 'late'].includes(l.status)).length
    const halfDays = logs.filter((l) => l.status === 'half-day').length
    const totalOT = logs.reduce((s, l) => s + (l.overtimeHours || 0), 0)
    const effectiveDays = presentDays + halfDays * 0.5
    const workingDays = 22 // standard monthly working days
    const basePay = Math.round((emp.salary / workingDays) * effectiveDays)
    const otPay = Math.round((emp.salary / workingDays / 8) * 1.5 * totalOT)
    const deductions = emp.status === 'on-leave' ? Math.round(emp.salary * 0.05) : 0

    return {
      employeeId: emp._id,
      employeeNumber: emp.employeeNumber,
      name: emp.name,
      dept: emp.dept,
      baseSalary: emp.salary,
      presentDays,
      halfDays,
      effectiveDays,
      overtimeHours: totalOT,
      basePay,
      overtimePay: otPay,
      deductions,
      netPay: basePay + otPay - deductions,
    }
  })
}

/* ── dashboard stats ──────────────────────────────────────────── */

const getHrStats = async (companyId) => {
  const [totalEmployees, activeCount, onLeaveCount, pendingLeaves, todayAttendance] = await Promise.all([
    EmployeeRecord.countDocuments({ companyId }),
    EmployeeRecord.countDocuments({ companyId, status: 'active' }),
    EmployeeRecord.countDocuments({ companyId, status: 'on-leave' }),
    LeaveRequest.countDocuments({ companyId, status: 'pending' }),
    (() => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return AttendanceLog.countDocuments({ companyId, date: today, status: { $in: ['present', 'late'] } })
    })(),
  ])

  const totalPayroll = await EmployeeRecord.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, total: { $sum: '$salary' } } },
  ])

  return {
    totalEmployees,
    activeCount,
    onLeaveCount,
    pendingLeaves,
    todayAttendance,
    totalPayroll: totalPayroll[0]?.total || 0,
  }
}

export const hrService = {
  applyLeave,
  processLeave,
  cancelLeave,
  markAttendance,
  correctAttendance,
  recalcAttendance,
  getPayrollSummary,
  getHrStats,
}
