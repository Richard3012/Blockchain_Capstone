# BlockERP

BlockERP is a blockchain-backed Retail ERP demo built for multi-user, single-laptop presentations.  
It combines MongoDB for operational ERP data, Ethereum/Hardhat for record anchoring, and a React admin UI for orders, invoices, inventory, procurement, audit, and verification flows.

## Core Stack

- Frontend: React, Vite, TailwindCSS, Zustand
- Backend: Node.js, Express, Mongoose, JWT
- Database: MongoDB
- Blockchain: Solidity, Hardhat, Ethers.js
- Document/OCR: jsPDF, Tesseract.js, invoice scanner workflows

## Key Features

- Credential-based login with role-aware ERP access
- MongoDB-backed products, orders, invoices, procurement, inventory, support, documents, projects, HR, and more
- Blockchain verification ledger for critical ERP records
- Tamper detection with audit visibility
- MetaMask wallet linking after login
- OCR/invoice scanning workflow
- Dark/light mode UI
- Demo-friendly one-command local startup

## Project Structure

```text
.
├── backend/                  # Express API, Mongo models, services, controllers
├── contracts/                # Solidity contracts
├── scripts/                  # startup and deployment helpers
├── src/                      # React frontend
├── START_EVERYTHING_FIXED.bat
├── hardhat.config.cjs
└── package.json
```

## Environment Variables

Create a `.env` file in the project root. You can start from `.env.example`.

Required variables:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/blockerp
MONGO_FALLBACK=true
JWT_SECRET=replace-with-a-strong-secret
JWT_EXPIRES_IN=12h

BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_PRIVATE_KEY=
RECORD_ANCHOR_ADDRESS=

PINATA_API_KEY=
PINATA_JWT=
PINATA_GATEWAY=

VITE_API_URL=http://localhost:4000/api
```

Notes:

- `MONGODB_URI` can point to local MongoDB or MongoDB Atlas.
- If you use Atlas, make sure your current IP is allowed in Atlas Network Access.
- `MONGO_FALLBACK=true` helps local demo startup when Mongo is unavailable, but real demo data should use MongoDB.

## Installation

From the project root:

```powershell
npm install
```

## How To Run

### One-command startup

From the project root:

```powershell
.\START_EVERYTHING_FIXED.bat
```

This starts:

- Hardhat local blockchain on `http://127.0.0.1:8545`
- backend on `http://localhost:4000`
- frontend on `http://localhost:3000`

### Alternative command

```powershell
npm run all
```

## Manual Run Commands

If you want to run services separately:

### 1. Start Hardhat local node

```powershell
npm run node
```

### 2. Deploy the anchor contract

```powershell
npm run deploy:anchor -- --network localhost
```

### 3. Start backend

```powershell
npm run server
```

### 4. Start frontend

```powershell
npm run dev -- --host localhost --port 3000 --strictPort
```

## Demo Login Credentials

Default seeded demo password:

```text
ChangeMe123!
```

Common demo users:

- `admin@blockerp.local`
- `procurement@blockerp.local`
- `inventory@blockerp.local`
- `finance@blockerp.local`
- `sales@blockerp.local`
- `storemanager@blockerp.local`
- `support@blockerp.local`

The login screen defaults to:

- Email: `admin@blockerp.local`
- Password: `ChangeMe123!`

## Demo URLs

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:4000](http://localhost:4000)
- Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## MongoDB Notes

MongoDB is the source of truth for:

- products
- orders
- invoices
- procurement
- inventory
- support tickets
- documents
- finance/accounting related records
- audit and verification metadata

If the app starts but data looks empty:

1. verify MongoDB is reachable
2. check Atlas IP whitelist if using Atlas
3. restart the backend so bootstrap/seed logic can populate demo records

## Blockchain Notes

Blockchain is used for proof and verification, not as the main ERP database.

Flow:

1. record is stored in MongoDB
2. canonical payload is generated
3. payload hash is created
4. hash is stored in verification records and can be anchored on-chain
5. later verification compares the current MongoDB record with the trusted baseline

This enables tamper detection for selected ERP entities such as:

- orders
- invoices
- purchase orders
- goods receipts
- inventory adjustments

## Useful Commands

Build frontend:

```powershell
npm run build
```

Seed backend data:

```powershell
npm run seed:backend
```

Compile contracts:

```powershell
npm run compile
```

Run tests:

```powershell
npm run test
```

## GitHub Run Section

You can paste this into your GitHub project description or setup section:

```text
How to run BlockERP locally:

1. Clone the repository
2. Create a .env file from .env.example
3. Run npm install
4. Start the full stack with:
   .\START_EVERYTHING_FIXED.bat

Frontend:
http://localhost:3000

Backend:
http://localhost:4000

Health check:
http://localhost:4000/api/health

Default demo login:
admin@blockerp.local
ChangeMe123!
```

## Current Demo Scope

This repository is focused on Retail ERP, not CRM.

Implemented/active demo areas include:

- dashboard
- inventory
- sales orders
- invoices
- procurement
- blockchain verification ledger
- audit log
- OCR/invoice scanning
- finance/accounting/GST/TDS data views
- support and operational admin modules

