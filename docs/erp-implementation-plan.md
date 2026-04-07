# BlockERP ERP Conversion Plan

## Cleaned project structure

```text
Capstone/
  backend/
    src/
      config/
      constants/
      controllers/
      middlewares/
      models/
      routes/
      services/
  contracts/
    ERPRecordAnchor.sol
  docs/
    erp-implementation-plan.md
  src/
    components/
    config/
    hooks/
    pages/
    services/
```

## Step-by-step implementation plan

1. Remove CRM-only navigation and convert the shell to ERP modules.
2. Stand up the Express API, Mongo connection, auth entry point, and CRUD routes for master and transaction entities.
3. Replace mock dashboard metrics with computed backend summaries.
4. Connect inventory, orders, invoices, audit log, and blockchain ledger pages to real APIs.
5. Add procurement and finance transaction services so stock and receivables/payables move automatically.
6. Add document upload flows to Pinata once API credentials are provided.
7. Anchor canonical hashes for critical ERP records with `ERPRecordAnchor`.
8. Add queued sync states for offline-first readiness.

## Frontend refactor guidance

- Remove `CRMAnalytics.jsx` and `CRMERPIntegration.jsx` from routing and navigation.
- Keep `Customers.jsx` as customer master data for sales and invoicing only.
- Keep `DataAssistant.jsx` out of primary workflow until it has a concrete ERP use case.
- Replace fake metric tickers and fake blockchain feed generation with live API and Socket.IO events.
- Migrate remaining pages from local mock store state to API-backed hooks in this order:
  dashboard, inventory, orders, invoices, audit log, blockchain ledger, settings.

## Missing ERP pages to add next

- Products master page
- Suppliers master page
- Warehouses and stores page
- Goods receipts page
- Purchase orders page
- Payments page
- Users and roles page
- Notifications center
- Verification detail drawer for invoices and receipts

## Tesseract OCR Integration

The Invoice Scanner module uses **Tesseract.js v7** for optical character recognition on scanned invoices and receipts. See [tesseract-integration.md](tesseract-integration.md) for full setup, configuration, API usage, and troubleshooting.

## CI/CD Pipeline

GitHub Actions workflows are in `.github/workflows/`:

- **`ci.yml`** — Runs on every push/PR to `main`. Three parallel jobs:
  - `smart-contracts` — Solidity compilation + Hardhat tests
  - `backend` — Tesseract OCR integration tests + Express smoke test
  - `frontend` — Vite production build
- **`deploy.yml`** — Triggers after CI passes. Deploys to VPS via SSH with PM2 zero-downtime reload and automatic rollback on health-check failure.

## Required secrets

### Application (`.env`)

- `MONGODB_URI`
- `JWT_SECRET`
- `PINATA_JWT`
- `PINATA_GATEWAY`
- `BLOCKCHAIN_PRIVATE_KEY`
- `RECORD_ANCHOR_ADDRESS`
- Network RPC URL for the target chain when leaving local Hardhat

### GitHub Actions (Settings → Secrets)

- `SERVER_IP` — VPS IP address
- `SERVER_USER` — SSH username
- `SERVER_SSH_KEY` — Private SSH key for deployment
