const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || "";

/**
 * Removes an admin from the FeaturedCommunityAuction contract.
 * Only the owner can remove admins. Cannot remove the owner.
 *
 * Usage:
 *   PROXY_ADDRESS=0x... ADMIN_ADDRESS=0x... npx hardhat run scripts/removeAdmin.js --network <network>
 */
async function main() {
  const [owner] = await ethers.getSigners();

  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS. Set it via environment variable.");
  }
  if (!ADMIN_ADDRESS) {
    throw new Error("Missing ADMIN_ADDRESS. Set it via environment variable.");
  }

  console.log("=".repeat(50));
  console.log("Remove Admin from FeaturedCommunityAuction");
  console.log("=".repeat(50));
  console.log("Owner (sender):", owner.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("Admin to remove:", ADMIN_ADDRESS);
  console.log("");

  const auction = await ethers.getContractAt(
    "FeaturedCommunityAuction",
    PROXY_ADDRESS
  );

  // Check current status
  const isCurrentlyAdmin = await auction.isAdmin(ADMIN_ADDRESS);
  if (!isCurrentlyAdmin) {
    console.log("Address is not an admin!");
    return;
  }

  // Check if trying to remove owner
  const contractOwner = await auction.owner();
  if (ADMIN_ADDRESS.toLowerCase() === contractOwner.toLowerCase()) {
    console.log("Cannot remove the owner as admin!");
    return;
  }

  console.log("Sending transaction...");
  const tx = await auction.removeAdmin(ADMIN_ADDRESS);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  const isStillAdmin = await auction.isAdmin(ADMIN_ADDRESS);
  console.log("");
  console.log("isAdmin(", ADMIN_ADDRESS, ") =", isStillAdmin);
  console.log("Admin removed successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

