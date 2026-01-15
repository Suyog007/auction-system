const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";

/**
 * Gets current auction status and featured communities.
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/getAuctionStatus.js --network <network>
 */
async function main() {
  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS. Set it via environment variable.");
  }

  console.log("=".repeat(60));
  console.log("FeaturedCommunityAuction Status");
  console.log("=".repeat(60));
  console.log("Contract:", PROXY_ADDRESS);
  console.log("");

  const auction = await ethers.getContractAt(
    "FeaturedCommunityAuction",
    PROXY_ADDRESS
  );

  // Contract Info
  console.log("--- Contract Info ---");
  console.log("Owner:", await auction.owner());
  console.log("Treasury:", await auction.treasury());
  console.log("Version:", await auction.version());
  console.log("Min Bid:", ethers.formatEther(await auction.minimumBidPrice()), "ETH");
  console.log("Bid Increment:", ethers.formatEther(await auction.bidIncrement()), "ETH");
  console.log("");

  // Current Auction
  const currentId = await auction.currentAuctionId();
  console.log("--- Current Auction ---");
  console.log("Auction ID:", currentId.toString());

  if (currentId > 0n) {
    const isActive = await auction.isAuctionActive();
    const remaining = await auction.getTimeRemaining();
    const auctionData = await auction.auctions(currentId);

    console.log("Status:", isActive ? "ACTIVE" : (auctionData.finalized ? "FINALIZED" : "ENDED (awaiting finalization)"));
    console.log("Start:", new Date(Number(auctionData.startTime) * 1000).toISOString());
    console.log("End:", new Date(Number(auctionData.endTime) * 1000).toISOString());

    if (isActive) {
      const hours = Number(remaining) / 3600;
      console.log("Time Remaining:", hours.toFixed(2), "hours");
    }

    console.log("Total Bids:", auctionData.totalBids.toString());
    console.log("Highest Bid:", ethers.formatEther(auctionData.highestBid), "ETH");
    console.log("Highest Bidder:", auctionData.highestBidder);

    if (auctionData.highestBidder !== ethers.ZeroAddress) {
      console.log("Leading Community:", auctionData.winningCommunity?.name || "N/A");
    }
  } else {
    console.log("No auction has been started yet.");
  }

  console.log("");

  // Featured Slots
  console.log("--- Featured Communities (3 Slots) ---");
  const slots = await auction.getFeaturedSlots();
  const now = BigInt(Math.floor(Date.now() / 1000));

  for (let i = 0; i < 3; i++) {
    const slot = slots[i];
    console.log(`\nSlot #${i + 1}:`);

    if (slot.winner === ethers.ZeroAddress) {
      console.log("  Status: Empty");
    } else {
      const isActive = slot.active && now < slot.endTime;
      const daysRemaining = isActive ? Number(slot.endTime - now) / 86400 : 0;

      console.log("  Status:", isActive ? "ACTIVE" : "EXPIRED");
      console.log("  Winner:", slot.winner);
      console.log("  Community:", slot.community.name);
      console.log("  Description:", slot.community.description || "(none)");
      console.log("  Link:", slot.community.link);
      console.log("  Winning Bid:", ethers.formatEther(slot.winningBid), "ETH");
      console.log("  Auction ID:", slot.auctionId.toString());

      if (isActive) {
        console.log("  Days Remaining:", daysRemaining.toFixed(2));
      }

      console.log("  End Time:", new Date(Number(slot.endTime) * 1000).toISOString());
    }
  }

  console.log("");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

