const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";

/**
 * Starts a new 24-hour auction.
 * Only admins can start auctions.
 * Cannot start if previous auction is still active/not finalized.
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/startAuction.js --network <network>
 */
async function main() {
  const [signer] = await ethers.getSigners();

  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS. Set it via environment variable.");
  }

  console.log("=".repeat(50));
  console.log("Start New Auction");
  console.log("=".repeat(50));
  console.log("Signer:", signer.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("");

  const auction = await ethers.getContractAt(
    "FeaturedCommunityAuction",
    PROXY_ADDRESS
  );

  // Check if signer is admin
  const isAdmin = await auction.isAdmin(signer.address);
  if (!isAdmin) {
    throw new Error("Signer is not an admin!");
  }

  // Check if there's an active auction
  const isActive = await auction.isAuctionActive();
  if (isActive) {
    const remaining = await auction.getTimeRemaining();
    console.log("An auction is currently active!");
    console.log("Time remaining:", Number(remaining) / 3600, "hours");
    return;
  }

  // Check if previous auction needs finalization
  const currentId = await auction.currentAuctionId();
  if (currentId > 0) {
    const auctionData = await auction.auctions(currentId);
    if (!auctionData.finalized) {
      console.log("Previous auction needs to be finalized first!");
      console.log("Run: npx hardhat run scripts/finalizeAuction.js --network <network>");
      return;
    }
  }

  console.log("Starting new auction...");
  const tx = await auction.startAuction();
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  // Get new auction details
  const newId = await auction.currentAuctionId();
  const newAuction = await auction.auctions(newId);

  console.log("");
  console.log("=".repeat(50));
  console.log("Auction Started!");
  console.log("=".repeat(50));
  console.log("Auction ID:", newId.toString());
  console.log("Start Time:", new Date(Number(newAuction.startTime) * 1000).toISOString());
  console.log("End Time:", new Date(Number(newAuction.endTime) * 1000).toISOString());
  console.log("Minimum Bid:", ethers.formatEther(await auction.minimumBidPrice()), "ETH");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

