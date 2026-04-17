import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { LeaveRequest } from '../backend/src/models/leave-request.model.js'
import { AttendanceLog } from '../backend/src/models/attendance-log.model.js'
import { EmployeeRecord } from '../backend/src/models/employee-record.model.js'

let mongoServer

before(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

after(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('HR Models', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  let employeeId

  it('should create an employee record', async () => {
    const emp = await EmployeeRecord.create({
      companyId,
      employeeNumber: 'EMP-0001',
      name: 'Alice Johnson',
      dept: 'IT',
      roleTitle: 'Software Engineer',
      shift: 'Day',
      status: 'active',
      salary: 75000,
    })
    employeeId = emp._id
    assert.equal(emp.name, 'Alice Johnson')
    assert.equal(emp.attendance, 0)
    // Ensure indexes are built before the uniqueness test
    await EmployeeRecord.ensureIndexes()
  })

  it('should enforce unique companyId + employeeNumber', async () => {
    await assert.rejects(
      () =>
        EmployeeRecord.create({
          companyId,
          employeeNumber: 'EMP-0001',
          name: 'Duplicate',
          dept: 'IT',
          roleTitle: 'Tester',
          salary: 50000,
        }),
      (err) => err.code === 11000,
    )
  })

  it('should create a leave request', async () => {
    const leave = await LeaveRequest.create({
      companyId,
      leaveNumber: 'LV-0001',
      employee: employeeId,
      employeeName: 'Alice Johnson',
      leaveType: 'casual',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-03'),
      days: 3,
      reason: 'Personal',
      status: 'pending',
      appliedBy: userId,
    })
    assert.equal(leave.status, 'pending')
    assert.equal(leave.days, 3)
    assert.equal(leave.version, 0)
  })

  it('should reject invalid leave type', async () => {
    await assert.rejects(
      () =>
        LeaveRequest.create({
          companyId,
          leaveNumber: 'LV-0002',
          employee: employeeId,
          employeeName: 'Alice Johnson',
          leaveType: 'invalid_type',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2026-04-03'),
          days: 3,
          appliedBy: userId,
        }),
      (err) => err.name === 'ValidationError',
    )
  })

  it('should create an attendance log', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const log = await AttendanceLog.create({
      companyId,
      employee: employeeId,
      employeeName: 'Alice Johnson',
      date: today,
      checkIn: new Date(today.getTime() + 9 * 3600000),
      checkOut: new Date(today.getTime() + 17.5 * 3600000),
      status: 'present',
      hoursWorked: 8.5,
      overtimeHours: 0.5,
      markedBy: userId,
    })
    assert.equal(log.status, 'present')
    assert.equal(log.hoursWorked, 8.5)
    assert.equal(log.overtimeHours, 0.5)
  })

  it('should enforce unique attendance per employee per date', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await assert.rejects(
      () =>
        AttendanceLog.create({
          companyId,
          employee: employeeId,
          employeeName: 'Alice Johnson',
          date: today,
          status: 'present',
          markedBy: userId,
        }),
      (err) => err.code === 11000,
    )
  })

  it('should track corrections in attendance log', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const log = await AttendanceLog.findOne({ companyId, employee: employeeId, date: today })
    log.corrections.push({
      field: 'checkOut',
      oldValue: log.checkOut,
      newValue: new Date(today.getTime() + 18 * 3600000),
      editedBy: userId,
      editedByName: 'Admin',
      reason: 'Forgot to log out on time',
    })
    log.checkOut = new Date(today.getTime() + 18 * 3600000)
    log.hoursWorked = 9
    log.overtimeHours = 1
    await log.save()

    const updated = await AttendanceLog.findById(log._id)
    assert.equal(updated.corrections.length, 1)
    assert.equal(updated.corrections[0].field, 'checkOut')
    assert.equal(updated.hoursWorked, 9)
  })

  it('should approve a leave request with optimistic locking', async () => {
    const leave = await LeaveRequest.findOne({ leaveNumber: 'LV-0001', companyId })
    const currentVersion = leave.version

    const updated = await LeaveRequest.findOneAndUpdate(
      { _id: leave._id, version: currentVersion },
      { status: 'approved', approvedBy: userId, approverName: 'Admin', version: currentVersion + 1 },
      { new: true },
    )
    assert.equal(updated.status, 'approved')
    assert.equal(updated.version, 1)

    // Simulate concurrent update — should fail
    const stale = await LeaveRequest.findOneAndUpdate(
      { _id: leave._id, version: currentVersion },
      { status: 'rejected', version: currentVersion + 1 },
      { new: true },
    )
    assert.equal(stale, null)
  })
})
