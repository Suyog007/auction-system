const { ethers } = require("hardhat");

// ============ Configuration ============
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";
const SLOT_INDEX = parseInt(process.env.SLOT_INDEX || "0"); // 0, 1, or 2
const COMMUNITY_NAME = process.env.COMMUNITY_NAME || "";
const COMMUNITY_DESCRIPTION = process.env.COMMUNITY_DESCRIPTION || "";
const COMMUNITY_LINK = process.env.COMMUNITY_LINK || "";

/**
 * Updates metadata for a featured community slot (Admin only).
 *
 * Usage:
 *   PROXY_ADDRESS=0x... SLOT_INDEX=0 COMMUNITY_NAME="New Name" COMMUNITY_DESCRIPTION="New Desc" COMMUNITY_LINK="https://..." \
 *   npx hardhat run scripts/updateFeaturedMetadata.js --network <network>
 */
async function main() {
  const [signer] = await ethers.getSigners();

  if (!PROXY_ADDRESS) {
    throw new Error("Missing PROXY_ADDRESS");
  }
  if (!COMMUNITY_NAME) {
    throw new Error("Missing COMMUNITY_NAME");
  }
  if (!COMMUNITY_LINK) {
    throw new Error("Missing COMMUNITY_LINK");
  }
  if (SLOT_INDEX < 0 || SLOT_INDEX > 2) {
    throw new Error("SLOT_INDEX must be 0, 1, or 2");
  }

  console.log("=".repeat(50));
  console.log("Update Featured Community Metadata");
  console.log("=".repeat(50));
  console.log("Signer:", signer.address);
  console.log("Proxy:", PROXY_ADDRESS);
  console.log("Slot Index:", SLOT_INDEX);
  console.log("New Name:", COMMUNITY_NAME);
  console.log("New Description:", COMMUNITY_DESCRIPTION);
  console.log("New Link:", COMMUNITY_LINK);
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

  // Get current slot data
  const slots = await auction.getFeaturedSlots();
  const currentSlot = slots[SLOT_INDEX];

  if (currentSlot.winner === ethers.ZeroAddress) {
    console.log("Warning: Slot", SLOT_INDEX, "is empty!");
  } else {
    console.log("Current data:");
    console.log("  Name:", currentSlot.community.name);
    console.log("  Description:", currentSlot.community.description);
    console.log("  Link:", currentSlot.community.link);
    console.log("");
  }

  console.log("Updating metadata...");
  const tx = await auction.updateFeaturedCommunity(
    SLOT_INDEX,
    COMMUNITY_NAME,
    COMMUNITY_DESCRIPTION,
    COMMUNITY_LINK
  );
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  // Verify update
  const updatedSlots = await auction.getFeaturedSlots();
  const updatedSlot = updatedSlots[SLOT_INDEX];

  console.log("");
  console.log("Updated successfully!");
  console.log("  Name:", updatedSlot.community.name);
  console.log("  Description:", updatedSlot.community.description);
  console.log("  Link:", updatedSlot.community.link);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

