import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const DEPARTMENTS = ['All', 'Warehouse', 'Logistics', 'Finance', 'Sales', 'IT', 'Admin']
const SHIFTS = ['Day', 'Night', 'Rotational']
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

export default function HRManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [employees, setEmployees] = useState([])
  const [deptFilter, setDeptFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [showPayroll, setShowPayroll] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', dept: 'Warehouse', roleTitle: '', shift: 'Day', status: 'active', salary: '' })

  const loadEmployees = async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/employees')
      setEmployees(Array.isArray(rows) ? rows : [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const filtered = useMemo(() => {
    const query = (localSearch || searchQuery || '').toLowerCase()
    return employees.filter((employee) => {
      if (deptFilter !== 'All' && employee.dept !== deptFilter) return false
      return employee.name?.toLowerCase().includes(query)
        || employee.employeeNumber?.toLowerCase().includes(query)
        || employee.roleTitle?.toLowerCase().includes(query)
    })
  }, [employees, deptFilter, localSearch, searchQuery])

  const totalPayroll = employees.reduce((sum, employee) => sum + (employee.salary || 0), 0)
  const activeCount = employees.filter((employee) => employee.status === 'active').length
  const avgAttendance = employees.length > 0 ? (employees.reduce((sum, employee) => sum + (employee.attendance || 0), 0) / employees.length).toFixed(1) : '0.0'

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', dept: 'Warehouse', roleTitle: '', shift: 'Day', status: 'active', salary: '' })
    setShowModal(true)
  }

  const openEdit = (employee) => {
    setEditing(employee)
    setForm({
      name: employee.name,
      dept: employee.dept,
      roleTitle: employee.roleTitle,
      shift: employee.shift,
      status: employee.status,
      salary: String(employee.salary || ''),
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.roleTitle.trim() || !form.salary) {
      addToast('Fill all required fields', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      dept: form.dept,
      roleTitle: form.roleTitle,
      shift: form.shift,
      status: form.status,
      salary: Number(form.salary),
    }
    try {
      if (editing) {
        await apiClient.patch(`/employees/${editing._id}`, payload)
        addToast('Employee updated', 'success')
      } else {
        await apiClient.post('/employees', payload)
        addToast('Employee added', 'success')
      }
      setShowModal(false)
      await loadEmployees()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this employee?')) return
    try {
      await apiClient.delete(`/employees/${id}`)
      addToast('Employee removed', 'success')
      await loadEmployees()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const toggleStatus = async (employee) => {
    try {
      await apiClient.patch(`/employees/${employee._id}`, {
        status: employee.status === 'active' ? 'on-leave' : 'active',
      })
      await loadEmployees()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Human Resource Management</h1>
        <p className="text-text-secondary mt-1">Payroll, attendance, and workforce visibility fetched from MongoDB.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: employees.length, sub: `${activeCount} active` },
          { label: 'Monthly Payroll', value: fmt(totalPayroll), sub: 'Gross salary' },
          { label: 'Avg Attendance', value: `${avgAttendance}%`, sub: 'This month' },
          { label: 'On Leave', value: employees.length - activeCount, sub: 'Today' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Search employees..." className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm" />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
        <button onClick={() => setShowPayroll(!showPayroll)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          {showPayroll ? 'Employee List' : 'Payroll View'}
        </button>
        <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Add Employee
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading employees...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">ID</th>
                  <th className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Name</th>
                  <th className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Department</th>
                  <th className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Role</th>
                  <th className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Shift</th>
                  {showPayroll && <th className="text-right p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Salary</th>}
                  <th className="text-center p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Attendance</th>
                  <th className="text-center p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                  <th className="text-center p-3 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr key={employee._id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{employee.employeeNumber}</td>
                    <td className="p-3 font-medium text-text-primary">{employee.name}</td>
                    <td className="p-3 text-text-secondary">{employee.dept}</td>
                    <td className="p-3 text-text-secondary">{employee.roleTitle}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        employee.shift === 'Day' ? 'bg-yellow-100 text-yellow-700' : employee.shift === 'Night' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                      }`}>{employee.shift}</span>
                    </td>
                    {showPayroll && <td className="p-3 text-right font-semibold text-text-primary">{fmt(employee.salary)}</td>}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${(employee.attendance || 0) >= 95 ? 'bg-green-500' : (employee.attendance || 0) >= 90 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${employee.attendance || 0}%` }} />
                        </div>
                        <span className="text-xs font-medium">{employee.attendance || 0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`} onClick={() => toggleStatus(employee)}>{employee.status}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(employee)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(employee._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
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
                {DEPARTMENTS.filter((department) => department !== 'All').map((department) => <option key={department} value={department}>{department}</option>)}
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
                {SHIFTS.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
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
    </div>
  )
}
