const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ));

  const AuctionSystem = await ethers.getContractFactory("AuctionSystem");
  const auction = await AuctionSystem.deploy();

  await auction.waitForDeployment();

  console.log("AuctionSystem deployed to:", await auction.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});