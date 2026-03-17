import { useStore } from './store/useStore'
import { useRealTime } from './hooks/useRealTime'
import Sidebar from './components/Layout/Sidebar'
import TopBar from './components/Layout/TopBar'
import Toast from './components/UI/Toast'

import AuditLog from './pages/AuditLog'
import Blockchain from './pages/Blockchain'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import DataAssistant from './pages/DataAssistant'
import ERPAnalytics from './pages/ERPAnalytics'
import Finance from './pages/Finance'
import Inventory from './pages/Inventory'
import Invoices from './pages/Invoices'
import MasterData from './pages/MasterData'
import Orders from './pages/Orders'
import Procurement from './pages/Procurement'
import Settings from './pages/Settings'
import Support from './pages/Support'

const pageMap = {
  dashboard: Dashboard,
  'data-assistant': DataAssistant,
  'master-data': MasterData,
  procurement: Procurement,
  'erp-analytics': ERPAnalytics,
  blockchain: Blockchain,
  orders: Orders,
  invoices: Invoices,
  customers: Customers,
  inventory: Inventory,
  finance: Finance,
  support: Support,
  audit: AuditLog,
  settings: Settings,
}

export default function App() {
  useRealTime()

  const currentPage = useStore((state) => state.currentPage)
  const toasts = useStore((state) => state.toasts) || []
  const removeToast = useStore((state) => state.removeToast)
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed)

  const ActivePage = pageMap[currentPage] || Dashboard

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-[200px]'}`}>
        <TopBar />

        <main className="p-6 pt-[84px]">
          <ActivePage />
        </main>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  )
}
