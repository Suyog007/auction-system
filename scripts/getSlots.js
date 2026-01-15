const { ethers } = require("hardhat");

// Fill these in before running the script.
const PROXY_ADDRESS = "0x4891684b367dee27Fbf12E515D6dD188B288e28d"; // e.g. "0x1234..."

/**
 * Usage:
 *   npx hardhat run scripts/addAdmin.js --network <network>
 */
async function main() {
  const [owner] = await ethers.getSigners();


  // Attach to the proxy address using the implementation ABI.
  const auction = await ethers.getContractAt(
    "AuctionSystemUpgradeable",
    PROXY_ADDRESS
  );

  const slots = await auction.maxSlots();
  console.log("Max slots:", slots);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


