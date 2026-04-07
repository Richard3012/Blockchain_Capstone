# Tesseract OCR Integration Guide

## Overview

BlockERP uses **Tesseract.js v7** (a pure JavaScript port of the Tesseract OCR engine) to extract text from scanned invoices, receipts, and other business documents. The integration powers the **Invoice Scanner** module — a three-step pipeline that converts paper/image invoices into structured ERP records with blockchain anchoring.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Frontend    │     │  Backend API     │     │  Blockchain       │
│  Upload UI   │────>│  /invoice-scanner│────>│  ERPRecordAnchor  │
│  (React)     │     │  /parse, /process│     │  (Solidity)       │
└──────────────┘     └──────────────────┘     └───────────────────┘
                            │
                     ┌──────┴──────┐
                     │ Tesseract.js│
                     │ OCR Engine  │
                     └─────────────┘
```

### Component Breakdown

| Component | File | Purpose |
|-----------|------|---------|
| Frontend UI | `src/pages/InvoiceScanner.jsx` | Three-step upload → review → confirm flow |
| API Routes | `backend/src/routes/invoice-scanner.routes.js` | Multer file handling, REST endpoints |
| Controller | `backend/src/controllers/invoice-scanner.controller.js` | Request orchestration |
| File Extractor | `backend/src/services/file-extractor.service.js` | OCR via Tesseract.js + PDF/DOCX extraction |
| Invoice Parser | `backend/src/services/invoice-scanner.service.js` | Structured field extraction with confidence scores |
| Validation | `backend/src/services/invoice-validation.service.js` | Cross-foot checks, GSTIN validation |
| Frontend Service | `src/services/erpServices.js` | API client (`invoiceScannerService`) |

## Prerequisites

- **Node.js** ≥ 18 (required by Tesseract.js v7)
- **npm** dependencies (installed via `npm install` at project root):
  - `tesseract.js` ^7.0.0 — OCR engine
  - `pdf-parse` ^2.4.5 — PDF text extraction
  - `mammoth` ^1.12.0 — DOCX text extraction

No native binaries or system-level Tesseract installation is required. Tesseract.js downloads WASM-compiled OCR models automatically on first use.

## Getting Started

### 1. Install Dependencies

```bash
cd Blockchain_Capstone
npm install
```

### 2. Start the Backend Server

```bash
npm run server:dev
```

### 3. Access the Invoice Scanner

Navigate to the **Invoice Scanner** page in the BlockERP frontend (via sidebar navigation). The scanner accepts:

| Format | Extensions |
|--------|-----------|
| Images | `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tiff` |
| Documents | `.pdf`, `.docx`, `.doc` |
| Text | `.txt`, `.csv` |

**Max file size:** 10 MB

## Usage

### Scanning a Document (Frontend)

1. **Upload** — Drag-and-drop or click to select a file. Alternatively, paste raw invoice text.
2. **Review** — Inspect extracted fields (vendor, GSTIN, invoice number, date, amounts, line items). Each field shows an OCR confidence score. Edit any misread values.
3. **Submit** — Confirm to create the invoice record, update inventory, post accounting entries, and anchor the hash to blockchain.

### API Endpoints

```
POST /api/invoice-scanner/parse       # Extract fields (preview, no DB writes)
POST /api/invoice-scanner/process     # Full pipeline with blockchain anchoring
GET  /api/invoice-scanner/verify/:id  # Verify invoice hash against blockchain
GET  /api/invoice-scanner/list        # List all scanned invoices
```

#### Parse (Preview)

```bash
# With file upload
curl -X POST http://localhost:3000/api/invoice-scanner/parse \
  -H "Authorization: Bearer <token>" \
  -F "file=@invoice.jpg"

# With raw text
curl -X POST http://localhost:3000/api/invoice-scanner/parse \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rawText": "Acme Corp\nInvoice No: INV-001\nTotal: ₹5,000"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "fields": {
      "vendorName": { "value": "Acme Corp", "confidence": 0.7 },
      "gstin": { "value": "29AABCU9603R1ZM", "confidence": 0.95 },
      "invoiceNumber": { "value": "INV-001", "confidence": 0.95 },
      "invoiceDate": { "value": "07/04/2026", "confidence": 0.95 },
      "totalAmount": { "value": 5000, "confidence": 0.95 },
      "subtotal": { "value": 4237.29, "confidence": 0.7 },
      "taxAmount": { "value": 762.71, "confidence": 0.7 }
    },
    "lineItems": [...],
    "rawText": "...",
    "validation": { "errors": [], "warnings": [] }
  }
}
```

## Tesseract.js Configuration

The OCR engine is configured in `backend/src/services/file-extractor.service.js`:

```javascript
const { data } = await Tesseract.recognize(buffer, 'eng', {
  tessedit_pageseg_mode: '6',           // Assume uniform block of text
  preserve_interword_spaces: '1',       // Preserve spacing for table layouts
  tessedit_char_whitelist:               // Allowed characters
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:-/#@%₹ ()\n',
})
```

### Key Settings

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `tessedit_pageseg_mode` | `6` | Assumes a uniform block of text (best for invoices) |
| `preserve_interword_spaces` | `1` | Preserves column alignment in tabular data |
| `tessedit_char_whitelist` | Custom set | Restricts output to expected characters, reducing noise |

### Page Segmentation Modes (PSM)

| Mode | Description | Use Case |
|------|-------------|----------|
| 3 | Fully automatic | General documents |
| 4 | Single column | Receipts |
| **6** | **Uniform block** | **Invoices (default)** |
| 7 | Single line | Serial numbers |
| 11 | Sparse text | Labels/stamps |

## Confidence Scoring

Each extracted field includes a confidence score (0–1):

| Range | Interpretation | Action |
|-------|---------------|--------|
| ≥ 0.7 | High confidence | Auto-accepted |
| 0.4–0.7 | Medium confidence | Flagged for human review |
| < 0.4 | Low confidence | Rejected / requires manual entry |

Fields matching strict regex patterns (e.g., GSTIN format) receive 0.95 confidence. A global OCR confidence below 30% triggers a warning log.

## Testing

Run the integration tests:

```bash
node test/tesseract-integration.test.cjs
```

This verifies:
1. **Engine loading** — Tesseract.js initializes and processes images
2. **Invoice parsing** — GSTIN, vendor, invoice number, dates, amounts, and line items are correctly extracted from OCR text
3. **Configuration** — Service files have correct Tesseract options

## Supported Languages

The default configuration uses English (`eng`). To add languages, modify the `recognize()` call:

```javascript
// Single language
Tesseract.recognize(buffer, 'eng')

// Multiple languages
Tesseract.recognize(buffer, 'eng+hin')  // English + Hindi
```

Language data is downloaded automatically on first use (~15 MB per language).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Slow first scan | Normal — WASM engine + language data downloaded on first run (~30s). Subsequent scans are faster. |
| Low confidence scores | Ensure scanned images are ≥300 DPI with good contrast. Avoid phone camera angles. |
| Missing line items | Check that items are formatted as numbered rows. Handwritten text has lower accuracy. |
| `Unsupported file type` error | Verify file MIME type matches expected formats (see supported formats table above). |
| Memory issues with large images | Resize images to ≤4000px on longest side before uploading. |

## Best Practices

1. **Image quality** — Use 300+ DPI scans with black text on white background for >90% accuracy.
2. **Pre-processing** — Deskew and crop images before upload for better results.
3. **Human review** — Always review fields with confidence < 0.7 before submitting.
4. **Batch processing** — For high-volume scanning, consider using `createWorker()` + `createScheduler()` for parallel OCR.
