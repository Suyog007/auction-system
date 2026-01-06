const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0xd8fA081a3FF388F4eDDE9aD518154C3856509554";

async function main() {
  const [owner] = await ethers.getSigners();
  const auction = await ethers.getContractAt("AuctionSystem", CONTRACT_ADDRESS);

  const now = Math.floor(Date.now() / 1000);

  // 1️⃣ Create Auction
  await auction.createAuction(
    now + 60,              // start in 1 min
    now + 3600,            // end in 1 hour
    ethers.parseEther("0.01")
  );
  console.log("Auction created");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});