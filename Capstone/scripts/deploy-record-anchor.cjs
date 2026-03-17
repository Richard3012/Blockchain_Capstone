const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const factory = await hre.ethers.getContractFactory('ERPRecordAnchor')
  const contract = await factory.deploy(deployer.address)
  await contract.waitForDeployment()

  console.log('ERPRecordAnchor deployed at:', await contract.getAddress())
  console.log('Deployer:', deployer.address)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
