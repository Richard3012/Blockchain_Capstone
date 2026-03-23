import { useEffect, useState } from 'react'

import Sidebar from './components/Layout/Sidebar'
import TopBar from './components/Layout/TopBar'
import Toast from './components/UI/Toast'
import { useRealTime } from './hooks/useRealTime'
import AuditLog from './pages/AuditLog'
import Blockchain from './pages/Blockchain'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import DataAssistant from './pages/DataAssistant'
import ERPAnalytics from './pages/ERPAnalytics'
import Finance from './pages/Finance'
import Inventory from './pages/Inventory'
import Invoices from './pages/Invoices'
import Login from './pages/Login'
import MasterData from './pages/MasterData'
import Orders from './pages/Orders'
import Procurement from './pages/Procurement'
import Settings from './pages/Settings'
import Support from './pages/Support'
import GSTCompliance from './pages/GSTCompliance'
import Accounting from './pages/Accounting'
import TDSManagement from './pages/TDSManagement'
import DemandForecast from './pages/DemandForecast'
import DeliveryTracking from './pages/DeliveryTracking'
import InvoiceScanner from './pages/InvoiceScanner'
import AIAssistant from './pages/AIAssistant'
import { authService } from './services/authService'
import { useStore } from './store/useStore'

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
  gst: GSTCompliance,
  accounting: Accounting,
  tds: TDSManagement,
  'demand-forecast': DemandForecast,
  'delivery-tracking': DeliveryTracking,
  'invoice-scanner': InvoiceScanner,
  'ai-assistant': AIAssistant,
}

export default function App() {
  useRealTime()

  const currentPage = useStore((state) => state.currentPage)
  const toasts = useStore((state) => state.toasts) || []
  const removeToast = useStore((state) => state.removeToast)
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed)
  const isAuthenticated = useStore((state) => state.isAuthenticated)
  const setSession = useStore((state) => state.setSession)
  const clearSession = useStore((state) => state.clearSession)
  const addToast = useStore((state) => state.addToast)

  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authInitialized, setAuthInitialized] = useState(false)

  useEffect(() => {
    const token = authService.getToken()
    const hasAuthFlag = authService.hasAuthFlag()

    if (!token || !hasAuthFlag) {
      authService.clearToken()
      clearSession()
      setAuthLoading(false)
      setAuthInitialized(true)
      return
    }

    authService
      .me()
      .then((user) => {
        setSession({ token, user })
        setAuthLoading(false)
        setAuthInitialized(true)
      })
      .catch(() => {
        authService.clearToken()
        clearSession()
        setAuthLoading(false)
        setAuthInitialized(true)
      })
  }, [clearSession, setSession])

  const handleLogin = async (credentials) => {
    setAuthError('')
    setAuthLoading(true)

    try {
      const result = await authService.login(credentials)
      authService.setToken(result.token)
      setSession({ token: result.token, user: result.user })
      addToast('Login successful', 'success')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const ActivePage = pageMap[currentPage] || Dashboard

  if (!authInitialized || (authLoading && !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-text-secondary">
        Loading BlockERP...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login onSubmit={handleLogin} loading={authLoading} error={authError} />
  }

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
