import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import ProductQRCode from '../components/QRCode/ProductQRCode'

export default function Inventory() {
  const inventory = useStore((state) => state.inventory)
  const restockProduct = useStore((state) => state.restockProduct)
  const appendAuditEntry = useStore((state) => state.appendAuditEntry)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getInventoryStats = useStore((state) => state.getInventoryStats)

  const [localSearch, setLocalSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedProductQR, setSelectedProductQR] = useState(null)

  const stats = getInventoryStats()

  const categories = useMemo(() => {
    return [...new Set(inventory.map(p => p.category))]
  }, [inventory])

  const filteredInventory = useMemo(() => {
    return inventory.filter(p => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [inventory, localSearch, searchQuery, categoryFilter, statusFilter])

  const handleRestock = (product) => {
    restockProduct(product.id, 100)
    appendAuditEntry({
      id: Date.now(),
      user: 'Alex Thompson',
      action: 'Restock initiated',
      entity: 'Product',
      entityId: product.sku,
      hash: `0x${Math.random().toString(16).slice(2, 42)}`,
      timestamp: new Date().toISOString(),
      details: `Restock order placed for ${product.name}`
    })
    addToast(`Restock order placed for ${product.name}`, 'success')
  }

  const maxStock = Math.max(...inventory.map(p => p.stock), 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Inventory</h1>
        <p className="text-text-secondary mt-1">Track and manage your product stock levels</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Products</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.total} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">In Stock</p>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.inStock} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Low Stock</p>
          <p className="text-2xl font-bold text-orange mt-1">
            <AnimatedNumber value={stats.lowStock} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Value</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.totalValue} prefix="₹" />
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
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
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Status</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Product</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">SKU</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Category</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Price</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide w-48">Stock Level</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((product) => {
                const stockPercent = Math.min(100, (product.stock / maxStock) * 100)
                const barColor = product.status === 'In Stock' ? 'bg-green' : product.status === 'Low Stock' ? 'bg-orange' : 'bg-red'
                
                return (
                  <tr key={product.id} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-medium text-text-primary">{product.name}</p>
                    </td>
                    <td className="py-4 px-6 text-sm text-text-secondary font-mono">{product.sku}</td>
                    <td className="py-4 px-6 text-sm text-text-secondary">{product.category}</td>
                    <td className="py-4 px-6 text-sm text-text-primary font-medium">${product.price.toLocaleString()}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${barColor} rounded-full transition-all duration-500`}
                            style={{ width: `${stockPercent}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-12 text-right">
                          {product.stock}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge>{product.status}</Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => setSelectedProductQR(product)}
                          title="Generate QR Code"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                        </Button>
                        <Button 
                          size="sm" 
                          variant={product.status === 'In Stock' ? 'secondary' : 'primary'}
                          onClick={() => handleRestock(product)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restock
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Code Modal */}
      {selectedProductQR && (
        <ProductQRCode 
          product={selectedProductQR} 
          onClose={() => setSelectedProductQR(null)} 
        />
      )}
    </div>
  )
}
