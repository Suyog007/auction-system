const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );

  // 👇 IMPORTANT: upgradeable contract factory
  const AuctionSystem = await ethers.getContractFactory(
    "AuctionSystemUpgradeable"
  );

  // 👇 Deploy proxy instead of normal contract
  const auctionProxy = await upgrades.deployProxy(
    AuctionSystem,
    [], // constructor args → initialize args
    { initializer: "initialize" }
  );

  await auctionProxy.waitForDeployment();

  console.log(
    "AuctionSystem PROXY deployed to:",
    await auctionProxy.getAddress()
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});