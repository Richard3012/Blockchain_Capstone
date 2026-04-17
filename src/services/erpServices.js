import { apiClient } from './api/client'

export const gstService = {
  getSummary(period) { return apiClient.get(`/gst/summary?period=${period}`) },
  generateGSTR1(period) { return apiClient.get(`/gst/gstr1?period=${period}`) },
  generateGSTR3B(period) { return apiClient.get(`/gst/gstr3b?period=${period}`) },
  fileReturn(returnType, period) { return apiClient.post('/gst/file-return', { returnType, period }) },
  getReturns(financialYear) { return apiClient.get(`/gst/returns${financialYear ? `?financialYear=${financialYear}` : ''}`) },
  getReturnById(id) { return apiClient.get(`/gst/returns/${id}`) },
  getStateCodes() { return apiClient.get('/gst/state-codes') },
  searchHSN(query) { return apiClient.get(`/gst/hsn?q=${encodeURIComponent(query)}`) },
  validateGSTIN(gstin) { return apiClient.get(`/gst/validate-gstin?gstin=${encodeURIComponent(gstin)}`) },
  getStats() { return apiClient.get('/gst/stats') },
}

export const accountingService = {
  initializeAccounts() { return apiClient.post('/accounting/initialize') },
  getAccounts() { return apiClient.get('/accounting/accounts') },
  createAccount(data) { return apiClient.post('/accounting/accounts', data) },
  createJournalEntry(data) { return apiClient.post('/accounting/journal-entries', data) },
  getJournalEntries() { return apiClient.get('/accounting/journal-entries') },
  getJournalEntry(id) { return apiClient.get(`/accounting/journal-entries/${id}`) },
  getTrialBalance() { return apiClient.get('/accounting/trial-balance') },
  getProfitAndLoss() { return apiClient.get('/accounting/profit-and-loss') },
  getBalanceSheet() { return apiClient.get('/accounting/balance-sheet') },
}

export const tdsService = {
  getSections() { return apiClient.get('/tds/sections') },
  calculate(section, amount) { return apiClient.post('/tds/calculate', { section, amount }) },
  recordDeduction(data) { return apiClient.post('/tds/deductions', data) },
  getEntries(filters) {
    const params = new URLSearchParams(filters).toString()
    return apiClient.get(`/tds/deductions${params ? `?${params}` : ''}`)
  },
  getQuarterlySummary(fy, quarter) { return apiClient.get(`/tds/quarterly/${fy}/${quarter}`) },
  markDeposited(id, challanNumber) { return apiClient.put(`/tds/deductions/${id}/deposit`, { challanNumber }) },
}

export const demandForecastService = {
  forecast(productId, months) {
    const params = new URLSearchParams()
    if (productId) params.set('productId', productId)
    if (months) params.set('months', months)
    return apiClient.get(`/demand/forecast?${params}`)
  },
  history(productId, months) {
    const params = new URLSearchParams()
    if (productId) params.set('productId', productId)
    if (months) params.set('months', months)
    return apiClient.get(`/demand/history?${params}`)
  },
  topProducts(limit) { return apiClient.get(`/demand/top-products?limit=${limit || 10}`) },
}

export const deliveryService = {
  create(data) { return apiClient.post('/delivery', data) },
  list(params) {
    const qs = new URLSearchParams(params).toString()
    return apiClient.get(`/delivery${qs ? `?${qs}` : ''}`)
  },
  getById(id) { return apiClient.get(`/delivery/${id}`) },
  updateStatus(id, data) { return apiClient.patch(`/delivery/${id}/status`, data) },
  track(trackingNumber) { return apiClient.get(`/delivery/track/${encodeURIComponent(trackingNumber)}`) },
  verify(trackingNumber) { return apiClient.get(`/delivery/verify/${encodeURIComponent(trackingNumber)}`) },
}

export const invoiceScannerService = {
  parse(rawText) { return apiClient.post('/invoice-scanner/parse', { rawText }) },
  process(data) { return apiClient.post('/invoice-scanner/process', data) },
}

export const whatsappBotServiceApi = {
  getStatus() { return apiClient.get('/whatsapp/status') },
  getOverdue() { return apiClient.get('/whatsapp/overdue') },
  sendReminder(invoiceId) { return apiClient.post(`/whatsapp/remind/${invoiceId}`) },
  sendBulkReminders() { return apiClient.post('/whatsapp/remind-all') },
  confirmPayment(data) { return apiClient.post('/whatsapp/confirm-payment', data) },
}

export const aiAssistantServiceApi = {
  query(text) { return apiClient.post('/assistant/query', { query: text }) },
}
