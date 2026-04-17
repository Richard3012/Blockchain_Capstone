import { useCallback, useEffect, useMemo, useState } from 'react'
import io from 'socket.io-client'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000'
const DEPARTMENTS = ['All', 'Warehouse', 'Logistics', 'Finance', 'Sales', 'IT', 'Admin', 'HR']
const SHIFTS = ['Day', 'Night', 'Rotational']
const LEAVE_TYPES = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid', 'compensatory']
const ATTENDANCE_STATUSES = ['present', 'absent', 'half-day', 'late', 'on-leave', 'holiday']
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

const TAB_KEYS = ['employees', 'leaves', 'attendance', 'payroll']
const TAB_LABELS = { employees: 'Employees', leaves: 'Leave Management', attendance: 'Attendance', payroll: 'Payroll' }

const Badge = ({ color, children, onClick }) => {
  const colors = {
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    purple: 'bg-purple-100 text-purple-700',
  }
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {children}
    </span>
  )
}

const statusColor = (s) => ({ active: 'green', 'on-leave': 'orange', pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray' })[s] || 'gray'
const attendanceColor = (s) => ({ present: 'green', absent: 'red', 'half-day': 'orange', late: 'yellow', 'on-leave': 'indigo', holiday: 'purple' })[s] || 'gray'

export default function HRManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)

  const [activeTab, setActiveTab] = useState('employees')

  // ── employees state ───────────────────────────
  const [employees, setEmployees] = useState([])
  const [deptFilter, setDeptFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', dept: 'Warehouse', roleTitle: '', shift: 'Day', status: 'active', salary: '' })

  // ── leaves state ──────────────────────────────
  const [leaves, setLeaves] = useState([])
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all')
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ employee: '', leaveType: 'casual', startDate: '', endDate: '', reason: '' })
  const [leaveLoading, setLeaveLoading] = useState(false)

  // ── attendance state ──────────────────────────
  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10))
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [attendanceForm, setAttendanceForm] = useState({ employee: '', date: '', status: 'present', checkIn: '', checkOut: '', remarks: '' })
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [correctionForm, setCorrectionForm] = useState({ field: 'checkIn', newValue: '', reason: '' })
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // ── payroll state ─────────────────────────────
  const [payrollData, setPayrollData] = useState([])
  const [payrollLoading, setPayrollLoading] = useState(false)

  // ── HR stats ──────────────────────────────────
  const [hrStats, setHrStats] = useState({})

  /* ── data fetchers ──────────────────────────────── */

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/employees')
      setEmployees(Array.isArray(rows) ? rows : [])
    } catch (error) { addToast(error.message, 'error') }
    finally { setLoading(false) }
  }, [addToast])

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true)
    try {
      const rows = await apiClient.get('/hr/leaves')
      setLeaves(Array.isArray(rows) ? rows : [])
    } catch (error) { addToast(error.message, 'error') }
    finally { setLeaveLoading(false) }
  }, [addToast])

  const loadAttendance = useCallback(async () => {
    setAttendanceLoading(true)
    try {
      const rows = await apiClient.get(`/hr/attendance?date=${attendanceDate}`)
      setAttendanceLogs(Array.isArray(rows) ? rows : [])
    } catch (error) { addToast(error.message, 'error') }
    finally { setAttendanceLoading(false) }
  }, [addToast, attendanceDate])

  const loadPayroll = useCallback(async () => {
    setPayrollLoading(true)
    try {
      const rows = await apiClient.get('/hr/payroll')
      setPayrollData(Array.isArray(rows) ? rows : [])
    } catch (error) { addToast(error.message, 'error') }
    finally { setPayrollLoading(false) }
  }, [addToast])

  const loadHrStats = useCallback(async () => {
    try {
      const stats = await apiClient.get('/hr/stats')
      if (stats) setHrStats(stats)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { loadEmployees(); loadHrStats() }, [loadEmployees, loadHrStats])
  useEffect(() => { if (activeTab === 'leaves') loadLeaves() }, [activeTab, loadLeaves])
  useEffect(() => { if (activeTab === 'attendance') loadAttendance() }, [activeTab, loadAttendance])
  useEffect(() => { if (activeTab === 'payroll') loadPayroll() }, [activeTab, loadPayroll])

  /* ── Socket.IO real-time ────────────────────────── */

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })

    socket.on('hr:leave:applied', () => { loadLeaves(); loadHrStats() })
    socket.on('hr:leave:approved', () => { loadLeaves(); loadEmployees(); loadHrStats() })
    socket.on('hr:leave:rejected', () => { loadLeaves(); loadHrStats() })
    socket.on('hr:leave:cancelled', () => { loadLeaves(); loadEmployees(); loadHrStats() })
    socket.on('hr:attendance:marked', () => { loadAttendance(); loadEmployees() })
    socket.on('hr:attendance:corrected', () => { loadAttendance(); loadEmployees() })

    return () => socket.disconnect()
  }, [loadLeaves, loadEmployees, loadAttendance, loadHrStats])

  /* ── employee helpers ───────────────────────────── */

  const filtered = useMemo(() => {
    const query = (localSearch || searchQuery || '').toLowerCase()
    return employees.filter((e) => {
      if (deptFilter !== 'All' && e.dept !== deptFilter) return false
      return e.name?.toLowerCase().includes(query)
        || e.employeeNumber?.toLowerCase().includes(query)
        || e.roleTitle?.toLowerCase().includes(query)
    })
  }, [employees, deptFilter, localSearch, searchQuery])

  const totalPayroll = employees.reduce((s, e) => s + (e.salary || 0), 0)
  const activeCount = employees.filter((e) => e.status === 'active').length
  const avgAttendance = employees.length > 0 ? (employees.reduce((s, e) => s + (e.attendance || 0), 0) / employees.length).toFixed(1) : '0.0'

  const openAdd = () => { setEditing(null); setForm({ name: '', dept: 'Warehouse', roleTitle: '', shift: 'Day', status: 'active', salary: '' }); setShowModal(true) }
  const openEdit = (emp) => { setEditing(emp); setForm({ name: emp.name, dept: emp.dept, roleTitle: emp.roleTitle, shift: emp.shift, status: emp.status, salary: String(emp.salary || '') }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.roleTitle.trim() || !form.salary) { addToast('Fill all required fields', 'error'); return }
    setSaving(true)
    const payload = { name: form.name, dept: form.dept, roleTitle: form.roleTitle, shift: form.shift, status: form.status, salary: Number(form.salary) }
    try {
      if (editing) { await apiClient.patch(`/employees/${editing._id}`, payload); addToast('Employee updated', 'success') }
      else { await apiClient.post('/employees', payload); addToast('Employee added', 'success') }
      setShowModal(false); await loadEmployees(); loadHrStats()
    } catch (error) { addToast(error.message, 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this employee?')) return
    try { await apiClient.delete(`/employees/${id}`); addToast('Employee removed', 'success'); await loadEmployees(); loadHrStats() }
    catch (error) { addToast(error.message, 'error') }
  }

  const toggleStatus = async (emp) => {
    try { await apiClient.patch(`/employees/${emp._id}`, { status: emp.status === 'active' ? 'on-leave' : 'active' }); await loadEmployees(); loadHrStats() }
    catch (error) { addToast(error.message, 'error') }
  }

  /* ── leave helpers ──────────────────────────────── */

  const filteredLeaves = useMemo(() => {
    if (leaveStatusFilter === 'all') return leaves
    return leaves.filter((l) => l.status === leaveStatusFilter)
  }, [leaves, leaveStatusFilter])

  const handleLeaveApply = async () => {
    if (!leaveForm.employee || !leaveForm.startDate || !leaveForm.endDate) { addToast('Fill all required fields', 'error'); return }
    setSaving(true)
    try {
      await apiClient.post('/hr/leaves', leaveForm)
      addToast('Leave request submitted', 'success')
      setShowLeaveModal(false)
      await loadLeaves(); loadHrStats()
    } catch (error) { addToast(error.message, 'error') }
    finally { setSaving(false) }
  }

  const handleLeaveProcess = async (id, action) => {
    const rejectionReason = action === 'rejected' ? window.prompt('Rejection reason (optional):') : undefined
    try {
      await apiClient.patch(`/hr/leaves/${id}/process`, { action, rejectionReason: rejectionReason || '' })
      addToast(`Leave ${action}`, 'success')
      await loadLeaves(); loadEmployees(); loadHrStats()
    } catch (error) { addToast(error.message, 'error') }
  }

  const handleLeaveCancel = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return
    try {
      await apiClient.patch(`/hr/leaves/${id}/cancel`)
      addToast('Leave cancelled', 'success')
      await loadLeaves(); loadEmployees(); loadHrStats()
    } catch (error) { addToast(error.message, 'error') }
  }

  /* ── attendance helpers ─────────────────────────── */

  const handleMarkAttendance = async () => {
    if (!attendanceForm.employee || !attendanceForm.date) { addToast('Select employee and date', 'error'); return }
    setSaving(true)
    try {
      await apiClient.post('/hr/attendance', attendanceForm)
      addToast('Attendance marked', 'success')
      setShowAttendanceModal(false)
      await loadAttendance(); loadEmployees()
    } catch (error) { addToast(error.message, 'error') }
    finally { setSaving(false) }
  }

  const openCorrection = (log) => {
    setCorrectionTarget(log)
    setCorrectionForm({ field: 'checkIn', newValue: '', reason: '' })
    setShowCorrectionModal(true)
  }

  const handleCorrection = async () => {
    if (!correctionForm.reason.trim()) { addToast('Reason is required for corrections', 'error'); return }
    setSaving(true)
    try {
      await apiClient.patch(`/hr/attendance/${correctionTarget._id}/correct`, correctionForm)
      addToast('Attendance corrected', 'success')
      setShowCorrectionModal(false)
      await loadAttendance(); loadEmployees()
    } catch (error) { addToast(error.message, 'error') }
    finally { setSaving(false) }
  }

  /* ── render ─────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Human Resource Management</h1>
        <p className="text-text-secondary mt-1">Payroll, attendance, leave management, and workforce visibility — powered by MongoDB & blockchain audit.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { label: 'Total Employees', value: hrStats.totalEmployees ?? employees.length, sub: `${hrStats.activeCount ?? activeCount} active` },
          { label: 'Monthly Payroll', value: fmt(hrStats.totalPayroll ?? totalPayroll), sub: 'Gross salary' },
          { label: 'Avg Attendance', value: `${avgAttendance}%`, sub: 'Last 30 days' },
          { label: 'On Leave', value: hrStats.onLeaveCount ?? (employees.length - activeCount), sub: 'Currently' },
          { label: 'Pending Leaves', value: hrStats.pendingLeaves ?? 0, sub: 'Awaiting approval' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* ═══ EMPLOYEES TAB ═══ */}
      {activeTab === 'employees' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Search employees..." className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm" />
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">+ Add Employee</button>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading employees...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['ID', 'Name', 'Department', 'Role', 'Shift', 'Salary', 'Attendance', 'Status', 'Actions'].map((h) => (
                        <th key={h} className={`p-3 text-xs font-medium text-text-muted uppercase tracking-wide ${h === 'Salary' || h === 'Attendance' ? 'text-right' : h === 'Status' || h === 'Actions' ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((emp) => (
                      <tr key={emp._id} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-mono text-xs text-blue-600">{emp.employeeNumber}</td>
                        <td className="p-3 font-medium text-text-primary">{emp.name}</td>
                        <td className="p-3 text-text-secondary">{emp.dept}</td>
                        <td className="p-3 text-text-secondary">{emp.roleTitle}</td>
                        <td className="p-3">
                          <Badge color={emp.shift === 'Day' ? 'yellow' : emp.shift === 'Night' ? 'indigo' : 'gray'}>{emp.shift}</Badge>
                        </td>
                        <td className="p-3 text-right font-semibold text-text-primary">{fmt(emp.salary)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className={`h-full rounded-full ${(emp.attendance || 0) >= 95 ? 'bg-green-500' : (emp.attendance || 0) >= 90 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${emp.attendance || 0}%` }} />
                            </div>
                            <span className="text-xs font-medium">{emp.attendance || 0}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge color={statusColor(emp.status)} onClick={() => toggleStatus(emp)}>{emp.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                            <button onClick={() => handleDelete(emp._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <p className="text-center text-sm text-text-muted py-8">No employees match your search.</p>}
            </div>
          )}
        </>
      )}

      {/* ═══ LEAVE MANAGEMENT TAB ═══ */}
      {activeTab === 'leaves' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={leaveStatusFilter} onChange={(e) => setLeaveStatusFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => { setLeaveForm({ employee: '', leaveType: 'casual', startDate: '', endDate: '', reason: '' }); setShowLeaveModal(true) }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">+ Apply Leave</button>
          </div>

          {leaveLoading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading leave requests...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['Leave #', 'Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Approver', 'Actions'].map((h) => (
                        <th key={h} className={`p-3 text-xs font-medium text-text-muted uppercase tracking-wide ${h === 'Days' ? 'text-right' : h === 'Status' || h === 'Actions' ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.map((lv) => (
                      <tr key={lv._id} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-mono text-xs text-blue-600">{lv.leaveNumber}</td>
                        <td className="p-3 font-medium text-text-primary">{lv.employeeName}</td>
                        <td className="p-3 capitalize text-text-secondary">{lv.leaveType}</td>
                        <td className="p-3 text-text-secondary">{new Date(lv.startDate).toLocaleDateString()}</td>
                        <td className="p-3 text-text-secondary">{new Date(lv.endDate).toLocaleDateString()}</td>
                        <td className="p-3 text-right font-semibold">{lv.days}</td>
                        <td className="p-3 text-center"><Badge color={statusColor(lv.status)}>{lv.status}</Badge></td>
                        <td className="p-3 text-text-secondary text-xs">{lv.approverName || '—'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {lv.status === 'pending' && (
                              <>
                                <button onClick={() => handleLeaveProcess(lv._id, 'approved')} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                                <button onClick={() => handleLeaveProcess(lv._id, 'rejected')} className="text-red-600 hover:text-red-800 text-xs font-medium">Reject</button>
                              </>
                            )}
                            {['pending', 'approved'].includes(lv.status) && (
                              <button onClick={() => handleLeaveCancel(lv._id)} className="text-gray-500 hover:text-gray-700 text-xs font-medium">Cancel</button>
                            )}
                            {lv.status === 'rejected' && lv.rejectionReason && (
                              <span className="text-xs text-red-400 italic" title={lv.rejectionReason}>Reason ℹ</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredLeaves.length === 0 && <p className="text-center text-sm text-text-muted py-8">No leave requests found.</p>}
            </div>
          )}
        </>
      )}

      {/* ═══ ATTENDANCE TAB ═══ */}
      {activeTab === 'attendance' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm" />
            <button onClick={() => { setAttendanceForm({ employee: '', date: attendanceDate, status: 'present', checkIn: '', checkOut: '', remarks: '' }); setShowAttendanceModal(true) }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">+ Mark Attendance</button>
          </div>

          {attendanceLoading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading attendance...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['Employee', 'Date', 'Check In', 'Check Out', 'Hours', 'OT', 'Status', 'Corrections', 'Actions'].map((h) => (
                        <th key={h} className={`p-3 text-xs font-medium text-text-muted uppercase tracking-wide ${['Hours', 'OT', 'Corrections'].includes(h) ? 'text-right' : h === 'Status' || h === 'Actions' ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs.map((log) => (
                      <tr key={log._id} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-medium text-text-primary">{log.employeeName}</td>
                        <td className="p-3 text-text-secondary">{new Date(log.date).toLocaleDateString()}</td>
                        <td className="p-3 text-text-secondary">{log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="p-3 text-text-secondary">{log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="p-3 text-right font-semibold">{log.hoursWorked?.toFixed(1) || '0.0'}</td>
                        <td className="p-3 text-right">{log.overtimeHours > 0 ? <Badge color="purple">{log.overtimeHours.toFixed(1)}h</Badge> : '—'}</td>
                        <td className="p-3 text-center"><Badge color={attendanceColor(log.status)}>{log.status}</Badge></td>
                        <td className="p-3 text-right text-xs text-text-muted">{log.corrections?.length || 0}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => openCorrection(log)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Correct</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {attendanceLogs.length === 0 && <p className="text-center text-sm text-text-muted py-8">No attendance records for this date.</p>}
            </div>
          )}
        </>
      )}

      {/* ═══ PAYROLL TAB ═══ */}
      {activeTab === 'payroll' && (
        <>
          {payrollLoading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Calculating payroll...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['ID', 'Name', 'Dept', 'Base Salary', 'Effective Days', 'OT Hours', 'Base Pay', 'OT Pay', 'Deductions', 'Net Pay'].map((h) => (
                        <th key={h} className={`p-3 text-xs font-medium text-text-muted uppercase tracking-wide ${['Base Salary', 'Effective Days', 'OT Hours', 'Base Pay', 'OT Pay', 'Deductions', 'Net Pay'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payrollData.map((row) => (
                      <tr key={row.employeeId} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-mono text-xs text-blue-600">{row.employeeNumber}</td>
                        <td className="p-3 font-medium text-text-primary">{row.name}</td>
                        <td className="p-3 text-text-secondary">{row.dept}</td>
                        <td className="p-3 text-right">{fmt(row.baseSalary)}</td>
                        <td className="p-3 text-right">{row.effectiveDays}</td>
                        <td className="p-3 text-right">{row.overtimeHours.toFixed(1)}</td>
                        <td className="p-3 text-right">{fmt(row.basePay)}</td>
                        <td className="p-3 text-right text-green-600">{fmt(row.overtimePay)}</td>
                        <td className="p-3 text-right text-red-600">{fmt(row.deductions)}</td>
                        <td className="p-3 text-right font-bold text-text-primary">{fmt(row.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {payrollData.length > 0 && (
                    <tfoot className="bg-gray-50 border-t border-border">
                      <tr>
                        <td colSpan={6} className="p-3 text-right font-semibold text-text-primary">Totals</td>
                        <td className="p-3 text-right font-semibold">{fmt(payrollData.reduce((s, r) => s + r.basePay, 0))}</td>
                        <td className="p-3 text-right font-semibold text-green-600">{fmt(payrollData.reduce((s, r) => s + r.overtimePay, 0))}</td>
                        <td className="p-3 text-right font-semibold text-red-600">{fmt(payrollData.reduce((s, r) => s + r.deductions, 0))}</td>
                        <td className="p-3 text-right font-bold text-text-primary">{fmt(payrollData.reduce((s, r) => s + r.netPay, 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {payrollData.length === 0 && <p className="text-center text-sm text-text-muted py-8">No payroll data available.</p>}
            </div>
          )}
        </>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Employee Add/Edit */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Employee' : 'Add Employee'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Full Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Employee name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Department</label>
              <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {DEPARTMENTS.filter((d) => d !== 'All').map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Role *</label>
              <input value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Job title" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Shift</label>
              <select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Monthly Salary *</label>
              <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="₹" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="active">Active</option>
              <option value="on-leave">On Leave</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update Employee' : 'Add Employee'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Leave Apply */}
      <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Apply for Leave" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Employee *</label>
            <select value={leaveForm.employee} onChange={(e) => setLeaveForm({ ...leaveForm, employee: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Select employee</option>
              {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} ({emp.employeeNumber})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Leave Type</label>
            <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">From *</label>
              <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">To *</label>
              <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Reason</label>
            <textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Optional reason" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowLeaveModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleLeaveApply} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Submitting...' : 'Submit Leave Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Mark Attendance */}
      <Modal isOpen={showAttendanceModal} onClose={() => setShowAttendanceModal(false)} title="Mark Attendance" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Employee *</label>
            <select value={attendanceForm.employee} onChange={(e) => setAttendanceForm({ ...attendanceForm, employee: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Select employee</option>
              {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} ({emp.employeeNumber})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Date *</label>
              <input type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Check In</label>
              <input type="datetime-local" value={attendanceForm.checkIn} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkIn: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Check Out</label>
              <input type="datetime-local" value={attendanceForm.checkOut} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkOut: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Remarks</label>
            <input value={attendanceForm.remarks} onChange={(e) => setAttendanceForm({ ...attendanceForm, remarks: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Optional remarks" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAttendanceModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleMarkAttendance} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Mark Attendance'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Attendance Correction */}
      <Modal isOpen={showCorrectionModal} onClose={() => setShowCorrectionModal(false)} title={`Correct Attendance — ${correctionTarget?.employeeName || ''}`} size="md">
        <div className="space-y-4">
          <p className="text-xs text-text-muted">Corrections are blockchain-anchored and audit-logged for tamper-proof records.</p>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Field to Correct</label>
            <select value={correctionForm.field} onChange={(e) => setCorrectionForm({ ...correctionForm, field: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="checkIn">Check In</option>
              <option value="checkOut">Check Out</option>
              <option value="status">Status</option>
              <option value="hoursWorked">Hours Worked</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">New Value *</label>
            {correctionForm.field === 'status' ? (
              <select value={correctionForm.newValue} onChange={(e) => setCorrectionForm({ ...correctionForm, newValue: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                <option value="">Select status</option>
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : correctionForm.field === 'hoursWorked' ? (
              <input type="number" step="0.5" value={correctionForm.newValue} onChange={(e) => setCorrectionForm({ ...correctionForm, newValue: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="e.g. 8.5" />
            ) : (
              <input type="datetime-local" value={correctionForm.newValue} onChange={(e) => setCorrectionForm({ ...correctionForm, newValue: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Reason *</label>
            <textarea value={correctionForm.reason} onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })} rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Mandatory reason for audit trail" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCorrectionModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleCorrection} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Submit Correction'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
