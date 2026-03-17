const steps = [
  'Low stock detection',
  'Purchase order approval',
  'Goods receipt capture',
  'Inventory increment',
  'Supplier invoice reference',
  'Audit and blockchain proof',
]

export default function Procurement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Procurement</h1>
        <p className="text-text-secondary mt-1">Track purchasing from reorder alert through receipt and verification.</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary">Planned workflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {steps.map((step, index) => (
            <div key={step} className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Step {index + 1}</p>
              <p className="mt-2 font-medium text-text-primary">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
