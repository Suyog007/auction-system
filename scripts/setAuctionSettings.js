const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";
const NEW_MIN_BID = process.env.NEW_MIN_BID || ""; // In ETH, e.g., "0.02"
const NEW_BID_INCREMENT = process.env.NEW_BID_INCREMENT || ""; // In ETH, e.g., "0.01"
const NEW_TREASURY = process.env.NEW_TREASURY || ""; // Address

/**
 * Updates auction settings (Admin/Owner only).
 * - Min bid and increment: Admin can change
 * - Treasury: Only owner can change
 *
 * Usage:
 *   PROXY_ADDRESS=0x... NEW_MIN_BID=0.02 npx hardhat run scripts/setAuctionSettings.js --network <network>
 *   PROXY_ADDRESS=0x... NEW_TREASURY=0x... npx hardhat run scripts/setAuctionSettings.js --network <network>
 */
async function main() {
  const [signer] = await ethers.getSigners();

  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS");
  }

  if (!NEW_MIN_BID && !NEW_BID_INCREMENT && !NEW_TREASURY) {
    console.log("No settings to update. Provide at least one of:");
    console.log("  NEW_MIN_BID=<eth amount>");
    console.log("  NEW_BID_INCREMENT=<eth amount>");
    console.log("  NEW_TREASURY=<address>");
    return;
  }

  console.log("=".repeat(50));
  console.log("Update Auction Settings");
  console.log("=".repeat(50));
  console.log("Signer:", signer.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("");

  const auction = await ethers.getContractAt(
    "FeaturedCommunityAuction",
    PROXY_ADDRESS
  );

  // Current settings
  console.log("Current Settings:");
  console.log("  Min Bid:", ethers.formatEther(await auction.minimumBidPrice()), "ETH");
  console.log("  Bid Increment:", ethers.formatEther(await auction.bidIncrement()), "ETH");
  console.log("  Treasury:", await auction.treasury());
  console.log("");

  // Update min bid
  if (NEW_MIN_BID) {
    const isAdmin = await auction.isAdmin(signer.address);
    if (!isAdmin) {
      throw new Error("Signer must be admin to change min bid");
    }

    const newValue = ethers.parseEther(NEW_MIN_BID);
    console.log("Setting minimum bid to", NEW_MIN_BID, "ETH...");
    const tx = await auction.setMinimumBidPrice(newValue);
    await tx.wait();
    console.log("Done! Tx:", tx.hash);
  }

  // Update bid increment
  if (NEW_BID_INCREMENT) {
    const isAdmin = await auction.isAdmin(signer.address);
    if (!isAdmin) {
      throw new Error("Signer must be admin to change bid increment");
    }

    const newValue = ethers.parseEther(NEW_BID_INCREMENT);
    console.log("Setting bid increment to", NEW_BID_INCREMENT, "ETH...");
    const tx = await auction.setBidIncrement(newValue);
    await tx.wait();
    console.log("Done! Tx:", tx.hash);
  }

  // Update treasury
  if (NEW_TREASURY) {
    const owner = await auction.owner();
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      throw new Error("Only owner can change treasury");
    }

    if (!ethers.isAddress(NEW_TREASURY)) {
      throw new Error("Invalid treasury address");
    }

    console.log("Setting treasury to", NEW_TREASURY, "...");
    const tx = await auction.setTreasury(NEW_TREASURY);
    await tx.wait();
    console.log("Done! Tx:", tx.hash);
  }

  console.log("");
  console.log("Updated Settings:");
  console.log("  Min Bid:", ethers.formatEther(await auction.minimumBidPrice()), "ETH");
  console.log("  Bid Increment:", ethers.formatEther(await auction.bidIncrement()), "ETH");
  console.log("  Treasury:", await auction.treasury());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

