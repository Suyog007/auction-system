const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = "0x541357D9D59a6818011419899C0D0c5DfcBe657D";

  const AuctionV2 = await ethers.getContractFactory(
    "AuctionSystemUpgradeable"
  );

  await upgrades.upgradeProxy(proxyAddress, AuctionV2);

  console.log("Auction upgraded successfully");
}

main();