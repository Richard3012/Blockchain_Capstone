# BlockERP Smart Contracts

Comprehensive Solidity backend for BlockERP - a blockchain-powered Enterprise Resource Planning system.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BlockERPCore                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   RBAC      │  │   Module    │  │     Company Info         │ │
│  │  (Roles)    │  │  Registry   │  │  (Name, RegNo, Email)    │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  OrderManager   │ │ InvoiceManager  │ │InventoryManager │
│                 │ │                 │ │                 │
│ • Create orders │ │ • Create invoice│ │ • Add products  │
│ • Status flow   │ │ • Record payment│ │ • Stock movement│
│ • Verification  │ │ • Due tracking  │ │ • QR codes      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │              AuditLog                  │
          │                                        │
          │  • Immutable event logging            │
          │  • Hash-chain verification            │
          │  • Cross-module audit trail           │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │            SupplyChain                 │
          │                                        │
          │  • Product tracking                   │
          │  • Handler management                 │
          │  • Provenance verification            │
          └───────────────────────────────────────┘
```

## Contracts

### BlockERPCore.sol

Central contract managing access control and module registration.

**Features:**

- Role-Based Access Control (ADMIN, MANAGER, VIEWER)
- Module registry for extensibility
- Company information management
- Emergency pause functionality

### OrderManager.sol

Handles complete order lifecycle management.

**Features:**

- Order creation with products, quantities, prices
- Status workflow (PENDING → PROCESSING → SHIPPED → DELIVERED)
- Blockchain hash verification
- Customer-order associations
- Order statistics tracking

### InvoiceManager.sol

Manages invoices and payment processing.

**Features:**

- Invoice creation with tax/discount calculations
- Status management (DRAFT → SENT → PAID/OVERDUE → CANCELLED)
- Payment recording with history
- QR code generation
- Overdue detection

### InventoryManager.sol

Product and stock management.

**Features:**

- Product CRUD operations
- Stock movements (IN, OUT, ADJUSTMENT)
- Low stock alerts
- Category management
- QR code generation
- Expiry date tracking

### AuditLog.sol

Immutable audit trail for all operations.

**Features:**

- Log all system actions (CREATE, UPDATE, DELETE, etc.)
- Hash-chain verification
- Module authorization
- Batch logging support
- Query by module/action/entity

### SupplyChain.sol

Supply chain tracking and provenance.

**Features:**

- Product journey tracking
- Handler/stakeholder management
- Status tracking (MANUFACTURED → IN_TRANSIT → DELIVERED)
- Quality check recording
- Provenance verification with hash chain

## Role Permissions

| Feature               | VIEWER | MANAGER | ADMIN |
| --------------------- | ------ | ------- | ----- |
| View data             | ✅     | ✅      | ✅    |
| Create orders         | ❌     | ✅      | ✅    |
| Manage invoices       | ❌     | ✅      | ✅    |
| Update inventory      | ❌     | ✅      | ✅    |
| Supply chain tracking | ❌     | ✅      | ✅    |
| Grant roles           | ❌     | ❌      | ✅    |
| Register modules      | ❌     | ❌      | ✅    |
| Pause system          | ❌     | ❌      | ✅    |

## Setup

### Prerequisites

- Node.js >= 18
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile
```

### Configuration

1. Copy `.env.example` to `.env`
2. Fill in your configuration:
   - `PRIVATE_KEY` - Your wallet private key
   - `SEPOLIA_RPC_URL` - RPC endpoint for Sepolia testnet
   - `ETHERSCAN_API_KEY` - For contract verification

## Deployment

### Local (Hardhat Network)

```bash
# Start local node
npm run node

# Deploy in another terminal
npm run deploy:local
```

### Sepolia Testnet

```bash
npm run deploy:sepolia
```

### Mumbai Testnet (Polygon)

```bash
npm run deploy:mumbai
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## Contract Verification

After deployment, verify contracts on Etherscan:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> [constructor args]
```

## Gas Estimates

| Operation               | Estimated Gas |
| ----------------------- | ------------- |
| Deploy BlockERPCore     | ~2,500,000    |
| Deploy OrderManager     | ~3,000,000    |
| Deploy InvoiceManager   | ~3,500,000    |
| Deploy InventoryManager | ~3,800,000    |
| Deploy AuditLog         | ~2,800,000    |
| Deploy SupplyChain      | ~3,200,000    |
| Create Order            | ~150,000      |
| Create Invoice          | ~180,000      |
| Add Product             | ~200,000      |
| Record Stock Movement   | ~80,000       |
| Log Audit Entry         | ~100,000      |
| Start Tracking          | ~180,000      |

## Security Considerations

1. **Access Control**: All sensitive functions require appropriate roles
2. **Input Validation**: All inputs are validated before processing
3. **Reentrancy**: No external calls that could enable reentrancy
4. **Integer Overflow**: Using Solidity 0.8+ with built-in overflow checks
5. **Hash Verification**: All entities have blockchain hashes for verification

## Integration with Frontend

### Reading Contract Data

```javascript
import { ethers } from "ethers";

const provider = new ethers.providers.Web3Provider(window.ethereum);
const contract = new ethers.Contract(address, abi, provider);

// Get order
const order = await contract.getOrder(orderId);

// Verify blockchain hash
const isValid = await contract.verifyOrder(orderId, hash);
```

### Writing to Contracts

```javascript
const signer = provider.getSigner();
const contractWithSigner = contract.connect(signer);

// Create order
const tx = await contractWithSigner.createOrder(
  customerId,
  productIds,
  quantities,
  prices,
  totalAmount,
);
await tx.wait();
```

## License

MIT License
