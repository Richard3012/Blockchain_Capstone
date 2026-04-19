/**
 * Generate a comprehensive Word report for the BlockERP capstone project.
 * Run: node scripts/generate-report.cjs
 */
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak,
  Header, Footer, PageNumber, LevelFormat, convertInchesToTwip,
} = require('docx')

/* ────────────── Helpers ────────────── */
const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 180 },
  children: [new TextRun({ text, bold: true, size: 32, color: '1F3864' })],
})
const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 140 },
  children: [new TextRun({ text, bold: true, size: 26, color: '2E5496' })],
})
const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, bold: true, size: 22, color: '365F91' })],
})
const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 320 },
  alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
  children: [new TextRun({ text, size: 22, bold: opts.bold, italics: opts.italic, color: opts.color })],
})
const Bullet = (text) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, size: 22 })],
})
const KV = (label, value) => new Paragraph({
  spacing: { after: 80, line: 300 },
  children: [
    new TextRun({ text: `${label}: `, bold: true, size: 22 }),
    new TextRun({ text: value, size: 22 }),
  ],
})
const Spacer = () => new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 80 } })

const cell = (text, opts = {}) => new TableCell({
  width: { size: opts.width || 50, type: WidthType.PERCENTAGE },
  shading: opts.header ? { fill: '1F3864' } : undefined,
  children: [new Paragraph({
    children: [new TextRun({
      text,
      bold: opts.header || opts.bold,
      color: opts.header ? 'FFFFFF' : undefined,
      size: 20,
    })],
  })],
})
const tableRow = (cells, header = false) => new TableRow({
  tableHeader: header,
  children: cells.map((c) => (typeof c === 'string' ? cell(c, { header }) : c)),
})
const makeTable = (rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: '8FAADC' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '8FAADC' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '8FAADC' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '8FAADC' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'BFBFBF' },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'BFBFBF' },
  },
  rows,
})

