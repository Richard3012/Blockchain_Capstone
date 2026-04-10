import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/UI/Modal'

const DEPARTMENTS = ['All', 'Warehouse', 'Logistics', 'Finance', 'Sales', 'IT', 'Admin']
const SHIFTS = ['Day', 'Night', 'Rotational']

const initialEmployees = [
  { id: 'EMP-001', name: 'Rajesh Kumar', dept: 'Warehouse', role: 'Supervisor', shift: 'Day', status: 'active', attendance: 96, salary: 35000 },
  { id: 'EMP-002', name: 'Priya Sharma', dept: 'Finance', role: 'Accountant', shift: 'Day', status: 'active', attendance: 98, salary: 42000 },
  { id: 'EMP-003', name: 'Amit Patel', dept: 'Logistics', role: 'Driver', shift: 'Rotational', status: 'active', attendance: 91, salary: 28000 },
  { id: 'EMP-004', name: 'Sneha Reddy', dept: 'Sales', role: 'Executive', shift: 'Day', status: 'active', attendance: 94, salary: 38000 },
  { id: 'EMP-005', name: 'Vikram Singh', dept: 'Warehouse', role: 'Picker', shift: 'Night', status: 'on-leave', attendance: 88, salary: 22000 },
  { id: 'EMP-006', name: 'Anjali Nair', dept: 'IT', role: 'Developer', shift: 'Day', status: 'active', attendance: 97, salary: 55000 },
  { id: 'EMP-007', name: 'Suresh Gupta', dept: 'Logistics', role: 'Coordinator', shift: 'Day', status: 'active', attendance: 93, salary: 32000 },
  { id: 'EMP-008', name: 'Deepa Joshi', dept: 'Admin', role: 'HR Manager', shift: 'Day', status: 'active', attendance: 99, salary: 48000 },
]

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

export default function HRManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [employees, setEmployees] = useState(initialEmployees)
  const [deptFilter, setDeptFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [showPayroll, setShowPayroll] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', dept: 'Warehouse', role: '', shift: 'Day', status: 'active', salary: '' })

  const filtered = useMemo(() => {
    const q = (localSearch || searchQuery || '').toLowerCase()
    return employees.filter((e) => {
      if (deptFilter !== 'All' && e.dept !== deptFilter) return false
      return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)
    })
  }, [employees, deptFilter, localSearch, searchQuery])

  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0)
  const activeCount = employees.filter((e) => e.status === 'active').length
  const avgAttendance = (employees.reduce((s, e) => s + e.attendance, 0) / (employees.length || 1)).toFixed(1)

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', dept: 'Warehouse', role: '', shift: 'Day', status: 'active', salary: '' })
    setShowModal(true)
  }

  const openEdit = (emp) => {
    setEditing(emp)
    setForm({ name: emp.name, dept: emp.dept, role: emp.role, shift: emp.shift, status: emp.status, salary: emp.salary })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name || !form.role || !form.salary) { addToast('Fill all required fields', 'error'); return }
    if (editing) {
      setEmployees(prev => prev.map(e => e.id === editing.id ? { ...e, ...form, salary: Number(form.salary) } : e))
      addToast('Employee updated', 'success')
    } else {
      const nextId = `EMP-${String(employees.length + 1).padStart(3, '0')}`
      setEmployees(prev => [...prev, { ...form, id: nextId, salary: Number(form.salary), attendance: 0 }])
      addToast('Employee added', 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (id) => {
    if (!confirm('Remove this employee?')) return
    setEmployees(prev => prev.filter(e => e.id !== id))
    addToast('Employee removed', 'success')
  }

  const toggleStatus = (id) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: e.status === 'active' ? 'on-leave' : 'active' } : e))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Human Resource Management</h1>
        <p className="text-text-secondary mt-1">Payroll, attendance, performance tracking and workforce optimization for logistics operations.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: employees.length, sub: `${activeCount} active`, color: 'blue' },
          { label: 'Monthly Payroll', value: fmt(totalPayroll), sub: 'Gross salary', color: 'green' },
          { label: 'Avg Attendance', value: `${avgAttendance}%`, sub: 'This month', color: 'purple' },
          { label: 'On Leave', value: employees.length - activeCount, sub: 'Today', color: 'orange' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search employees..."
          className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm"
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => setShowPayroll(!showPayroll)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          {showPayroll ? 'Employee List' : 'Payroll View'}
        </button>
        <button onClick={openAdd}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Add Employee
        </button>
      </div>

      {/* Employee Table */}
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
              {filtered.map((emp) => (
                <tr key={emp.id} className="border-b border-border hover:bg-gray-50 transition">
                  <td className="p-3 font-mono text-xs text-blue-600">{emp.id}</td>
                  <td className="p-3 font-medium text-text-primary">{emp.name}</td>
                  <td className="p-3 text-text-secondary">{emp.dept}</td>
                  <td className="p-3 text-text-secondary">{emp.role}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.shift === 'Day' ? 'bg-yellow-100 text-yellow-700' :
                      emp.shift === 'Night' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{emp.shift}</span>
                  </td>
                  {showPayroll && <td className="p-3 text-right font-semibold text-text-primary">{fmt(emp.salary)}</td>}
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className={`w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden`}>
                        <div className={`h-full rounded-full ${emp.attendance >= 95 ? 'bg-green-500' : emp.attendance >= 90 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${emp.attendance}%` }} />
                      </div>
                      <span className="text-xs font-medium">{emp.attendance}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                      emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`} onClick={() => toggleStatus(emp.id)}>{emp.status}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                      <button onClick={() => handleDelete(emp.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center text-sm text-text-muted py-8">No employees match your search.</p>}
      </div>

      {/* Payroll Summary */}
      {showPayroll && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Payroll Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Gross Salary', value: fmt(totalPayroll) },
              { label: 'PF Deduction (12%)', value: fmt(Math.round(totalPayroll * 0.12)) },
              { label: 'Net Payable', value: fmt(Math.round(totalPayroll * 0.88)) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
                <p className="text-xl font-bold text-text-primary mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workforce Optimization */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Workforce Optimization</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { title: 'Shift Scheduling', desc: 'Align warehouse and driver shifts with demand patterns and peak delivery hours.' },
            { title: 'Overtime Tracking', desc: 'Monitor hours-of-service compliance for transport staff and overtime costs.' },
            { title: 'Productivity Metrics', desc: 'Track picks/hour, deliveries/route, and processing times per employee.' },
            { title: 'Seasonal Staffing', desc: 'Scale temporary warehouse workers during peak seasons based on forecast.' },
            { title: 'Training & Compliance', desc: 'Ensure certifications (forklift, hazmat) are current across logistics staff.' },
            { title: 'Performance Reviews', desc: 'Goal setting, KPI tracking, and competency mapping for all departments.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-background p-4">
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Add/Edit Employee Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Employee' : 'Add Employee'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Full Name *</label>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Employee name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Department</label>
              <select value={form.dept} onChange={(e) => setForm({...form, dept: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {DEPARTMENTS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Role *</label>
              <input value={form.role} onChange={(e) => setForm({...form, role: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Job title" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Shift</label>
              <select value={form.shift} onChange={(e) => setForm({...form, shift: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Monthly Salary *</label>
              <input type="number" value={form.salary} onChange={(e) => setForm({...form, salary: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="₹" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="active">Active</option>
              <option value="on-leave">On Leave</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? 'Update Employee' : 'Add Employee'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
