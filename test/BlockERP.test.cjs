const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlockERP Smart Contracts", function () {
  let blockERPCore;
  let orderManager;
  let invoiceManager;
  let inventoryManager;
  let auditLog;
  let supplyChain;
  let owner;
  let admin;
  let manager;
  let viewer;
  let handler;

  beforeEach(async function () {
    [owner, admin, manager, viewer, handler] = await ethers.getSigners();

    // Deploy BlockERPCore
    const BlockERPCore = await ethers.getContractFactory("BlockERPCore");
    blockERPCore = await BlockERPCore.deploy(
      "Test Company",
      "TC-001",
      "United States"
    );
    await blockERPCore.waitForDeployment();

    // Deploy all manager contracts
    const OrderManager = await ethers.getContractFactory("OrderManager");
    orderManager = await OrderManager.deploy(await blockERPCore.getAddress());
    await orderManager.waitForDeployment();

    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    invoiceManager = await InvoiceManager.deploy(await blockERPCore.getAddress());
    await invoiceManager.waitForDeployment();

    const InventoryManager = await ethers.getContractFactory("InventoryManager");
    inventoryManager = await InventoryManager.deploy(await blockERPCore.getAddress());
    await inventoryManager.waitForDeployment();

    const AuditLog = await ethers.getContractFactory("AuditLog");
    auditLog = await AuditLog.deploy(await blockERPCore.getAddress());
    await auditLog.waitForDeployment();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    supplyChain = await SupplyChain.deploy(await blockERPCore.getAddress());
    await supplyChain.waitForDeployment();

    // Register modules
    await blockERPCore.registerModule("OrderManager", await orderManager.getAddress());
    await blockERPCore.registerModule("InvoiceManager", await invoiceManager.getAddress());
    await blockERPCore.registerModule("InventoryManager", await inventoryManager.getAddress());
    await blockERPCore.registerModule("AuditLog", await auditLog.getAddress());
    await blockERPCore.registerModule("SupplyChain", await supplyChain.getAddress());

    // Authorize modules for audit log
    await auditLog.authorizeModule(await orderManager.getAddress());
    await auditLog.authorizeModule(await invoiceManager.getAddress());
    await auditLog.authorizeModule(await inventoryManager.getAddress());
    await auditLog.authorizeModule(await supplyChain.getAddress());

    // Grant roles
    await blockERPCore.grantRole(admin.address, 3); // ADMIN
    await blockERPCore.grantRole(manager.address, 2); // MANAGER
    await blockERPCore.grantRole(viewer.address, 1); // VIEWER
  });

  describe("BlockERPCore", function () {
    it("should set owner correctly", async function () {
      expect(await blockERPCore.owner()).to.equal(owner.address);
    });

    it("should grant ADMIN role to owner by default", async function () {
      expect(await blockERPCore.hasRole(owner.address, 3)).to.be.true;
    });

    it("should allow admin to grant roles", async function () {
      const newUser = ethers.Wallet.createRandom().address;
      await blockERPCore.connect(admin).grantRole(newUser, 2); // MANAGER
      expect(await blockERPCore.hasRole(newUser, 2)).to.be.true;
    });

    it("should prevent non-admins from granting roles", async function () {
      const newUser = ethers.Wallet.createRandom().address;
      await expect(
        blockERPCore.connect(viewer).grantRole(newUser, 2)
      ).to.be.revertedWith("BlockERPCore: caller is not admin");
    });

    it("should update company info correctly", async function () {
      await blockERPCore.updateCompanyInfo("Updated Company", "https://company.com");
      const companyInfo = await blockERPCore.getCompanyInfo();
      expect(companyInfo.name).to.equal("Updated Company");
      expect(companyInfo.website).to.equal("https://company.com");
    });

    it("should pause and unpause system", async function () {
      await blockERPCore.pause();
      expect(await blockERPCore.paused()).to.be.true;
      
      await blockERPCore.unpause();
      expect(await blockERPCore.paused()).to.be.false;
    });
  });

  describe("OrderManager", function () {
    it("should create an order", async function () {
      const items = [
        {
          productId: 1,
          productName: "Product A",
          sku: "SKU-A",
          quantity: 10,
          unitPrice: 100,
          totalPrice: 1000
        }
      ];
      
      // Get the order ID from the transaction event
      const tx = await orderManager.connect(manager).createOrder(
        1, // customerId
        "John Doe", // customerName
        items
      );
      
      const receipt = await tx.wait();
      
      // Find OrderCreated event to get the orderId
      const event = receipt.logs.find(log => {
        try {
          const parsed = orderManager.interface.parseLog(log);
          return parsed && parsed.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      
      const parsedEvent = orderManager.interface.parseLog(event);
      const orderId = parsedEvent.args.orderId;

      const order = await orderManager.getOrder(orderId);
      expect(order.customerId).to.equal(1);
      expect(order.status).to.equal(0); // PENDING
    });

    it("should update order status", async function () {
      const items = [{
        productId: 1,
        productName: "Test Product",
        sku: "SKU-001",
        quantity: 10,
        unitPrice: 100,
        totalPrice: 1000
      }];
      
      const tx = await orderManager.connect(manager).createOrder(1, "Customer", items);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = orderManager.interface.parseLog(log);
          return parsed && parsed.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      const orderId = orderManager.interface.parseLog(event).args.orderId;
      
      await orderManager.connect(manager).updateOrderStatus(orderId, 1); // PROCESSING
      let order = await orderManager.getOrder(orderId);
      expect(order.status).to.equal(1);

      await orderManager.connect(manager).updateOrderStatus(orderId, 2); // SHIPPED
      order = await orderManager.getOrder(orderId);
      expect(order.status).to.equal(2);
    });

    it("should verify order with hash", async function () {
      const items = [{
        productId: 1,
        productName: "Test Product",
        sku: "SKU-001",
        quantity: 10,
        unitPrice: 100,
        totalPrice: 1000
      }];
      
      const tx = await orderManager.connect(manager).createOrder(1, "Customer", items);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = orderManager.interface.parseLog(log);
          return parsed && parsed.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      const orderId = orderManager.interface.parseLog(event).args.orderId;
      
      const order = await orderManager.getOrder(orderId);
      // Order has a blockchain hash stored as string - verify it exists
      expect(order.blockchainHash).to.be.a('string');
      expect(order.blockchainHash.length).to.be.greaterThan(0);
    });
  });

  describe("InvoiceManager", function () {
    it("should create an invoice", async function () {
      const items = [{
        productId: 1,
        description: "Test Product",
        quantity: 10,
        unitPrice: 100,
        totalPrice: 1000
      }];
      
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      
      const tx = await invoiceManager.connect(manager).createInvoice(
        0, 1, "John Doe", items, 1000, 500, dueDate
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = invoiceManager.interface.parseLog(log);
          return parsed && parsed.name === "InvoiceCreated";
        } catch {
          return false;
        }
      });
      const invoiceId = invoiceManager.interface.parseLog(event).args.invoiceId;

      const invoice = await invoiceManager.getInvoice(invoiceId);
      expect(invoice.customerId).to.equal(1);
      expect(invoice.status).to.equal(0); // DRAFT
    });

    it("should record payment", async function () {
      const items = [{
        productId: 1,
        description: "Test Product",
        quantity: 10,
        unitPrice: 100,
        totalPrice: 1000
      }];
      
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      
      const tx = await invoiceManager.connect(manager).createInvoice(
        0, 1, "Customer", items, 0, 0, dueDate
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = invoiceManager.interface.parseLog(log);
          return parsed && parsed.name === "InvoiceCreated";
        } catch {
          return false;
        }
      });
      const invoiceId = invoiceManager.interface.parseLog(event).args.invoiceId;
      
      await invoiceManager.connect(manager).sendInvoice(invoiceId); // Send invoice first
      await invoiceManager.connect(manager).recordPayment(invoiceId, 500, "BANK", "REF-001");
      
      const payments = await invoiceManager.getPaymentHistory(invoiceId);
      expect(payments.length).to.equal(1);
      expect(payments[0].amount).to.equal(500);
    });
  });

  describe("InventoryManager", function () {
    it("should create a product", async function () {
      const tx = await inventoryManager.connect(manager).createProduct(
        "Test Product",
        "SKU-001",
        "Category A",
        1000,
        100,
        10,
        "BATCH-001",
        Math.floor(Date.now() / 1000),
        0
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = inventoryManager.interface.parseLog(log);
          return parsed && parsed.name === "ProductCreated";
        } catch {
          return false;
        }
      });
      const productId = inventoryManager.interface.parseLog(event).args.productId;

      const product = await inventoryManager.getProduct(productId);
      expect(product.name).to.equal("Test Product");
      expect(product.sku).to.equal("SKU-001");
      expect(product.stock).to.equal(100);
    });

    it("should record stock movements", async function () {
      const tx = await inventoryManager.connect(manager).createProduct(
        "Product", "SKU", "Cat", 100, 50, 5, "BATCH", Math.floor(Date.now() / 1000), 0
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = inventoryManager.interface.parseLog(log);
          return parsed && parsed.name === "ProductCreated";
        } catch {
          return false;
        }
      });
      const productId = inventoryManager.interface.parseLog(event).args.productId;
      
      await inventoryManager.connect(manager).addStock(productId, 25, "Stock received");
      let product = await inventoryManager.getProduct(productId);
      expect(product.stock).to.equal(75);

      await inventoryManager.connect(manager).removeStock(productId, 10, "Stock sold");
      product = await inventoryManager.getProduct(productId);
      expect(product.stock).to.equal(65);
    });

    it("should generate product QR code", async function () {
      const tx = await inventoryManager.connect(manager).createProduct(
        "Product", "SKU", "Cat", 100, 50, 5, "BATCH", Math.floor(Date.now() / 1000), 0
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = inventoryManager.interface.parseLog(log);
          return parsed && parsed.name === "ProductCreated";
        } catch {
          return false;
        }
      });
      const productId = inventoryManager.interface.parseLog(event).args.productId;
      
      const product = await inventoryManager.getProduct(productId);
      expect(product.qrCodeHash.length).to.be.greaterThan(0);
    });
  });

  describe("AuditLog", function () {
    it("should allow authorized modules to log entries", async function () {
      await auditLog.connect(admin).logCreate(
        "Test",
        1,
        "Test entry created"
      );

      const count = await auditLog.getEntryCount();
      expect(count).to.equal(1);
    });

    it("should verify log entries with hash", async function () {
      const tx = await auditLog.connect(admin).logCreate("Test", 1, "Test entry");
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = auditLog.interface.parseLog(log);
          return parsed && parsed.name === "AuditEntryCreated";
        } catch {
          return false;
        }
      });
      const entryId = auditLog.interface.parseLog(event).args.entryId;
      
      const entry = await auditLog.getEntry(entryId);
      // verifyEntryIntegrity takes bytes32 dataHash, check the entry has a hash
      expect(entry.dataHash).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("SupplyChain", function () {
    beforeEach(async function () {
      await supplyChain.connect(admin).registerHandler(
        handler.address,
        "Warehouse A",
        "Warehouse",
        "New York"
      );
    });

    it("should register handlers", async function () {
      const handlerInfo = await supplyChain.getHandlerInfo(handler.address);
      expect(handlerInfo.name).to.equal("Warehouse A");
      expect(handlerInfo.isActive).to.be.true;
    });

    it("should start tracking a product", async function () {
      await supplyChain.connect(manager).startTracking(
        1,
        "Factory A",
        "Store B"
      );

      const record = await supplyChain.getTrackingRecord(1);
      expect(record.origin).to.equal("Factory A");
      expect(record.destination).to.equal("Store B");
    });

    it("should record tracking events", async function () {
      await supplyChain.connect(manager).startTracking(1, "Factory", "Store");
      
      await supplyChain.connect(handler).recordEvent(
        1,
        1, // IN_TRANSIT
        "Highway 101",
        "In transit to warehouse"
      );

      const status = await supplyChain.getCurrentStatus(1);
      expect(status).to.equal(1); // IN_TRANSIT
    });

    it("should verify provenance chain", async function () {
      await supplyChain.connect(manager).startTracking(1, "Factory", "Store");
      await supplyChain.connect(handler).recordEvent(1, 1, "Location A", "Note 1");
      await supplyChain.connect(handler).recordEvent(1, 2, "Location B", "Note 2");

      const [isValid, eventCount] = await supplyChain.verifyProvenance(1);
      expect(isValid).to.be.true;
      expect(eventCount).to.equal(3);
    });

    it("should complete tracking on delivery", async function () {
      await supplyChain.connect(manager).startTracking(1, "Factory", "Store");
      await supplyChain.connect(handler).recordEvent(1, 1, "Transit", "Moving"); // 1 = IN_TRANSIT
      await supplyChain.connect(handler).recordEvent(1, 7, "Store", "Delivered"); // 7 = DELIVERED

      const record = await supplyChain.getTrackingRecord(1);
      expect(record.isComplete).to.be.true;
    });
  });

  describe("Integration Tests", function () {
    it("should handle full order workflow", async function () {
      // 1. Add product to inventory
      const productTx = await inventoryManager.connect(manager).createProduct(
        "Widget",
        "WGT-001",
        "Electronics",
        5000,
        100,
        10,
        "BATCH-001",
        Math.floor(Date.now() / 1000),
        0
      );
      const productReceipt = await productTx.wait();
      const productEvent = productReceipt.logs.find(log => {
        try {
          return inventoryManager.interface.parseLog(log)?.name === "ProductCreated";
        } catch {
          return false;
        }
      });
      const productId = inventoryManager.interface.parseLog(productEvent).args.productId;

      // 2. Create order
      const orderItems = [{
        productId: productId,
        productName: "Widget",
        sku: "WGT-001",
        quantity: 5,
        unitPrice: 5000,
        totalPrice: 25000
      }];
      
      const orderTx = await orderManager.connect(manager).createOrder(1, "Test Customer", orderItems);
      const orderReceipt = await orderTx.wait();
      const orderEvent = orderReceipt.logs.find(log => {
        try {
          return orderManager.interface.parseLog(log)?.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      const orderId = orderManager.interface.parseLog(orderEvent).args.orderId;

      // 3. Create invoice
      const invoiceItems = [{
        productId: productId,
        description: "Widget",
        quantity: 5,
        unitPrice: 5000,
        totalPrice: 25000
      }];
      
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await invoiceManager.connect(manager).createInvoice(
        orderId, 1, "Test Customer", invoiceItems, 1000, 0, dueDate
      );

      // 4. Process order
      await orderManager.connect(manager).updateOrderStatus(orderId, 1); // PROCESSING
      
      // 5. Update inventory
      await inventoryManager.connect(manager).removeStock(
        productId, 5, "Order fulfillment"
      );

      // Verify final state
      const product = await inventoryManager.getProduct(productId);
      expect(product.stock).to.equal(95);

      const order = await orderManager.getOrder(orderId);
      expect(order.status).to.equal(1); // PROCESSING
    });
  });
});
