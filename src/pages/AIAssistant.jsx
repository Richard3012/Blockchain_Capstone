import { useState, useRef, useEffect } from 'react'
import Button from '../components/UI/Button'
import { apiClient } from '../services/api/client'

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content:
        '**Welcome to BlockERP AI Assistant**\n\nI have full access to your live ERP data. Ask me anything:\n\n' +
        '- "Today\'s sales"\n' +
        '- "Overdue invoices"\n' +
        '- "Low stock alerts"\n' +
        '- "P&L statement"\n' +
        '- "Recent orders"\n' +
        '- "Customer count"\n' +
        '- "Trial balance"\n' +
        '- "Balance sheet"\n\n' +
        'Type **help** for the full list.',
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || isTyping) return

    const userMsg = { id: Date.now(), role: 'user', content: text, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setIsTyping(true)

    try {
      const result = await apiClient.post('/assistant/query', { query: text })
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.text || result.response || 'No response.',
          data: result.data,
          intent: result.intent,
          timestamp: new Date(),
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Error: ${err.message || 'Could not reach the server.'}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickAction = (query) => {
    setInputValue(query)
    inputRef.current?.focus()
  }

  const handleExport = (data, intent) => {
    if (!data) return
    const blob = new Blob([JSON.stringify({ intent, exportedAt: new Date().toISOString(), data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `blockerp-${intent || 'data'}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatMarkdown = (text) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')

  const quickActions = [
    { label: "Today's Sales", query: "Today's sales" },
    { label: 'Overdue Invoices', query: 'Overdue invoices' },
    { label: 'Low Stock', query: 'Low stock alerts' },
    { label: 'P&L', query: 'Profit and loss' },
    { label: 'Recent Orders', query: 'Recent orders' },
    { label: 'Invoice Summary', query: 'Invoice summary' },
    { label: 'Top Products', query: 'Top products' },
    { label: 'Balance Sheet', query: 'Balance sheet' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-blue to-purple rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.75-11.396c.251.023.501.05.75.082M12 3v1.5M8 14.5h8M8 14.5l-1.5 6h11l-1.5-6M8 14.5H5M16 14.5h3" />
              </svg>
            </span>
            AI Assistant
          </h1>
          <p className="text-text-secondary mt-1">Ask anything about your live ERP data</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="w-2 h-2 bg-green rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {/* Chat */}
      <div
        className="bg-white rounded-xl shadow-sm border border-border overflow-hidden"
        style={{ height: 'calc(100vh - 280px)' }}
      >
        <div className="h-full flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user' ? 'bg-blue text-white' : 'bg-gray-100 text-text-primary'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                    />
                  ) : (
                    <p>{msg.content}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <p className={`text-xs ${msg.role === 'user' ? 'text-blue-100' : 'text-text-muted'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {msg.role === 'assistant' && msg.data && (
                      <button
                        onClick={() => handleExport(msg.data, msg.intent)}
                        className="text-xs text-blue hover:text-blue/80 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Export
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-6 py-3 border-t border-border bg-gray-50">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAction(a.query)}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-border rounded-full hover:border-blue hover:text-blue transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-border">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about sales, invoices, inventory, finances..."
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
    </div>
  )
}
