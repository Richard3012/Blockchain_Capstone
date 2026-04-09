import { useEffect, useMemo, useState } from 'react'

import ProductQRCode from '../components/QRCode/ProductQRCode'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import { useLiveData, invalidateLiveData } from '../hooks/useLiveData'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const emptyProductForm = {
  sku: '',
  name: '',
  category: '',
  unit: 'pcs',
  costPrice: '',
  salePrice: '',
  reorderLevel: '',
  currentStock: '',
  description: '',
}

export default function Inventory() {
  useLiveData('inventory')
  const inventory = useStore((state) => state.inventory)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getInventoryStats = useStore((state) => state.getInventoryStats)
  const hasPermission = useStore((state) => state.hasPermission)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedProductQR, setSelectedProductQR] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [restockForm, setRestockForm] = useState({ productId: '', quantity: '25', storeId: user.storeId || '', notes: 'Routine restock' })
  const [submitting, setSubmitting] = useState(false)
  const [stores, setStores] = useState([])

  const stats = getInventoryStats()
  const canEditInventory = hasPermission('edit_inventory') || hasPermission('view_all')

  useEffect(() => {
    apiClient.get('/stores').then(setStores).catch(() => {})
  }, [])

  const categories = useMemo(() => [...new Set(inventory.map((product) => product.category).filter(Boolean))], [inventory])

  const filteredInventory = useMemo(() => {
    return inventory.filter((product) => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || product.sku.toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [inventory, localSearch, searchQuery, categoryFilter, statusFilter])

  const maxStock = Math.max(...inventory.map((product) => product.stock), 1)

  const reloadInventory = async () => {
    invalidateLiveData('inventory', 'audit', 'blockchain')
    const products = await apiClient.get('/products')
    useStore.getState().setInventory(products.map((product) => {
      const stock = product.currentStock ?? 0
      const reorder = product.reorderLevel ?? 0
      let status = 'In Stock'
      if (stock <= 0) status = 'Out of Stock'
      else if (stock <= reorder) status = 'Low Stock'

      return {
        id: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category || '-',
        unit: product.unit || 'pcs',
        costPrice: product.costPrice || 0,
        salePrice: product.salePrice || 0,
        price: product.salePrice || product.costPrice || 0,
        stock,
        reorderLevel: reorder,
        status,
        lastRestocked: product.updatedAt,
      }
    }))
  }

  const handleCreateProduct = async (event) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      await apiClient.post('/products', {
        sku: productForm.sku.trim(),
        name: productForm.name.trim(),
        category: productForm.category.trim() || undefined,
        unit: productForm.unit.trim() || 'pcs',
        description: productForm.description.trim() || undefined,
        costPrice: Number(productForm.costPrice),
        salePrice: Number(productForm.salePrice),
        reorderLevel: Number(productForm.reorderLevel || 0),
        currentStock: Number(productForm.currentStock || 0),
      })

      await reloadInventory()
      setProductForm(emptyProductForm)
      setShowCreateModal(false)
      addToast('Product created and synced with MongoDB', 'success')
    } catch (error) {
      addToast(error.message || 'Unable to create product', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestock = async (event) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      await apiClient.post('/inventory/stock-in', {
        productId: restockForm.productId,
        quantity: Number(restockForm.quantity),
        storeId: restockForm.storeId || user.storeId,
        notes: restockForm.notes || 'Manual restock',
      })

      await reloadInventory()
      setShowRestockModal(false)
      setRestockForm({ productId: '', quantity: '25', storeId: user.storeId || '', notes: 'Routine restock' })
      addToast('Inventory restocked successfully', 'success')
    } catch (error) {
      addToast(error.message || 'Unable to restock product', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventory</h1>
          <p className="text-text-secondary mt-1">Track stock, create products, and restock store items from MongoDB-backed ERP data.</p>
        </div>
        {canEditInventory && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowRestockModal(true)}>Restock Product</Button>
            <Button onClick={() => setShowCreateModal(true)}>New Product</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Products</p>
          <p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.total} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">In Stock</p>
          <p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.inStock} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Low Stock</p>
          <p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.lowStock} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Value</p>
          <p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.totalValue} prefix="₹" /></p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Status</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Product</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">SKU</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Category</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Unit</th>
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
                    <td className="py-4 px-6 text-sm text-text-secondary">{product.unit}</td>
                    <td className="py-4 px-6 text-sm text-text-primary font-medium">₹{Number(product.price || 0).toLocaleString()}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${stockPercent}%` }} />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-12 text-right">{product.stock}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6"><Badge>{product.status}</Badge></td>
                    <td className="py-4 px-6">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setSelectedProductQR(product)}>QR</Button>
                        {canEditInventory && (
                          <Button
                            size="sm"
                            variant={product.status === 'In Stock' ? 'secondary' : 'primary'}
                            onClick={() => {
                              setRestockForm({
                                productId: product.id,
                                quantity: '25',
                                storeId: user.storeId || stores[0]?._id || '',
                                notes: `Restock for ${product.name}`,
                              })
                              setShowRestockModal(true)
                            }}
                          >
                            Restock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <Modal title="Create Product" onClose={() => setShowCreateModal(false)} size="lg">
          <form className="space-y-4" onSubmit={handleCreateProduct}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="SKU"><input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required /></Field>
              <Field label="Product Name"><input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required /></Field>
              <Field label="Category"><input value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" /></Field>
              <Field label="Unit"><input value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" /></Field>
              <Field label="Cost Price"><input type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(event) => setProductForm((current) => ({ ...current, costPrice: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required /></Field>
              <Field label="Sale Price"><input type="number" min="0" step="0.01" value={productForm.salePrice} onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required /></Field>
              <Field label="Reorder Level"><input type="number" min="0" value={productForm.reorderLevel} onChange={(event) => setProductForm((current) => ({ ...current, reorderLevel: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" /></Field>
              <Field label="Opening Stock"><input type="number" min="0" value={productForm.currentStock} onChange={(event) => setProductForm((current) => ({ ...current, currentStock: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" /></Field>
            </div>
            <Field label="Description">
              <textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white min-h-[96px]" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Create Product'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {showRestockModal && (
        <Modal title="Restock Product" onClose={() => setShowRestockModal(false)} size="md">
          <form className="space-y-4" onSubmit={handleRestock}>
            <Field label="Product">
              <select value={restockForm.productId} onChange={(event) => setRestockForm((current) => ({ ...current, productId: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required>
                <option value="">Select product</option>
                {inventory.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity">
                <input type="number" min="1" value={restockForm.quantity} onChange={(event) => setRestockForm((current) => ({ ...current, quantity: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required />
              </Field>
              <Field label="Store">
                <select value={restockForm.storeId || user.storeId || ''} onChange={(event) => setRestockForm((current) => ({ ...current, storeId: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" required>
                  <option value="">Select store</option>
                  {stores.map((store) => <option key={store._id} value={store._id}>{store.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <input value={restockForm.notes} onChange={(event) => setRestockForm((current) => ({ ...current, notes: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg bg-white" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowRestockModal(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Apply Restock'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedProductQR && (
        <ProductQRCode product={selectedProductQR} onClose={() => setSelectedProductQR(null)} />
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}
