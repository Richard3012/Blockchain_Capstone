import { useEffect, useState } from 'react'

import Button from '../components/UI/Button'
import { walletService } from '../services/walletService'
import { useStore } from '../store/useStore'

export default function Settings() {
  const user = useStore((state) => state.user)
  const setUser = useStore((state) => state.setUser)
  const addToast = useStore((state) => state.addToast)

  const [activeTab, setActiveTab] = useState('profile')
  const [walletStatus, setWalletStatus] = useState({
    linkedWalletAddress: user.linkedWalletAddress || null,
    walletLinkedAt: user.walletLinkedAt || null,
  })
  const [walletLoading, setWalletLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email || '',
    company: 'BlockERP Retail',
    timezone: 'Asia/Kolkata',
    language: 'en',
    theme: 'light',
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
    { id: 'wallet', label: 'Wallet', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h3a1 1 0 011 1v4a1 1 0 01-1 1h-3m0-6v6m0-6h-4a2 2 0 00-2 2v2a2 2 0 002 2h4' },
    { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]

  useEffect(() => {
    walletService
      .status()
      .then((status) => {
        setWalletStatus(status)
        setUser(status)
      })
      .catch(() => {})
  }, [setUser])

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
      addToast(`Wallet linked: ${result.linkedWalletAddress.slice(0, 6)}...${result.linkedWalletAddress.slice(-4)}`, 'success')
    } catch (error) {
      addToast(error.message || 'Wallet linking failed', 'error')
    } finally {
      setWalletLoading(false)
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
              </div>
              <div className="flex justify-end">
                <Button onClick={handleWalletLink} disabled={walletLoading}>
                  {walletLoading ? 'Linking Wallet...' : walletStatus.linkedWalletAddress ? 'Relink Wallet' : 'Link MetaMask Wallet'}
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
