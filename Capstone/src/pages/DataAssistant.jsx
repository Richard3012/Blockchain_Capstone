import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import Button from '../components/UI/Button'
import { YEARLY_DATA, QUARTERLY_DATA, MONTHLY_DATA, PRODUCT_HISTORY, CUSTOMER_SEGMENTS, REGIONAL_DATA } from '../data/seed'

// AI Response processor - simulates MCP-like data extraction
const processQuery = (query, storeData) => {
  const lowerQuery = query.toLowerCase()
  
  // Year-based queries
  if (lowerQuery.includes('year') || lowerQuery.includes('annual') || lowerQuery.includes('yearly')) {
    const yearMatch = lowerQuery.match(/20\d{2}/)
    if (yearMatch) {
      const year = parseInt(yearMatch[0])
      const yearData = YEARLY_DATA.find(d => d.year === year)
      if (yearData) {
        return {
          type: 'yearly',
          data: yearData,
          response: `📊 **${year} Annual Report**\n\n| Metric | Value |\n|--------|-------|\n| Revenue | ₹${yearData.revenue.toLocaleString()} |\n| Orders | ${yearData.orders} |\n| Customers | ${yearData.customers} |\n| Expenses | ₹${yearData.expenses.toLocaleString()} |\n| Profit | ₹${yearData.profit.toLocaleString()} |\n\n*Profit Margin: ${((yearData.profit / yearData.revenue) * 100).toFixed(1)}%*`
        }
      }
    }
    // All years comparison
    return {
      type: 'yearly-all',
      data: YEARLY_DATA,
      response: `📊 **Year-over-Year Performance**\n\n| Year | Revenue | Orders | Customers | Profit |\n|------|---------|--------|-----------|--------|\n${YEARLY_DATA.map(y => `| ${y.year} | ₹${(y.revenue / 1000000).toFixed(2)}M | ${y.orders} | ${y.customers} | ₹${(y.profit / 1000000).toFixed(2)}M |`).join('\n')}\n\n*2026 data is year-to-date through March.*`
    }
  }

  // Quarter-based queries
  if (lowerQuery.includes('quarter') || lowerQuery.includes('q1') || lowerQuery.includes('q2') || lowerQuery.includes('q3') || lowerQuery.includes('q4')) {
    const yearMatch = lowerQuery.match(/20\d{2}/)
    const quarterMatch = lowerQuery.match(/q[1-4]/i)
    
    if (yearMatch && quarterMatch) {
      const year = parseInt(yearMatch[0])
      const quarter = quarterMatch[0].toUpperCase()
      const qData = QUARTERLY_DATA.find(d => d.year === year && d.quarter === quarter)
      if (qData) {
        return {
          type: 'quarterly',
          data: qData,
          response: `📈 **${quarter} ${year} Report**\n\n| Metric | Value |\n|--------|-------|\n| Revenue | ₹${qData.revenue.toLocaleString()} |\n| Orders | ${qData.orders} |\n| Customers | ${qData.customers} |\n| Top Product | ${qData.topProduct} |`
        }
      }
    }
    
    // All quarters for a year
    if (yearMatch) {
      const year = parseInt(yearMatch[0])
      const yearQuarters = QUARTERLY_DATA.filter(d => d.year === year)
      if (yearQuarters.length > 0) {
        return {
          type: 'quarterly-year',
          data: yearQuarters,
          response: `📈 **${year} Quarterly Breakdown**\n\n| Quarter | Revenue | Orders | Top Product |\n|---------|---------|--------|-------------|\n${yearQuarters.map(q => `| ${q.quarter} | ₹${q.revenue.toLocaleString()} | ${q.orders} | ${q.topProduct} |`).join('\n')}`
        }
      }
    }
    
    // General quarterly data
    return {
      type: 'quarterly-all',
      data: QUARTERLY_DATA,
      response: `📈 **Quarterly Performance Overview**\n\nI can provide quarterly data for years 2022-2026. Please specify a year (e.g., "Show Q1 2025" or "quarterly data for 2024").`
    }
  }

  // Monthly queries
  if (lowerQuery.includes('month') || lowerQuery.includes('january') || lowerQuery.includes('february') || 
      lowerQuery.includes('march') || lowerQuery.includes('april') || lowerQuery.includes('may') ||
      lowerQuery.includes('june') || lowerQuery.includes('july') || lowerQuery.includes('august') ||
      lowerQuery.includes('september') || lowerQuery.includes('october') || lowerQuery.includes('november') ||
      lowerQuery.includes('december')) {
    
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const monthMatch = months.find(m => lowerQuery.includes(m))
    const yearMatch = lowerQuery.match(/20\d{2}/)
    
    if (monthMatch && yearMatch) {
      const year = parseInt(yearMatch[0])
      const monthName = monthMatch.charAt(0).toUpperCase() + monthMatch.slice(1)
      const mData = MONTHLY_DATA.find(d => d.year === year && d.month === monthName)
      if (mData) {
        return {
          type: 'monthly',
          data: mData,
          response: `📅 **${monthName} ${year} Report**\n\n| Metric | Value |\n|--------|-------|\n| Revenue | $${mData.revenue.toLocaleString()} |\n| Orders | ${mData.orders} |\n| New Customers | ${mData.newCustomers} |\n| Churned Customers | ${mData.churnedCustomers} |\n| Net Customer Growth | +${mData.newCustomers - mData.churnedCustomers} |`
        }
      }
    }
    
    // Monthly overview
    const yearMatch2 = lowerQuery.match(/20\d{2}/)
    if (yearMatch2) {
      const year = parseInt(yearMatch2[0])
      const yearMonths = MONTHLY_DATA.filter(d => d.year === year)
      if (yearMonths.length > 0) {
        return {
          type: 'monthly-year',
          data: yearMonths,
          response: `📅 **${year} Monthly Breakdown**\n\n| Month | Revenue | Orders | New Customers |\n|-------|---------|--------|---------------|\n${yearMonths.map(m => `| ${m.month} | $${m.revenue.toLocaleString()} | ${m.orders} | ${m.newCustomers} |`).join('\n')}`
        }
      }
    }
    
    return {
      type: 'monthly-all',
      data: MONTHLY_DATA,
      response: `📅 **Monthly Data Available**\n\nI have monthly data for 2025-2026. Try asking:\n- "Show January 2026 data"\n- "Monthly breakdown for 2025"\n- "Compare February 2025 vs 2026"`
    }
  }

  // Product queries
  if (lowerQuery.includes('product') || lowerQuery.includes('inventory') || lowerQuery.includes('stock') || lowerQuery.includes('best sell') || lowerQuery.includes('top sell')) {
    const topProducts = [...storeData.inventory].sort((a, b) => b.price * b.stock - a.price * a.stock).slice(0, 5)
    return {
      type: 'products',
      data: topProducts,
      response: `📦 **Product Performance**\n\n**Top Products by Value:**\n\n| Product | SKU | Price | Stock | Value |\n|---------|-----|-------|-------|-------|\n${topProducts.map(p => `| ${p.name} | ${p.sku} | $${p.price.toLocaleString()} | ${p.stock} | $${(p.price * p.stock).toLocaleString()} |`).join('\n')}\n\n**Inventory Status:**\n- In Stock: ${storeData.inventory.filter(p => p.status === 'In Stock').length}\n- Low Stock: ${storeData.inventory.filter(p => p.status === 'Low Stock').length}\n- Out of Stock: ${storeData.inventory.filter(p => p.status === 'Out of Stock').length}`
    }
  }

  // Customer queries
  if (lowerQuery.includes('customer') || lowerQuery.includes('client') || lowerQuery.includes('segment')) {
    return {
      type: 'customers',
      data: { segments: CUSTOMER_SEGMENTS, stats: storeData.customers },
      response: `👥 **Customer Analytics**\n\n**Customer Segments:**\n\n| Segment | Count | Revenue | Avg Order |\n|---------|-------|---------|----------|\n${CUSTOMER_SEGMENTS.map(s => `| ${s.segment} | ${s.count} | $${s.revenue.toLocaleString()} | $${s.avgOrderValue.toLocaleString()} |`).join('\n')}\n\n**Current Status:**\n- Total Customers: ${storeData.customers.length}\n- Active: ${storeData.customers.filter(c => c.status === 'Customer').length}\n- Leads: ${storeData.customers.filter(c => c.status === 'Lead').length}\n- Prospects: ${storeData.customers.filter(c => c.status === 'Prospect').length}\n- Churned: ${storeData.customers.filter(c => c.status === 'Churned').length}`
    }
  }

  // Regional queries
  if (lowerQuery.includes('region') || lowerQuery.includes('geographic') || lowerQuery.includes('location') || lowerQuery.includes('country') || lowerQuery.includes('market')) {
    return {
      type: 'regional',
      data: REGIONAL_DATA,
      response: `🌍 **Regional Performance**\n\n| Region | Revenue | Orders | Growth |\n|--------|---------|--------|--------|\n${REGIONAL_DATA.map(r => `| ${r.region} | $${r.revenue.toLocaleString()} | ${r.orders} | +${r.growth}% |`).join('\n')}\n\n**Fastest Growing:** Asia Pacific (+35%)\n**Largest Market:** North America ($1.52M)`
    }
  }

  // Revenue queries
  if (lowerQuery.includes('revenue') || lowerQuery.includes('sales') || lowerQuery.includes('income') || lowerQuery.includes('earning')) {
    const totalRevenue = YEARLY_DATA.reduce((sum, y) => sum + y.revenue, 0)
    const avgGrowth = ((YEARLY_DATA[4].revenue / YEARLY_DATA[0].revenue - 1) * 100 / 4).toFixed(1)
    return {
      type: 'revenue',
      data: YEARLY_DATA,
      response: `💰 **Revenue Analysis**\n\n**Lifetime Revenue:** $${totalRevenue.toLocaleString()}\n**Average Annual Growth:** ${avgGrowth}%\n\n| Year | Revenue | YoY Growth |\n|------|---------|------------|\n${YEARLY_DATA.map((y, i) => {
        const prev = YEARLY_DATA[i - 1]
        const growth = prev ? (((y.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1) : 'N/A'
        return `| ${y.year} | $${(y.revenue / 1000000).toFixed(2)}M | ${growth === 'N/A' ? 'N/A' : growth + '%'} |`
      }).join('\n')}`
    }
  }

  // Order queries
  if (lowerQuery.includes('order') || lowerQuery.includes('purchase')) {
    const orderStats = {
      total: storeData.orders.length,
      shipped: storeData.orders.filter(o => o.status === 'Shipped').length,
      delivered: storeData.orders.filter(o => o.status === 'Delivered').length,
      processing: storeData.orders.filter(o => o.status === 'Processing').length,
      pending: storeData.orders.filter(o => o.status === 'Pending').length,
      cancelled: storeData.orders.filter(o => o.status === 'Cancelled').length,
    }
    const totalValue = storeData.orders.reduce((sum, o) => sum + o.amount, 0)
    return {
      type: 'orders',
      data: orderStats,
      response: `📋 **Orders Overview**\n\n**Current Orders:** ${orderStats.total}\n**Total Value:** $${totalValue.toLocaleString()}\n\n| Status | Count | Percentage |\n|--------|-------|------------|\n| Delivered | ${orderStats.delivered} | ${((orderStats.delivered / orderStats.total) * 100).toFixed(1)}% |\n| Shipped | ${orderStats.shipped} | ${((orderStats.shipped / orderStats.total) * 100).toFixed(1)}% |\n| Processing | ${orderStats.processing} | ${((orderStats.processing / orderStats.total) * 100).toFixed(1)}% |\n| Pending | ${orderStats.pending} | ${((orderStats.pending / orderStats.total) * 100).toFixed(1)}% |\n| Cancelled | ${orderStats.cancelled} | ${((orderStats.cancelled / orderStats.total) * 100).toFixed(1)}% |`
    }
  }

  // Invoice queries
  if (lowerQuery.includes('invoice') || lowerQuery.includes('billing') || lowerQuery.includes('payment')) {
    const invoiceStats = {
      total: storeData.invoices.length,
      paid: storeData.invoices.filter(i => i.status === 'Paid').length,
      overdue: storeData.invoices.filter(i => i.status === 'Overdue').length,
      sent: storeData.invoices.filter(i => i.status === 'Sent').length,
      draft: storeData.invoices.filter(i => i.status === 'Draft').length,
    }
    const totalValue = storeData.invoices.reduce((sum, i) => sum + i.amount, 0)
    const paidValue = storeData.invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0)
    return {
      type: 'invoices',
      data: invoiceStats,
      response: `🧾 **Invoice Summary**\n\n**Total Invoices:** ${invoiceStats.total}\n**Total Value:** $${totalValue.toLocaleString()}\n**Collected:** $${paidValue.toLocaleString()}\n\n| Status | Count | Percentage |\n|--------|-------|------------|\n| Paid | ${invoiceStats.paid} | ${((invoiceStats.paid / invoiceStats.total) * 100).toFixed(1)}% |\n| Overdue | ${invoiceStats.overdue} | ${((invoiceStats.overdue / invoiceStats.total) * 100).toFixed(1)}% |\n| Sent | ${invoiceStats.sent} | ${((invoiceStats.sent / invoiceStats.total) * 100).toFixed(1)}% |\n| Draft | ${invoiceStats.draft} | ${((invoiceStats.draft / invoiceStats.total) * 100).toFixed(1)}% |`
    }
  }

  // Profit/Expense queries
  if (lowerQuery.includes('profit') || lowerQuery.includes('expense') || lowerQuery.includes('margin') || lowerQuery.includes('cost')) {
    return {
      type: 'profit',
      data: YEARLY_DATA,
      response: `📊 **Profit & Expense Analysis**\n\n| Year | Revenue | Expenses | Profit | Margin |\n|------|---------|----------|--------|--------|\n${YEARLY_DATA.map(y => `| ${y.year} | $${(y.revenue / 1000000).toFixed(2)}M | $${(y.expenses / 1000000).toFixed(2)}M | $${(y.profit / 1000000).toFixed(2)}M | ${((y.profit / y.revenue) * 100).toFixed(1)}% |`).join('\n')}\n\n*2026 data is year-to-date.*`
    }
  }

  // Comparison queries
  if (lowerQuery.includes('compare') || lowerQuery.includes('vs') || lowerQuery.includes('versus') || lowerQuery.includes('difference')) {
    const year1Match = lowerQuery.match(/20\d{2}/)
    const years = lowerQuery.match(/20\d{2}/g)
    
    if (years && years.length >= 2) {
      const y1 = YEARLY_DATA.find(d => d.year === parseInt(years[0]))
      const y2 = YEARLY_DATA.find(d => d.year === parseInt(years[1]))
      if (y1 && y2) {
        const revChange = ((y2.revenue - y1.revenue) / y1.revenue * 100).toFixed(1)
        const orderChange = ((y2.orders - y1.orders) / y1.orders * 100).toFixed(1)
        return {
          type: 'comparison',
          data: { y1, y2 },
          response: `📊 **${y1.year} vs ${y2.year} Comparison**\n\n| Metric | ${y1.year} | ${y2.year} | Change |\n|--------|------|------|--------|\n| Revenue | $${y1.revenue.toLocaleString()} | $${y2.revenue.toLocaleString()} | ${revChange > 0 ? '+' : ''}${revChange}% |\n| Orders | ${y1.orders} | ${y2.orders} | ${orderChange > 0 ? '+' : ''}${orderChange}% |\n| Customers | ${y1.customers} | ${y2.customers} | ${y2.customers > y1.customers ? '+' : ''}${y2.customers - y1.customers} |\n| Profit | $${y1.profit.toLocaleString()} | $${y2.profit.toLocaleString()} | ${(((y2.profit - y1.profit) / y1.profit) * 100).toFixed(1)}% |`
        }
      }
    }
  }

  // Help / capabilities
  if (lowerQuery.includes('help') || lowerQuery.includes('what can') || lowerQuery.includes('capabilities') || lowerQuery.includes('how to')) {
    return {
      type: 'help',
      data: null,
      response: `🤖 **BlockERP Data Assistant**\n\nI can help you analyze your business data. Here's what I can do:\n\n**📊 Time-Based Analysis:**\n- Yearly data (2022-2026)\n- Quarterly breakdowns\n- Monthly reports\n\n**💼 Business Metrics:**\n- Revenue & profit analysis\n- Order statistics\n- Invoice summaries\n- Customer analytics\n\n**📦 Operations:**\n- Product performance\n- Inventory status\n- Regional sales data\n\n**Example Queries:**\n- "Show 2024 annual report"\n- "Q3 2025 performance"\n- "January 2026 data"\n- "Compare 2023 vs 2025"\n- "Top selling products"\n- "Customer segments"\n- "Regional breakdown"`
    }
  }

  // Default response
  return {
    type: 'general',
    data: null,
    response: `I can help you analyze your business data. Here are some things you can ask:\n\n- **Yearly data:** "Show 2024 annual report"\n- **Quarterly data:** "Q2 2025 performance"\n- **Monthly data:** "February 2026 figures"\n- **Products:** "Top selling products"\n- **Customers:** "Customer segment breakdown"\n- **Revenue:** "Revenue trend analysis"\n- **Comparisons:** "Compare 2023 vs 2024"\n\nWhat would you like to know?`
  }
}

