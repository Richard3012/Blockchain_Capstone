import { useEffect, useMemo, useState } from 'react'

import Badge from '../components/UI/Badge'
import { apiClient } from '../services/api/client'

export default function MasterData() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    products: [],
    suppliers: [],
    stores: [],
  })

  useEffect(() => {
    let mounted = true

    Promise.all([
      apiClient.get('/products'),
      apiClient.get('/suppliers'),
      apiClient.get('/stores'),
    ])
      .then(([products, suppliers, stores]) => {
        if (!mounted) return
        setState({
          loading: false,
          error: '',
          products,
          suppliers,
          stores,
        })
      })
      .catch((error) => {
        if (!mounted) return
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Unable to load master data',
        }))
      })

    return () => {
      mounted = false
    }
  }, [])

  const summary = useMemo(() => ({
    products: state.products.length,
    suppliers: state.suppliers.length,
    stores: state.stores.filter((store) => store.type === 'store').length,
    warehouses: state.stores.filter((store) => store.type === 'warehouse').length,
  }), [state.products, state.suppliers, state.stores])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Master Data</h1>
        <p className="text-text-secondary mt-1">Products, suppliers, stores, and warehouses that drive ERP transactions.</p>
      </div>

      {state.error && (
        <div className="rounded-xl border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-text-secondary">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Products" value={summary.products} />
        <SummaryCard label="Suppliers" value={summary.suppliers} />
        <SummaryCard label="Stores" value={summary.stores} />
        <SummaryCard label="Warehouses" value={summary.warehouses} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          title="Products and SKU Catalog"
          loading={state.loading}
          rows={state.products.slice(0, 6)}
          renderRow={(product) => (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{product.name}</p>
                <p className="text-xs text-text-secondary">{product.sku} · {product.category || 'Uncategorized'}</p>
              </div>
              <Badge>{(product.currentStock ?? 0) <= (product.reorderLevel ?? 0) ? 'Low Stock' : 'In Stock'}</Badge>
            </div>
          )}
          emptyText="No product master records found."
        />

        <SectionCard
          title="Suppliers"
          loading={state.loading}
          rows={state.suppliers.slice(0, 6)}
          renderRow={(supplier) => (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{supplier.name}</p>
                <p className="text-xs text-text-secondary">{supplier.code} · {supplier.paymentTermsDays || 0} day terms</p>
              </div>
              <Badge variant="primary">Active</Badge>
            </div>
          )}
          emptyText="No supplier records found."
        />

        <SectionCard
          title="Stores and Warehouses"
          loading={state.loading}
          rows={state.stores.slice(0, 6)}
          renderRow={(store) => (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{store.name}</p>
                <p className="text-xs text-text-secondary">{store.code} · {store.address || 'Address pending'}</p>
              </div>
              <Badge variant={store.type === 'warehouse' ? 'warning' : 'success'}>
                {store.type === 'warehouse' ? 'Warehouse' : 'Store'}
              </Badge>
            </div>
          )}
          emptyText="No store records found."
        />
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
    </div>
  )
}

function SectionCard({ title, loading, rows, renderRow, emptyText }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
      <h2 className="font-semibold text-text-primary">{title}</h2>
      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-text-secondary">Loading…</p>}
        {!loading && rows.length === 0 && <p className="text-sm text-text-secondary">{emptyText}</p>}
        {!loading && rows.map((row) => (
          <div key={row._id} className="rounded-lg border border-border p-3">
            {renderRow(row)}
          </div>
        ))}
      </div>
    </div>
  )
}
