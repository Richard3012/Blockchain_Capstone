const modules = [
  'Products and SKU catalog',
  'Suppliers and payment terms',
  'Warehouses and stores',
  'Users and employee access',
  'Company and tax settings',
]

export default function MasterData() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Master Data</h1>
        <p className="text-text-secondary mt-1">ERP reference data that drives inventory, procurement, sales, and finance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {modules.map((item) => (
          <div key={item} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="font-semibold text-text-primary">{item}</p>
            <p className="text-sm text-text-secondary mt-2">
              Back this module with CRUD APIs before downstream transactions are enabled.
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
