require('dotenv').config()

const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const factory = await hre.ethers.getContractFactory('ERPRecordAnchor')
  const contract = await factory.deploy(deployer.address)
  await contract.waitForDeployment()

  if (process.env.BLOCKCHAIN_PRIVATE_KEY) {
    const backendWallet = new hre.ethers.Wallet(process.env.BLOCKCHAIN_PRIVATE_KEY)
    const anchorRole = await contract.ANCHOR_ROLE()

    if (backendWallet.address.toLowerCase() !== deployer.address.toLowerCase()) {
      const grantTx = await contract.grantRole(anchorRole, backendWallet.address)
      await grantTx.wait()
      console.log('Granted ANCHOR_ROLE to backend wallet:', backendWallet.address)
    }
  }

  console.log('ERPRecordAnchor deployed at:', await contract.getAddress())
  console.log('Deployer:', deployer.address)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
