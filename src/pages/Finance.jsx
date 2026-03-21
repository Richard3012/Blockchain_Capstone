const financeCards = [
  'Accounts receivable',
  'Accounts payable',
  'Expense tracking',
  'Cash flow summary',
  'Ledger summaries',
]

export default function Finance() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Finance</h1>
        <p className="text-text-secondary mt-1">ERP finance basics derived from invoices, payments, procurement, and expenses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {financeCards.map((card) => (
          <div key={card} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="font-semibold text-text-primary">{card}</p>
            <p className="text-sm text-text-secondary mt-2">
              Connect this page after invoice, payment, and payable collections are live.
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
