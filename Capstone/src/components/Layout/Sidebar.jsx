import { erpNavigation } from '../../config/navigation'
import { useStore } from '../../store/useStore'

const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a2 2 0 01-2 2h-2a2 2 0 01-2-2v-6z" />
    </svg>
  ),
  layers: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6l8 4-8 4-8-4 8-4zm0 6l8 4-8 4-8-4 8-4z" />
    </svg>
  ),
  truck: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17h6m-6 0a2 2 0 11-4 0m4 0a2 2 0 104 0m4 0a2 2 0 104 0m-4 0h-2m2 0V9a1 1 0 00-1-1h-3V5a1 1 0 00-1-1H3a1 1 0 00-1 1v11h3m12 0h3v-4l-3-3h-2" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  blocks: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  cart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  box: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  wallet: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h3a1 1 0 011 1v4a1 1 0 01-1 1h-3m0-6v6m0-6h-4a2 2 0 00-2 2v2a2 2 0 002 2h4" />
    </svg>
  ),
  headset: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  clipboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  lock: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

export default function Sidebar() {
  const currentPage = useStore((state) => state.currentPage)
  const setActivePage = useStore((state) => state.setActivePage)
  const user = useStore((state) => state.user)
  const hasPermission = useStore((state) => state.hasPermission)
  const addToast = useStore((state) => state.addToast)

  const handleNavClick = (item) => {
    if (!hasPermission(item.permission)) {
      addToast(`Access restricted. ${user.role === 'viewer' ? 'Upgrade to an ERP manager role.' : 'Admin role required.'}`, 'warning')
      return
    }
    setActivePage(item.id)
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[200px] bg-white border-r border-border flex flex-col z-40">
      <div className="flex items-center gap-2 px-4 h-[60px] border-b border-border">
        <svg className="w-7 h-7 text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span className="font-bold text-lg text-text-primary">BlockERP</span>
      </div>

      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue flex items-center justify-center text-white text-sm font-medium">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-text-primary truncate">{user.name}</p>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
              user.role === 'admin' ? 'bg-purple/10 text-purple' :
              user.role === 'manager' ? 'bg-blue/10 text-blue' :
              'bg-gray-100 text-text-secondary'
            }`}>
              {user.role}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {erpNavigation.map((item) => {
          const isActive = currentPage === item.id
          const isLocked = !hasPermission(item.permission)

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-blue-light text-blue border-l-[3px] border-l-blue pl-[13px]'
                  : isLocked
                    ? 'text-text-muted hover:bg-gray-50 opacity-50'
                    : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
                }
              `}
            >
              <span className={isActive ? 'text-blue' : isLocked ? 'text-text-muted' : 'text-text-secondary'}>
                {icons[item.icon]}
              </span>
              <span className="flex-1">{item.label}</span>
              {isLocked && (
                <span className="text-text-muted">{icons.lock}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary rounded-lg transition-colors">
          {icons.logout}
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}
