const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = "0x4891684b367dee27Fbf12E515D6dD188B288e28d";

  const AuctionV2 = await ethers.getContractFactory(
    "AuctionSystemUpgradeable"
  );

  await upgrades.upgradeProxy(proxyAddress, AuctionV2);

  console.log("Auction upgraded successfully");
}

main();