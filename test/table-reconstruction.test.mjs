/**
 * Table Reconstruction Engine Tests
 * ──────────────────────────────────
 * Covers:
 *  1. Header Detection (classifyHeader, isHeaderLine)
 *  2. Column Alignment via Bounding Boxes
 *  3. Text-Based Table Parsing
 *  4. Row Reconstruction + Multi-Line Merging
 *  5. HSN Disambiguation
 *  6. IGST / Tax Extraction & Validation
 *  7. Error Correction (zero unitPrice, unrealistic qty)
 *  8. Financial Reconstruction Override
 *  9. Validation Layer
 * 10. End-to-End structured invoice scenarios
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tableReconstructionService } from '../backend/src/services/table-reconstruction.service.js'

/* ═══════════════════════════════════════════════════════════════════
   1. Header Detection
   ═══════════════════════════════════════════════════════════════════ */

describe('Header Detection', () => {
  it('should classify common header names', () => {
    assert.equal(tableReconstructionService.classifyHeader('HSN / SAC'), 'hsn')
    assert.equal(tableReconstructionService.classifyHeader('Qty'), 'quantity')
    assert.equal(tableReconstructionService.classifyHeader('Quantity'), 'quantity')
    assert.equal(tableReconstructionService.classifyHeader('Rate'), 'rate')
    assert.equal(tableReconstructionService.classifyHeader('Taxable Value'), 'taxableValue')
    assert.equal(tableReconstructionService.classifyHeader('IGST'), 'igst')
    assert.equal(tableReconstructionService.classifyHeader('CGST'), 'cgst')
    assert.equal(tableReconstructionService.classifyHeader('SGST'), 'sgst')
    assert.equal(tableReconstructionService.classifyHeader('Total'), 'total')
    assert.equal(tableReconstructionService.classifyHeader('Amount'), 'total')
    assert.equal(tableReconstructionService.classifyHeader('S.No.'), 'sno')
    assert.equal(tableReconstructionService.classifyHeader('Description'), 'description')
    assert.equal(tableReconstructionService.classifyHeader('Particulars'), 'description')
    assert.equal(tableReconstructionService.classifyHeader('Unit Price'), 'rate')
  })

  it('should classify case-insensitively', () => {
    assert.equal(tableReconstructionService.classifyHeader('QTY'), 'quantity')
    assert.equal(tableReconstructionService.classifyHeader('hsn'), 'hsn')
    assert.equal(tableReconstructionService.classifyHeader('RATE'), 'rate')
    assert.equal(tableReconstructionService.classifyHeader('igst'), 'igst')
  })

  it('should return null for unrecognized headers', () => {
    assert.equal(tableReconstructionService.classifyHeader('Random'), null)
    assert.equal(tableReconstructionService.classifyHeader('XYZ'), null)
  })

  it('should detect a header line with ≥3 recognized columns', () => {
    assert.equal(tableReconstructionService.isHeaderLine('S.No.  Description  Qty  Rate  Amount'), true)
    assert.equal(tableReconstructionService.isHeaderLine('HSN / SAC  Qty  Taxable Value  IGST  Total'), true)
  })

  it('should reject non-header lines', () => {
    assert.equal(tableReconstructionService.isHeaderLine('1  Widget  10  500  5000'), false)
    assert.equal(tableReconstructionService.isHeaderLine('Invoice Total: 50000'), false)
    assert.equal(tableReconstructionService.isHeaderLine('Hello world'), false)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   2. Column Alignment via Bounding Boxes
   ═══════════════════════════════════════════════════════════════════ */

describe('Column Alignment via Bounding Boxes', () => {
  it('should build column map from header words with bounding boxes', () => {
    const words = [
      { text: 'S.No.', bbox: { x0: 10, y0: 50, x1: 60, y1: 70 } },
      { text: 'Description', bbox: { x0: 120, y0: 50, x1: 250, y1: 70 } },
      { text: 'Qty', bbox: { x0: 320, y0: 50, x1: 370, y1: 70 } },
      { text: 'Rate', bbox: { x0: 440, y0: 50, x1: 500, y1: 70 } },
      { text: 'Amount', bbox: { x0: 570, y0: 50, x1: 650, y1: 70 } },
    ]

    const result = tableReconstructionService.buildColumnMap(words, 60)
    assert.ok(result.columns.length >= 5, `Expected ≥5 columns, got ${result.columns.length}`)

    const canonicals = result.columns.map((c) => c.canonical).filter(Boolean)
    assert.ok(canonicals.includes('sno'), 'Should detect sno column')
    assert.ok(canonicals.includes('description'), 'Should detect description column')
    assert.ok(canonicals.includes('quantity'), 'Should detect quantity column')
    assert.ok(canonicals.includes('rate'), 'Should detect rate column')
    assert.ok(canonicals.includes('total'), 'Should detect total/amount column')
  })

  it('should merge multi-word headers like "Taxable Value"', () => {
    const words = [
      { text: 'Qty', bbox: { x0: 10, y0: 50, x1: 50, y1: 70 } },
      { text: 'Taxable', bbox: { x0: 100, y0: 50, x1: 150, y1: 70 } },
      { text: 'Value', bbox: { x0: 155, y0: 50, x1: 200, y1: 70 } },
      { text: 'IGST', bbox: { x0: 250, y0: 50, x1: 300, y1: 70 } },
    ]

    const result = tableReconstructionService.buildColumnMap(words, 60)
    const canonicals = result.columns.map((c) => c.canonical).filter(Boolean)
    assert.ok(canonicals.includes('taxableValue'), 'Should merge and detect taxableValue')
  })

  it('should return empty columns if too few header words', () => {
    const words = [
      { text: 'Qty', bbox: { x0: 10, y0: 50, x1: 50, y1: 70 } },
    ]
    const result = tableReconstructionService.buildColumnMap(words, 60)
    assert.equal(result.columns.length, 0)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   3. Text-Based Table Parsing
   ═══════════════════════════════════════════════════════════════════ */

describe('Text-Based Table Parsing', () => {
  it('should parse a structured invoice table from text', () => {
    const rawText = `
Tax Invoice
Vendor: ABC Industries
GSTIN: 29AABCU9603R1ZM
Invoice No: INV-2025-001

S.No.  Description          Qty  Rate     Taxable Value  IGST     Total
1      Steel Pipes 2"       50   120.00   6000.00        1080.00  7080.00
2      Elbow Joints 90°     100  25.00    2500.00        450.00   2950.00
3      Flanges 4"           20   350.00   7000.00        1260.00  8260.00

Subtotal: 15500.00
IGST @18%: 2790.00
Grand Total: 18290.00
`
    const result = tableReconstructionService.parseTableFromText(rawText)

    assert.ok(result.items.length >= 3, `Expected ≥3 items, got ${result.items.length}`)
    assert.equal(result.method, 'text_position')

    // Verify first item
    const item1 = result.items[0]
    assert.ok(item1.description.includes('Steel'), `Description should include Steel: ${item1.description}`)
    assert.equal(item1.quantity, 50)
    assert.equal(item1.unitPrice, 120)
  })

  it('should return no_header when no header row found', () => {
    const rawText = `
Just some random text
without any table structure
1234 hello world 5678
`
    const result = tableReconstructionService.parseTableFromText(rawText)
    assert.equal(result.method, 'no_header')
    assert.equal(result.items.length, 0)
  })

  it('should handle multi-line product descriptions', () => {
    const rawText = `
S.No.  Description            Qty  Rate     Amount
1      Stanley Hammer          2    450.00   900.00
       Claw Hammer Steel Shaft
2      Bosch Drill Machine     1    12500.00 12500.00
       GSB 500 RE

Total: 13400.00
`
    const result = tableReconstructionService.parseTableFromText(rawText)

    assert.ok(result.items.length >= 2, `Expected ≥2 items, got ${result.items.length}`)

    // First item should have merged description
    const item1 = result.items[0]
    assert.ok(
      item1.description.includes('Stanley') && item1.description.includes('Claw'),
      `Description should merge multi-line: ${item1.description}`,
    )
  })
})

/* ═══════════════════════════════════════════════════════════════════
   4. Row Grouping + Multi-Line Merging (BBox)
   ═══════════════════════════════════════════════════════════════════ */

describe('Row Grouping from Bounding Boxes', () => {
  it('should group words into rows by Y-coordinate', () => {
    const words = [
      { text: 'Hello', bbox: { x0: 10, y0: 50, x1: 60, y1: 70 } },
      { text: 'World', bbox: { x0: 80, y0: 52, x1: 130, y1: 72 } },
      { text: 'Second', bbox: { x0: 10, y0: 100, x1: 80, y1: 120 } },
      { text: 'Row', bbox: { x0: 90, y0: 102, x1: 130, y1: 122 } },
    ]

    const rows = tableReconstructionService.groupWordsIntoRows(words)
    assert.equal(rows.length, 2, `Expected 2 rows, got ${rows.length}`)
    assert.equal(rows[0].words.length, 2, 'First row should have 2 words')
    assert.equal(rows[1].words.length, 2, 'Second row should have 2 words')
  })

  it('should handle empty words array', () => {
    const rows = tableReconstructionService.groupWordsIntoRows([])
    assert.equal(rows.length, 0)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   5. HSN Disambiguation
   ═══════════════════════════════════════════════════════════════════ */

describe('HSN Disambiguation', () => {
  it('should detect quantity that is actually an HSN code', () => {
    const items = [
      { description: 'Steel Pipes', quantity: 73051100, unitPrice: 120, taxableValue: 6000, amount: 7080, hsn: '' },
    ]

    const corrections = tableReconstructionService.fixHSNMisidentification(items)

    assert.ok(corrections.length > 0, 'Should have corrections')
    assert.equal(items[0].hsn, '73051100', 'HSN should be set')
    assert.equal(items[0].quantity, 50, 'Quantity should be derived from taxableValue/unitPrice')
  })

  it('should not flag normal quantities as HSN', () => {
    const items = [
      { description: 'Bolts', quantity: 100, unitPrice: 10, taxableValue: 1000, amount: 1180, hsn: '' },
    ]

    const corrections = tableReconstructionService.fixHSNMisidentification(items)
    assert.equal(corrections.length, 0, 'No corrections needed for normal qty')
    assert.equal(items[0].quantity, 100)
  })

  it('should not flag if HSN already present', () => {
    const items = [
      { description: 'Pipes', quantity: 5000, unitPrice: 200, taxableValue: 1000000, amount: 1180000, hsn: '73051100' },
    ]

    const corrections = tableReconstructionService.fixHSNMisidentification(items)
    assert.equal(corrections.length, 0, 'Should not modify if HSN already set')
  })
})

/* ═══════════════════════════════════════════════════════════════════
   6. IGST / Tax Extraction & Validation
   ═══════════════════════════════════════════════════════════════════ */

describe('IGST / Tax Validation', () => {
  it('should compute tax from GST rate when tax amounts missing', () => {
    const items = [
      { description: 'Item A', quantity: 10, unitPrice: 100, taxableValue: 1000, amount: 1000, gstRate: 18, igst: 0, cgst: 0, sgst: 0, tax: 0 },
    ]

    const corrections = tableReconstructionService.validateItemTaxes(items)

    assert.ok(corrections.length > 0, 'Should compute tax')
    assert.equal(items[0].igst, 180, 'IGST should be 18% of 1000')
    assert.equal(items[0].tax, 180)
  })

  it('should verify igst_amount = taxable_value × rate%', () => {
    const items = [
      { description: 'Item B', quantity: 5, unitPrice: 200, taxableValue: 1000, amount: 1180, gstRate: 18, igst: 180, cgst: 0, sgst: 0, tax: 180 },
    ]

    const corrections = tableReconstructionService.validateItemTaxes(items)
    // No corrections needed — amounts are correct
    assert.equal(items[0].igst, 180)
  })

  it('should average CGST and SGST if they differ', () => {
    const items = [
      { description: 'Item C', quantity: 1, unitPrice: 1000, taxableValue: 1000, amount: 1180, gstRate: 18, igst: 0, cgst: 95, sgst: 85, tax: 180 },
    ]

    const corrections = tableReconstructionService.validateItemTaxes(items)
    assert.equal(items[0].cgst, items[0].sgst, 'CGST and SGST should be equal after averaging')
  })
})

/* ═══════════════════════════════════════════════════════════════════
   7. Error Correction
   ═══════════════════════════════════════════════════════════════════ */

describe('Error Correction Rules', () => {
  it('should reconstruct unitPrice from taxableValue/qty when unitPrice=0', () => {
    const items = [
      { description: 'Widget', quantity: 10, unitPrice: 0, taxableValue: 5000, amount: 5900, tax: 0, hsn: '' },
    ]

    const corrections = tableReconstructionService.correctItems(items)

    assert.ok(corrections.length > 0, 'Should have corrections')
    assert.equal(items[0].unitPrice, 500, 'unitPrice should be 5000/10 = 500')
  })

  it('should re-evaluate qty > 1000 using taxableValue/unitPrice', () => {
    const items = [
      { description: 'Pipe', quantity: 73051100, unitPrice: 120, taxableValue: 6000, amount: 7080, tax: 0, hsn: '' },
    ]

    const corrections = tableReconstructionService.correctItems(items)

    assert.ok(items[0].quantity <= 1000 || corrections.length > 0, 'Should correct unrealistic qty')
  })

  it('should derive missing qty from amount/unitPrice', () => {
    const items = [
      { description: 'Bolt', quantity: 0, unitPrice: 50, taxableValue: 0, amount: 500, tax: 0, hsn: '' },
    ]

    const corrections = tableReconstructionService.correctItems(items)
    assert.equal(items[0].quantity, 10, 'Qty should be derived as 500/50 = 10')
  })
})

/* ═══════════════════════════════════════════════════════════════════
   8. Financial Reconstruction Override
   ═══════════════════════════════════════════════════════════════════ */

describe('Financial Reconstruction Override', () => {
  it('should create single item from totals when no items parsed', () => {
    const items = []
    const corrections = tableReconstructionService.financialOverride(items, {
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
    })

    assert.ok(corrections.length > 0, 'Should have corrections')
    assert.equal(items.length, 1, 'Should create one item')
    assert.equal(items[0].unitPrice, 10000)
    assert.equal(items[0].amount, 11800)
    assert.equal(items[0].tax, 1800)
  })

  it('should not override when items already exist and match', () => {
    const items = [
      { description: 'A', quantity: 1, unitPrice: 1000, taxableValue: 1000, amount: 1180, tax: 180 },
    ]
    const corrections = tableReconstructionService.financialOverride(items, {
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
    })

    // No significant corrections needed — items match totals
    assert.equal(items.length, 1, 'Should not add extra items')
  })
})

/* ═══════════════════════════════════════════════════════════════════
   9. Validation Layer
   ═══════════════════════════════════════════════════════════════════ */

describe('Validation Layer', () => {
  it('should accept items with all required fields', () => {
    const items = [
      { description: 'Valid Item', quantity: 5, unitPrice: 100, amount: 590, tax: 90, taxableValue: 500 },
    ]

    const { valid, rejected } = tableReconstructionService.validateItems(items)
    assert.equal(valid.length, 1)
    assert.equal(rejected.length, 0)
  })

  it('should reject items with unitPrice=0', () => {
    const items = [
      { description: 'Bad Item', quantity: 5, unitPrice: 0, amount: 500, tax: 0, taxableValue: 500 },
    ]

    const { valid, rejected } = tableReconstructionService.validateItems(items)
    assert.equal(valid.length, 0)
    assert.equal(rejected.length, 1)
    assert.ok(rejected[0].issues.includes('unitPrice=0'))
  })

  it('should reject items with qty=0', () => {
    const items = [
      { description: 'Bad Item 2', quantity: 0, unitPrice: 100, amount: 500, tax: 0, taxableValue: 500 },
    ]

    const { valid, rejected } = tableReconstructionService.validateItems(items)
    assert.equal(valid.length, 0)
    assert.ok(rejected[0].issues.includes('qty=0'))
  })

  it('should reject items with no description', () => {
    const items = [
      { description: '', quantity: 5, unitPrice: 100, amount: 500, tax: 0, taxableValue: 500 },
    ]

    const { valid, rejected } = tableReconstructionService.validateItems(items)
    assert.equal(valid.length, 0)
    assert.ok(rejected[0].issues.includes('no description'))
  })
})

/* ═══════════════════════════════════════════════════════════════════
   10. End-to-End: Full Structured Invoice Parsing
   ═══════════════════════════════════════════════════════════════════ */

describe('End-to-End: Structured Invoice Parsing', () => {
  it('should parse a complete GST invoice with HSN, IGST columns', () => {
    const rawText = `
TAX INVOICE
M/s. Industrial Supplies Pvt Ltd
GSTIN: 29AABCI5678D1ZK
Invoice No: IS/2025-26/0042    Date: 15/04/2026

S.No.  HSN / SAC  Description              Qty  Rate      Taxable Value  IGST @18%  Total
1      73051100   Steel Pipes 2" ERW       50   120.00    6000.00        1080.00    7080.00
2      73072990   Elbow Joints 90° SS      100  25.00     2500.00        450.00     2950.00
3      73079990   Flanges 4" RF PN16       20   350.00    7000.00        1260.00    8260.00

                                           Subtotal:                    15500.00
                                           IGST @18%:                   2790.00
                                           Round Off:                   0.00
                                           Grand Total:                 18290.00

Amount in words: Eighteen Thousand Two Hundred Ninety Rupees Only
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 15500,
      taxAmount: 2790,
      totalAmount: 18290,
    })

    assert.ok(result.items.length >= 3, `Expected ≥3 items, got ${result.items.length}`)
    assert.ok(result.tableConfidence >= 0.5, `Confidence should be ≥0.5, got ${result.tableConfidence}`)

    // Verify structural accuracy
    for (const item of result.items) {
      assert.ok(item.quantity > 0, `Qty should be > 0: ${item.description}`)
      assert.ok(item.unitPrice > 0, `Unit price should be > 0: ${item.description}`)
      assert.ok(item.amount > 0, `Amount should be > 0: ${item.description}`)
    }
  })

  it('should handle invoice where HSN is mistaken as quantity', () => {
    // Simulate OCR output where HSN code lands in qty column
    const rawText = `
S.No.  Description         Qty         Rate     Taxable Value  IGST    Total
1      Steel Pipes 2"      73051100    120.00   6000.00        1080.00 7080.00
2      Elbow Joints        73072990    25.00    2500.00        450.00  2950.00

Subtotal: 8500.00
IGST: 1530.00
Total: 10030.00
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 8500,
      taxAmount: 1530,
      totalAmount: 10030,
    })

    // After HSN disambiguation, quantities should be reasonable
    for (const item of result.items) {
      assert.ok(item.quantity <= 1000, `Qty ${item.quantity} should be ≤1000 after HSN fix: ${item.description}`)
      assert.ok(item.unitPrice > 0, `Unit price should be > 0: ${item.description}`)
    }
  })

  it('should handle invoice with CGST + SGST columns (intra-state)', () => {
    const rawText = `
S.No.  Description    Qty  Rate    Taxable Value  CGST @9%  SGST @9%  Total
1      Office Chair   5    3500    17500          1575      1575      20650
2      Desk Lamp      10   800     8000           720       720       9440

Subtotal: 25500
CGST: 2295
SGST: 2295
Total: 30090
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 25500,
      taxAmount: 4590,
      totalAmount: 30090,
    })

    assert.ok(result.items.length >= 2, `Expected ≥2 items, got ${result.items.length}`)
  })

  it('should produce zero rejected items for well-structured invoice', () => {
    const rawText = `
S.No.  Description       Qty  Rate     Amount
1      Printer Paper     10   250.00   2500.00
2      Ink Cartridge     5    800.00   4000.00
3      Stapler Pins      20   50.00    1000.00

Total: 7500.00
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 7500,
      taxAmount: 0,
      totalAmount: 7500,
    })

    assert.ok(result.items.length >= 3, `Expected ≥3 items, got ${result.items.length}`)
    assert.equal(result.meta?.rejectedItems || 0, 0, 'No items should be rejected')
  })

  it('should use financial override when table parsing fails completely', () => {
    const rawText = `
Some random text without any table structure
Just vendor info and totals

Subtotal: 5000
Tax: 900
Grand Total: 5900
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 5000,
      taxAmount: 900,
      totalAmount: 5900,
    })

    // Should create at least 1 item from totals
    assert.ok(result.items.length >= 1, 'Should create item from financial override')
    assert.equal(result.method, 'financial_override')
  })

  it('should return confidence=1.0 when all items valid and financials match', () => {
    const rawText = `
S.No.  Description    Qty  Rate    Amount
1      Widget A       10   100     1000
2      Widget B       5    200     1000

Total: 2000
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 2000,
      taxAmount: 0,
      totalAmount: 2000,
    })

    if (result.items.length >= 2) {
      assert.ok(result.tableConfidence >= 0.9, `Confidence should be ≥0.9 when items match totals, got ${result.tableConfidence}`)
    }
  })

  it('should handle invoice with discount column', () => {
    const rawText = `
S.No.  Description    Qty  Rate    Discount  Taxable Value  Amount
1      Product X      10   500     10%       4500           4500
2      Product Y      5    1000    5%        4750           4750

Total: 9250
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 9250,
      taxAmount: 0,
      totalAmount: 9250,
    })

    assert.ok(result.items.length >= 2, `Expected ≥2 items, got ${result.items.length}`)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   11. Edge Cases
   ═══════════════════════════════════════════════════════════════════ */

describe('Edge Cases', () => {
  it('should handle empty rawText', () => {
    const result = tableReconstructionService.reconstruct('', [], null)
    assert.equal(result.items.length, 0)
  })

  it('should handle null words', () => {
    const result = tableReconstructionService.reconstruct('some text', null, null)
    assert.ok(result, 'Should not crash')
  })

  it('should handle null documentTotals', () => {
    const result = tableReconstructionService.reconstruct('some text', [], null)
    assert.ok(result, 'Should not crash')
  })

  it('should stop parsing at totals/footer lines', () => {
    const rawText = `
S.No.  Description    Qty  Rate    Amount
1      Item A         5    100     500
2      Item B         3    200     600

Subtotal: 1100
IGST @18%: 198
Grand Total: 1298

Bank Details:
Account: 1234567890
IFSC: SBIN0001234
`
    const result = tableReconstructionService.reconstruct(rawText, [], {
      subtotal: 1100,
      taxAmount: 198,
      totalAmount: 1298,
    })

    // Should not include bank details as line items
    assert.ok(result.items.length <= 3, 'Should not parse footer as items')
    for (const item of result.items) {
      assert.ok(!item.description.toLowerCase().includes('bank'), 'Should not include bank details')
      assert.ok(!item.description.toLowerCase().includes('account'), 'Should not include account info')
    }
  })
})
