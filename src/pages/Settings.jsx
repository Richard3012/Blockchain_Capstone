import { useEffect, useState } from 'react'

import Button from '../components/UI/Button'
import { walletService } from '../services/walletService'
import { useStore } from '../store/useStore'

export default function Settings() {
  const user = useStore((state) => state.user)
  const setUser = useStore((state) => state.setUser)
  const addToast = useStore((state) => state.addToast)
  const theme = useStore((state) => state.theme)
  const setTheme = useStore((state) => state.setTheme)

  const [activeTab, setActiveTab] = useState('profile')
  const [walletStatus, setWalletStatus] = useState({
    linkedWalletAddress: user.linkedWalletAddress || null,
    walletLinkedAt: user.walletLinkedAt || null,
  })
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletConnection, setWalletConnection] = useState({
    installed: typeof window !== 'undefined' && Boolean(window.ethereum),
    connected: false,
    account: '',
    chainId: '',
  })

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email || '',
    company: 'BlockERP Retail',
    timezone: 'Asia/Kolkata',
    language: 'en',
    theme,
    notifications: {
      email: true,
      push: true,
      orders: true,
      inventory: true,
      blockchain: true,
    },
  })

  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'appearance', label: 'Appearance', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707' },
    { id: 'wallet', label: 'Wallet', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h3a1 1 0 011 1v4a1 1 0 01-1 1h-3m0-6v6m0-6h-4a2 2 0 00-2 2v2a2 2 0 002 2h4' },
    { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]
  const walletRoleRequirement = user.role === 'admin' || user.role === 'inventory_manager'
    ? 'Wallet recommended for blockchain verification and fulfillment/tamper demo actions.'
    : 'Wallet is optional for your role. Routine ERP work does not require MetaMask.'

  useEffect(() => {
    walletService
      .status()
      .then((status) => {
        setWalletStatus(status)
        setUser(status)
      })
      .catch(() => {})
  }, [setUser])

  useEffect(() => {
    if (!window.ethereum) {
      setWalletConnection((current) => ({ ...current, installed: false, connected: false, account: '', chainId: '' }))
      return undefined
    }

    let mounted = true

    const syncWalletConnection = async () => {
      try {
        const [accounts, chainId] = await Promise.all([
          window.ethereum.request({ method: 'eth_accounts' }),
          window.ethereum.request({ method: 'eth_chainId' }),
        ])

        if (!mounted) return

        setWalletConnection({
          installed: true,
          connected: Array.isArray(accounts) && accounts.length > 0,
          account: Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : '',
          chainId: chainId || '',
        })
      } catch {
        if (!mounted) return
        setWalletConnection({
          installed: true,
          connected: false,
          account: '',
          chainId: '',
        })
      }
    }

    const handleAccountsChanged = (accounts) => {
      setWalletConnection((current) => ({
        ...current,
        connected: Array.isArray(accounts) && accounts.length > 0,
        account: Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : '',
      }))
    }

    const handleChainChanged = (chainId) => {
      setWalletConnection((current) => ({ ...current, chainId }))
    }

    syncWalletConnection()
    window.ethereum.on?.('accountsChanged', handleAccountsChanged)
    window.ethereum.on?.('chainChanged', handleChainChanged)

    return () => {
      mounted = false
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [])

  const handleWalletLink = async () => {
    if (!window.ethereum) {
      addToast('MetaMask is not installed in this browser', 'error')
      return
    }

    setWalletLoading(true)

    try {
      const { nonce } = await walletService.requestLinkNonce()
      const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [nonce, address],
      })

      const result = await walletService.verifyLink(signature)
      setWalletStatus(result)
      setUser(result)
      setWalletConnection((current) => ({ ...current, installed: true, connected: true, account: address }))
      addToast(`Wallet linked: ${result.linkedWalletAddress.slice(0, 6)}...${result.linkedWalletAddress.slice(-4)}`, 'success')
    } catch (error) {
      addToast(error.message || 'Wallet linking failed', 'error')
    } finally {
      setWalletLoading(false)
    }
  }

  const handleConnectWallet = async () => {
    if (!window.ethereum) {
      addToast('MetaMask is not installed in this browser', 'error')
      return
    }

    try {
      const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      setWalletConnection({
        installed: true,
        connected: Boolean(account),
        account: account || '',
        chainId: chainId || '',
      })
    } catch (error) {
      addToast(error.message || 'MetaMask connection failed', 'error')
    }
  }

  const handleSave = () => {
    addToast('Settings saved locally. API persistence can be added next.', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Manage your account, notifications, and wallet linking</p>
      </div>

      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-border p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-blue/10 text-blue' : 'text-text-secondary hover:bg-gray-50'
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

        <div className="flex-1 bg-white rounded-xl shadow-sm border border-border p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-lg"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Wallet Linking</h2>
              <div className="rounded-xl border border-border p-5 bg-background">
                <p className="font-medium text-text-primary">MetaMask connection</p>
                <p className="text-sm text-text-secondary mt-2">
                  {!walletConnection.installed && 'MetaMask is not installed in this browser.'}
                  {walletConnection.installed && !walletConnection.connected && 'MetaMask is installed but not currently connected.'}
                  {walletConnection.installed && walletConnection.connected && (
                    <>
                      Connected account: <span className="font-mono">{walletConnection.account}</span>
                      {walletConnection.chainId ? ` on chain ${walletConnection.chainId}` : ''}
                    </>
                  )}
                </p>
                <div className="mt-4">
                  <Button variant="secondary" onClick={handleConnectWallet}>
                    {walletConnection.connected ? 'Reconnect MetaMask' : 'Connect MetaMask'}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-border p-5 bg-background">
                <p className="font-medium text-text-primary">Linked wallet</p>
                <p className="text-sm text-text-secondary mt-2">
                  {walletStatus.linkedWalletAddress
                    ? `${walletStatus.linkedWalletAddress} linked on ${new Date(walletStatus.walletLinkedAt).toLocaleString()}`
                    : 'No wallet linked yet. Use MetaMask to link one wallet to this ERP user account.'}
                </p>
              </div>
              <div className="rounded-xl border border-blue/20 bg-blue/5 p-5">
                <p className="font-medium text-text-primary">How it works</p>
                <p className="text-sm text-text-secondary mt-2">
                  BlockERP requests a nonce from the backend, MetaMask signs it, and the backend verifies the signature before saving your wallet address.
                </p>
                <p className="text-sm text-text-secondary mt-2">
                  {walletRoleRequirement}
                </p>
              </div>
              {walletConnection.connected && walletStatus.linkedWalletAddress && walletConnection.account.toLowerCase() !== walletStatus.linkedWalletAddress.toLowerCase() && (
                <div className="rounded-xl border border-orange/30 bg-orange/5 p-5 text-sm text-text-secondary">
                  The currently connected MetaMask account does not match the wallet linked to this ERP user. Link again if you want to switch the trusted wallet.
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={handleWalletLink} disabled={walletLoading}>
                  {walletLoading ? 'Linking Wallet...' : walletStatus.linkedWalletAddress ? 'Relink Wallet' : 'Link MetaMask Wallet'}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Appearance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'light', label: 'Light Mode', description: 'Clean admin view for bright-room demos.' },
                  { id: 'dark', label: 'Dark Mode', description: 'Low-glare theme across dashboards, inventory, orders, invoices, and ledger.' },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setTheme(option.id)
                      setFormData((current) => ({ ...current, theme: option.id }))
                    }}
                    className={`rounded-xl border p-5 text-left transition-colors ${
                      theme === option.id ? 'border-blue bg-blue/5' : 'border-border hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-text-primary">{option.label}</p>
                    <p className="text-sm text-text-secondary mt-2">{option.description}</p>
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <Button
                  onClick={() => {
                    window.localStorage.setItem('blockerp-theme', theme)
                    addToast(`${theme === 'dark' ? 'Dark' : 'Light'} mode applied`, 'success')
                  }}
                >
                  Save Appearance
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Email Notifications' },
                  { key: 'push', label: 'Push Notifications' },
                  { key: 'orders', label: 'Order Updates' },
                  { key: 'inventory', label: 'Inventory Alerts' },
                  { key: 'blockchain', label: 'Blockchain Events' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <p className="font-medium text-text-primary">{item.label}</p>
                    <button
                      onClick={() => setFormData({
                        ...formData,
                        notifications: {
                          ...formData.notifications,
                          [item.key]: !formData.notifications[item.key],
                        },
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
        </div>
      </div>
    </div>
  )
}
