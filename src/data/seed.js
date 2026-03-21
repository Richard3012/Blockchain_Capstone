// Seed data for BlockERP application

// Helper function to generate random hex string
const randomHex = (length) => {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

// Helper to generate random date within range
const randomDate = (start, end) => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const date = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()))
  return date.toISOString().split('T')[0]
}

// Helper to generate random integer
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// Products (12 items)
export const PRODUCTS = [
  { id: 1,  name: 'Enterprise Server Pro',   sku: 'SKU-FJKU09', category: 'Hardware',      price: 4342,  stock: 29,  reorderLevel: 62,  status: 'Low Stock',  lastRestocked: '2026-02-01' },
  { id: 2,  name: 'Cloud Storage Solution',  sku: 'SKU-B5H1YZ', category: 'Accessories',   price: 7457,  stock: 388, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-09' },
  { id: 3,  name: 'Security Suite X',        sku: 'SKU-6QY7NH', category: 'Software',      price: 1151,  stock: 390, reorderLevel: 100, status: 'In Stock',   lastRestocked: '2026-01-26' },
  { id: 4,  name: 'Analytics Platform',      sku: 'SKU-D5F1F3', category: 'Hardware',      price: 4730,  stock: 481, reorderLevel: 100, status: 'In Stock',   lastRestocked: '2026-01-27' },
  { id: 5,  name: 'Network Router Elite',    sku: 'SKU-61PS36', category: 'Accessories',   price: 6273,  stock: 68,  reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-01' },
  { id: 6,  name: 'Backup System Pro',       sku: 'SKU-CIMCDB', category: 'Subscriptions', price: 552,   stock: 288, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-02-24' },
  { id: 7,  name: 'Database Manager',        sku: 'SKU-LPLEQ8', category: 'Hardware',      price: 4714,  stock: 282, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-23' },
  { id: 8,  name: 'API Gateway',             sku: 'SKU-A6Y60W', category: 'Subscriptions', price: 9397,  stock: 450, reorderLevel: 100, status: 'In Stock',   lastRestocked: '2026-01-11' },
  { id: 9,  name: 'Load Balancer X',         sku: 'SKU-TUZL5L', category: 'Hardware',      price: 3575,  stock: 166, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-05' },
  { id: 10, name: 'Monitoring Dashboard',    sku: 'SKU-K073W7', category: 'Subscriptions', price: 8275,  stock: 118, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-22' },
  { id: 11, name: 'Data Sync Tool',          sku: 'SKU-RQ5PDY', category: 'Services',      price: 4853,  stock: 220, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-01-23' },
  { id: 12, name: 'Integration Hub',         sku: 'SKU-RSMBY4', category: 'Software',      price: 8531,  stock: 263, reorderLevel: 50,  status: 'In Stock',   lastRestocked: '2026-02-10' },
]

// Customer names and companies for generating realistic data
const firstNames = ['John', 'William', 'Robert', 'Michael', 'David', 'James', 'Richard', 'Joseph', 'Thomas', 'Christopher', 'Emily', 'Amanda', 'Sarah', 'Jessica', 'Jennifer', 'Lisa', 'Mary', 'Patricia', 'Elizabeth', 'Linda']
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee']
const companies = ['MetroWorks Inc', 'QuarterTech Industries', 'Pacific Trading Co', 'TechView Solutions', 'MidState Ventures', 'Global Dynamics', 'Apex Systems', 'Vertex Group', 'Synergy Corp', 'Prime Industries', 'Nova Tech', 'Summit Holdings', 'Cascade Enterprises', 'Horizon Partners', 'Alliance Group']

// Helper to determine customer segment based on lifetime value
const getSegment = (value) => {
  if (value >= 50000) return 'enterprise'
  if (value >= 25000) return 'business'
  if (value >= 10000) return 'startup'
  return 'individual'
}

// Customers (50 items) - status: 'active' or 'inactive', segment: enterprise/business/startup/individual
export const CUSTOMERS = [
  { id: 1,  name: 'John Smith',        company: 'MetroWorks Inc',            email: 'john.smith@metroworksinc.com',            phone: '+1 (203) 495-1400', status: 'active',  orders: 22, totalSpent: 95458, lifetimeValue: 95458, segment: 'enterprise' },
  { id: 2,  name: 'William Brown',     company: 'MetroWorks Inc',            email: 'william.brown@metroworksinc.com',         phone: '+1 (764) 763-3817', status: 'active',  orders: 19, totalSpent: 91181, lifetimeValue: 91181, segment: 'enterprise' },
  { id: 3,  name: 'William Davis',     company: 'QuarterTech Industries',    email: 'william.davis@quartertechindustries.com', phone: '+1 (848) 295-5700', status: 'active',  orders: 22, totalSpent: 81906, lifetimeValue: 81906, segment: 'enterprise' },
  { id: 4,  name: 'Robert Garcia',     company: 'Pacific Trading Co',        email: 'robert.garcia@pacifictradingco.com',      phone: '+1 (572) 276-6490', status: 'active',  orders: 22, totalSpent: 70400, lifetimeValue: 70400, segment: 'enterprise' },
  { id: 5,  name: 'John Williams',     company: 'TechView Solutions',        email: 'john.williams@techviewsolutions.com',     phone: '+1 (211) 609-2591', status: 'inactive',   orders: 24, totalSpent: 69912, lifetimeValue: 69912, segment: 'enterprise' },
  { id: 6,  name: 'Michael Williams',  company: 'MidState Ventures',         email: 'michael.williams@midstateventures.com',   phone: '+1 (757) 371-3572', status: 'active',  orders: 18, totalSpent: 66924, lifetimeValue: 66924, segment: 'enterprise' },
  { id: 7,  name: 'David Johnson',     company: 'Global Dynamics',           email: 'david.johnson@globaldynamics.com',        phone: '+1 (432) 887-2341', status: 'active',  orders: 17, totalSpent: 64500, lifetimeValue: 64500, segment: 'enterprise' },
  { id: 8,  name: 'James Anderson',    company: 'Apex Systems',              email: 'james.anderson@apexsystems.com',          phone: '+1 (555) 234-5678', status: 'active',  orders: 15, totalSpent: 62100, lifetimeValue: 62100, segment: 'enterprise' },
  { id: 9,  name: 'Emily Davis',       company: 'Vertex Group',              email: 'emily.davis@vertexgroup.com',             phone: '+1 (321) 456-7890', status: 'active',  orders: 14, totalSpent: 59800, lifetimeValue: 59800, segment: 'enterprise' },
  { id: 10, name: 'Sarah Wilson',      company: 'Synergy Corp',              email: 'sarah.wilson@synergycorp.com',            phone: '+1 (678) 901-2345', status: 'active',  orders: 16, totalSpent: 57400, lifetimeValue: 57400, segment: 'enterprise' },
  { id: 11, name: 'Amanda Martinez',   company: 'Prime Industries',          email: 'amanda.martinez@primeindustries.com',     phone: '+1 (890) 123-4567', status: 'active',  orders: 13, totalSpent: 54900, lifetimeValue: 54900, segment: 'enterprise' },
  { id: 12, name: 'Richard Thomas',    company: 'Nova Tech',                 email: 'richard.thomas@novatech.com',             phone: '+1 (234) 567-8901', status: 'active',  orders: 8,  totalSpent: 52300, lifetimeValue: 52300, segment: 'enterprise' },
  { id: 13, name: 'Jessica Brown',     company: 'Summit Holdings',           email: 'jessica.brown@summitholdings.com',        phone: '+1 (345) 678-9012', status: 'active',  orders: 12, totalSpent: 49700, lifetimeValue: 49700, segment: 'business' },
  { id: 14, name: 'Christopher Lee',   company: 'Cascade Enterprises',       email: 'christopher.lee@cascadeenterprises.com',  phone: '+1 (456) 789-0123', status: 'active',  orders: 11, totalSpent: 47200, lifetimeValue: 47200, segment: 'business' },
  { id: 15, name: 'Jennifer Garcia',   company: 'Horizon Partners',          email: 'jennifer.garcia@horizonpartners.com',     phone: '+1 (567) 890-1234', status: 'active',  orders: 9,  totalSpent: 44600, lifetimeValue: 44600, segment: 'business' },
  { id: 16, name: 'Thomas Miller',     company: 'Alliance Group',            email: 'thomas.miller@alliancegroup.com',         phone: '+1 (678) 901-2345', status: 'active',  orders: 10, totalSpent: 42100, lifetimeValue: 42100, segment: 'business' },
  { id: 17, name: 'Lisa Rodriguez',    company: 'MetroWorks Inc',            email: 'lisa.rodriguez@metroworksinc.com',        phone: '+1 (789) 012-3456', status: 'active',  orders: 9,  totalSpent: 39500, lifetimeValue: 39500, segment: 'business' },
  { id: 18, name: 'Joseph Wilson',     company: 'TechView Solutions',        email: 'joseph.wilson@techviewsolutions.com',     phone: '+1 (890) 123-4567', status: 'active',  orders: 7,  totalSpent: 37000, lifetimeValue: 37000, segment: 'business' },
  { id: 19, name: 'Mary Taylor',       company: 'Pacific Trading Co',        email: 'mary.taylor@pacifictradingco.com',        phone: '+1 (901) 234-5678', status: 'active',  orders: 8,  totalSpent: 34400, lifetimeValue: 34400, segment: 'business' },
  { id: 20, name: 'Patricia Moore',    company: 'Global Dynamics',           email: 'patricia.moore@globaldynamics.com',       phone: '+1 (012) 345-6789', status: 'active',  orders: 7,  totalSpent: 31900, lifetimeValue: 31900, segment: 'business' },
  { id: 21, name: 'Elizabeth Jackson', company: 'Apex Systems',              email: 'elizabeth.jackson@apexsystems.com',       phone: '+1 (123) 456-7890', status: 'active',  orders: 6,  totalSpent: 29300, lifetimeValue: 29300, segment: 'business' },
  { id: 22, name: 'Linda Martin',      company: 'Vertex Group',              email: 'linda.martin@vertexgroup.com',            phone: '+1 (234) 567-8901', status: 'active',  orders: 6,  totalSpent: 26800, lifetimeValue: 26800, segment: 'business' },
  { id: 23, name: 'Robert Hernandez',  company: 'Synergy Corp',              email: 'robert.hernandez@synergycorp.com',        phone: '+1 (345) 678-9012', status: 'active',  orders: 5,  totalSpent: 24200, lifetimeValue: 24200, segment: 'startup' },
  { id: 24, name: 'Michael Lopez',     company: 'Prime Industries',          email: 'michael.lopez@primeindustries.com',       phone: '+1 (456) 789-0123', status: 'active',  orders: 4,  totalSpent: 21700, lifetimeValue: 21700, segment: 'startup' },
  { id: 25, name: 'David Smith',       company: 'Nova Tech',                 email: 'david.smith@novatech.com',                phone: '+1 (567) 890-1234', status: 'active',  orders: 5,  totalSpent: 19100, lifetimeValue: 19100, segment: 'startup' },
  { id: 26, name: 'James Williams',    company: 'Summit Holdings',           email: 'james.williams@summitholdings.com',       phone: '+1 (678) 901-2345', status: 'active',  orders: 4,  totalSpent: 16600, lifetimeValue: 16600, segment: 'startup' },
  { id: 27, name: 'Emily Johnson',     company: 'Cascade Enterprises',       email: 'emily.johnson@cascadeenterprises.com',    phone: '+1 (789) 012-3456', status: 'inactive',   orders: 3,  totalSpent: 14000, lifetimeValue: 14000, segment: 'startup' },
  { id: 28, name: 'Sarah Brown',       company: 'Horizon Partners',          email: 'sarah.brown@horizonpartners.com',         phone: '+1 (890) 123-4567', status: 'active',  orders: 3,  totalSpent: 11500, lifetimeValue: 11500, segment: 'startup' },
  { id: 29, name: 'Amanda Jones',      company: 'Alliance Group',            email: 'amanda.jones@alliancegroup.com',          phone: '+1 (901) 234-5678', status: 'active',  orders: 2,  totalSpent: 8900, lifetimeValue: 8900, segment: 'individual' },
  { id: 30, name: 'Richard Garcia',    company: 'MetroWorks Inc',            email: 'richard.garcia@metroworksinc.com',        phone: '+1 (012) 345-6789', status: 'active',  orders: 2,  totalSpent: 6400, lifetimeValue: 6400, segment: 'individual' },
  { id: 31, name: 'Jessica Miller',    company: 'QuarterTech Industries',    email: 'jessica.miller@quartertechindustries.com', phone: '+1 (123) 456-7891', status: 'active',  orders: 2,  totalSpent: 5800, lifetimeValue: 5800, segment: 'individual' },
  { id: 32, name: 'Christopher Davis', company: 'TechView Solutions',        email: 'christopher.davis@techviewsolutions.com', phone: '+1 (234) 567-8902', status: 'active',  orders: 2,  totalSpent: 5200, lifetimeValue: 5200, segment: 'individual' },
  { id: 33, name: 'Jennifer Wilson',   company: 'Pacific Trading Co',        email: 'jennifer.wilson@pacifictradingco.com',    phone: '+1 (345) 678-9013', status: 'active',  orders: 1,  totalSpent: 4600, lifetimeValue: 4600, segment: 'individual' },
  { id: 34, name: 'Thomas Anderson',   company: 'Global Dynamics',           email: 'thomas.anderson@globaldynamics.com',      phone: '+1 (456) 789-0124', status: 'active',  orders: 1,  totalSpent: 4000, lifetimeValue: 4000, segment: 'individual' },
  { id: 35, name: 'Lisa Thomas',       company: 'Apex Systems',              email: 'lisa.thomas@apexsystems.com',             phone: '+1 (567) 890-1235', status: 'active',  orders: 1,  totalSpent: 3400, lifetimeValue: 3400, segment: 'individual' },
  { id: 36, name: 'Joseph Taylor',     company: 'Vertex Group',              email: 'joseph.taylor@vertexgroup.com',           phone: '+1 (678) 901-2346', status: 'active',  orders: 1,  totalSpent: 2800, lifetimeValue: 2800, segment: 'individual' },
  { id: 37, name: 'Mary Moore',        company: 'Synergy Corp',              email: 'mary.moore@synergycorp.com',              phone: '+1 (789) 012-3457', status: 'active',  orders: 1,  totalSpent: 2200, lifetimeValue: 2200, segment: 'individual' },
  { id: 38, name: 'Patricia Jackson',  company: 'Prime Industries',          email: 'patricia.jackson@primeindustries.com',    phone: '+1 (890) 123-4568', status: 'inactive',   orders: 0,  totalSpent: 1800, lifetimeValue: 1800, segment: 'individual' },
  { id: 39, name: 'Elizabeth Martin',  company: 'Nova Tech',                 email: 'elizabeth.martin@novatech.com',           phone: '+1 (901) 234-5679', status: 'active',  orders: 0,  totalSpent: 1400, lifetimeValue: 1400, segment: 'individual' },
  { id: 40, name: 'Linda Hernandez',   company: 'Summit Holdings',           email: 'linda.hernandez@summitholdings.com',      phone: '+1 (012) 345-6790', status: 'active',  orders: 0,  totalSpent: 1000, lifetimeValue: 1000, segment: 'individual' },
  { id: 41, name: 'Robert Lopez',      company: 'Cascade Enterprises',       email: 'robert.lopez@cascadeenterprises.com',     phone: '+1 (123) 456-7892', status: 'active',  orders: 0,  totalSpent: 800, lifetimeValue: 800, segment: 'individual' },
  { id: 42, name: 'Michael Smith',     company: 'Horizon Partners',          email: 'michael.smith@horizonpartners.com',       phone: '+1 (234) 567-8903', status: 'active',  orders: 0,  totalSpent: 600, lifetimeValue: 600, segment: 'individual' },
  { id: 43, name: 'David Brown',       company: 'Alliance Group',            email: 'david.brown@alliancegroup.com',           phone: '+1 (345) 678-9014', status: 'active',  orders: 0,  totalSpent: 400, lifetimeValue: 400, segment: 'individual' },
  { id: 44, name: 'James Johnson',     company: 'MetroWorks Inc',            email: 'james.johnson@metroworksinc.com',         phone: '+1 (456) 789-0125', status: 'active',  orders: 0,  totalSpent: 200, lifetimeValue: 200, segment: 'individual' },
  { id: 45, name: 'Emily Williams',    company: 'QuarterTech Industries',    email: 'emily.williams@quartertechindustries.com', phone: '+1 (567) 890-1236', status: 'active',  orders: 0,  totalSpent: 100, lifetimeValue: 100, segment: 'individual' },
  { id: 46, name: 'Sarah Jones',       company: 'TechView Solutions',        email: 'sarah.jones@techviewsolutions.com',       phone: '+1 (678) 901-2347', status: 'active',  orders: 0,  totalSpent: 50, lifetimeValue: 50, segment: 'individual' },
  { id: 47, name: 'Amanda Garcia',     company: 'Pacific Trading Co',        email: 'amanda.garcia@pacifictradingco.com',      phone: '+1 (789) 012-3458', status: 'active',  orders: 0,  totalSpent: 0, lifetimeValue: 0, segment: 'individual' },
  { id: 48, name: 'Richard Miller',    company: 'Global Dynamics',           email: 'richard.miller@globaldynamics.com',       phone: '+1 (890) 123-4569', status: 'active',  orders: 0,  totalSpent: 0, lifetimeValue: 0, segment: 'individual' },
  { id: 49, name: 'Jessica Davis',     company: 'Apex Systems',              email: 'jessica.davis@apexsystems.com',           phone: '+1 (901) 234-5680', status: 'active',  orders: 0,  totalSpent: 0, lifetimeValue: 0, segment: 'individual' },
  { id: 50, name: 'Christopher Wilson', company: 'Vertex Group',             email: 'christopher.wilson@vertexgroup.com',      phone: '+1 (012) 345-6791', status: 'active',  orders: 0,  totalSpent: 0, lifetimeValue: 0, segment: 'individual' },
]

// Orders (100 items)
const orderStatuses = ['Shipped', 'Processing', 'Delivered', 'Cancelled', 'Pending']
const customerNames = CUSTOMERS.map(c => c.name)

export const ORDERS = [
  { id: 'ORD00001', customer: 'David Smith',      amount: 104149, status: 'Shipped',    date: '2026-02-12' },
  { id: 'ORD00002', customer: 'Robert Garcia',    amount: 18856,  status: 'Processing', date: '2026-01-17' },
  { id: 'ORD00003', customer: 'William Davis',    amount: 141063, status: 'Delivered',  date: '2026-02-08' },
  { id: 'ORD00004', customer: 'Amanda Williams',  amount: 66200,  status: 'Delivered',  date: '2026-01-24' },
  { id: 'ORD00005', customer: 'Michael Jones',    amount: 36602,  status: 'Delivered',  date: '2025-12-11' },
  { id: 'ORD00006', customer: 'Amanda Rodriguez', amount: 28600,  status: 'Delivered',  date: '2025-12-21' },
  { id: 'ORD00007', customer: 'Emily Williams',   amount: 126159, status: 'Shipped',    date: '2025-12-25' },
  { id: 'ORD00008', customer: 'Amanda Rodriguez', amount: 107668, status: 'Delivered',  date: '2025-12-26' },
  ...Array.from({ length: 92 }, (_, i) => ({
    id: `ORD${String(i + 9).padStart(5, '0')}`,
    customer: customerNames[Math.floor(Math.random() * customerNames.length)],
    amount: randomInt(5000, 150000),
    status: orderStatuses[Math.floor(Math.random() * orderStatuses.length)],
    date: randomDate('2025-06-01', '2026-02-28')
  }))
]

// Invoices (100 items - mirror orders with INV prefix)
const invoiceStatuses = ['Paid', 'Overdue', 'Draft', 'Sent']

export const INVOICES = [
  { id: 'INV00001', customer: 'David Smith',      amount: 104149, status: 'Overdue', issueDate: '2026-02-01', dueDate: '2026-03-03' },
  { id: 'INV00002', customer: 'Robert Garcia',    amount: 18856,  status: 'Overdue', issueDate: '2026-01-16', dueDate: '2026-02-16' },
  { id: 'INV00003', customer: 'William Davis',    amount: 141063, status: 'Paid',    issueDate: '2026-02-11', dueDate: '2026-03-11' },
  { id: 'INV00004', customer: 'Amanda Williams',  amount: 66200,  status: 'Paid',    issueDate: '2026-02-28', dueDate: '2026-03-30' },
  { id: 'INV00005', customer: 'Michael Jones',    amount: 36602,  status: 'Paid',    issueDate: '2026-02-04', dueDate: '2026-03-06' },
  ...Array.from({ length: 95 }, (_, i) => {
    const issueDate = randomDate('2025-10-01', '2026-02-28')
    const dueDate = new Date(new Date(issueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return {
      id: `INV${String(i + 6).padStart(5, '0')}`,
      customer: customerNames[Math.floor(Math.random() * customerNames.length)],
      amount: randomInt(5000, 150000),
      status: invoiceStatuses[Math.floor(Math.random() * invoiceStatuses.length)],
      issueDate,
      dueDate
    }
  })
]

// Support Tickets (30 items)
const ticketTitles = ['Product return', 'Refund request', 'Product delivery delay', 'Account upgrade', 'Feature request', 'Password reset', 'Integration issue', 'Technical support needed', 'Unable to access dashboard', 'Billing inquiry']
const ticketStatuses = ['open', 'in-progress', 'resolved', 'closed']
const ticketPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const ticketAssignees = ['Emily Williams', 'Jessica Brown', 'Amanda Martinez', 'Jessica Martinez', 'John Smith', 'Emily Martinez', 'Robert Johnson', 'Michael Miller']

export const TICKETS = Array.from({ length: 30 }, (_, i) => ({
  id: `TKT-${String(i + 1).padStart(5, '0')}`,
  title: ticketTitles[i % ticketTitles.length],
  description: `Customer reported an issue regarding ${ticketTitles[i % ticketTitles.length].toLowerCase()}. Needs resolution within SLA timeframe.`,
  status: ticketStatuses[i % ticketStatuses.length],
  priority: ticketPriorities[Math.floor(Math.random() * ticketPriorities.length)],
  assignee: ticketAssignees[Math.floor(Math.random() * ticketAssignees.length)],
  customer: customerNames[Math.floor(Math.random() * customerNames.length)],
  createdAt: randomDate('2026-01-01', '2026-03-05'),
  updatedAt: randomDate('2026-02-01', '2026-03-05')
}))

// Audit Log (100 entries)
const auditUsers = ['Sarah Chen', 'Chris Wilson', 'Emily Davis', 'Mike Johnson', 'Alex Thompson']
const auditActions = ['Processed payment', 'Resolved support ticket', 'Updated order status', 'Verified blockchain record', 'Added customer', 'Created order', 'Generated invoice', 'Exported report', 'Updated product pricing', 'Modified user permissions', 'Updated inventory']
const auditEntities = ['User', 'Settings', 'Order', 'Invoice', 'Customer', 'Product', 'Ticket']

export const AUDIT_LOG = Array.from({ length: 100 }, (_, i) => {
  const hasHash = Math.random() < 0.6
  const action = auditActions[Math.floor(Math.random() * auditActions.length)]
  const entity = auditEntities[Math.floor(Math.random() * auditEntities.length)]
  const user = auditUsers[Math.floor(Math.random() * auditUsers.length)]
  const timestamp = new Date(Date.now() - i * 720000) // Each entry ~12 min apart
  
  return {
    id: i + 1,
    user,
    action,
    entity,
    entityId: `${entity.toUpperCase().substring(0, 3)}-${String(randomInt(1, 999)).padStart(3, '0')}`,
    hash: hasHash ? `0x${randomHex(40)}` : null,
    timestamp: timestamp.toISOString(),
    details: `${action} for ${entity.toLowerCase()} record`
  }
})

// Blockchain Transactions (200 items)
const blockchainTypes = ['Invoice', 'Order', 'Audit', 'Customer', 'Inventory']

export const BLOCKCHAIN_TXS = Array.from({ length: 200 }, (_, i) => {
  const type = blockchainTypes[Math.floor(Math.random() * blockchainTypes.length)]
  const isVerified = Math.random() < 0.95
  const timestamp = new Date(Date.now() - i * 180000) // Each tx ~3 min apart
  
  return {
    id: i + 1,
    hash: `0x${randomHex(40)}`,
    type,
    entityId: `${type.toUpperCase().substring(0, 3)}-${String(randomInt(1, 999)).padStart(3, '0')}`,
    status: isVerified ? 'Verified' : 'Pending',
    timestamp: timestamp.toISOString(),
    gasUsed: randomInt(21000, 150000)
  }
})

// Revenue History (12 months for line chart)
export const REVENUE_HISTORY = [
  { month: 'Mar', revenue: 42000 },
  { month: 'Apr', revenue: 38000 },
  { month: 'May', revenue: 45000 },
  { month: 'Jun', revenue: 41000 },
  { month: 'Jul', revenue: 43000 },
  { month: 'Aug', revenue: 47000 },
  { month: 'Sep', revenue: 52000 },
  { month: 'Oct', revenue: 89000 },
  { month: 'Nov', revenue: 145000 },
  { month: 'Dec', revenue: 380000 },
  { month: 'Jan', revenue: 1200000 },
  { month: 'Feb', revenue: 2541768 },
]

// ============ HISTORICAL DATA FOR MCP DATA ASSISTANT ============

// Multi-year historical data
export const YEARLY_DATA = [
  { year: 2022, revenue: 1250000, orders: 450, customers: 120, expenses: 890000, profit: 360000 },
  { year: 2023, revenue: 2100000, orders: 780, customers: 185, expenses: 1420000, profit: 680000 },
  { year: 2024, revenue: 3450000, orders: 1200, customers: 290, expenses: 2180000, profit: 1270000 },
  { year: 2025, revenue: 5200000, orders: 1850, customers: 420, expenses: 3100000, profit: 2100000 },
  { year: 2026, revenue: 2541768, orders: 650, customers: 50, expenses: 1450000, profit: 1091768 }, // YTD
]

// Quarterly data for all years
export const QUARTERLY_DATA = [
  // 2022
  { year: 2022, quarter: 'Q1', revenue: 280000, orders: 95, customers: 28, topProduct: 'Enterprise Server Pro' },
  { year: 2022, quarter: 'Q2', revenue: 310000, orders: 110, customers: 32, topProduct: 'Cloud Storage Solution' },
  { year: 2022, quarter: 'Q3', revenue: 295000, orders: 105, customers: 30, topProduct: 'Security Suite X' },
  { year: 2022, quarter: 'Q4', revenue: 365000, orders: 140, customers: 30, topProduct: 'Analytics Platform' },
  // 2023
  { year: 2023, quarter: 'Q1', revenue: 420000, orders: 165, customers: 38, topProduct: 'Enterprise Server Pro' },
  { year: 2023, quarter: 'Q2', revenue: 480000, orders: 185, customers: 42, topProduct: 'API Gateway' },
  { year: 2023, quarter: 'Q3', revenue: 520000, orders: 195, customers: 48, topProduct: 'Cloud Storage Solution' },
  { year: 2023, quarter: 'Q4', revenue: 680000, orders: 235, customers: 57, topProduct: 'Database Manager' },
  // 2024
  { year: 2024, quarter: 'Q1', revenue: 720000, orders: 260, customers: 62, topProduct: 'Load Balancer X' },
  { year: 2024, quarter: 'Q2', revenue: 850000, orders: 290, customers: 68, topProduct: 'Monitoring Dashboard' },
  { year: 2024, quarter: 'Q3', revenue: 920000, orders: 320, customers: 75, topProduct: 'Data Sync Tool' },
  { year: 2024, quarter: 'Q4', revenue: 960000, orders: 330, customers: 85, topProduct: 'Integration Hub' },
  // 2025
  { year: 2025, quarter: 'Q1', revenue: 1100000, orders: 420, customers: 95, topProduct: 'Enterprise Server Pro' },
  { year: 2025, quarter: 'Q2', revenue: 1250000, orders: 450, customers: 102, topProduct: 'API Gateway' },
  { year: 2025, quarter: 'Q3', revenue: 1400000, orders: 490, customers: 110, topProduct: 'Cloud Storage Solution' },
  { year: 2025, quarter: 'Q4', revenue: 1450000, orders: 490, customers: 113, topProduct: 'Security Suite X' },
  // 2026 (YTD)
  { year: 2026, quarter: 'Q1', revenue: 2541768, orders: 650, customers: 50, topProduct: 'Enterprise Server Pro' },
]

// Monthly data for current and previous year
export const MONTHLY_DATA = [
  // 2025
  { year: 2025, month: 'January', revenue: 380000, orders: 145, newCustomers: 12, churnedCustomers: 3 },
  { year: 2025, month: 'February', revenue: 360000, orders: 138, newCustomers: 15, churnedCustomers: 4 },
  { year: 2025, month: 'March', revenue: 360000, orders: 137, newCustomers: 18, churnedCustomers: 2 },
  { year: 2025, month: 'April', revenue: 420000, orders: 152, newCustomers: 14, churnedCustomers: 5 },
  { year: 2025, month: 'May', revenue: 410000, orders: 148, newCustomers: 16, churnedCustomers: 3 },
  { year: 2025, month: 'June', revenue: 420000, orders: 150, newCustomers: 20, churnedCustomers: 4 },
  { year: 2025, month: 'July', revenue: 450000, orders: 160, newCustomers: 22, churnedCustomers: 2 },
  { year: 2025, month: 'August', revenue: 470000, orders: 165, newCustomers: 18, churnedCustomers: 3 },
  { year: 2025, month: 'September', revenue: 480000, orders: 165, newCustomers: 19, churnedCustomers: 4 },
  { year: 2025, month: 'October', revenue: 490000, orders: 168, newCustomers: 25, churnedCustomers: 3 },
  { year: 2025, month: 'November', revenue: 485000, orders: 164, newCustomers: 21, churnedCustomers: 5 },
  { year: 2025, month: 'December', revenue: 475000, orders: 158, newCustomers: 16, churnedCustomers: 2 },
  // 2026
  { year: 2026, month: 'January', revenue: 1200000, orders: 280, newCustomers: 22, churnedCustomers: 4 },
  { year: 2026, month: 'February', revenue: 1341768, orders: 370, newCustomers: 28, churnedCustomers: 3 },
]

// Product performance history
export const PRODUCT_HISTORY = PRODUCTS.map(product => ({
  ...product,
  salesHistory: [
    { year: 2024, unitsSold: randomInt(50, 200), revenue: product.price * randomInt(50, 200) },
    { year: 2025, unitsSold: randomInt(80, 350), revenue: product.price * randomInt(80, 350) },
    { year: 2026, unitsSold: randomInt(20, 100), revenue: product.price * randomInt(20, 100) },
  ],
  quarterlyTrend: [
    { quarter: 'Q1 2025', sales: randomInt(25, 80) },
    { quarter: 'Q2 2025', sales: randomInt(30, 90) },
    { quarter: 'Q3 2025', sales: randomInt(35, 100) },
    { quarter: 'Q4 2025', sales: randomInt(40, 110) },
    { quarter: 'Q1 2026', sales: randomInt(20, 60) },
  ]
}))

// Customer segments analytics
export const CUSTOMER_SEGMENTS = [
  { segment: 'Enterprise', count: 15, revenue: 1850000, avgOrderValue: 45000 },
  { segment: 'Mid-Market', count: 22, revenue: 980000, avgOrderValue: 18500 },
  { segment: 'Small Business', count: 35, revenue: 450000, avgOrderValue: 8200 },
  { segment: 'Startup', count: 28, revenue: 220000, avgOrderValue: 4500 },
]

// Regional sales data
export const REGIONAL_DATA = [
  { region: 'North America', revenue: 1520000, orders: 380, growth: 24 },
  { region: 'Europe', revenue: 620000, orders: 165, growth: 18 },
  { region: 'Asia Pacific', revenue: 280000, orders: 72, growth: 35 },
  { region: 'Latin America', revenue: 85000, orders: 25, growth: 12 },
  { region: 'Middle East', revenue: 36768, orders: 8, growth: 28 },
]

// Invoice line items template
export const INVOICE_LINE_ITEMS_TEMPLATE = PRODUCTS.slice(0, 6).map(p => ({
  productId: p.id,
  productName: p.name,
  sku: p.sku,
  unitPrice: p.price,
  quantity: 1,
  total: p.price
}))

// Generator functions for real-time updates
export const generateAuditEntry = () => {
  const hasHash = Math.random() < 0.6
  const action = auditActions[Math.floor(Math.random() * auditActions.length)]
  const entity = auditEntities[Math.floor(Math.random() * auditEntities.length)]
  const user = auditUsers[Math.floor(Math.random() * auditUsers.length)]
  
  return {
    id: Date.now(),
    user,
    action,
    entity,
    entityId: `${entity.toUpperCase().substring(0, 3)}-${String(randomInt(1, 999)).padStart(3, '0')}`,
    hash: hasHash ? `0x${randomHex(40)}` : null,
    timestamp: new Date().toISOString(),
    details: `${action} for ${entity.toLowerCase()} record`,
    isNew: true
  }
}

export const generateBlockchainTx = () => {
  const type = blockchainTypes[Math.floor(Math.random() * blockchainTypes.length)]
  const isVerified = Math.random() < 0.95
  
  return {
    id: Date.now(),
    hash: `0x${randomHex(40)}`,
    type,
    entityId: `${type.toUpperCase().substring(0, 3)}-${String(randomInt(1, 999)).padStart(3, '0')}`,
    status: isVerified ? 'Verified' : 'Pending',
    timestamp: new Date().toISOString(),
    gasUsed: randomInt(21000, 150000),
    isNew: true
  }
}

export const generateOrder = () => {
  return {
    id: `ORD${String(Date.now()).slice(-5)}`,
    customer: customerNames[Math.floor(Math.random() * customerNames.length)],
    amount: randomInt(5000, 150000),
    status: 'Pending',
    date: new Date().toISOString().split('T')[0]
  }
}
