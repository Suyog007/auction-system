const { ethers } = require("hardhat");

// Fill these in before running the script.
const PROXY_ADDRESS = ""; // e.g. "0x1234..."
const ADMIN_ADDRESS = ""; // e.g. "0xabcd..."

/**
 * Usage:
 *   npx hardhat run scripts/addAdmin.js --network <network>
 */
async function main() {
  const [owner] = await ethers.getSigners();

  if (!PROXY_ADDRESS || !ADMIN_ADDRESS) {
    throw new Error(
      "Missing PROXY_ADDRESS / ADMIN_ADDRESS. Please set them at the top of scripts/addAdmin.js"
    );
  }

  if (!ethers.isAddress(PROXY_ADDRESS)) {
    throw new Error(`Invalid proxy address: ${PROXY_ADDRESS}`);
  }

  if (!ethers.isAddress(ADMIN_ADDRESS)) {
    throw new Error(`Invalid admin address: ${ADMIN_ADDRESS}`);
  }

  console.log("Owner:", owner.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("Admin to add:", ADMIN_ADDRESS);

  // Attach to the proxy address using the implementation ABI.
  const auction = await ethers.getContractAt(
    "AuctionSystemUpgradeable",
    PROXY_ADDRESS
  );

  const tx = await auction.addAdmin(ADMIN_ADDRESS);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  const isAdmin = await auction.admins(ADMIN_ADDRESS);
  console.log("admins[admin] =", isAdmin);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


