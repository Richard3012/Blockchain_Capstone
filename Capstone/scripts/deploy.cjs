const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("═══════════════════════════════════════════════════════════");
  console.log("            BlockERP Smart Contracts Deployment             ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Deployer address: ${deployer.address}`);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} ETH`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const deployedContracts = {};
  let totalGasUsed = 0n;

  // ============ Deploy BlockERPCore ============
  console.log("📦 Deploying BlockERPCore...");
  const BlockERPCore = await hre.ethers.getContractFactory("BlockERPCore");
  const blockERPCore = await BlockERPCore.deploy(
    "BlockERP Enterprise",
    "BERP-001",
    "United States"
  );
  await blockERPCore.waitForDeployment();
  
  const coreReceipt = await blockERPCore.deploymentTransaction().wait();
  totalGasUsed += coreReceipt.gasUsed;
  
  deployedContracts.BlockERPCore = await blockERPCore.getAddress();
  console.log(`   ✅ BlockERPCore deployed at: ${deployedContracts.BlockERPCore}`);
  console.log(`   ⛽ Gas used: ${coreReceipt.gasUsed.toString()}\n`);

  // ============ Deploy OrderManager ============
  console.log("📦 Deploying OrderManager...");
  const OrderManager = await hre.ethers.getContractFactory("OrderManager");
  const orderManager = await OrderManager.deploy(deployedContracts.BlockERPCore);
  await orderManager.waitForDeployment();
  
  const orderReceipt = await orderManager.deploymentTransaction().wait();
  totalGasUsed += orderReceipt.gasUsed;
  
  deployedContracts.OrderManager = await orderManager.getAddress();
  console.log(`   ✅ OrderManager deployed at: ${deployedContracts.OrderManager}`);
  console.log(`   ⛽ Gas used: ${orderReceipt.gasUsed.toString()}\n`);

  // ============ Deploy InvoiceManager ============
  console.log("📦 Deploying InvoiceManager...");
  const InvoiceManager = await hre.ethers.getContractFactory("InvoiceManager");
  const invoiceManager = await InvoiceManager.deploy(deployedContracts.BlockERPCore);
  await invoiceManager.waitForDeployment();
  
  const invoiceReceipt = await invoiceManager.deploymentTransaction().wait();
  totalGasUsed += invoiceReceipt.gasUsed;
  
  deployedContracts.InvoiceManager = await invoiceManager.getAddress();
  console.log(`   ✅ InvoiceManager deployed at: ${deployedContracts.InvoiceManager}`);
  console.log(`   ⛽ Gas used: ${invoiceReceipt.gasUsed.toString()}\n`);

  // ============ Deploy InventoryManager ============
  console.log("📦 Deploying InventoryManager...");
  const InventoryManager = await hre.ethers.getContractFactory("InventoryManager");
  const inventoryManager = await InventoryManager.deploy(deployedContracts.BlockERPCore);
  await inventoryManager.waitForDeployment();
  
  const inventoryReceipt = await inventoryManager.deploymentTransaction().wait();
  totalGasUsed += inventoryReceipt.gasUsed;
  
  deployedContracts.InventoryManager = await inventoryManager.getAddress();
  console.log(`   ✅ InventoryManager deployed at: ${deployedContracts.InventoryManager}`);
  console.log(`   ⛽ Gas used: ${inventoryReceipt.gasUsed.toString()}\n`);

  // ============ Deploy AuditLog ============
  console.log("📦 Deploying AuditLog...");
  const AuditLog = await hre.ethers.getContractFactory("AuditLog");
  const auditLog = await AuditLog.deploy(deployedContracts.BlockERPCore);
  await auditLog.waitForDeployment();
  
  const auditReceipt = await auditLog.deploymentTransaction().wait();
  totalGasUsed += auditReceipt.gasUsed;
  
  deployedContracts.AuditLog = await auditLog.getAddress();
  console.log(`   ✅ AuditLog deployed at: ${deployedContracts.AuditLog}`);
  console.log(`   ⛽ Gas used: ${auditReceipt.gasUsed.toString()}\n`);

  // ============ Deploy SupplyChain ============
  console.log("📦 Deploying SupplyChain...");
  const SupplyChain = await hre.ethers.getContractFactory("SupplyChain");
  const supplyChain = await SupplyChain.deploy(deployedContracts.BlockERPCore);
  await supplyChain.waitForDeployment();
  
  const supplyReceipt = await supplyChain.deploymentTransaction().wait();
  totalGasUsed += supplyReceipt.gasUsed;
  
  deployedContracts.SupplyChain = await supplyChain.getAddress();
  console.log(`   ✅ SupplyChain deployed at: ${deployedContracts.SupplyChain}`);
  console.log(`   ⛽ Gas used: ${supplyReceipt.gasUsed.toString()}\n`);

  // ============ Register Modules ============
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                  Registering Modules                        ");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("🔗 Registering OrderManager...");
  let tx = await blockERPCore.registerModule("OrderManager", deployedContracts.OrderManager);
  await tx.wait();
  console.log("   ✅ OrderManager registered\n");

  console.log("🔗 Registering InvoiceManager...");
  tx = await blockERPCore.registerModule("InvoiceManager", deployedContracts.InvoiceManager);
  await tx.wait();
  console.log("   ✅ InvoiceManager registered\n");

  console.log("🔗 Registering InventoryManager...");
  tx = await blockERPCore.registerModule("InventoryManager", deployedContracts.InventoryManager);
  await tx.wait();
  console.log("   ✅ InventoryManager registered\n");

  console.log("🔗 Registering AuditLog...");
  tx = await blockERPCore.registerModule("AuditLog", deployedContracts.AuditLog);
  await tx.wait();
  console.log("   ✅ AuditLog registered\n");

  console.log("🔗 Registering SupplyChain...");
  tx = await blockERPCore.registerModule("SupplyChain", deployedContracts.SupplyChain);
  await tx.wait();
  console.log("   ✅ SupplyChain registered\n");

  // ============ Authorize AuditLog ============
  console.log("═══════════════════════════════════════════════════════════");
  console.log("              Authorizing AuditLog Modules                   ");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("🔐 Authorizing OrderManager to write audit logs...");
  tx = await auditLog.authorizeModule(deployedContracts.OrderManager);
  await tx.wait();
  console.log("   ✅ OrderManager authorized\n");

  console.log("🔐 Authorizing InvoiceManager to write audit logs...");
  tx = await auditLog.authorizeModule(deployedContracts.InvoiceManager);
  await tx.wait();
  console.log("   ✅ InvoiceManager authorized\n");

  console.log("🔐 Authorizing InventoryManager to write audit logs...");
  tx = await auditLog.authorizeModule(deployedContracts.InventoryManager);
  await tx.wait();
  console.log("   ✅ InventoryManager authorized\n");

  console.log("🔐 Authorizing SupplyChain to write audit logs...");
  tx = await auditLog.authorizeModule(deployedContracts.SupplyChain);
  await tx.wait();
  console.log("   ✅ SupplyChain authorized\n");

  // ============ Update Company Info ============
  console.log("═══════════════════════════════════════════════════════════");
  console.log("              Updating Company Information                   ");
  console.log("═══════════════════════════════════════════════════════════\n");

  tx = await blockERPCore.updateCompanyInfo(
    "BlockERP Enterprise",
    "https://blockerp.io"
  );
  await tx.wait();
  console.log("   ✅ Company website updated\n");

  // ============ Summary ============
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT SUMMARY                       ");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  console.log("📋 Deployed Contracts:");
  console.log("────────────────────────────────────────────────────────────");
  Object.entries(deployedContracts).forEach(([name, address]) => {
    console.log(`   ${name.padEnd(20)} → ${address}`);
  });
  console.log("────────────────────────────────────────────────────────────");
  console.log(`\n⛽ Total gas used: ${totalGasUsed.toString()}`);
  
  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  const spent = balance - finalBalance;
  console.log(`💰 ETH spent: ${hre.ethers.formatEther(spent)} ETH`);
  console.log(`💰 Remaining balance: ${hre.ethers.formatEther(finalBalance)} ETH\n`);

  // Save deployment addresses to file
  const fs = require("fs");
  const deploymentPath = "./deployments";
  
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath);
  }

  const networkName = hre.network.name;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deploymentFile = `${deploymentPath}/${networkName}-${timestamp}.json`;
  
  const deploymentData = {
    network: networkName,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployedContracts,
    gasUsed: totalGasUsed.toString()
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`📄 Deployment saved to: ${deploymentFile}`);

  // Also save latest deployment for easy reference
  const latestFile = `${deploymentPath}/${networkName}-latest.json`;
  fs.writeFileSync(latestFile, JSON.stringify(deploymentData, null, 2));
  console.log(`📄 Latest deployment saved to: ${latestFile}\n`);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("              🎉 DEPLOYMENT COMPLETE! 🎉                     ");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Verification instructions
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("📝 To verify contracts on Etherscan, run:");
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.BlockERPCore}`);
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.OrderManager} ${deployedContracts.BlockERPCore}`);
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.InvoiceManager} ${deployedContracts.BlockERPCore}`);
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.InventoryManager} ${deployedContracts.BlockERPCore}`);
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.AuditLog} ${deployedContracts.BlockERPCore}`);
    console.log(`   npx hardhat verify --network ${networkName} ${deployedContracts.SupplyChain} ${deployedContracts.BlockERPCore}\n`);
  }

  return deployedContracts;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
