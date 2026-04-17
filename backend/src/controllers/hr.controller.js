import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { AttendanceLog } from '../models/attendance-log.model.js'
import { EmployeeRecord } from '../models/employee-record.model.js'
import { LeaveRequest } from '../models/leave-request.model.js'
import { hrService } from '../services/hr.service.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

/* ── validation schemas ──────────────────────────────────────── */

const leaveApplySchema = z.object({
  employee: z.string().min(1),
  leaveType: z.enum(['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid', 'compensatory']),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional(),
})

const leaveProcessSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
})

const attendanceMarkSchema = z.object({
  employee: z.string().min(1),
  date: z.string().min(1),
  status: z.enum(['present', 'absent', 'half-day', 'late', 'on-leave', 'holiday']).optional(),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  remarks: z.string().optional(),
})

const attendanceBulkSchema = z.object({
  date: z.string().min(1),
  entries: z.array(
    z.object({
      employee: z.string().min(1),
      status: z.enum(['present', 'absent', 'half-day', 'late', 'on-leave', 'holiday']),
      checkIn: z.string().optional().nullable(),
      checkOut: z.string().optional().nullable(),
      remarks: z.string().optional(),
    }),
  ),
})

const attendanceCorrectionSchema = z.object({
  field: z.enum(['checkIn', 'checkOut', 'status', 'hoursWorked']),
  newValue: z.union([z.string(), z.number()]),
  reason: z.string().min(1),
})

/* ── controller ──────────────────────────────────────────────── */

export const hrController = {
  /* ── leave endpoints ──────────────────────────── */

  listLeaves: asyncHandler(async (req, res) => {
    const { status: leaveStatus, employee } = req.query
    const filter = companyFilter(req.user)
    if (leaveStatus) filter.status = leaveStatus
    if (employee) filter.employee = employee
    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 })
    logger.info('hr.leaves_fetched', { count: leaves.length, companyId: req.user.companyId.toString() })
    res.json({ success: true, data: leaves })
  }),

  applyLeave: asyncHandler(async (req, res) => {
    const payload = leaveApplySchema.parse(req.body)
    const io = req.app.get('io')
    const leave = await hrService.applyLeave({
      companyId: req.user.companyId,
      employee: payload.employee,
      leaveType: payload.leaveType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      reason: payload.reason,
      user: req.user,
      io,
    })
    res.status(201).json({ success: true, data: leave })
  }),

  processLeave: asyncHandler(async (req, res) => {
    const payload = leaveProcessSchema.parse(req.body)
    const io = req.app.get('io')
    const leave = await hrService.processLeave({
      companyId: req.user.companyId,
      leaveId: req.params.id,
      action: payload.action,
      rejectionReason: payload.rejectionReason,
      user: req.user,
      io,
    })
    res.json({ success: true, data: leave })
  }),

  cancelLeave: asyncHandler(async (req, res) => {
    const io = req.app.get('io')
    const leave = await hrService.cancelLeave({
      companyId: req.user.companyId,
      leaveId: req.params.id,
      user: req.user,
      io,
    })
    res.json({ success: true, data: leave })
  }),

  /* ── attendance endpoints ─────────────────────── */

  listAttendance: asyncHandler(async (req, res) => {
    const { date, employee } = req.query
    const filter = companyFilter(req.user)
    if (employee) filter.employee = employee
    if (date) {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      filter.date = { $gte: d, $lt: next }
    }
    const logs = await AttendanceLog.find(filter).sort({ date: -1, employeeName: 1 })
    logger.info('hr.attendance_fetched', { count: logs.length, companyId: req.user.companyId.toString() })
    res.json({ success: true, data: logs })
  }),

  markAttendance: asyncHandler(async (req, res) => {
    const payload = attendanceMarkSchema.parse(req.body)
    const io = req.app.get('io')
    const record = await hrService.markAttendance({
      companyId: req.user.companyId,
      employee: payload.employee,
      date: payload.date,
      status: payload.status,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      remarks: payload.remarks,
      user: req.user,
      io,
    })
    res.status(201).json({ success: true, data: record })
  }),

  bulkMarkAttendance: asyncHandler(async (req, res) => {
    const payload = attendanceBulkSchema.parse(req.body)
    const io = req.app.get('io')
    const results = []
    for (const entry of payload.entries) {
      const record = await hrService.markAttendance({
        companyId: req.user.companyId,
        employee: entry.employee,
        date: payload.date,
        status: entry.status,
        checkIn: entry.checkIn,
        checkOut: entry.checkOut,
        remarks: entry.remarks,
        user: req.user,
        io,
      })
      results.push(record)
    }
    res.status(201).json({ success: true, data: results })
  }),

  correctAttendance: asyncHandler(async (req, res) => {
    const payload = attendanceCorrectionSchema.parse(req.body)
    const io = req.app.get('io')
    const record = await hrService.correctAttendance({
      companyId: req.user.companyId,
      attendanceId: req.params.id,
      field: payload.field,
      newValue: payload.newValue,
      reason: payload.reason,
      user: req.user,
      io,
    })
    res.json({ success: true, data: record })
  }),

  /* ── payroll ──────────────────────────────────── */

  getPayroll: asyncHandler(async (req, res) => {
    const summary = await hrService.getPayrollSummary(req.user.companyId)
    res.json({ success: true, data: summary })
  }),

  /* ── HR dashboard stats ───────────────────────── */

  getHrStats: asyncHandler(async (req, res) => {
    const stats = await hrService.getHrStats(req.user.companyId)
    res.json({ success: true, data: stats })
  }),
}
