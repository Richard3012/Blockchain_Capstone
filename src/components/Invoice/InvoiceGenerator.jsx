import { useState, useRef } from 'react'
import { useStore } from '../../store/useStore'
import Button from '../UI/Button'
import Modal from '../UI/Modal'
import { QRCodeSVG } from 'qrcode.react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export default function InvoiceGenerator({ isOpen, onClose, existingInvoice = null }) {
  const customers = useStore((state) => state.customers)
  const inventory = useStore((state) => state.inventory)
  const addInvoice = useStore((state) => state.addInvoice)
  const addToast = useStore((state) => state.addToast)
  const user = useStore((state) => state.user)
  
  const invoiceRef = useRef(null)
  
  const [invoiceData, setInvoiceData] = useState({
    customerId: existingInvoice?.customerId || '',
    customerName: existingInvoice?.customer || '',
    customerEmail: existingInvoice?.customerEmail || '',
    customerAddress: existingInvoice?.customerAddress || '123 Business Street, City, ST 12345',
    items: existingInvoice?.items || [],
    notes: existingInvoice?.notes || '',
    dueDate: existingInvoice?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    tax: existingInvoice?.tax || 8.5,
    discount: existingInvoice?.discount || 0,
  })
  
  const [showPreview, setShowPreview] = useState(false)
  
  const invoiceNumber = existingInvoice?.id || `INV${String(Date.now()).slice(-5)}`
  const invoiceDate = new Date().toISOString().split('T')[0]
  
  const subtotal = invoiceData.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
  const discountAmount = (subtotal * invoiceData.discount) / 100
  const taxableAmount = subtotal - discountAmount
  const taxAmount = (taxableAmount * invoiceData.tax) / 100
  const total = taxableAmount + taxAmount

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === parseInt(customerId))
    if (customer) {
      setInvoiceData(prev => ({
        ...prev,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        customerAddress: `${customer.company}, Business District`
      }))
    }
  }

  const addItem = () => {
    setInvoiceData(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', productName: '', sku: '', unitPrice: 0, quantity: 1, total: 0 }]
    }))
  }

  const updateItem = (index, field, value) => {
    setInvoiceData(prev => {
      const newItems = [...prev.items]
      if (field === 'productId') {
        const product = inventory.find(p => p.id === parseInt(value))
        if (product) {
          newItems[index] = {
            ...newItems[index],
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.price,
            total: product.price * newItems[index].quantity
          }
        }
      } else {
        newItems[index] = { ...newItems[index], [field]: value }
        if (field === 'quantity' || field === 'unitPrice') {
          newItems[index].total = newItems[index].unitPrice * newItems[index].quantity
        }
      }
      return { ...prev, items: newItems }
    })
  }

  const removeItem = (index) => {
    setInvoiceData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleSave = () => {
    if (!invoiceData.customerName || invoiceData.items.length === 0) {
      addToast('Please add customer and at least one item', 'error')
      return
    }
    
    const invoice = {
      id: invoiceNumber,
      customer: invoiceData.customerName,
      amount: total,
      status: 'Draft',
      dueDate: invoiceData.dueDate,
      items: invoiceData.items,
      tax: invoiceData.tax,
      discount: invoiceData.discount,
      notes: invoiceData.notes
    }
    
    addInvoice(invoice)
    addToast('Invoice created successfully!', 'success')
    onClose()
  }

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return
    
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      })
      
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`${invoiceNumber}.pdf`)
      
      addToast('Invoice downloaded as PDF', 'success')
    } catch (error) {
      addToast('Failed to generate PDF', 'error')
    }
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value)
  }

  const qrData = JSON.stringify({
    invoice: invoiceNumber,
    customer: invoiceData.customerName,
    amount: total,
    date: invoiceDate,
    due: invoiceData.dueDate
  })

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {!showPreview ? (
          // Editor View
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">Create Invoice</h2>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowPreview(true)}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview
                </Button>
              </div>
            </div>

            {/* Customer Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Customer</label>
                <select
                  value={invoiceData.customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-border rounded-lg"
                >
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.company}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Due Date</label>
                <input
                  type="date"
                  value={invoiceData.dueDate}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-border rounded-lg"
                />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-secondary">Line Items</label>
                <Button size="sm" variant="secondary" onClick={addItem}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </Button>
              </div>
              
              <div className="bg-gray-50 rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-gray-100">
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Product</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted w-20">Qty</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted w-28">Unit Price</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted w-28">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="py-2 px-3">
                          <select
                            value={item.productId}
                            onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-border rounded"
                          >
                            <option value="">Select Product</option>
                            {inventory.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-1 text-sm border border-border rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-border rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-sm font-medium">
                          {formatCurrency(item.total)}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-red hover:text-red/80"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {invoiceData.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-text-muted text-sm">
                          No items added. Click "Add Item" to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tax & Discount */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Tax Rate (%)</label>
                <input
                  type="number"
                  value={invoiceData.tax}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, tax: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 bg-white border border-border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Discount (%)</label>
                <input
                  type="number"
                  value={invoiceData.discount}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 bg-white border border-border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Notes</label>
                <input
                  type="text"
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Payment terms, etc."
                  className="w-full px-4 py-2 bg-white border border-border rounded-lg"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-secondary">Subtotal</span>
                <span className="text-text-primary">{formatCurrency(subtotal)}</span>
              </div>
              {invoiceData.discount > 0 && (
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-text-secondary">Discount ({invoiceData.discount}%)</span>
                  <span className="text-green">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-secondary">Tax ({invoiceData.tax}%)</span>
                <span className="text-text-primary">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-blue">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>Save Invoice</Button>
            </div>
          </div>
        ) : (
          // Preview View
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="secondary" onClick={() => setShowPreview(false)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Editor
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleDownloadPDF}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </Button>
                <Button onClick={handleSave}>Save & Send</Button>
              </div>
            </div>

            {/* Invoice Preview */}
            <div 
              ref={invoiceRef}
              className="bg-white rounded-lg border border-border p-8 max-w-2xl mx-auto"
              style={{ minHeight: '800px' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-text-primary">INVOICE</h1>
                  <p className="text-text-muted mt-1">{invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold text-blue">BlockERP</h2>
                  <p className="text-sm text-text-secondary mt-1">Enterprise Solutions</p>
                  <p className="text-sm text-text-muted">support@blockerp.com</p>
                </div>
              </div>

              {/* Billing Info */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-2">Bill To</p>
                  <p className="font-medium text-text-primary">{invoiceData.customerName || 'Customer Name'}</p>
                  <p className="text-sm text-text-secondary">{invoiceData.customerEmail}</p>
                  <p className="text-sm text-text-secondary">{invoiceData.customerAddress}</p>
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <p className="text-xs font-medium text-text-muted uppercase">Invoice Date</p>
                    <p className="text-text-primary">{invoiceDate}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-muted uppercase">Due Date</p>
                    <p className="text-text-primary">{invoiceData.dueDate}</p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full mb-8">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 text-xs font-medium text-text-muted uppercase">Item</th>
                    <th className="text-center py-2 text-xs font-medium text-text-muted uppercase">Qty</th>
                    <th className="text-right py-2 text-xs font-medium text-text-muted uppercase">Price</th>
                    <th className="text-right py-2 text-xs font-medium text-text-muted uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-3">
                        <p className="font-medium text-text-primary">{item.productName}</p>
                        <p className="text-xs text-text-muted">{item.sku}</p>
                      </td>
                      <td className="text-center py-3 text-text-primary">{item.quantity}</td>
                      <td className="text-right py-3 text-text-primary">{formatCurrency(item.unitPrice)}</td>
                      <td className="text-right py-3 font-medium text-text-primary">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-between">
                <div className="flex items-center gap-4">
                  <QRCodeSVG value={qrData} size={80} />
                  <div className="text-xs text-text-muted">
                    <p>Scan for invoice details</p>
                    <p>Blockchain verified</p>
                  </div>
                </div>
                <div className="w-64">
                  <div className="flex justify-between py-1">
                    <span className="text-text-secondary">Subtotal</span>
                    <span className="text-text-primary">{formatCurrency(subtotal)}</span>
                  </div>
                  {invoiceData.discount > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-text-secondary">Discount ({invoiceData.discount}%)</span>
                      <span className="text-green">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-text-secondary">Tax ({invoiceData.tax}%)</span>
                    <span className="text-text-primary">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-200 mt-2">
                    <span className="font-bold text-text-primary">Total</span>
                    <span className="font-bold text-blue text-xl">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              {invoiceData.notes && (
                <div className="mt-8 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Notes</p>
                  <p className="text-sm text-text-secondary">{invoiceData.notes}</p>
                </div>
              )}
              
              <div className="mt-8 pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-text-muted">Thank you for your business!</p>
                <p className="text-xs text-text-muted">Payment is due within 30 days of invoice date.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