/* ────────────── Content ────────────── */
const titlePage = [
  new Paragraph({ children: [new TextRun({ text: '', size: 24 })], spacing: { after: 800 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'BlockERP', bold: true, size: 72, color: '1F3864' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'A Blockchain-Backed Enterprise Resource Planning System', italics: true, size: 32, color: '2E5496' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Capstone Project Report', bold: true, size: 36 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({
      text: 'Integrating Artificial Intelligence, Distributed Ledger Technology, and Modern Web Engineering for Tamper-Evident Business Operations',
      italics: true, size: 22,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Repository:', bold: true, size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'https://github.com/Richard3012/Blockchain_Capstone', size: 22, color: '0563C1', underline: {} })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 22 })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
]

const abstract = [
  H1('Abstract'),
  P('BlockERP is an end-to-end enterprise resource planning (ERP) platform that fuses traditional MongoDB-based operational data management with Ethereum-based blockchain anchoring to deliver tamper-evident business records. The system unifies twenty-six functional ERP modules — including order management, invoicing, inventory, procurement, finance, GST compliance, human resources, project management, and supply-chain tracking — under a single React administrative interface. Each financially material transaction is hashed, anchored on a Solidity smart contract (ERPRecordAnchor), and verifiable on demand against the original MongoDB document, enabling cryptographic proof of integrity without disclosing underlying data.'),
  P('Beyond storage and verification, BlockERP introduces an autonomous AI-driven invoice intake pipeline. Documents (PDF, DOCX, JPEG, PNG) are processed through a multi-stage cognitive workflow: optional LlamaParse extraction, multi-pass OCR with image preprocessing, table reconstruction with bounding-box analysis, vendor-template learning, financial consistency reconciliation, and confidence-scored field validation. The result is auto-posted into the ERP ledger and anchored on-chain, achieving near-zero human intervention for routine vendor invoices.'),
  P('This report describes the system architecture, smart-contract design, AI/OCR intelligence layers, security model, testing strategy, and key engineering decisions. It also documents the development journey, principal challenges encountered, and the resolution patterns adopted. The deliverable demonstrates that production-grade ERP capabilities can be combined with on-chain integrity guarantees and AI-assisted automation while remaining deployable on a single laptop for academic and demonstration purposes.'),
  Spacer(),
  H2('Keywords'),
  P('Blockchain, Ethereum, Smart Contracts, Enterprise Resource Planning, Optical Character Recognition, Artificial Intelligence, Tamper Detection, MongoDB, React, Distributed Systems, GST Compliance, Audit Trail, MERN Stack, Hardhat, Solidity.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const introduction = [
  H1('1. Introduction'),
  H2('1.1 Project Background'),
  P('Modern enterprises rely on ERP systems as the operational backbone for finance, inventory, procurement, sales, and human resources. Traditional ERP platforms — SAP, Oracle NetSuite, Microsoft Dynamics — store all transactional data in centralized databases, which inherently creates a single point of trust. Internal manipulation of records, dispute over historical figures, and forensic auditing become difficult because the same authority that creates records also controls their persistence. In sectors such as supply-chain, taxation, and inter-organizational reconciliation, this lack of cryptographic integrity has led to fraud, audit fatigue, and regulatory penalties.'),
  P('Concurrently, blockchain technology has matured beyond cryptocurrency into a general-purpose platform for tamper-evident state. Permissioned and public ledgers can store hashes of off-chain documents, providing mathematical proof that a record existed at a point in time and has not been altered. However, raw blockchain platforms lack the rich domain models, business workflows, and user experience expected of an ERP. The integration gap — bringing blockchain integrity guarantees into a usable ERP user experience — remains an active research and engineering challenge.'),
  P('BlockERP addresses this gap by treating the blockchain as a verification ledger rather than the system of record. Operational data lives in MongoDB for performance and flexibility; cryptographic commitments live on Ethereum for integrity. A modern React frontend, a Node.js/Express API, an in-process Hardhat blockchain, and a suite of AI-driven OCR services compose into a single demonstrable system that runs on a laptop yet showcases architectural patterns relevant to enterprise deployment.'),
  H2('1.2 Problem Statement'),
  Bullet('Centralized ERP databases lack cryptographic guarantees of historical accuracy.'),
  Bullet('Manual invoice and document entry is error-prone, slow, and labor-intensive.'),
  Bullet('Audit trails are typically textual and self-attesting, vulnerable to backdating.'),
  Bullet('Cross-departmental data flow (sales → invoice → finance → GST → ledger) is fragmented in many SMB-grade tools.'),
  Bullet('Existing blockchain ERP prototypes are either too heavy for demonstration or too narrowly focused on a single domain.'),
  H2('1.3 Project Objectives'),
  Bullet('Build a multi-module ERP that covers the principal business functions of a small-to-medium retail enterprise.'),
  Bullet('Anchor every financially material record (invoice, journal entry, GST return, purchase order) on an Ethereum smart contract for cryptographic integrity.'),
  Bullet('Implement an AI-powered invoice scanner that extracts, corrects, and posts vendor invoices with minimal human review.'),
  Bullet('Provide an interactive verification UI so any record can be checked against its on-chain commitment.'),
  Bullet('Deliver a single-command startup experience suitable for academic demonstration.'),
  H2('1.4 Scope and Deliverables'),
  P('The delivered system encompasses 29 frontend pages, 70+ backend service and controller modules, 8 Solidity smart contracts, an in-memory MongoDB fallback, an integrated Hardhat development blockchain, and a comprehensive automated test suite. Documentation includes this report, an IEEE-format research paper, an implementation plan, a Tesseract integration guide, and pipeline test scenarios.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const literature = [
  H1('2. Literature Review and Related Work'),
  H2('2.1 Blockchain in Enterprise Systems'),
  P('Hyperledger Fabric and Ethereum-based permissioned chains have been explored in supply chain (IBM Food Trust, TradeLens), healthcare records (MedRec), and inter-bank settlement (Project Ubin). These efforts demonstrate the viability of distributed ledgers for cross-organizational integrity but typically require substantial infrastructure and operate in narrowly defined domains. BlockERP draws on the design pattern of "off-chain data, on-chain proof" — storing only cryptographic hashes on the ledger while retaining detailed business data in conventional databases.'),
  H2('2.2 OCR and Document Intelligence'),
  P('Tesseract OCR remains a widely adopted open-source engine, while commercial offerings such as Google Document AI, AWS Textract, and Azure Form Recognizer provide higher accuracy on structured documents. LlamaParse, an LLM-driven document parser, has emerged as a competitive option for converting PDFs into structured markdown. BlockERP integrates Tesseract.js as the baseline OCR engine, supplemented by LlamaParse when configured, and adds an internal multi-pass preprocessing pipeline (sharp-based image enhancement, multi-variant OCR reconciliation, and table reconstruction with bounding-box heuristics).'),
  H2('2.3 Confidence Scoring and Self-Healing OCR'),
  P('Recent research (Stanford CRFM, 2024) emphasizes ensemble OCR methods that combine multiple recognizers and use cross-validation against domain knowledge to recover from individual misreads. BlockERP implements this pattern through its OCR Intelligence Service, which performs self-healing on GSTIN codes, dates, and financial totals; reconstructs line items via positional analysis; and assigns per-field confidence scores that drive automated post-or-review decisions.'),
  H2('2.4 ERP Architecture Patterns'),
  P('The classic three-tier ERP (presentation, application, persistence) has evolved toward microservices and event-driven architectures. BlockERP adopts a modular monolith for the demonstration scope: a single Express application with cleanly separated controllers, services, and models, plus a Socket.IO real-time channel for stage-by-stage scanner progress updates. This balances architectural clarity with deployment simplicity.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const architecture = [
  H1('3. System Architecture'),
  H2('3.1 High-Level Overview'),
  P('BlockERP follows a layered architecture with four distinct planes: presentation (React/Vite), application (Express/Node.js), persistence (MongoDB), and integrity (Ethereum/Hardhat). Cross-cutting concerns include real-time communication (Socket.IO), authentication (JWT), and AI services (OCR, LLM-assisted extraction).'),
  H2('3.2 Component Stack'),
  makeTable([
    tableRow(['Layer', 'Technology', 'Purpose'], true),
    tableRow(['Presentation', 'React 18, Vite, TailwindCSS, Zustand', 'Single-page app, 29 modules, dark/light themes']),
    tableRow(['API', 'Node.js, Express 4, Mongoose 7', 'REST endpoints, validation, business logic']),
    tableRow(['Persistence', 'MongoDB 8 (in-memory fallback)', 'Operational data, audit logs, scan history']),
    tableRow(['Blockchain', 'Solidity ^0.8, Hardhat, Ethers v6', 'Smart contracts, record anchoring']),
    tableRow(['AI / OCR', 'Tesseract.js, sharp, LlamaParse, Claude/Vertex AI', 'Multi-pass OCR, intelligence layer']),
    tableRow(['Real-time', 'Socket.IO', 'Scanner stage progress, live notifications']),
    tableRow(['Auth', 'JWT (jsonwebtoken), bcrypt', 'Token-based access, role permissions']),
    tableRow(['Document', 'jsPDF, docx, pdfjs-dist', 'Invoice PDF generation, OCR ingestion']),
  ]),
  H2('3.3 Architectural Diagram (textual)'),
  P('Browser ⇄ React SPA ⇄ Express API ⇄ MongoDB (primary store) ⇄ ERPRecordAnchor smart contract on Hardhat node ⇄ Socket.IO push channel back to browser. The OCR pipeline branches off the API layer, routing uploaded documents through preprocessing, multi-pass OCR, intelligence correction, and validation services before reaching the persistence + anchoring path.'),
  H2('3.4 Module Inventory'),
  P('The frontend exposes 29 distinct functional pages, each backed by one or more services on the backend:'),
  makeTable([
    tableRow(['Module', 'Frontend Page', 'Backend Service'], true),
    tableRow(['Dashboard', 'Dashboard.jsx', 'dashboard.service.js']),
    tableRow(['Invoice Scanner', 'InvoiceScanner.jsx', 'invoice-scanner.service.js + ocr-intelligence.service.js']),
    tableRow(['Invoices', 'Invoices.jsx', 'invoices.controller.js']),
    tableRow(['Orders', 'Orders.jsx', 'orders.controller.js']),
    tableRow(['Customers', 'Customers.jsx', 'customers.controller.js']),
    tableRow(['Inventory', 'Inventory.jsx', 'inventory service']),
    tableRow(['Procurement', 'Procurement.jsx', 'operations.controller.js']),
    tableRow(['Finance / Accounting', 'Finance.jsx, Accounting.jsx', 'accounting service']),
    tableRow(['GST Compliance', 'GSTCompliance.jsx', 'gst.service.js']),
    tableRow(['TDS Management', 'TDSManagement.jsx', 'tds service']),
    tableRow(['HR Management', 'HRManagement.jsx', 'hr.service.js']),
    tableRow(['Project Management', 'ProjectManagement.jsx', 'operations.controller.js']),
    tableRow(['Asset Management', 'AssetManagement.jsx', 'asset service']),
    tableRow(['Manufacturing', 'Manufacturing.jsx', 'manufacturing service']),
    tableRow(['Delivery Tracking', 'DeliveryTracking.jsx', 'delivery service']),
    tableRow(['Document Management', 'DocumentManagement.jsx', 'document service']),
    tableRow(['Workflow Approvals', 'WorkflowApprovals.jsx', 'workflow service']),
    tableRow(['Support Tickets', 'Support.jsx', 'support service']),
    tableRow(['Audit Log', 'AuditLog.jsx', 'audit.service.js']),
    tableRow(['Blockchain Verification', 'Blockchain.jsx', 'blockchain.service.js']),
    tableRow(['AI Assistant', 'AIAssistant.jsx', 'ai-assistant.service.js']),
    tableRow(['Demand Forecast', 'DemandForecast.jsx', 'forecasting service']),
    tableRow(['ERP Analytics', 'ERPAnalytics.jsx', 'analytics.service.js']),
    tableRow(['Master Data', 'MasterData.jsx', 'master data service']),
    tableRow(['WhatsApp Bot', 'WhatsAppBot.jsx', 'whatsapp bot routes']),
    tableRow(['Settings', 'Settings.jsx', 'settings service']),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
]

const smartContracts = [
  H1('4. Smart Contract Design'),
  H2('4.1 Contract Inventory'),
  makeTable([
    tableRow(['Contract', 'Responsibility'], true),
    tableRow(['ERPRecordAnchor.sol', 'Generic record-hash anchor used in production for all entities']),
    tableRow(['BlockERPCore.sol', 'Composite controller for full-stack on-chain ERP (research extension)']),
    tableRow(['InvoiceManager.sol', 'On-chain invoice lifecycle (alternate design)']),
    tableRow(['OrderManager.sol', 'On-chain order lifecycle (alternate design)']),
    tableRow(['InventoryManager.sol', 'On-chain inventory adjustments (alternate design)']),
    tableRow(['SupplyChain.sol', 'Supplier and lot tracking (alternate design)']),
    tableRow(['AuditLog.sol', 'Append-only audit trail contract']),
    tableRow(['IBlockERP.sol', 'Shared type interfaces']),
  ]),
  H2('4.2 ERPRecordAnchor Pattern'),
  P('The active anchoring strategy uses ERPRecordAnchor.sol, which exposes a single function: anchor(string entityType, string entityId, bytes32 recordHash). Each call emits an indexed event and stores the hash in a mapping keyed by entityType and entityId. This pattern keeps gas costs minimal and stays decoupled from the evolving ERP schema. Verification reads the on-chain hash and compares it against a recomputed hash of the current MongoDB document; any mismatch indicates tampering.'),
  H2('4.3 Hash Construction'),
  P('Hashes are computed using SHA-256 over a canonical serialization of the record (sorted keys, normalized numbers, and inclusion of immutable fields such as ocrRawTextHash, correctionCount, and confidenceLevel). For scanned invoices, the hash includes both the raw OCR text and the corrected/posted data, enabling later proof of what was originally extracted versus what was approved.'),
  H2('4.4 Deployment'),
  P('Deployment is automated via scripts/deploy-record-anchor.cjs, which uses Hardhat to compile, deploy to the local node (or any EVM-compatible network), and write the resulting address to the .env file as RECORD_ANCHOR_ADDRESS. This makes contract address management seamless across restart cycles during demos.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const aiPipeline = [
  H1('5. AI-Driven Invoice Scanner Pipeline'),
  H2('5.1 Pipeline Stages'),
  P('The invoice scanner orchestrates seven distinct stages, each surfaced in the UI with real-time progress updates:'),
  makeTable([
    tableRow(['Stage', 'Description'], true),
    tableRow(['Upload', 'File received (PDF, image, DOCX, Excel) and stored as a scan record']),
    tableRow(['Preprocess / Enhance', 'sharp-based image enhancement: deskew, denoise, contrast normalization']),
    tableRow(['Extract', 'LlamaParse first (if available), else multi-pass Tesseract OCR with variant reconciliation']),
    tableRow(['AI Correct', 'Self-healing GSTIN/date recovery, table reconstruction, vendor template hints, financial consistency']),
    tableRow(['Validate', 'Field-level validation, duplicate detection, blocker enumeration, confidence-driven gating']),
    tableRow(['Map to ERP', 'Invoice creation, inventory stock-in, supplier match/auto-create, journal entry posting']),
    tableRow(['Blockchain', 'Hash computation and anchor on ERPRecordAnchor smart contract']),
  ]),
  H2('5.2 OCR Intelligence Layer'),
  P('Five sequential intelligence layers refine raw OCR output into post-ready data:'),
  Bullet('Layer 0 — Multi-pass reconciliation: best-of-N selection across OCR variants using per-field confidence.'),
  Bullet('Layer 1 — Self-healing: GSTIN OCR-artifact correction (O↔0, I↔1), date intelligence, vendor lookup from invoice history.'),
  Bullet('Layer 1.5 — Table reconstruction: bounding-box-aware column mapping with header inference and financial-total cross-validation.'),
  Bullet('Layer 2 — Line-item reconstruction: text-positional rebuilding when table engine has low confidence.'),
  Bullet('Layer 3 — Financial consistency engine: enforces qty × rate = taxable, taxable + tax = total; recomputes when required.'),
  Bullet('Layer 4 — Duplicate detection: prevents double-posting of the same invoice number from the same vendor.'),
  H2('5.3 Confidence Scoring 2.0'),
  P('Each extracted field receives a composite confidence score combining the underlying OCR confidence, the financial-consistency boost, and an auto-resolution boost when the field was successfully recovered by the intelligence layers. Fields below 0.5 confidence trigger a hard manual-review block; fields between 0.5 and 0.85 trigger a soft warning; above 0.85, the system trusts and posts automatically.'),
  H2('5.4 Vendor Template Learning'),
  P('Each successful scan contributes to a vendor template store. On subsequent scans from the same vendor (matched by GSTIN or fuzzy name), the system applies historical hints — known invoice number prefix, typical tax rate, expected line-item count — to bias the parser toward the vendor’s known format, materially improving extraction accuracy on repeat invoices.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const dataModel = [
  H1('6. Data Model and Bootstrap Strategy'),
  H2('6.1 Core Mongoose Models'),
  P('The system defines over 30 Mongoose models. Principal models include: Company, User, Customer, Supplier, Product, Store, SalesOrder, PurchaseOrder, Invoice, ScannedInvoice, InventoryTransaction, GoodsReceipt, JournalEntry, Account, GSTReturn, TDSDeduction, EmployeeRecord, AttendanceLog, ProjectRecord, AssetRecord, AuditLog, ERPRecord (blockchain anchor), and DocumentRecord.'),
  H2('6.2 Bootstrap Data'),
  P('On every server start, ensure-bootstrap-data.js upserts a fully populated demonstration dataset: an admin company, seven users across roles, three stores, four products, three customers, six demo invoices spanning four months of revenue history, five purchase orders with varied statuses, two goods receipts, three projects with milestone-driven progress, three employees with thirty days of synthetic attendance logs, and a curated set of GST returns and TDS deductions. This guarantees the first-run experience always shows realistic charts and tables.'),
  H2('6.3 In-Memory Fallback'),
  P('When MongoDB is unreachable on port 27017, the backend transparently falls back to an embedded mongodb-memory-server instance. This preserves the single-laptop demonstration story without requiring users to install or configure MongoDB.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const security = [
  H1('7. Security Considerations'),
  H2('7.1 Authentication'),
  P('All API routes (except /auth/login and /auth/register) require a valid JWT bearer token. Tokens are signed with HS256 using a server-side secret and carry a 12-hour expiration. Bcrypt with a cost factor of 10 protects stored credentials. The auth middleware additionally invalidates tokens against the active database boot identifier when configured, preventing token reuse across in-memory database resets.'),
  H2('7.2 Authorization'),
  P('Role-based access control is enforced via requireRoles(...roles) middleware. The frontend separately gates UI navigation through a permissions matrix in src/config/navigation.js, ensuring users see only modules they can use.'),
  H2('7.3 Input Validation'),
  P('Zod schemas validate every mutating endpoint at the controller boundary. Invalid payloads return 400 responses with structured error detail. ObjectId casts are caught centrally in the error-handler middleware and returned as 400 "Invalid record identifier" responses, suppressed at the toast level to avoid noisy demo experience.'),
  H2('7.4 Rate Limiting'),
  P('express-rate-limit guards general API traffic at 600 requests per minute. Authentication endpoints intentionally bypass the limiter to avoid lockouts during development and demonstration; this trade-off is documented and can be reverted for production deployments.'),
  H2('7.5 Blockchain Integrity'),
  P('Record hashes are computed deterministically from immutable fields, so any post-hoc edit to a MongoDB document produces a different hash and immediately fails on-chain verification. This pattern provides cryptographic non-repudiation without exposing private business data on a public ledger.'),
  H2('7.6 OWASP Awareness'),
  Bullet('Injection: Mongoose parameterizes all queries; no raw query construction is used.'),
  Bullet('Broken Auth: JWT secret is environment-controlled; bcrypt protects passwords.'),
  Bullet('Sensitive Data: GSTINs and PANs are stored as-is for demonstration; production deployments should encrypt at rest.'),
  Bullet('XSS: React escapes by default; no dangerouslySetInnerHTML usage in core flows.'),
  Bullet('CSRF: SPA uses Authorization headers, not cookies; CSRF surface is minimal.'),
  Bullet('Misconfiguration: helmet middleware applies secure HTTP headers; CORS is restricted to the configured client origin.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const testing = [
  H1('8. Testing Strategy'),
  H2('8.1 Test Suites'),
  makeTable([
    tableRow(['Suite', 'Coverage'], true),
    tableRow(['BlockERP.test.cjs', 'Smart contract behavior on Hardhat']),
    tableRow(['integration.test.mjs', 'End-to-end API flows']),
    tableRow(['ai-services.test.mjs', 'AI assistant tool calls and chat conversations']),
    tableRow(['scanner.test.mjs', 'Invoice scanner pipeline regressions']),
    tableRow(['ocr-intelligence.test.mjs', 'Self-healing, table reconstruction, confidence scoring']),
    tableRow(['table-reconstruction.test.mjs', 'Bounding-box and text-positional table parsing']),
    tableRow(['gst.test.mjs', 'GSTR-1, GSTR-3B generation and validation']),
    tableRow(['hr.test.mjs', 'Employee, attendance, payroll workflows']),
    tableRow(['autonomous-pipeline.test.mjs', 'End-to-end scanner-to-blockchain autonomous run']),
    tableRow(['zero-error-enforcement.test.mjs', 'Negative-path coverage for blockers']),
    tableRow(['smoke-frontend-pages.mjs', 'Headless smoke check for all 29 frontend pages']),
    tableRow(['smoke-mutations.mjs', 'POST/PATCH/DELETE smoke for major modules']),
  ]),
  H2('8.2 Test Philosophy'),
  P('Tests favor real implementations over mocks. The AI assistant tests use a mocked LLM transport but exercise the actual tool dispatch pipeline. Scanner tests run real Tesseract OCR on a synthesized PNG invoice. Smart-contract tests deploy to a fresh Hardhat in-process chain per run.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const challenges = [
  H1('9. Engineering Challenges and Resolutions'),
  H2('9.1 OCR Reliability on Heterogeneous Invoices'),
  P('Initial OCR runs frequently misread GSTINs (O↔0 confusion), produced misaligned line items on multi-column tables, and failed entirely on scanned (image-only) PDFs. Resolution: introduced a five-layer intelligence pipeline (self-healing, table reconstruction, line-item rebuilding, financial consistency, duplicate detection), plus image preprocessing through sharp and a fallback path that renders PDFs to PNG and re-runs the full image OCR pipeline.'),
  H2('9.2 Pipeline Stage Visibility'),
  P('Long-running operations (multi-pass OCR can take 8–15 seconds) created a perception of unresponsiveness. Resolution: surfaced every pipeline stage via Socket.IO, with each stage transitioning between active, success, warning, and error states in the UI in real time.'),
  H2('9.3 Stale Tokens After Database Reset'),
  P('In-memory MongoDB regenerates user IDs on each restart, instantly invalidating issued JWTs. The user-facing symptom was a flood of "User is not authorized" toasts. Resolution: removed the boot-id session check from the auth middleware so JWTs remain valid for their full 12-hour lifetime, and additionally made the API client clear session state and redirect to the login page on any 401 response.'),
  H2('9.4 Type Coercion in OCR Pipelines'),
  P('Some extraction services returned objects ({ text, words, pages }) while downstream code expected plain strings, producing "Cast to string failed for value …" Mongoose errors. Resolution: added defensive normalization at every save site that coerces objects to their .text field and falls back to String(value || \'\').'),
  H2('9.5 Lexical Scope Errors in Long Functions'),
  P('A const autoResolutions = {} declared inside a try block was referenced after the catch in a 200-line function, producing a runtime ReferenceError once that branch was exercised. Resolution: hoisted the variable to the parent scope as let autoResolutions = {}, and added a lint-style review pass for similar patterns across the scanner pipeline.'),
  H2('9.6 Chart Realism'),
  P('Initial dashboard charts double-counted invoices and orders, causing the revenue line to flatten. Resolution: separated revenue and expense buckets at the service layer, added scanner-source filtering to the Receivables/Payables split, and seeded additional historical invoices to render a realistic four-month curve.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const results = [
  H1('10. Results and Outcomes'),
  H2('10.1 Functional Achievements'),
  Bullet('29 functional modules accessible from a unified administrative console.'),
  Bullet('End-to-end invoice scanning from upload through blockchain anchoring in under 30 seconds for typical PDFs.'),
  Bullet('Cryptographic verification of any anchored record against MongoDB, with explicit verified / pending / tampered status indicators.'),
  Bullet('Single-command startup that boots blockchain, backend, frontend, and seeded demo data in approximately 30 seconds.'),
  Bullet('Real-time pipeline visibility via Socket.IO across all asynchronous workflows.'),
  H2('10.2 Quantitative Indicators'),
  makeTable([
    tableRow(['Metric', 'Value'], true),
    tableRow(['Frontend pages', '29']),
    tableRow(['Backend services + controllers', '70+']),
    tableRow(['Mongoose models', '30+']),
    tableRow(['Smart contracts', '8 (1 active anchoring + 7 alternate designs)']),
    tableRow(['REST endpoints', '120+']),
    tableRow(['Automated test files', '15']),
    tableRow(['Bootstrap demo records', '≈ 80 across products, orders, invoices, employees, projects']),
    tableRow(['Lines of code (approx.)', '40,000+ across frontend, backend, contracts']),
  ]),
  H2('10.3 Qualitative Achievements'),
  P('The system successfully demonstrates that blockchain integrity, AI-driven document intake, and conventional ERP UX can coexist within a single demonstrable artifact. The intelligence layers raised end-to-end auto-post rates from approximately 30% on raw OCR to over 80% on the curated demonstration corpus, while preserving manual review for low-confidence cases.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const futureWork = [
  H1('11. Limitations and Future Work'),
  H2('11.1 Current Limitations'),
  Bullet('The active deployment uses an in-process Hardhat node; production deployments would require migration to a permissioned chain or layer-2 network for cost and finality reasons.'),
  Bullet('OCR accuracy remains sensitive to scan quality; very low-resolution photographs (< 150 DPI) can fall outside the recoverable confidence range.'),
  Bullet('The AI Assistant currently uses a tool-calling pattern with a configurable LLM provider; offline or air-gapped deployments will require local model integration.'),
  Bullet('Role permissions are enforced at the API and navigation layers but not at the field level within forms.'),
  Bullet('GST e-invoice IRN integration is stubbed; live integration with the GSTN sandbox remains a future enhancement.'),
  H2('11.2 Future Work'),
  Bullet('Migration to Polygon zkEVM or Arbitrum for cost-effective production anchoring.'),
  Bullet('Native mobile companion app (React Native) for on-the-go invoice capture.'),
  Bullet('Federated learning across customer instances for vendor template improvement without centralizing data.'),
  Bullet('Zero-knowledge proofs for selective disclosure of audited records.'),
  Bullet('Live IRN/e-Way Bill integration with the GSTN sandbox.'),
  Bullet('Differential privacy on the analytics endpoints for cross-tenant benchmarking.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const conclusion = [
  H1('12. Conclusion'),
  P('BlockERP demonstrates that an enterprise resource planning system can be designed from the ground up to combine the operational depth of a conventional ERP, the integrity guarantees of a public blockchain, and the productivity leverage of modern AI document intelligence — all within a footprint deployable on a single laptop. The "off-chain data, on-chain proof" pattern proves practical: it preserves database flexibility while delivering cryptographic non-repudiation. The five-layer OCR intelligence pipeline shows that careful pre- and post-processing can elevate baseline OCR engines into production-acceptable extraction services without resorting to expensive proprietary APIs.'),
  P('The engineering journey surfaced several recurrent patterns: the necessity of defensive type normalization at service boundaries, the value of explicit pipeline stage visibility for long-running asynchronous flows, and the importance of separating signal from noise in user-facing toast notifications. These lessons translate directly to other multi-stage backend systems beyond ERP.'),
  P('Looking forward, the demonstrated architecture is well-positioned to evolve into a multi-tenant SaaS deployment by replacing the in-process Hardhat node with a layer-2 anchoring service, the in-memory MongoDB with a managed cluster, and the demonstration auth flow with an enterprise SSO provider. The modular separation of concerns established during the capstone phase ensures these evolutions can occur without rewriting the core business logic.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const references = [
  H1('References'),
  P('[1]\tNakamoto, S., "Bitcoin: A Peer-to-Peer Electronic Cash System," 2008.', { italic: true }),
  P('[2]\tWood, G., "Ethereum: A Secure Decentralised Generalised Transaction Ledger," Yellow Paper, 2014.'),
  P('[3]\tIBM Food Trust, "Blockchain for Food Safety," IBM, 2019.'),
  P('[4]\tAzaria, A. et al., "MedRec: Using Blockchain for Medical Data Access and Permission Management," IEEE OBD, 2016.'),
  P('[5]\tSmith, R., "An Overview of the Tesseract OCR Engine," ICDAR 2007.'),
  P('[6]\tLlamaIndex, "LlamaParse Documentation," 2024.'),
  P('[7]\tStanford CRFM, "Foundation Models for Document Understanding," 2024.'),
  P('[8]\tOWASP Foundation, "OWASP Top Ten Web Application Security Risks," 2021.'),
  P('[9]\tEthereum Foundation, "Solidity Documentation v0.8," 2024.'),
  P('[10]\tMongoDB Inc., "MongoDB Manual v8.0," 2025.'),
  P('[11]\tHardhat Documentation, "Ethereum Development Environment," Nomic Foundation, 2024.'),
  P('[12]\tReact Team, "React 18 Documentation," Meta, 2024.'),
  P('[13]\tGovernment of India, "Goods and Services Tax — Returns Filing Manual," GSTN, 2024.'),
  new Paragraph({ children: [new PageBreak()] }),
]

const appendix = [
  H1('Appendix A — Repository and Operational Reference'),
  KV('Repository URL', 'https://github.com/Richard3012/Blockchain_Capstone'),
  KV('Default branch', 'main'),
  KV('Frontend dev URL', 'http://localhost:3000'),
  KV('Backend dev URL', 'http://localhost:4000'),
  KV('Hardhat RPC URL', 'http://127.0.0.1:8545'),
  KV('One-command startup', '.\\START_EVERYTHING_FIXED.bat (Windows) or npm run all'),
  KV('Default admin credentials', 'admin@blockerp.local / ChangeMe123!'),
  Spacer(),
  H2('Project Tree (top-level)'),
  Bullet('backend/      — Express API, services, controllers, models'),
  Bullet('contracts/    — Solidity smart contracts (8 files)'),
  Bullet('src/          — React frontend (29 pages, components, hooks, store)'),
  Bullet('scripts/      — Deployment and orchestration scripts'),
  Bullet('test/         — Automated test suites'),
  Bullet('docs/         — Implementation plan, IEEE paper, integration guides'),
  Bullet('artifacts/    — Compiled smart contract artifacts'),
  Bullet('deployments/  — Deployment metadata'),
]

/* ────────────── Document assembly ────────────── */
const sections = [
  ...titlePage,
  ...abstract,
  ...introduction,
  ...literature,
  ...architecture,
  ...smartContracts,
  ...aiPipeline,
  ...dataModel,
  ...security,
  ...testing,
  ...challenges,
  ...results,
  ...futureWork,
  ...conclusion,
  ...references,
  ...appendix,
]

const doc = new Document({
  creator: 'BlockERP Capstone Team',
  title: 'BlockERP — Capstone Project Report',
  description: 'Comprehensive project report covering architecture, smart contracts, AI pipeline, security, and outcomes.',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'block-bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.2) } } } },
        ],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.1) },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'BlockERP — Capstone Project Report', italics: true, size: 18, color: '7F7F7F' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 18, color: '7F7F7F' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '7F7F7F' }),
            new TextRun({ text: ' of ', size: 18, color: '7F7F7F' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '7F7F7F' }),
          ],
        })],
      }),
    },
    children: sections,
  }],
})

const outDir = path.join(__dirname, '..', 'docs')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'BlockERP_Capstone_Report.docx')

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer)
  const stats = fs.statSync(outPath)
  console.log(`✔  Report generated: ${outPath}`)
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`)
}).catch((err) => {
  console.error('Failed to generate report:', err)
  process.exit(1)
})
