/**
 * Country-specific Chart of Accounts templates.
 *
 * Designed to be backward-compatible with the original BlockERP flat COA:
 * legacy account codes (1000=Cash, 1100=AR, 1200=Inventory, 2000=AP,
 * 2100=GST Payable, 3000=Owner Equity, 4000=Sales, 5000=COGS, 5100=Salary,
 * 5200=Rent, 5300=Utilities) are preserved in the IN template so existing
 * bootstrap seed data and integrations keep working unchanged.
 *
 * `parent` references another account by `code` within the same template.
 * `subType` is used by callers (invoice scanner, WhatsApp bot, payments) to
 * resolve accounts semantically instead of relying on hard-coded codes.
 */

const NORMAL = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
}

export const COA_TEMPLATES = {
  IN: {
    name: 'India (Schedule III)',
    currency: 'INR',
    fyStartMonth: 4, // April
    accounts: [
      // ── Assets ────────────────────────────────────────
      { code: '1000', name: 'Cash', type: 'asset', subType: 'cash' },
      { code: '1050', name: 'Bank Accounts', type: 'asset', subType: 'bank' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'receivable', isReconciliation: true },
      { code: '1200', name: 'Inventory', type: 'asset', subType: 'inventory' },
      { code: '1300', name: 'GST Input Credit (CGST)', type: 'asset', subType: 'tax' },
      { code: '1310', name: 'GST Input Credit (SGST)', type: 'asset', subType: 'tax' },
      { code: '1320', name: 'GST Input Credit (IGST)', type: 'asset', subType: 'tax' },
      { code: '1330', name: 'GST Input Credit (Cess)', type: 'asset', subType: 'tax' },
      { code: '1340', name: 'RCM Input Credit', type: 'asset', subType: 'tax' },
      { code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'fixed' },
      { code: '1510', name: 'Plant & Machinery', type: 'asset', subType: 'fixed', parent: '1500' },
      { code: '1520', name: 'Office Equipment', type: 'asset', subType: 'fixed', parent: '1500' },
      { code: '1590', name: 'Accumulated Depreciation', type: 'asset', subType: 'fixed', parent: '1500' },

      // ── Liabilities ───────────────────────────────────
      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'payable', isReconciliation: true },
      { code: '2100', name: 'GST Payable', type: 'liability', subType: 'tax' },
      { code: '2110', name: 'CGST Payable', type: 'liability', subType: 'tax', parent: '2100' },
      { code: '2120', name: 'SGST Payable', type: 'liability', subType: 'tax', parent: '2100' },
      { code: '2130', name: 'IGST Payable', type: 'liability', subType: 'tax', parent: '2100' },
      { code: '2140', name: 'Cess Payable', type: 'liability', subType: 'tax', parent: '2100' },
      { code: '2150', name: 'GST RCM Payable', type: 'liability', subType: 'tax' },
      { code: '2200', name: 'TDS Payable', type: 'liability', subType: 'tax' },
      { code: '2210', name: 'TCS Payable', type: 'liability', subType: 'tax' },
      { code: '2220', name: 'PF Payable', type: 'liability', subType: 'tax' },
      { code: '2230', name: 'ESI Payable', type: 'liability', subType: 'tax' },
      { code: '2240', name: 'Professional Tax Payable', type: 'liability', subType: 'tax' },
      { code: '2300', name: 'Salaries Payable', type: 'liability', subType: 'payable' },
      { code: '2400', name: 'MSME Interest Payable', type: 'liability', subType: 'payable' },

      // ── Equity ────────────────────────────────────────
      { code: '3000', name: 'Owner Equity', type: 'equity', subType: 'capital' },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: 'retained', lockedSystem: true },

      // ── Revenue ───────────────────────────────────────
      { code: '4000', name: 'Sales Revenue', type: 'revenue', subType: 'operating' },
      { code: '4100', name: 'Service Revenue', type: 'revenue', subType: 'operating' },
      { code: '4800', name: 'Round-off (Income)', type: 'revenue', subType: 'other' },
      { code: '4900', name: 'Other Income', type: 'revenue', subType: 'other' },

      // ── Expenses ──────────────────────────────────────
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subType: 'cogs' },
      { code: '5100', name: 'Salaries Expense', type: 'expense', subType: 'operating' },
      { code: '5200', name: 'Rent Expense', type: 'expense', subType: 'operating' },
      { code: '5300', name: 'Utilities Expense', type: 'expense', subType: 'operating' },
      { code: '5400', name: 'Depreciation Expense', type: 'expense', subType: 'depreciation' },
      { code: '5500', name: 'MSME Interest Expense', type: 'expense', subType: 'operating' },
      { code: '5600', name: 'Bank Charges', type: 'expense', subType: 'operating' },
      { code: '5700', name: 'Round-off (Expense)', type: 'expense', subType: 'other' },
      { code: '5900', name: 'Other Expenses', type: 'expense', subType: 'other' },
    ],
  },

  US: {
    name: 'United States (US GAAP)',
    currency: 'USD',
    fyStartMonth: 1,
    accounts: [
      { code: '1000', name: 'Cash', type: 'asset', subType: 'cash' },
      { code: '1050', name: 'Bank Accounts', type: 'asset', subType: 'bank' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'receivable', isReconciliation: true },
      { code: '1200', name: 'Inventory', type: 'asset', subType: 'inventory' },
      { code: '1500', name: 'Property, Plant & Equipment', type: 'asset', subType: 'fixed' },
      { code: '1590', name: 'Accumulated Depreciation', type: 'asset', subType: 'fixed', parent: '1500' },

      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'payable', isReconciliation: true },
      { code: '2100', name: 'Sales Tax Payable', type: 'liability', subType: 'tax' },
      { code: '2200', name: 'Payroll Tax Payable', type: 'liability', subType: 'tax' },

      { code: '3000', name: 'Common Stock', type: 'equity', subType: 'capital' },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: 'retained', lockedSystem: true },

      { code: '4000', name: 'Sales Revenue', type: 'revenue', subType: 'operating' },
      { code: '4100', name: 'Service Revenue', type: 'revenue', subType: 'operating' },

      { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subType: 'cogs' },
      { code: '5100', name: 'Salaries & Wages', type: 'expense', subType: 'operating' },
      { code: '5200', name: 'Rent Expense', type: 'expense', subType: 'operating' },
      { code: '5300', name: 'Utilities Expense', type: 'expense', subType: 'operating' },
      { code: '5400', name: 'Depreciation Expense', type: 'expense', subType: 'depreciation' },
    ],
  },

  UK: {
    name: 'United Kingdom (FRS 102)',
    currency: 'GBP',
    fyStartMonth: 4,
    accounts: [
      { code: '1000', name: 'Cash at Hand', type: 'asset', subType: 'cash' },
      { code: '1050', name: 'Cash at Bank', type: 'asset', subType: 'bank' },
      { code: '1100', name: 'Trade Debtors', type: 'asset', subType: 'receivable', isReconciliation: true },
      { code: '1200', name: 'Stock / Inventory', type: 'asset', subType: 'inventory' },
      { code: '1300', name: 'VAT Recoverable', type: 'asset', subType: 'tax' },
      { code: '1500', name: 'Tangible Fixed Assets', type: 'asset', subType: 'fixed' },

      { code: '2000', name: 'Trade Creditors', type: 'liability', subType: 'payable', isReconciliation: true },
      { code: '2100', name: 'VAT Payable', type: 'liability', subType: 'tax' },
      { code: '2200', name: 'PAYE / NIC', type: 'liability', subType: 'tax' },

      { code: '3000', name: 'Share Capital', type: 'equity', subType: 'capital' },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: 'retained', lockedSystem: true },

      { code: '4000', name: 'Turnover', type: 'revenue', subType: 'operating' },
      { code: '4100', name: 'Other Operating Income', type: 'revenue', subType: 'other' },

      { code: '5000', name: 'Cost of Sales', type: 'expense', subType: 'cogs' },
      { code: '5100', name: 'Administrative Expenses', type: 'expense', subType: 'operating' },
      { code: '5200', name: 'Distribution Costs', type: 'expense', subType: 'operating' },
    ],
  },
}

export const NORMAL_SIDE = NORMAL
export const SUPPORTED_TEMPLATES = Object.keys(COA_TEMPLATES)
export const DEFAULT_TEMPLATE = 'IN'
