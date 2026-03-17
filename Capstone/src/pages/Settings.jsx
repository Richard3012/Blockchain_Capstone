import { useState } from 'react'
import { useStore } from '../store/useStore'
import Button from '../components/UI/Button'

export default function Settings() {
  const user = useStore((state) => state.user)
  const setUserRole = useStore((state) => state.setUserRole)
  const addToast = useStore((state) => state.addToast)
  const addAuditEntry = useStore((state) => state.addAuditEntry)

  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({
    name: user.name,
    email: 'admin@blockerp.io',
    company: 'BlockERP Inc.',
    timezone: 'UTC-5',
    language: 'en',
    theme: 'light',
    notifications: {
      email: true,
      push: true,
      orders: true,
      inventory: true,
      blockchain: false,
    },
    security: {
      twoFactor: false,
      sessionTimeout: 30,
    }
  })

  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { id: 'appearance', label: 'Appearance', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
    { id: 'security', label: 'Security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { id: 'system', label: 'System', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ]

  const handleSave = () => {
    addAuditEntry({
      action: 'UPDATE',
      entity: 'Settings',
      entityId: user.name,
      details: `Updated ${activeTab} settings`
    })
    addToast('Settings saved successfully', 'success')
  }

  const handleRoleChange = (role) => {
    setUserRole(role)
    addToast(`Role switched to ${role}`, 'info')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Manage your account and application settings</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-border p-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-blue/10 text-blue' 
                    : 'text-text-secondary hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-border p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Profile Settings</h2>
              
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue to-purple flex items-center justify-center text-white text-2xl font-bold">
                  {user.name.charAt(0)}
                </div>
                <Button variant="secondary">Change Avatar</Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Full Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Timezone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({...formData, timezone: e.target.value})}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  >
                    <option value="UTC-8">Pacific Time (UTC-8)</option>
                    <option value="UTC-5">Eastern Time (UTC-5)</option>
                    <option value="UTC+0">UTC</option>
                    <option value="UTC+1">Central European Time (UTC+1)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Notification Preferences</h2>

              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { key: 'push', label: 'Push Notifications', desc: 'Browser push notifications' },
                  { key: 'orders', label: 'Order Updates', desc: 'New orders and status changes' },
                  { key: 'inventory', label: 'Inventory Alerts', desc: 'Low stock and restock notifications' },
                  { key: 'blockchain', label: 'Blockchain Events', desc: 'Transaction confirmations and verifications' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium text-text-primary">{item.label}</p>
                      <p className="text-sm text-text-secondary">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setFormData({
                        ...formData,
                        notifications: {
                          ...formData.notifications,
                          [item.key]: !formData.notifications[item.key]
                        }
                      })}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        formData.notifications[item.key] ? 'bg-blue' : 'bg-gray-200'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        formData.notifications[item.key] ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Appearance Settings</h2>

              <div>
                <label className="block text-sm text-text-secondary mb-3">Theme</label>
                <div className="flex gap-4">
                  {[
                    { id: 'light', label: 'Light', color: '#ffffff' },
                    { id: 'dark', label: 'Dark', color: '#1a1a2e' },
                    { id: 'system', label: 'System', color: 'linear-gradient(135deg, #fff 50%, #1a1a2e 50%)' },
                  ].map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setFormData({...formData, theme: theme.id})}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                        formData.theme === theme.id ? 'border-blue' : 'border-border hover:border-gray-300'
                      }`}
                    >
                      <div 
                        className="w-16 h-16 rounded-lg border border-border"
                        style={{ background: theme.color }}
                      />
                      <span className="text-sm font-medium">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-3">Language</label>
                <select
                  value={formData.language}
                  onChange={(e) => setFormData({...formData, language: e.target.value})}
                  className="w-full max-w-xs px-4 py-2 border border-border rounded-lg"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Security Settings</h2>

              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="font-medium text-text-primary">Two-Factor Authentication</p>
                  <p className="text-sm text-text-secondary">Add extra security with 2FA</p>
                </div>
                <button
                  onClick={() => setFormData({
                    ...formData,
                    security: { ...formData.security, twoFactor: !formData.security.twoFactor }
                  })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.security.twoFactor ? 'bg-green' : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formData.security.twoFactor ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-2">Session Timeout (minutes)</label>
                <select
                  value={formData.security.sessionTimeout}
                  onChange={(e) => setFormData({
                    ...formData,
                    security: { ...formData.security, sessionTimeout: Number(e.target.value) }
                  })}
                  className="w-full max-w-xs px-4 py-2 border border-border rounded-lg"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>

              <div className="p-4 bg-red/5 rounded-lg border border-red/20">
                <p className="font-medium text-red">Danger Zone</p>
                <p className="text-sm text-text-secondary mt-1 mb-3">Irreversible actions</p>
                <Button variant="secondary" className="border-red text-red hover:bg-red/10">
                  Delete Account
                </Button>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">System Settings</h2>

              {/* RBAC Demo */}
              <div className="p-4 bg-purple/5 rounded-lg border border-purple/20">
                <p className="font-medium text-purple mb-2">Role-Based Access Control (Demo)</p>
                <p className="text-sm text-text-secondary mb-4">
                  Switch roles to see how different access levels affect the UI
                </p>
                <div className="flex gap-2 mb-4">
                  {['admin', 'manager', 'viewer'].map(role => (
                    <button
                      key={role}
                      onClick={() => handleRoleChange(role)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        user.role === role 
                          ? 'bg-purple text-white' 
                          : 'bg-white border border-border hover:bg-gray-50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                
                {/* Role Permissions Info */}
                <div className="mt-4 p-4 bg-white rounded-lg border border-border">
                  <p className="font-medium text-text-primary mb-3">Role Permissions</p>
                  <div className="grid gap-3">
                    <div className={`p-3 rounded-lg ${user.role === 'admin' ? 'bg-purple/10 border border-purple/30' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-purple"></span>
                        <span className="font-medium text-text-primary">Administrator</span>
                      </div>
                      <p className="text-xs text-text-secondary ml-4">Full system access: Analytics, Blockchain, Audit Logs, Settings, User Management</p>
                    </div>
                    <div className={`p-3 rounded-lg ${user.role === 'manager' ? 'bg-blue/10 border border-blue/30' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-blue"></span>
                        <span className="font-medium text-text-primary">Manager</span>
                      </div>
                      <p className="text-xs text-text-secondary ml-4">Operations access: Orders, Inventory, Customers, Analytics, Reports</p>
                    </div>
                    <div className={`p-3 rounded-lg ${user.role === 'viewer' ? 'bg-gray-200 border border-gray-300' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <span className="font-medium text-text-primary">Viewer</span>
                      </div>
                      <p className="text-xs text-text-secondary ml-4">Read-only: Dashboard, Orders, Customers, Inventory (no analytics/settings)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-text-muted">Current Role</p>
                  <p className="text-lg font-semibold text-text-primary capitalize">{user.role}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-text-muted">App Version</p>
                  <p className="text-lg font-semibold text-text-primary">1.0.0</p>
                </div>
              </div>

              <div>
                <p className="font-medium text-text-primary mb-2">Data Management</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => addToast('Backup started...', 'info')}>
                    Backup Data
                  </Button>
                  <Button variant="secondary" onClick={() => addToast('All caches cleared', 'success')}>
                    Clear Cache
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
