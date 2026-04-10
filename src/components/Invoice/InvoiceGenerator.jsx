import { useMemo, useState, useRef } from 'react'
import { useStore } from '../../store/useStore'
import Button from '../UI/Button'
import Modal from '../UI/Modal'
import { QRCodeSVG } from 'qrcode.react'
import jsPDF from 'jspdf'

export default function InvoiceGenerator({ isOpen, onClose, existingInvoice = null, onSaveInvoice }) {
  const customers = useStore((state) => state.customers)
  const inventory = useStore((state) => state.inventory)
  const addToast = useStore((state) => state.addToast)
  
  const invoiceRef = useRef(null)
  const companyProfile = useMemo(() => ({
    name: 'BlockERP Retail Pvt. Ltd.',
    address: '42 Logistics Park, Outer Ring Road, Bengaluru 560037',
    gstin: '29AABCB4499L1ZP',
    phone: '+91 80 4400 4400',
    email: 'billing@blockerp.local',
  }), [])
  
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
    const customer = customers.find((c) => String(c.id) === String(customerId))
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
        const product = inventory.find((p) => String(p.id) === String(value))
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

  const handleSave = async () => {
    if (!invoiceData.customerName || invoiceData.items.length === 0) {
      addToast('Please add customer and at least one item', 'error')
      return
    }

    const invoicePayload = {
      customerId: invoiceData.customerId,
      customerName: invoiceData.customerName,
      customerEmail: invoiceData.customerEmail,
      dueDate: invoiceData.dueDate,
      subtotal,
      taxAmount,
      totalAmount: total,
      items: invoiceData.items,
      notes: invoiceData.notes,
      taxRate: invoiceData.tax,
      discountRate: invoiceData.discount,
    }

    try {
      if (onSaveInvoice) {
        await onSaveInvoice(invoicePayload)
      }
      addToast('Invoice created successfully!', 'success')
      onClose()
    } catch (error) {
      addToast(error.message || 'Failed to create invoice', 'error')
    }
  }

  const handleDownloadPDF = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const left = 14
      const right = 196
      let y = 16

      const writeLine = (label, value, offset = 0) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, left + offset, y)
        pdf.setFont('helvetica', 'normal')
        pdf.text(String(value || '-'), left + offset + 22, y)
        y += 5
      }

      pdf.setFillColor(20, 33, 61)
      pdf.roundedRect(12, 10, 186, 28, 3, 3, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.text(companyProfile.name, left, 20)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(companyProfile.address, left, 27)
      pdf.text(`GSTIN: ${companyProfile.gstin}  |  ${companyProfile.phone}  |  ${companyProfile.email}`, left, 33)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.text('TAX INVOICE', right, 20, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(`Invoice #: ${invoiceNumber}`, right, 27, { align: 'right' })
      pdf.text(`Invoice Date: ${invoiceDate}`, right, 32, { align: 'right' })
      pdf.text(`Due Date: ${invoiceData.dueDate}`, right, 37, { align: 'right' })

      y = 48
      pdf.setTextColor(32, 33, 36)
      pdf.setFillColor(245, 247, 251)
      pdf.roundedRect(12, y, 88, 36, 2, 2, 'F')
      pdf.roundedRect(110, y, 88, 36, 2, 2, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Billed By', 16, y + 8)
      pdf.text('Billed To', 114, y + 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(companyProfile.name, 16, y + 15)
      pdf.text(companyProfile.address, 16, y + 20, { maxWidth: 80 })
      pdf.text(`GSTIN: ${companyProfile.gstin}`, 16, y + 30)
      pdf.text(invoiceData.customerName || 'Customer Name', 114, y + 15)
      pdf.text(invoiceData.customerAddress || 'Customer address not provided', 114, y + 20, { maxWidth: 80 })
      pdf.text(invoiceData.customerEmail || 'No customer email', 114, y + 30)

      y += 46
      pdf.setFont('helvetica', 'bold')
      pdf.setFillColor(20, 33, 61)
      pdf.setTextColor(255, 255, 255)
      pdf.rect(12, y, 186, 8, 'F')
      pdf.text('Item Description', 16, y + 5.5)
      pdf.text('SKU', 92, y + 5.5)
      pdf.text('Qty', 120, y + 5.5)
      pdf.text('Unit Price', 145, y + 5.5, { align: 'right' })
      pdf.text('Line Total', 190, y + 5.5, { align: 'right' })
      y += 10

      pdf.setTextColor(32, 33, 36)
      pdf.setFont('helvetica', 'normal')
      invoiceData.items.forEach((item, index) => {
        const rowTop = y + (index * 10)
        pdf.setDrawColor(230, 233, 238)
        pdf.line(12, rowTop + 6.5, 198, rowTop + 6.5)
        pdf.text(item.productName || 'Item', 16, rowTop + 4.5, { maxWidth: 70 })
        pdf.text(item.sku || '-', 92, rowTop + 4.5, { maxWidth: 24 })
        pdf.text(String(item.quantity || 0), 120, rowTop + 4.5)
        pdf.text(formatCurrency(item.unitPrice || 0), 145, rowTop + 4.5, { align: 'right' })
        pdf.text(formatCurrency(item.total || 0), 190, rowTop + 4.5, { align: 'right' })
      })

      y += Math.max(invoiceData.items.length, 1) * 10 + 4
      pdf.setDrawColor(210, 214, 220)
      pdf.line(124, y, 198, y)
      y += 6

      writeLine('Subtotal', formatCurrency(subtotal), 110)
      if (invoiceData.discount > 0) {
        writeLine(`Discount (${invoiceData.discount}%)`, `- ${formatCurrency(discountAmount)}`, 110)
      }
      writeLine(`Tax (${invoiceData.tax}%)`, formatCurrency(taxAmount), 110)
      pdf.setDrawColor(20, 33, 61)
      pdf.line(124, y, 198, y)
      y += 8
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.text('Grand Total', 126, y)
      pdf.text(formatCurrency(total), 190, y, { align: 'right' })
      pdf.setFontSize(10)
      y += 10

      pdf.setFillColor(245, 247, 251)
      pdf.roundedRect(12, y, 110, 30, 2, 2, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.text('Payment & Notes', 16, y + 8)
      pdf.setFont('helvetica', 'normal')
      pdf.text(invoiceData.notes || 'Please make payment within 30 days. Contact billing@blockerp.local for account confirmation and GST support.', 16, y + 15, { maxWidth: 102 })
      pdf.setFont('helvetica', 'italic')
      pdf.text('This invoice is tracked for ERP integrity verification.', 16, y + 25)

      pdf.setDrawColor(230, 233, 238)
      pdf.line(12, 275, 198, 275)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text('Generated by BlockERP Retail ERP | MongoDB operational record | Blockchain verification reference available in ledger view', 105, 281, { align: 'center' })

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
