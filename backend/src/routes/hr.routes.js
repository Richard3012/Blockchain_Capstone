import { Router } from 'express'

import { hrController } from '../controllers/hr.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.use(requireAuth)

// Leave management
router.get('/leaves', hrController.listLeaves)
router.post('/leaves', hrController.applyLeave)
router.patch('/leaves/:id/process', hrController.processLeave)
router.patch('/leaves/:id/cancel', hrController.cancelLeave)

// Attendance
router.get('/attendance', hrController.listAttendance)
router.post('/attendance', hrController.markAttendance)
router.post('/attendance/bulk', hrController.bulkMarkAttendance)
router.patch('/attendance/:id/correct', hrController.correctAttendance)

// Payroll
router.get('/payroll', hrController.getPayroll)

// HR stats
router.get('/stats', hrController.getHrStats)

export default router
