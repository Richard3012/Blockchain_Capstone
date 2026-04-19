import jsPDF from 'jspdf'

/**
 * Generate and download a print-ready PDF invoice (GST-aware, itemized).
 * Accepts the invoice shape from the Invoices store or a populated API row.
 */
export function generateInvoicePDF(invoice) {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const W = 210
  const margin = 16
  const contentW = W - margin * 2
  let y = margin

  const fmt = (v) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0)
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

  const companyName = 'BlockERP Retail Pvt. Ltd.'
  const companyGstin = '29AABCU9603R1ZX'
  const companyAddr = 'Tower A, Manyata Tech Park, Bengaluru 560045'
  const companyEmail = 'accounts@blockerp.local'
  const logoNote = invoice.vendorName || 'BlockERP'

  // ── Header ──
  pdf.setFillColor(15, 23, 42)
  pdf.roundedRect(0, 0, W, 46, 0, 0, 'F')
  pdf.setDrawColor(59, 130, 246)
  pdf.setLineWidth(0.8)
  pdf.line(0, 46, W, 46)

  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(margin, 8, 28, 28, 2, 2, 'F')
  pdf.setTextColor(37, 99, 235)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text('LOGO', margin + 6, 24)

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('TAX INVOICE', margin + 36, 22)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${companyName} · ${logoNote}`, margin + 36, 30)
  pdf.text(`GSTIN ${companyGstin}`, margin + 36, 36)

  pdf.setFontSize(9)
  pdf.text(`Invoice # ${invoice.id || '—'}`, W - margin, 18, { align: 'right' })
  pdf.text(`Issue: ${fmtDate(invoice.issueDate)}`, W - margin, 24, { align: 'right' })
  pdf.text(`Due: ${fmtDate(invoice.dueDate)}`, W - margin, 30, { align: 'right' })
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Status: ${String(invoice.status || '—').toUpperCase()}`, W - margin, 38, { align: 'right' })

  y = 54

  // ── Parties ──
  pdf.setTextColor(71, 85, 105)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('FROM (VENDOR)', margin, y)
  pdf.text('BILL TO (CLIENT)', margin + contentW / 2, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(15, 23, 42)
  pdf.setFontSize(10)
  const leftCol = [
    companyName,
    companyAddr,
    `GSTIN: ${companyGstin}`,
    `Email: ${companyEmail}`,
  ]
  const rightCol = [
    invoice.customer || '—',
    invoice.store ? `Store: ${invoice.store}` : '',
    invoice.order ? `Ref. order: ${invoice.order}` : '',
    invoice.gstin ? `GSTIN: ${invoice.gstin}` : '',
  ].filter(Boolean)

  let yL = y
  let yR = y
  pdf.setFont('helvetica', 'bold')
  leftCol.forEach((line, i) => {
    pdf.setFont(i === 0 ? 'helvetica' : 'helvetica', i === 0 ? 'bold' : 'normal')
    pdf.text(line, margin, yL)
    yL += 5
  })
  pdf.setFont('helvetica', 'bold')
  rightCol.forEach((line, i) => {
    pdf.setFont(i === 0 ? 'helvetica' : 'helvetica', i === 0 ? 'bold' : 'normal')
    pdf.text(line, margin + contentW / 2, yR)
    yR += 5
  })
  y = Math.max(yL, yR) + 6

  pdf.setDrawColor(226, 232, 240)
  pdf.line(margin, y, W - margin, y)
  y += 8

  // ── Line items ──
  const items = invoice.lineItems?.length
    ? invoice.lineItems
    : (invoice.items || invoice.metadata?.lineItems || [])

  if (items.length > 0) {
    pdf.setFillColor(241, 245, 249)
    pdf.rect(margin, y - 4, contentW, 9, 'F')
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(71, 85, 105)
    pdf.text('#', margin + 1, y)
    pdf.text('Description', margin + 10, y)
    pdf.text('Qty', margin + contentW - 54, y, { align: 'right' })
    pdf.text('Rate', margin + contentW - 34, y, { align: 'right' })
    pdf.text('Amount', margin + contentW - 1, y, { align: 'right' })
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(15, 23, 42)
    pdf.setFontSize(9)
    items.forEach((item, i) => {
      const name = item.productName || item.name || item.description || `Line ${i + 1}`
      const qty = item.quantity || item.qty || 1
      const rate = item.unitPrice || item.price || item.rate || 0
      const amount = item.amount != null ? item.amount : qty * rate

      if (y > 258) {
        pdf.addPage()
        y = margin
      }

      pdf.text(String(i + 1), margin + 1, y)
      const wrapped = pdf.splitTextToSize(String(name), contentW - 70)
      pdf.text(wrapped, margin + 10, y)
      pdf.text(String(qty), margin + contentW - 54, y, { align: 'right' })
      pdf.text(fmt(rate), margin + contentW - 34, y, { align: 'right' })
      pdf.text(fmt(amount), margin + contentW - 1, y, { align: 'right' })
      y += Math.max(6, wrapped.length * 4.2)
    })
    y += 4
    pdf.setDrawColor(226, 232, 240)
    pdf.line(margin, y, W - margin, y)
    y += 8
  }

  // ── GST & totals ──
  const subtotal = invoice.subtotal != null ? invoice.subtotal : (invoice.amount != null && invoice.taxAmount != null ? invoice.amount - invoice.taxAmount : null)
  const tax = invoice.taxAmount ?? 0
  const cgst = tax > 0 ? tax / 2 : 0
  const sgst = tax > 0 ? tax / 2 : 0
  const total = invoice.amount ?? invoice.totalAmount ?? 0

  const colRight = W - margin
  pdf.setFontSize(10)
  pdf.setTextColor(71, 85, 105)
  pdf.setFont('helvetica', 'normal')

  if (subtotal != null) {
    pdf.text('Taxable value (excl. GST):', colRight - 62, y)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(15, 23, 42)
    pdf.text(fmt(subtotal), colRight, y, { align: 'right' })
    y += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(71, 85, 105)
  }

  pdf.text('CGST (50% of GST):', colRight - 62, y)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(15, 23, 42)
  pdf.text(fmt(cgst), colRight, y, { align: 'right' })
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(71, 85, 105)
  pdf.text('SGST / UTGST (50% of GST):', colRight - 62, y)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(15, 23, 42)
  pdf.text(fmt(sgst), colRight, y, { align: 'right' })
  y += 6

  pdf.setDrawColor(226, 232, 240)
  pdf.line(colRight - 70, y, colRight, y)
  y += 5
  pdf.setFontSize(12)
  pdf.setTextColor(15, 23, 42)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Invoice total:', colRight - 62, y)
  pdf.text(fmt(total), colRight, y, { align: 'right' })
  y += 8

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(71, 85, 105)
  pdf.text(`Amount paid: ${fmt(invoice.amountPaid || 0)}`, margin, y)
  pdf.text(`Balance due: ${fmt(invoice.balanceDue != null ? invoice.balanceDue : total - (invoice.amountPaid || 0))}`, margin + 70, y)
  y += 6
  pdf.text(`Payment status: ${String(invoice.status || '').toUpperCase()}`, margin, y)
  if (invoice.paymentDate) {
    pdf.text(`Payment date: ${fmtDate(invoice.paymentDate)}`, margin + 70, y)
  }
  y += 10

  if (invoice.blockchainHash) {
    pdf.setDrawColor(226, 232, 240)
    pdf.line(margin, y, W - margin, y)
    y += 6
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(100, 100, 100)
    pdf.text('INTEGRITY ANCHOR (SHA-256 CHAIN)', margin, y)
    y += 4
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(22, 163, 74)
    pdf.text(String(invoice.blockchainHash), margin, y, { maxWidth: contentW })
    y += 10
  }

  pdf.setFontSize(7)
  pdf.setTextColor(148, 163, 184)
  pdf.text('This document was generated by BlockERP for operational use. Retain for GST and audit purposes.', W / 2, 287, { align: 'center' })
  pdf.text(`Printed ${new Date().toLocaleString('en-IN')}`, W / 2, 292, { align: 'center' })

  pdf.save(`${invoice.id || 'Invoice'}.pdf`)
}
