# BlockERP — Comprehensive Pipeline Test Scenarios

**Project**: BlockERP (Blockchain-based ERP System)  
**Version**: 1.0  
**Date**: 2026-04-10  
**Methodology**: ISTQB / ISO 25010  
**Scope**: End-to-end pipeline verification — Authentication, CRUD, File Processing, Blockchain, Compliance, Reporting

---

## Table of Contents

1. [Pipeline Components](#1-pipeline-components)
2. [Authentication & Authorization Pipeline](#2-authentication--authorization-pipeline)
3. [Invoice Lifecycle Pipeline](#3-invoice-lifecycle-pipeline)
4. [Invoice Scanner / OCR Pipeline](#4-invoice-scanner--ocr-pipeline)
5. [Order Management Pipeline](#5-order-management-pipeline)
6. [Inventory Management Pipeline](#6-inventory-management-pipeline)
7. [Procurement Pipeline](#7-procurement-pipeline)
8. [Accounting Pipeline](#8-accounting-pipeline)
9. [GST Compliance Pipeline](#9-gst-compliance-pipeline)
10. [TDS Compliance Pipeline](#10-tds-compliance-pipeline)
11. [Blockchain Anchoring & Verification Pipeline](#11-blockchain-anchoring--verification-pipeline)
12. [Delivery Tracking Pipeline](#12-delivery-tracking-pipeline)
13. [Dashboard & Reporting Pipeline](#13-dashboard--reporting-pipeline)
14. [Master Data Pipeline](#14-master-data-pipeline)
15. [Cross-Pipeline Integration Scenarios](#15-cross-pipeline-integration-scenarios)
16. [Performance & Scalability Scenarios](#16-performance--scalability-scenarios)
17. [Security & Access Control Scenarios](#17-security--access-control-scenarios)
18. [Error Handling & Recovery Scenarios](#18-error-handling--recovery-scenarios)

---

## 1. Pipeline Components

| # | Component | Stages | Dependencies |
|---|-----------|--------|-------------|
| 1 | Authentication | Register → JWT Issue → Session Validate → Role Check | MongoDB, bcrypt, JWT |
| 2 | Invoice Lifecycle | Create → Blockchain Anchor → Payment → Verify | Customers, Stores, Blockchain |
| 3 | Invoice Scanner | Upload → Extract → OCR Parse → Validate → Create → Stock-in → Anchor | Tesseract, Products, Blockchain |
| 4 | Order Management | Create → Stock Allocate → Status → Deliver | Products, Inventory, Customers |
| 5 | Inventory | Stock-in/out → Adjust → Transfer → Low-stock Alert | Products, Stores |
| 6 | Procurement | PO Create → Goods Receipt → Auto Stock-in | Suppliers, Products, Stores |
| 7 | Accounting | Chart Init → Journal Entries → Reports (Trial/P&L/BS) | Accounts |
| 8 | GST Compliance | Summary → GSTR-1/3B/9 → File Return | Invoices |
| 9 | TDS Compliance | Calculate → Deduction → Quarterly → Deposit | — |
| 10 | Blockchain | Hash → IPFS → Anchor → Verify | Hardhat, ethers.js, Pinata |
| 11 | Delivery | Create → Dispatch → In-transit → Deliver → Blockchain Proof | Orders, Blockchain |
| 12 | Dashboard | Aggregate queries across all modules | All modules |
| 13 | Master Data | Products / Suppliers / Stores / Customers CRUD | — |

---

## 2. Authentication & Authorization Pipeline

### 2.1 Registration

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| AUTH-01 | Valid registration | `{ name: "Test", email: "test@co.com", password: "Pass1234" }` | Register a new user with valid data | 201, returns `{ token, user }`, password hashed with bcrypt | High |
| AUTH-02 | Duplicate email | Email that already exists in DB | Attempt registration with existing email | 400/409, `"Email already in use"` | High |
| AUTH-03 | Missing required fields | `{ email: "a@b.com" }` — no name, no password | Submit registration form with missing fields | 400, Zod validation error listing missing fields | High |
| AUTH-04 | Short password | `{ password: "abc" }` (< 8 chars) | Register with password below minimum length | 400, `"Password must be at least 8 characters"` | Medium |
| AUTH-05 | Empty body | `{}` | POST /api/auth/register with empty JSON | 400, validation error for all required fields | Medium |
| AUTH-06 | No body at all | No request body (Content-Type missing) | POST with no payload | 400, JSON parse error or validation error | Medium |
| AUTH-07 | Auto-create company | No `companyId` provided | Register first user for a company | Company auto-created, user.companyId populated | Medium |
| AUTH-08 | Invalid email format | `{ email: "not-an-email" }` | Register with malformed email | 400, `"Invalid email address"` | Medium |
| AUTH-09 | SQL/NoSQL injection in email | `{ email: "admin'--@x.com" }` | Attempt injection through email field | 400 validation error; no DB query execution | High |
| AUTH-10 | Extremely long name | `name` = 10,000 character string | Test field length boundaries | 400 validation or truncation; no crash | Low |

### 2.2 Login

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| AUTH-11 | Valid login | Correct email + password | Authenticate with valid credentials | 200, `{ token, user }`, `lastLoginAt` updated | High |
| AUTH-12 | Wrong password | Valid email + incorrect password | Login with wrong password | 401, `"Invalid credentials"` | High |
| AUTH-13 | Non-existent email | Email not in DB | Login with unregistered email | 401, `"Invalid credentials"` (no enumeration) | High |
| AUTH-14 | Empty credentials | `{ email: "", password: "" }` | Submit empty login form | 400, validation error | Medium |
| AUTH-15 | Deactivated user | `isActive: false` user | Login after account deactivation | 401/403, account disabled message | High |
| AUTH-16 | Dev fallback mode | MongoDB down + dev environment | Login when DB is unavailable | Returns DEV_FALLBACK_USER with limited token | Low |
| AUTH-17 | Expired token | JWT past 12h expiry | Call /api/auth/me with expired token | 401, `"Token expired"` | High |
| AUTH-18 | Server restart invalidation | Valid token, server restarted (new bootId) | Call /api/auth/me after server restart | 401, session ID mismatch | Medium |

### 2.3 Authorization (Role-Based)

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| AUTH-19 | Admin access | `role: admin` token | Access admin-only endpoint (PATCH order) | 200, operation succeeds | High |
| AUTH-20 | Unauthorized role | `role: viewer` token on admin route | Access admin-only endpoint with viewer role | 403, `"Insufficient permissions"` | High |
| AUTH-21 | No token at all | No Authorization header | Access protected endpoint without token | 401, `"Authentication required"` | High |
| AUTH-22 | Malformed token | `Authorization: Bearer not.a.jwt` | Submit garbage JWT | 401, JWT verification error | High |
| AUTH-23 | Multi-tenant isolation | User from Company A | Access Company B resources | Empty result set or 403; never see other company's data | Critical |

---

## 3. Invoice Lifecycle Pipeline

### 3.1 Invoice Creation

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INV-01 | Valid invoice | `{ customer, store, subtotal: 5000, taxAmount: 900, totalAmount: 5900 }` | Create invoice with all required fields | 201, invoice created, `invoiceNumber` auto-generated, blockchain record created | High |
| INV-02 | Missing customer | `{ store, subtotal: 1000, totalAmount: 1000 }` — no customer | Create invoice without customer reference | 400, `"customer is required"` | High |
| INV-03 | Negative subtotal | `{ subtotal: -500 }` | Create invoice with negative amount | 400, `"subtotal must be >= 0"` | High |
| INV-04 | Zero-value invoice | `{ subtotal: 0, taxAmount: 0, totalAmount: 0 }` | Create a zero-amount invoice | 201, invoice created (valid edge case) | Medium |
| INV-05 | Invalid customer ref | `{ customer: "nonexistent-id" }` | Create invoice pointing to deleted customer | 400/404, invalid reference error | Medium |
| INV-06 | Very large amounts | `{ subtotal: 999999999999.99 }` | Invoice with extreme monetary value | 201, amounts stored accurately (no float drift) | Medium |
| INV-07 | No invoices exist | Empty invoices collection | GET /api/invoices | 200, `[]` empty array | Medium |
| INV-08 | With linked order | `{ order: validOrderId }` | Create invoice linked to an existing order | Invoice populated with order reference | Medium |

### 3.2 Invoice Payment

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INV-09 | Full payment | `PUT /mark-paid` with amount = totalAmount | Mark invoice as fully paid | Status changes to `paid`, `balanceDue: 0`, payment record created | High |
| INV-10 | Partial payment | `{ amount: 500 }` on ₹5000 invoice | Record partial payment | `amountPaid` incremented, `balanceDue` decremented, status remains `issued` | High |
| INV-11 | Overpayment | `{ amount: 10000 }` on ₹5000 invoice | Pay more than owed | 400, `"Amount exceeds balance due"` or cap to balance | Medium |
| INV-12 | Payment on cancelled invoice | Invoice with `status: cancelled` | Attempt to pay cancelled invoice | 400, `"Cannot pay cancelled invoice"` | Medium |
| INV-13 | Double payment | Mark-paid called twice sequentially | Prevent duplicate full payments | Second call: 400 or idempotent no-op | Medium |

### 3.3 Invoice Verification

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INV-14 | Untampered invoice | Invoice with matching blockchain hash | Verify integrity of unmodified invoice | `blockchainVerified: true`, hashes match | High |
| INV-15 | Tampered invoice | Invoice modified after blockchain anchoring | Verify integrity after data tampering | `blockchainVerified: false`, `currentHash !== hash` | High |
| INV-16 | No blockchain record | Invoice never anchored | Verify invoice with no blockchain record | `verificationStatus: not_requested`, no on-chain data | Medium |
| INV-17 | Failed anchor | Blockchain record with `status: failed` | Verify invoice with failed anchoring | Shows failed status with error message | Medium |

---

## 4. Invoice Scanner / OCR Pipeline

### 4.1 File Upload & Extraction

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| SCN-01 | Valid PDF invoice | Well-formatted PDF with invoice fields | Parse PDF and extract fields | 200, all fields extracted with confidence scores | High |
| SCN-02 | Valid image (JPG) | Clear photograph of printed invoice | OCR image and extract text | 200, fields extracted via Tesseract, confidence reported | High |
| SCN-03 | Valid XLSX | Spreadsheet with invoice data columns | Parse Excel and extract fields | 200, fields extracted from cell values | Medium |
| SCN-04 | Valid DOCX | Word document with invoice template | Parse DOCX and extract fields | 200, fields extracted from text content | Medium |
| SCN-05 | Empty file | 0-byte PDF/image file | Upload empty file | 400, `"File is empty or unreadable"` | High |
| SCN-06 | Corrupted PDF | Binary garbage with .pdf extension | Upload corrupt file | 400, `"Unable to extract text from file"` | High |
| SCN-07 | Oversized file | 15 MB image (exceeds 10 MB limit) | Upload file exceeding size limit | 413, `"File too large"` (MulterError handled) | High |
| SCN-08 | Unsupported format | .exe, .zip, .mp4 file | Upload non-supported file type | 400, `"Unsupported file format"` | High |
| SCN-09 | No file & no rawText | POST with empty body | Process without any input | 400, `"File or rawText required"` | High |
| SCN-10 | Raw text input | Plain text pasted instead of file upload | Parse from rawText field | 200, fields extracted from text string | Medium |
| SCN-11 | Blurry image | Low-resolution, unfocused photo | OCR poorly scanned document | 200, extraction with `confidence: low`, many fields null | Medium |
| SCN-12 | Non-English invoice | Invoice in Hindi/Tamil characters | Process non-Latin script | Partial extraction; confidence reflects limited English OCR | Low |
| SCN-13 | Multi-page PDF | 50-page PDF, invoice on page 3 | Parse large multi-page document | Extracts fields found across all pages; reasonable processing time | Medium |
| SCN-14 | Password-protected PDF | PDF with password encryption | Upload encrypted PDF | 400, extraction failure with descriptive error | Medium |
| SCN-15 | CSV file | Comma-separated invoice data | Parse CSV file | Fields extracted from text content | Low |

### 4.2 OCR Parsing & Confidence

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| SCN-16 | All fields present | Invoice with vendor, GSTIN, number, date, amounts, line items | Parse fully populated invoice | All fields extracted, `confidence: high` (avg ≥ 0.7) | High |
| SCN-17 | Missing GSTIN | Invoice without GSTIN anywhere | Parse invoice without GSTIN | `gstin: null`, `fieldConfidence.gstin.confidence: 0` | Medium |
| SCN-18 | Missing invoice number | No invoice/bill/receipt number pattern | Parse invoice without number | `invoiceNumber: null`, auto-generates `SCN-{random}` during process | Medium |
| SCN-19 | Multiple date formats | `DD/MM/YYYY`, `DD-MM-YYYY`, `15 Mar 2026` all present | Parse invoice with various date formats | Most prominent date captured; confidence reflects format match | Medium |
| SCN-20 | Ambiguous amounts | Multiple "Total" lines with different values | Parse invoice with conflicting totals | Extracts last/most specific match; confidence reflects ambiguity | Medium |
| SCN-21 | No matching fields | Random text with no invoice-like patterns | Parse non-invoice text | All fields null, `confidence: low`, validation errors | Medium |
| SCN-22 | Unicode currency symbols | `₹`, `Rs.`, `INR` in amounts | Parse amounts with different currency markers | Amounts correctly parsed regardless of symbol | Medium |
| SCN-23 | Comma-separated numbers | Amount: `1,23,456.78` (Indian format) | Parse lakhs-formatted numbers | Correctly parsed to `123456.78` | Medium |

### 4.3 Validation & Processing

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| SCN-24 | Valid GSTIN format | `29ABCDE1234F1Z5` | Validate correctly formatted GSTIN | Validation passes, `gstin` stored | High |
| SCN-25 | Invalid GSTIN format | `INVALID_GSTIN` | Validate malformed GSTIN | Warning/error: `"Invalid GSTIN format"` (non-blocking) | Medium |
| SCN-26 | Line-item arithmetic mismatch | Sum of line items ≠ subtotal (difference > ₹1) | Validate invoice where items don't sum to subtotal | Warning: `"Line items sum does not match subtotal"` | Medium |
| SCN-27 | Tax exceeds 30% | `taxAmount: 5000`, `subtotal: 10000` (50%) | Validate invoice with unreasonable tax rate | Warning: `"Tax amount seems too high"` | Medium |
| SCN-28 | Duplicate invoice | Same `invoiceNumber + vendorName` already in DB | Process duplicate scanned invoice | Warning: `"Possible duplicate"`, invoice still created | Medium |
| SCN-29 | Idempotent re-upload | Same file content re-uploaded (MD5 matches) | Re-process identical raw text | Returns `{ duplicate: true }`, no new invoice created | High |
| SCN-30 | User overrides | parsedOverrides: `{ subtotal: 999, vendorName: "Fixed Name" }` | Override OCR-extracted values | Overridden values used in final invoice | High |
| SCN-31 | Auto inventory match (exact SKU) | Line item description matches existing product SKU | Process invoice with matching products | Product `currentStock` incremented, `InventoryTransaction` created | High |
| SCN-32 | Auto inventory match (fuzzy name) | Line item: "Widget A", product: "Widget Alpha" (Dice ≥ 0.4) | Fuzzy-match product by name | Product matched and stock updated | Medium |
| SCN-33 | No inventory match | Line item: "XYZ Widget" — no similar product exists | Process invoice with unrecognized line items | No stock update; `inventoryUpdates: []` for that item | Medium |
| SCN-34 | Vendor match by GSTIN | Scanned GSTIN matches existing Supplier.taxId | Link scanned invoice to supplier | Supplier linked; audit log reflects vendor match | Medium |

---

## 5. Order Management Pipeline

### 5.1 Sales Order Creation

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ORD-01 | Valid order | `{ customer, items: [{ product, quantity: 5, unitPrice: 100 }] }` | Create order with sufficient stock | 201, order created, `currentStock` decremented by 5, blockchain anchored | High |
| ORD-02 | Insufficient stock | `quantity: 100`, product `currentStock: 10` | Order more than available stock | 400, `"Insufficient stock for product X"` | High |
| ORD-03 | Zero quantity | `{ items: [{ quantity: 0 }] }` | Order with zero-quantity line | 400, Zod: `"quantity must be > 0"` | Medium |
| ORD-04 | Empty items array | `{ customer, items: [] }` | Order with no line items | 400, `"At least one item required"` | High |
| ORD-05 | No orders exist | Empty orders collection | GET /api/orders | 200, `[]` empty array | Medium |
| ORD-06 | Multiple line items | 20 different products in one order | Create large multi-item order | All stock decremented correctly, amounts summed | Medium |
| ORD-07 | Non-existent product | `product: "deleted-id"` | Order referencing deleted product | 400/404, product not found | Medium |
| ORD-08 | Very large order | 10,000 units × ₹99,999 unit price | Order with extreme totals | 201, amounts stored precisely without overflow | Low |

### 5.2 Order Status Transitions

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ORD-09 | Valid status flow | pending → processing → shipped → delivered | Walk through all valid transitions | Each status update succeeds | High |
| ORD-10 | Skip status | pending → delivered (skip shipped) | Attempt non-sequential transition | Depends on validation: may succeed or 400 | Medium |
| ORD-11 | Cancel order | `status: cancelled` on pending order | Cancel a pending order | Status changes, stock restored (if allocated) | High |
| ORD-12 | Modify cancelled order | PATCH on `status: cancelled` order | Update a cancelled order | 400, `"Cannot modify cancelled order"` | Medium |
| ORD-13 | Update with wrong role | `role: viewer` attempts PATCH | Non-admin/inventory_manager updates order | 403, insufficient permissions | High |

---

## 6. Inventory Management Pipeline

### 6.1 Stock Operations

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INV-M01 | Stock-in | `{ productId, storeId, quantity: 50 }` | Add stock to inventory | `currentStock` += 50, `InventoryTransaction` created, blockchain anchored | High |
| INV-M02 | Stock-out | `{ productId, storeId, quantity: 10 }` | Remove stock from inventory | `currentStock` -= 10, transaction recorded | High |
| INV-M03 | Stock-out exceeds stock | `quantity: 100`, `currentStock: 10` | Withdraw more than available | 400, `"Insufficient stock"` | High |
| INV-M04 | Zero stock operation | `{ quantity: 0 }` | Stock-in/out with zero quantity | 400, validation error (quantity must be > 0) | Medium |
| INV-M05 | Negative stock-in | `{ quantity: -10 }` for stock-in | Attempt negative stock-in | 400, validation error | Medium |
| INV-M06 | Adjustment (positive) | `{ quantity: 5 }` via /adjust | Adjust stock upward | `currentStock` adjusted, type: `adjustment` | Medium |
| INV-M07 | Adjustment (negative) | `{ quantity: -5 }` via /adjust | Adjust stock downward | `currentStock` adjusted, negative quantity allowed | Medium |
| INV-M08 | Transfer between stores | `{ fromStoreId, toStoreId, quantity: 20 }` | Transfer stock between two stores | Source decremented, destination incremented, two transactions | High |
| INV-M09 | Transfer to same store | `fromStoreId === toStoreId` | Transfer to the same store | 400, `"Source and destination must differ"` | Medium |
| INV-M10 | Transfer exceeds source | `quantity: 100`, source stock: 10 | Transfer more than source holds | 400, `"Insufficient stock at source store"` | High |
| INV-M11 | Non-existent product | Invalid productId | Stock operation on deleted product | 404, `"Product not found"` | Medium |

### 6.2 Low-Stock & History

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INV-M12 | Low stock alert | Products where `currentStock <= reorderLevel` | GET /api/inventory/low-stock | Returns only products below reorder threshold | High |
| INV-M13 | No low-stock products | All products above reorder level | GET /api/inventory/low-stock | 200, `[]` empty array | Medium |
| INV-M14 | Transaction history | Valid productId with 50 transactions | GET /api/inventory/history/:productId | Returns transactions sorted by `createdAt` desc | Medium |
| INV-M15 | No transaction history | Product with zero transactions | GET /api/inventory/history/:productId | 200, `[]` empty array | Medium |

---

## 7. Procurement Pipeline

### 7.1 Purchase Orders

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| PROC-01 | Valid PO | `{ supplier, store, items: [{ product, quantity: 100, unitCost: 50 }] }` | Create purchase order | 201, PO created with `orderNumber`, blockchain anchored | High |
| PROC-02 | Missing supplier | No supplier reference | Create PO without supplier | 400, `"supplier is required"` | High |
| PROC-03 | Empty items | `{ items: [] }` | PO with no line items | 400, minimum 1 item required | Medium |
| PROC-04 | No POs exist | Empty PO collection | GET /api/procurement/purchase-orders | 200, `[]` | Medium |
| PROC-05 | Negative unit cost | `{ unitCost: -10 }` | PO with negative pricing | 400, `"unitCost must be >= 0"` | Medium |

### 7.2 Goods Receipt

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| PROC-06 | Full receipt | All PO items received at ordered quantity | Record goods receipt | PO status → `received`, products `currentStock` updated | High |
| PROC-07 | Partial receipt | Only 50 of 100 ordered units received | Record partial delivery | PO status → `partially_received`, `receivedQuantity: 50` | High |
| PROC-08 | Over-receipt | `quantityReceived: 150` for `quantity: 100` | Receive more than ordered | May succeed or warn; receivedQuantity updated | Medium |
| PROC-09 | Receipt for non-existent PO | Invalid `purchaseOrder` ID | Record receipt for missing PO | 404, `"Purchase order not found"` | Medium |
| PROC-10 | Duplicate receipt | Same PO receivable twice | Submit receipt for already-received PO | Depends on status validation; should prevent or aggregate | Medium |

---

## 8. Accounting Pipeline

### 8.1 Chart of Accounts

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ACC-01 | Initialize chart | POST /api/accounting/initialize | Create default chart of accounts | Default accounts created (assets, liabilities, equity, revenue, expense) | High |
| ACC-02 | Double initialize | Call initialize when accounts exist | Re-initialize chart of accounts | Idempotent: no duplicates created, or 409 | Medium |
| ACC-03 | Create custom account | `{ code: "5001", name: "Office Supplies", type: "expense" }` | Add new account to chart | 201, account created | Medium |
| ACC-04 | Duplicate account code | Same `code` per company | Create account with existing code | 400/409, `"Account code already exists"` | Medium |
| ACC-05 | Invalid account type | `{ type: "invalid" }` | Create account with non-enum type | 400, Zod validation error | Medium |
| ACC-06 | No accounts exist | Empty accounts collection | GET /api/accounting/accounts | 200, `[]` | Medium |

### 8.2 Journal Entries

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ACC-07 | Balanced entry | `lines: [{ account: A, debit: 1000 }, { account: B, credit: 1000 }]` | Create valid journal entry | 201, entry created, account balances updated (A +1000 debit, B +1000 credit) | High |
| ACC-08 | Unbalanced entry | `debit: 1000, credit: 500` | Create entry where debits ≠ credits | 400, `"Debits must equal credits"` | High |
| ACC-09 | Single line | Only 1 line in `lines[]` | Journal entry with < 2 lines | 400, `"At least 2 lines required"` | High |
| ACC-10 | Empty lines | `{ lines: [] }` | Journal entry with no lines | 400, validation error | Medium |
| ACC-11 | Zero amounts | `{ debit: 0, credit: 0 }` on both lines | Journal entry with zero values | 400 or warning; no meaningful transaction | Medium |
| ACC-12 | Very large amounts | `{ debit: 999999999999 }` | Entry with extreme monetary value | 201, amounts stored precisely | Low |
| ACC-13 | Non-existent account | Invalid `account` ObjectId in lines | Journal entry referencing deleted account | 400/404, `"Account not found"` | Medium |
| ACC-14 | Multi-line entry | 10+ lines in a single journal entry | Complex multi-account entry | All account balances updated correctly | Medium |

### 8.3 Financial Reports

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ACC-15 | Trial balance (balanced) | Accounts with balanced entries | GET /api/accounting/trial-balance | `totalDebit === totalCredit`, `balanced: true` | High |
| ACC-16 | Trial balance (no data) | No journal entries created | GET /api/accounting/trial-balance | `totalDebit: 0, totalCredit: 0, balanced: true` | Medium |
| ACC-17 | Profit & Loss | Revenue & expense accounts with entries | GET /api/accounting/profit-and-loss | `netIncome = totalRevenue - totalExpenses` | High |
| ACC-18 | P&L (no revenue) | Only expense entries | GET /api/accounting/profit-and-loss | `totalRevenue: 0`, negative `netIncome` | Medium |
| ACC-19 | Balance sheet | All account types with balances | GET /api/accounting/balance-sheet | `totalAssets === totalLiabilities + totalEquity`, `balanced: true` | High |
| ACC-20 | Balance sheet (empty) | No accounts or entries | GET /api/accounting/balance-sheet | All totals zero, `balanced: true` | Medium |

---

## 9. GST Compliance Pipeline

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| GST-01 | Summary for valid period | `period=202604` with existing invoices | GET /api/gst/summary | Returns `invoiceCount`, `totalCGST`, `totalSGST`, `totalIGST`, etc. | High |
| GST-02 | Summary for empty period | `period=202001` — no invoices | GET /api/gst/summary | All tax values = 0, `invoiceCount: 0` | Medium |
| GST-03 | Invalid period format | `period=abcdef` or `period=99` | GET /api/gst/summary?period=abcdef | 400, `"Invalid period format"` | Medium |
| GST-04 | GSTR-1 generation | `period=202604` | GET /api/gst/gstr1 | Returns GSTR-1 structure with invoice breakdown | High |
| GST-05 | File GSTR-1 return | `{ returnType: "GSTR1", period: "202604" }` | POST /api/gst/file-return | GSTReturn document created, `status: filed` | High |
| GST-06 | Duplicate return filing | File same `returnType + period` twice | POST /api/gst/file-return | 400/409, `"Return already filed for this period"` | Medium |
| GST-07 | Invalid return type | `{ returnType: "GSTR99" }` | File with unknown return type | 400, validation error | Medium |
| GST-08 | State codes | — | GET /api/gst/state-codes | Returns 37 state → name mappings | Low |
| GST-09 | HSN search | `q=8471` (computer parts) | GET /api/gst/hsn?q=8471 | Returns matching HSN codes with GST rates | Medium |
| GST-10 | HSN search (no match) | `q=0000` | GET /api/gst/hsn?q=0000 | 200, `[]` empty array | Medium |
| GST-11 | HSN search (empty query) | `q=` | GET /api/gst/hsn?q= | All HSN codes or validation error | Low |

---

## 10. TDS Compliance Pipeline

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| TDS-01 | List TDS sections | — | GET /api/tds/sections | Returns 7 sections (194A–194Q) with descriptions and rates | Medium |
| TDS-02 | Calculate TDS | `{ section: "194C", amount: 100000 }` | POST /api/tds/calculate | `{ tdsAmount: 1000 }` (1% of 100000) | High |
| TDS-03 | Calculate with invalid section | `{ section: "999X" }` | Calculate TDS for non-existent section | 400, `"Invalid TDS section"` | Medium |
| TDS-04 | Calculate with zero amount | `{ section: "194C", amount: 0 }` | TDS on zero payment | `{ tdsAmount: 0 }` | Medium |
| TDS-05 | Calculate with negative amount | `{ section: "194C", amount: -5000 }` | TDS on negative payment | 400, `"Amount must be >= 0"` | Medium |
| TDS-06 | Record deduction | Full deduction object | POST /api/tds/deductions | TDS entry created with auto financial-year + quarter | High |
| TDS-07 | Quarterly summary | `financialYear=2025-2026, quarter=4` | GET /api/tds/quarterly/2025-2026/4 | Returns `totalPayment`, `totalTDS`, `depositedAmount`, `pendingAmount` | High |
| TDS-08 | Quarterly (no entries) | Non-existent financial year | GET /api/tds/quarterly/2000-2001/1 | All totals zero, `entryCount: 0` | Medium |
| TDS-09 | Deposit TDS | `{ challanNumber: "BSR12345" }` | PUT /api/tds/deductions/:id/deposit | `status: deposited`, `challanNumber` stored | High |
| TDS-10 | Deposit already deposited | Entry with `status: deposited` | PUT /mark as deposited again | 400 or idempotent no-op | Medium |
| TDS-11 | Filter deductions | `section=194J&quarter=1` | GET /api/tds/deductions with filters | Returns only matching entries | Medium |
| TDS-12 | No deductions exist | Empty TDS collection | GET /api/tds/deductions | 200, `[]` | Medium |

---

## 11. Blockchain Anchoring & Verification Pipeline

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| BC-01 | Anchor invoice | `POST /api/blockchain/anchor/invoice/:invoiceId` | Anchor invoice on-chain | `BlockchainRecord` created: status `pending` → `anchored`, txHash populated | High |
| BC-02 | Anchor with Hardhat down | Blockchain RPC unavailable | Anchor when node is offline | `status: failed`, `errorMessage` set, no crash | High |
| BC-03 | Verify anchored record | Entity with matching on-chain hash | GET /api/blockchain/verify/invoice/:id | `verified: true`, hashes match | High |
| BC-04 | Verify tampered data | Invoice modified after anchoring | Verify after data mutation | `verified: false`, `expectedHash !== currentHash` | High |
| BC-05 | Verify non-existent entity | Invalid entityId | GET /api/blockchain/verify/invoice/fake-id | 404 or `verified: false`, no on-chain record | Medium |
| BC-06 | Anchor unsupported entity type | `entityType: "unknown_type"` | POST /api/blockchain/anchor/unknown_type/:id | 400, `"Invalid entity type"` | Medium |
| BC-07 | IPFS upload failure | Pinata service unavailable | Anchor when IPFS is down | Anchor may proceed without IPFS CID, or fail gracefully | Medium |
| BC-08 | Blockchain ledger (empty) | No blockchain records | GET /api/blockchain/ledger | 200, `[]` | Medium |
| BC-09 | Blockchain ledger (populated) | 100+ anchored records | GET /api/blockchain/ledger | Returns all records sorted descending by date | Medium |
| BC-10 | Re-anchor same entity | Anchor an already-anchored entity | POST anchor for same entity/id | New record created (or idempotent update) | Medium |
| BC-11 | Hash computation consistency | Same payload anchored twice | Verify canonical hash is deterministic | Both produce identical SHA256 hash | High |
| BC-12 | Revoke record (admin) | Admin calls revokeRecord | Revoke on-chain record | Record marked as revoked | Medium |
| BC-13 | Revoke record (non-admin) | Non-admin calls revokeRecord | Unauthorized revocation attempt | Reverted / 403 | Medium |

---

## 12. Delivery Tracking Pipeline

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| DEL-01 | Create delivery | `{ orderId, customer }` — valid order | Create delivery tracking | Tracking number + barcode generated, `status: created` | High |
| DEL-02 | Invalid order ref | Non-existent orderId | Create delivery for missing order | 404, `"Order not found"` | Medium |
| DEL-03 | Status: dispatched | `{ status: "dispatched" }` | Update to dispatched | `dispatchedAt` set, tracking event added | High |
| DEL-04 | Status: delivered | `{ status: "delivered" }` | Mark delivery as complete | `actualDelivery` set, blockchain proof generated + anchored | High |
| DEL-05 | Invalid status transition | `created → delivered` (skip stages) | Skip intermediate statuses | 400 or allowed depending on business rules | Medium |
| DEL-06 | Barcode scan | `{ scannedBarcode: "matching-code" }` | Update status via barcode scan | Tracking event includes `scannedBarcode` | Medium |
| DEL-07 | Public tracking | Valid tracking number | GET /api/delivery/track/:trackingNumber | Returns delivery status without auth | High |
| DEL-08 | Public tracking (invalid) | Non-existent tracking number | GET /api/delivery/track/FAKE123 | 404, `"Delivery not found"` | Medium |
| DEL-09 | Barcode generation | `text=PROD-001` | GET /api/delivery/barcode/PROD-001 | Returns PNG image (code128 format) | Medium |
| DEL-10 | No deliveries exist | Empty delivery collection | GET /api/delivery | 200, `[]` or `{ deliveries: [] }` | Medium |

---

## 13. Dashboard & Reporting Pipeline

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| DASH-01 | Summary with data | Multiple invoices, orders, inventory records | GET /api/dashboard/summary | Returns aggregated KPIs (pending invoices, order count, low stock, etc.) | High |
| DASH-02 | Summary with no data | Empty database (new company) | GET /api/dashboard/summary | All counters = 0; no errors | High |
| DASH-03 | Summary multi-tenant | User from Company A | GET /api/dashboard/summary | Only Company A data reflected in totals | High |
| DASH-04 | Demand forecast | Products with sales history | GET /api/demand/forecast | Returns forecast data based on historical trends | Medium |
| DASH-05 | Demand forecast (no history) | Product with zero sales | GET /api/demand/forecast?productId=X | Returns zero/flat forecast or descriptive message | Medium |
| DASH-06 | Top products | Products with varying sales volumes | GET /api/demand/top-products?limit=5 | Returns top 5 by volume, sorted desc | Medium |
| DASH-07 | Top products (none sold) | No sales orders exist | GET /api/demand/top-products | 200, `[]` or all products with 0 volume | Medium |

---

## 14. Master Data Pipeline

### 14.1 Products

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| MD-01 | Create product | `{ sku: "P001", name: "Widget", costPrice: 50, salePrice: 100 }` | Create product with required fields | 201, product created | High |
| MD-02 | Duplicate SKU | Same `sku` value | Create product with existing SKU | 400/409, `"SKU already exists"` | High |
| MD-03 | Missing required fields | `{ name: "Widget" }` — no sku, no prices | Create product without prices/SKU | 400, Zod validation error | High |
| MD-04 | Negative prices | `{ costPrice: -10, salePrice: -5 }` | Negative pricing | 400, `"price must be >= 0"` | Medium |
| MD-05 | Delete product in use | Product referenced by orders/inventory | DELETE /api/products/:id | 400/409, `"Product is referenced"` or soft-delete (`isActive: false`) | Medium |
| MD-06 | List with no products | Empty product collection | GET /api/products | 200, `[]` | Medium |
| MD-07 | Update product | PATCH with partial fields | Update product name/price | 200, only specified fields changed | Medium |

### 14.2 Suppliers

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| MD-08 | Create supplier | `{ code: "SUP01", name: "ACME Ltd" }` | Create supplier with required fields | 201 | High |
| MD-09 | Duplicate supplier code | Same `code` | Create supplier with existing code | 400/409 | Medium |
| MD-10 | Missing supplier name | `{ code: "SUP02" }` | Create without name | 400 | Medium |

### 14.3 Customers

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| MD-11 | Create customer | `{ code: "C001", name: "Acme Corp" }` | Create customer with valid data | 201 | High |
| MD-12 | Duplicate customer code | Same `code` | Create with existing code | 400/409 | Medium |
| MD-13 | Invalid email format | `{ email: "bad-email" }` | Customer with malformed email | 400, validation error | Medium |
| MD-14 | Negative credit limit | `{ creditLimit: -1000 }` | Negative credit limit | 400, `"creditLimit must be >= 0"` | Medium |

### 14.4 Stores

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| MD-15 | Create store | `{ name: "Main", code: "S01" }` | Create store | 201 | High |
| MD-16 | Invalid store type | `{ type: "factory" }` — not store/warehouse | Create with invalid type | 400, enum validation error | Medium |

---

## 15. Cross-Pipeline Integration Scenarios

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| INT-01 | Order → Invoice → Payment → Verify | Full lifecycle | Create order → generate invoice → record payment → verify blockchain | All entities linked, blockchain integrity confirmed | Critical |
| INT-02 | PO → Receipt → Stock-in → Order → Stock-out | Full procurement-to-sales cycle | Purchase goods → receive → sell via order → verify stock levels | Stock: +receipt quantity, −order quantity = expected remaining | Critical |
| INT-03 | Scan → Invoice → Ledger → GST | Scanner-to-compliance | Scan invoice → auto-create → journal entry → GST summary | Scanned invoice appears in GST period summary | High |
| INT-04 | Scan → Inventory match → Low-stock | File upload to inventory alert | Scan invoice with matching products → check low-stock | Low-stock threshold respected after stock-in | High |
| INT-05 | Delete customer with invoices | Customer has 5 invoices | Delete customer referenced by invoices | 400 or cascade soft-delete; invoices not orphaned | High |
| INT-06 | Delete product with orders | Product in active orders | Delete product referenced in orders | 400 or soft-delete; orders not broken | High |
| INT-07 | Concurrent stock operations | Two simultaneous stock-out for same product | Race condition on inventory | One succeeds, one fails (or both succeed if stock sufficient) — no negative stock | High |
| INT-08 | Invoice → Payment → Accounting | Payment creates journal entry | Pay invoice → verify auto-generated journal entry | Journal entry with debit: Cash, credit: A/R for payment amount | Medium |
| INT-09 | Delivery → Blockchain proof → Public verify | Full delivery verification | Deliver order → anchor → public tracking verification | Public endpoint confirms blockchain-verified delivery | Medium |
| INT-10 | Multi-module audit trail | Actions across all modules | Verify all CUD operations create audit log entries | Audit log contains entries for every create/update/delete across all modules | High |

---

## 16. Performance & Scalability Scenarios

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| PERF-01 | Large invoice list | 10,000 invoices in DB | GET /api/invoices | Response within 2 seconds, paginated if supported | High |
| PERF-02 | Bulk order creation | 100 orders in rapid succession | POST /api/orders × 100 | All orders created correctly, no stock inconsistency | High |
| PERF-03 | Large file OCR | 10 MB high-resolution image | POST /api/invoice-scanner/parse | Tesseract completes within 30 seconds, no timeout | Medium |
| PERF-04 | Concurrent users | 50 simultaneous authenticated requests | Load test across endpoints | All requests complete, no 500 errors from race conditions | High |
| PERF-05 | Large journal entry | Entry with 100 lines (50 debits, 50 credits) | POST /api/accounting/journal-entries | Created successfully, all 100 account balances updated | Medium |
| PERF-06 | GST summary (large dataset) | 50,000 invoices in period | GET /api/gst/summary | Aggregation completes within 5 seconds | Medium |
| PERF-07 | Audit log volume | 100,000 audit entries | GET /api/audit | Paginated response, no memory overflow | Medium |
| PERF-08 | Blockchain batch anchoring | 50 entities anchored concurrently | Parallel anchor requests | All complete (sequential on-chain), no nonce conflicts | Medium |
| PERF-09 | Dashboard with full dataset | All collections populated (10K+ records each) | GET /api/dashboard/summary | Aggregation completes within 3 seconds | High |
| PERF-10 | Request body limit | POST with 3 MB JSON body (exceeds 2 MB limit) | Send oversized payload | 413, `"Request body too large"` | Medium |

---

## 17. Security & Access Control Scenarios

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| SEC-01 | Token in sessionStorage | After login | Verify token stored in sessionStorage (not localStorage) | Token in `sessionStorage` under key `blockerp-token` | High |
| SEC-02 | Password hashing | Registration | Verify password stored as bcrypt hash | `user.passwordHash` is bcrypt hash, plaintext never stored | Critical |
| SEC-03 | NoSQL injection | `{ email: { "$gt": "" } }` | Inject MongoDB operator in login | 400 validation error; no data leak | Critical |
| SEC-04 | XSS in customer name | `{ name: "<script>alert(1)</script>" }` | Store XSS payload in name field | Stored as plain text; rendered safely (React escapes) | High |
| SEC-05 | Path traversal in file upload | Filename: `../../../etc/passwd` | Upload file with traversal path | Filename sanitized; no filesystem access | Critical |
| SEC-06 | JWT tampering | Modify JWT payload without re-signing | Submit tampered token | 401, `"Invalid token"` (signature verification fails) | Critical |
| SEC-07 | CORS origin check | Request from unlisted origin | Cross-origin request from attacker domain | Request blocked by CORS policy | High |
| SEC-08 | Rate limiting (auth) | 100 login attempts in 1 minute | Brute-force password attack | Rate limited after X attempts (if implemented) — otherwise flagged as gap | Medium |
| SEC-09 | File upload MIME spoofing | .exe renamed to .pdf | Upload executable with PDF extension | Rejected based on MIME detection or file magic bytes | High |
| SEC-10 | Multi-tenant data isolation | Company A user queries Company B data | Direct API call with Company B entity IDs | 404 or 403; Company A user never sees Company B data | Critical |
| SEC-11 | Token expiry enforcement | Token >12 hours old | Call protected endpoint | 401, `"Token expired"` | High |
| SEC-12 | Session invalidation on restart | Server restarts (new bootId) | Call protected endpoint with pre-restart token | 401, session mismatch | Medium |

---

## 18. Error Handling & Recovery Scenarios

| ID | Scenario | Input Condition | Test Description | Expected Outcome | Priority |
|----|----------|-----------------|------------------|------------------|----------|
| ERR-01 | Database connection lost | MongoDB becomes unavailable mid-request | Any DB operation during outage | 500 with descriptive error; no credential leak in response | High |
| ERR-02 | Invalid ObjectId format | `id=not-a-valid-objectid` | GET /api/invoices/not-a-valid-objectid | 400/500, `"Invalid ID format"` (CastError handled) | Medium |
| ERR-03 | Zod validation failure | Malformed request body | Any validated endpoint with wrong schema | 400, structured error with field-level messages | High |
| ERR-04 | MulterError handling | File >10 MB | Upload oversized file | 413, user-friendly size error (not raw MulterError) | High |
| ERR-05 | Blockchain RPC timeout | Hardhat node unresponsive | Anchor request during RPC timeout | Blockchain record: `status: failed`, `errorMessage` populated; invoice still created | High |
| ERR-06 | IPFS service down | Pinata unavailable | Anchor with IPFS upload failure | Graceful degradation; record created without `ipfsCid` or marked failed | Medium |
| ERR-07 | Concurrent modification | Two users update same invoice simultaneously | Race condition on invoice update | Last-write-wins or optimistic concurrency error; no data corruption | Medium |
| ERR-08 | Missing environment variables | `jwtSecret` undefined | Server startup without required config | Server fails to start with clear error message | High |
| ERR-09 | Stack trace exposure (prod) | Any 500 error in production mode | Check error response format | `stack` field NOT present in production response | Critical |
| ERR-10 | Graceful shutdown | SIGTERM signal | Server termination during active requests | Open connections completed/closed, no data loss | Medium |
| ERR-11 | Malformed JSON body | `{ "name": "test",,, }` | POST with invalid JSON | 400, `"Invalid JSON"` (express json parser error) | Medium |
| ERR-12 | Empty string IDs | `GET /api/invoices/` (trailing slash, no ID) | Request to collection endpoint with empty param | 200 (list endpoint) or 404 (not matched) — no crash | Low |

---

## Summary Statistics

| Category | Scenario Count |
|----------|---------------|
| Authentication & Authorization | 23 |
| Invoice Lifecycle | 17 |
| Invoice Scanner / OCR | 34 |
| Order Management | 13 |
| Inventory Management | 15 |
| Procurement | 10 |
| Accounting | 20 |
| GST Compliance | 11 |
| TDS Compliance | 12 |
| Blockchain | 13 |
| Delivery Tracking | 10 |
| Dashboard & Reporting | 7 |
| Master Data | 16 |
| Cross-Pipeline Integration | 10 |
| Performance & Scalability | 10 |
| Security & Access Control | 12 |
| Error Handling & Recovery | 12 |
| **Total** | **245** |

### Priority Breakdown

| Priority | Count | Coverage |
|----------|-------|----------|
| Critical | 9 | Security fundamentals, multi-tenant isolation, full lifecycle |
| High | 110 | Core CRUD, validation, auth, blockchain, business rules |
| Medium | 107 | Edge cases, empty data, format variants, boundary conditions |
| Low | 19 | Rare scenarios, cosmetic, optional features |

---

## Test Execution Notes

1. **Prerequisites**: MongoDB running, Hardhat local node (`npx hardhat node`), contracts deployed, `.env` configured with all required variables.
2. **Test Data**: Use seed script (`src/data/seed.js`) for baseline data; create test-specific data per scenario.
3. **Isolation**: Each test should be independent. Use before/after hooks to create and clean up test data.
4. **Multi-tenant**: Always test with at least 2 companies to verify data isolation.
5. **Blockchain scenarios**: Require Hardhat node running on `localhost:8545` with deployed `ERPRecordAnchor` contract.
6. **OCR scenarios**: Require `eng.traineddata` (Tesseract language data) present at project root.
7. **File upload scenarios**: Prepare sample files (valid PDF, corrupt PDF, 0-byte file, oversized image, etc.) in test fixtures.
8. **Performance scenarios**: Use load testing tools (Artillery, k6, or autocannon) for concurrent/bulk tests.
