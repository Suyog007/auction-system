const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";

/**
 * Finalizes the current auction after it has ended.
 * - Transfers winning bid to treasury
 * - Rotates featured slots
 * - Adds winner to slot #1
 *
 * Anyone can call this (not restricted to admin).
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/finalizeAuction.js --network <network>
 */
async function main() {
  const [signer] = await ethers.getSigners();

  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS. Set it via environment variable.");
  }

  console.log("=".repeat(50));
  console.log("Finalize Auction");
  console.log("=".repeat(50));
  console.log("Signer:", signer.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("");

  const auction = await ethers.getContractAt(
    "FeaturedCommunityAuction",
    PROXY_ADDRESS
  );

  const currentId = await auction.currentAuctionId();
  if (currentId === 0n) {
    console.log("No auction has been created yet!");
    return;
  }

  const auctionData = await auction.auctions(currentId);

  if (auctionData.finalized) {
    console.log("Auction", currentId.toString(), "is already finalized!");
    return;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < auctionData.endTime) {
    const remaining = Number(auctionData.endTime - now);
    console.log("Auction is still active!");
    console.log("Time remaining:", (remaining / 3600).toFixed(2), "hours");
    console.log("End time:", new Date(Number(auctionData.endTime) * 1000).toISOString());
    return;
  }

  console.log("Auction ID:", currentId.toString());
  console.log("Highest Bidder:", auctionData.highestBidder);
  console.log("Winning Bid:", ethers.formatEther(auctionData.highestBid), "ETH");
  console.log("");

  console.log("Finalizing auction...");
  const tx = await auction.finalizeAuction();
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  console.log("");
  console.log("=".repeat(50));
  console.log("Auction Finalized!");
  console.log("=".repeat(50));

  if (auctionData.highestBidder !== ethers.ZeroAddress) {
    console.log("Winner:", auctionData.highestBidder);
    console.log("Community:", auctionData.winningCommunity?.name || "(loading...)");
    console.log("Bid sent to treasury:", ethers.formatEther(auctionData.highestBid), "ETH");
  } else {
    console.log("No bids were placed in this auction.");
  }

  // Show current featured slots
  const slots = await auction.getFeaturedSlots();
  console.log("");
  console.log("Current Featured Slots:");
  for (let i = 0; i < 3; i++) {
    if (slots[i].winner !== ethers.ZeroAddress) {
      console.log(`  Slot ${i + 1}: ${slots[i].community.name} (${slots[i].winner})`);
    } else {
      console.log(`  Slot ${i + 1}: Empty`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

