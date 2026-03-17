import { useStore } from '../../store/useStore'

export default function TopBar() {
  const searchQuery = useStore((state) => state.searchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)
  const user = useStore((state) => state.user)
  const notificationCount = useStore((state) => state.notificationCount)
  const clearNotifications = useStore((state) => state.clearNotifications)

  return (
    <header className="fixed top-0 left-[200px] right-0 h-[60px] bg-white border-b border-border z-30 flex items-center px-6 gap-4">
      {/* Search */}
      <div className="relative flex-1 max-w-[360px]">
        <svg 
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search orders, customers, invoices..."
          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue focus:bg-white transition-colors"
        />
      </div>

      <div className="flex items-center gap-4 ml-auto">
        {/* Notifications */}
        <button 
          onClick={clearNotifications}
          className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-gray-50 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red text-white text-xs font-medium rounded-full flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="text-right">
            <p className="text-sm font-medium text-text-primary">{user.name}</p>
            <p className="text-xs text-text-muted capitalize">{user.role}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue flex items-center justify-center text-white text-sm font-medium">
            {user.initials}
          </div>
        </div>
      </div>
    </header>
  )
}
