import { useEffect, useLayoutEffect, useState } from 'react'

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
import InvoiceScanner from './pages/InvoiceScanner'
import AIAssistant from './pages/AIAssistant'
import HRManagement from './pages/HRManagement'
import Manufacturing from './pages/Manufacturing'
import ProjectManagement from './pages/ProjectManagement'
import DocumentManagement from './pages/DocumentManagement'
import AssetManagement from './pages/AssetManagement'
import WorkflowApprovals from './pages/WorkflowApprovals'
import { erpNavigation } from './config/navigation'
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
  'invoice-scanner': InvoiceScanner,
  'ai-assistant': AIAssistant,
  'hr-management': HRManagement,
  manufacturing: Manufacturing,
  'project-management': ProjectManagement,
  'document-management': DocumentManagement,
  'asset-management': AssetManagement,
  'workflow-approvals': WorkflowApprovals,
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
  const hasPermission = useStore((state) => state.hasPermission)
  const setActivePage = useStore((state) => state.setActivePage)
  const theme = useStore((state) => state.theme)
  const setTheme = useStore((state) => state.setTheme)

  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authInitialized, setAuthInitialized] = useState(false)

  useLayoutEffect(() => {
    const storedTheme = window.localStorage.getItem('blockerp-theme')
    if (storedTheme === 'dark' || storedTheme === 'light') {
      setTheme(storedTheme)
    }
  }, [setTheme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-dark', theme === 'dark')
    window.localStorage.setItem('blockerp-theme', theme)
  }, [theme])

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

  useEffect(() => {
    if (!isAuthenticated) return
    const currentNav = erpNavigation.find((item) => item.id === currentPage)
    if (!currentNav) return
    if (!hasPermission(currentNav.permission)) {
      const firstAllowed = erpNavigation.find((item) => hasPermission(item.permission))
      if (firstAllowed) {
        setActivePage(firstAllowed.id)
      }
    }
  }, [currentPage, hasPermission, isAuthenticated, setActivePage])

  const handleLogin = async (credentials) => {
    setAuthError('')
    setAuthLoading(true)

    try {
      const result = await authService.login(credentials)
      authService.setLastCredentials(credentials.email.trim(), credentials.password)
      authService.setToken(result.token)
      setSession({ token: result.token, user: result.user })
      useStore.getState().clearToasts()
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