export default function DataAssistant() {
  const inventory = useStore((state) => state.inventory)
  const orders = useStore((state) => state.orders)
  const invoices = useStore((state) => state.invoices)
  const customers = useStore((state) => state.customers)
  
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: `👋 **Welcome to BlockERP Data Assistant!**\n\nI'm your AI-powered analytics companion. I can help you extract and analyze data from your ERP system, including:\n\n- 📊 Historical data (2022-2026)\n- 📈 Quarterly & monthly breakdowns\n- 💰 Revenue & profit analysis\n- 👥 Customer insights\n- 📦 Product performance\n\n**Try asking:** "Show me 2025 yearly report" or "Compare Q1 2025 vs Q1 2026"`,
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputValue.trim()) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700))

    const storeData = { inventory, orders, invoices, customers }
    const response = processQuery(userMessage.content, storeData)

    const assistantMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: response.response,
      data: response.data,
      type: response.type,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, assistantMessage])
    setIsTyping(false)
  }

  const handleQuickAction = (query) => {
    setInputValue(query)
    inputRef.current?.focus()
  }

  const handleExportData = (data, type) => {
    if (!data) return
    
    const exportData = {
      type,
      exportedAt: new Date().toISOString(),
      data
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `blockerp-${type}-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = (data, type) => {
    if (!data || !Array.isArray(data)) return
    
    const headers = Object.keys(data[0] || {})
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `blockerp-${type}-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const quickActions = [
    { label: '2025 Report', query: 'Show 2025 annual report' },
    { label: 'Q1 2026', query: 'Q1 2026 quarterly data' },
    { label: 'Top Products', query: 'Top selling products' },
    { label: 'Revenue Trend', query: 'Revenue analysis all years' },
    { label: 'Customers', query: 'Customer segment breakdown' },
    { label: 'Compare Years', query: 'Compare 2024 vs 2025' },
  ]

  const formatMessage = (content) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
      .replace(/\|(.*?)\|/g, (match) => {
        // Basic table rendering
        return match
      })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-blue to-purple rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            Data Assistant
          </h1>
          <p className="text-text-secondary mt-1">AI-powered analytics for your ERP data</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="w-2 h-2 bg-green rounded-full animate-pulse"></span>
          MCP Connected
        </div>
      </div>

      {/* Chat Interface */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Messages Area */}
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-blue text-white'
                      : 'bg-gray-100 text-text-primary'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                    />
                  ) : (
                    <p>{message.content}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <p className={`text-xs ${message.role === 'user' ? 'text-blue-100' : 'text-text-muted'}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {message.role === 'assistant' && message.data && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleExportData(message.data, message.type)}
                          className="text-xs text-blue hover:text-blue/80 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          JSON
                        </button>
                        {Array.isArray(message.data) && (
                          <button
                            onClick={() => handleExportCSV(message.data, message.type)}
                            className="text-xs text-green hover:text-green/80 flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            CSV
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-6 py-3 border-t border-border bg-gray-50">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickAction(action.query)}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-border rounded-full hover:border-blue hover:text-blue transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-border">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your data... (e.g., 'Show Q1 2025 revenue')"
                className="flex-1 px-4 py-3 bg-gray-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                disabled={isTyping}
              />
              <Button type="submit" disabled={isTyping || !inputValue.trim()}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Historical Data</p>
              <p className="text-xs text-text-muted">2022 - 2026</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Data Sources</p>
              <p className="text-xs text-text-muted">Orders, Invoices, Customers, Products</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Real-time Updates</p>
              <p className="text-xs text-text-muted">Live data extraction</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
