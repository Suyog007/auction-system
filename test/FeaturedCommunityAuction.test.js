const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("FeaturedCommunityAuction", function () {
  let FeaturedCommunityAuction;
  let auction;
  let owner, treasury, alice, bob, carol, dave, admin;

  const MIN_BID = ethers.parseEther("0.01");
  const BID_INCREMENT = ethers.parseEther("0.005");

  // Constants matching contract
  const AUCTION_DURATION = 24 * 60 * 60; // 24 hours
  const FEATURED_DURATION = 3 * 24 * 60 * 60; // 3 days

  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }

  async function getTimestamp() {
    return (await ethers.provider.getBlock("latest")).timestamp;
  }

  beforeEach(async function () {
    [owner, treasury, alice, bob, carol, dave, admin] = await ethers.getSigners();

    FeaturedCommunityAuction = await ethers.getContractFactory("FeaturedCommunityAuction");
    auction = await upgrades.deployProxy(
      FeaturedCommunityAuction,
      [treasury.address, MIN_BID, BID_INCREMENT],
      { initializer: "initialize", kind: "uups" }
    );
    await auction.waitForDeployment();
  });

  // ============ Initialization Tests ============
  describe("Initialization", function () {
    it("should set owner correctly", async function () {
      expect(await auction.owner()).to.equal(owner.address);
    });

    it("should make owner an admin automatically", async function () {
      expect(await auction.isAdmin(owner.address)).to.equal(true);
    });

    it("should set treasury correctly", async function () {
      expect(await auction.treasury()).to.equal(treasury.address);
    });

    it("should set minimum bid price correctly", async function () {
      expect(await auction.minimumBidPrice()).to.equal(MIN_BID);
    });

    it("should set bid increment correctly", async function () {
      expect(await auction.bidIncrement()).to.equal(BID_INCREMENT);
    });

    it("should not allow initialize twice", async function () {
      await expect(
        auction.initialize(treasury.address, MIN_BID, BID_INCREMENT)
      ).to.be.reverted;
    });

    it("should revert with zero treasury address", async function () {
      const Factory = await ethers.getContractFactory("FeaturedCommunityAuction");
      await expect(
        upgrades.deployProxy(
          Factory,
          [ethers.ZeroAddress, MIN_BID, BID_INCREMENT],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(Factory, "InvalidAddress");
    });
  });

  // ============ Admin Management Tests ============
  describe("Admin Management", function () {
    it("should allow owner to add admin", async function () {
      await expect(auction.addAdmin(admin.address))
        .to.emit(auction, "AdminAdded")
        .withArgs(admin.address, owner.address);

      expect(await auction.isAdmin(admin.address)).to.equal(true);
    });

    it("should not allow non-owner to add admin", async function () {
      await expect(
        auction.connect(alice).addAdmin(bob.address)
      ).to.be.reverted;
    });

    it("should not allow adding zero address as admin", async function () {
      await expect(
        auction.addAdmin(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(auction, "InvalidAddress");
    });

    it("should not allow adding existing admin", async function () {
      await auction.addAdmin(admin.address);
      await expect(
        auction.addAdmin(admin.address)
      ).to.be.revertedWithCustomError(auction, "AlreadyAdmin");
    });

    it("should allow owner to remove admin", async function () {
      await auction.addAdmin(admin.address);
      
      await expect(auction.removeAdmin(admin.address))
        .to.emit(auction, "AdminRemoved")
        .withArgs(admin.address, owner.address);

      expect(await auction.isAdmin(admin.address)).to.equal(false);
    });

    it("should not allow removing owner as admin", async function () {
      await expect(
        auction.removeAdmin(owner.address)
      ).to.be.revertedWithCustomError(auction, "CannotRemoveOwner");
    });

    it("should not allow removing non-admin", async function () {
      await expect(
        auction.removeAdmin(alice.address)
      ).to.be.revertedWithCustomError(auction, "NotAnAdmin");
    });

    it("should return all admins correctly", async function () {
      await auction.addAdmin(admin.address);
      await auction.addAdmin(alice.address);

      const admins = await auction.getAdmins();
      expect(admins).to.include(owner.address);
      expect(admins).to.include(admin.address);
      expect(admins).to.include(alice.address);
    });

    it("owner should be treated as admin even without explicit add", async function () {
      expect(await auction.isAdmin(owner.address)).to.equal(true);
    });
  });

  // ============ Auction Creation Tests ============
  describe("Auction Creation", function () {
    it("should allow admin to start auction", async function () {
      await expect(auction.startAuction())
        .to.emit(auction, "AuctionStarted");

      expect(await auction.currentAuctionId()).to.equal(1);
    });

    it("should allow added admin to start auction", async function () {
      await auction.addAdmin(admin.address);
      
      await expect(auction.connect(admin).startAuction())
        .to.emit(auction, "AuctionStarted");
    });

    it("should not allow non-admin to start auction", async function () {
      await expect(
        auction.connect(alice).startAuction()
      ).to.be.revertedWithCustomError(auction, "NotAdmin");
    });

    it("should not allow starting new auction while one is active", async function () {
      await auction.startAuction();
      
      await expect(
        auction.startAuction()
      ).to.be.revertedWithCustomError(auction, "AuctionStillActive");
    });

    it("should set correct auction timing", async function () {
      await auction.startAuction();

      const currentAuction = await auction.getCurrentAuction();
      const now = await getTimestamp();

      expect(currentAuction.startTime).to.be.closeTo(now, 5);
      expect(currentAuction.endTime).to.be.closeTo(now + AUCTION_DURATION, 5);
    });

    it("should check auction active status correctly", async function () {
      expect(await auction.isAuctionActive()).to.equal(false);
      
      await auction.startAuction();
      expect(await auction.isAuctionActive()).to.equal(true);
      
      await increaseTime(AUCTION_DURATION + 1);
      expect(await auction.isAuctionActive()).to.equal(false);
    });
  });

  // ============ Bidding Tests ============
  describe("Bidding", function () {
    beforeEach(async function () {
      await auction.startAuction();
    });

    it("should accept valid bid with community details", async function () {
      await expect(
        auction.connect(alice).placeBid(
          "My Community",
          "An awesome community",
          "https://mycommunity.com",
          { value: MIN_BID }
        )
      )
        .to.emit(auction, "BidPlaced")
        .withArgs(1, alice.address, MIN_BID, "My Community", "https://mycommunity.com");
    });

    it("should reject bid below minimum", async function () {
      await expect(
        auction.connect(alice).placeBid(
          "Community",
          "Desc",
          "https://link.com",
          { value: ethers.parseEther("0.001") }
        )
      ).to.be.revertedWithCustomError(auction, "BidTooLow");
    });

    it("should reject bid with empty name", async function () {
      await expect(
        auction.connect(alice).placeBid(
          "",
          "Description",
          "https://link.com",
          { value: MIN_BID }
        )
      ).to.be.revertedWithCustomError(auction, "EmptyString");
    });

    it("should reject bid with empty link", async function () {
      await expect(
        auction.connect(alice).placeBid(
          "Community",
          "Description",
          "",
          { value: MIN_BID }
        )
      ).to.be.revertedWithCustomError(auction, "EmptyString");
    });

    it("should update highest bidder on new higher bid", async function () {
      await auction.connect(alice).placeBid(
        "Alice Community",
        "Desc",
        "https://alice.com",
        { value: MIN_BID }
      );

      const higherBid = MIN_BID + BID_INCREMENT;
      await auction.connect(bob).placeBid(
        "Bob Community",
        "Desc",
        "https://bob.com",
        { value: higherBid }
      );

      const currentAuction = await auction.getCurrentAuction();
      expect(currentAuction.highestBidder).to.equal(bob.address);
      expect(currentAuction.highestBid).to.equal(higherBid);
      expect(currentAuction.leadingCommunityName).to.equal("Bob Community");
    });

    it("should refund previous highest bidder automatically", async function () {
      await auction.connect(alice).placeBid(
        "Alice Community",
        "Desc",
        "https://alice.com",
        { value: MIN_BID }
      );

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

      const higherBid = MIN_BID + BID_INCREMENT;
      await expect(
        auction.connect(bob).placeBid(
          "Bob Community",
          "Desc",
          "https://bob.com",
          { value: higherBid }
        )
      )
        .to.emit(auction, "RefundIssued")
        .withArgs(alice.address, MIN_BID, 1)
        .and.to.emit(auction, "BidOutbid");

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalanceAfter).to.equal(aliceBalanceBefore + MIN_BID);
    });

    it("should require minimum increment for subsequent bids", async function () {
      await auction.connect(alice).placeBid(
        "Alice Community",
        "Desc",
        "https://alice.com",
        { value: MIN_BID }
      );

      // Bid that's higher but not by increment should fail
      await expect(
        auction.connect(bob).placeBid(
          "Bob Community",
          "Desc",
          "https://bob.com",
          { value: MIN_BID + ethers.parseEther("0.001") }
        )
      ).to.be.revertedWithCustomError(auction, "BidTooLow");
    });

    it("should not accept bids after auction ends", async function () {
      await increaseTime(AUCTION_DURATION + 1);

      await expect(
        auction.connect(alice).placeBid(
          "Community",
          "Desc",
          "https://link.com",
          { value: MIN_BID }
        )
      ).to.be.revertedWithCustomError(auction, "AuctionNotActive");
    });

    it("should reject bid when no auction active", async function () {
      // Deploy fresh contract
      const Factory = await ethers.getContractFactory("FeaturedCommunityAuction");
      const fresh = await upgrades.deployProxy(
        Factory,
        [treasury.address, MIN_BID, BID_INCREMENT],
        { initializer: "initialize", kind: "uups" }
      );
      await fresh.waitForDeployment();

      await expect(
        fresh.connect(alice).placeBid(
          "Community",
          "Desc",
          "https://link.com",
          { value: MIN_BID }
        )
      ).to.be.revertedWithCustomError(fresh, "NoActiveAuction");
    });

    it("should track bid count correctly", async function () {
      await auction.connect(alice).placeBid("A", "D", "https://a.com", { value: MIN_BID });
      
      const bid2 = MIN_BID + BID_INCREMENT;
      await auction.connect(bob).placeBid("B", "D", "https://b.com", { value: bid2 });

      const bid3 = bid2 + BID_INCREMENT;
      await auction.connect(carol).placeBid("C", "D", "https://c.com", { value: bid3 });

      expect(await auction.getCurrentBidCount()).to.equal(3);
    });

    it("should get minimum bid correctly", async function () {
      expect(await auction.getMinimumBid()).to.equal(MIN_BID);

      await auction.connect(alice).placeBid("A", "D", "https://a.com", { value: MIN_BID });
      expect(await auction.getMinimumBid()).to.equal(MIN_BID + BID_INCREMENT);
    });
  });

  // ============ Auction Finalization Tests ============
  describe("Auction Finalization", function () {
    beforeEach(async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid(
        "Alice Community",
        "Best community ever",
        "https://alice.com",
        { value: MIN_BID }
      );
      await increaseTime(AUCTION_DURATION + 1);
    });

    it("should allow anyone to finalize ended auction", async function () {
      await expect(auction.connect(bob).finalizeAuction())
        .to.emit(auction, "AuctionFinalized")
        .withArgs(1, alice.address, MIN_BID, "Alice Community");
    });

    it("should not allow finalizing active auction", async function () {
      // First finalize the ended auction from beforeEach
      await auction.finalizeAuction();
      
      // Start a new auction
      await auction.startAuction();
      
      // Try to finalize while active (should fail)
      await expect(
        auction.finalizeAuction()
      ).to.be.revertedWithCustomError(auction, "AuctionStillActive");
    });

    it("should not allow double finalization", async function () {
      await auction.finalizeAuction();
      
      await expect(
        auction.finalizeAuction()
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyFinalized");
    });

    it("should transfer winning bid to treasury", async function () {
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      
      await auction.finalizeAuction();

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + MIN_BID);
    });

    it("should add winner to featured slot #1", async function () {
      await auction.finalizeAuction();

      const slots = await auction.getFeaturedSlots();
      expect(slots[0].winner).to.equal(alice.address);
      expect(slots[0].winningBid).to.equal(MIN_BID);
      expect(slots[0].community.name).to.equal("Alice Community");
      expect(slots[0].active).to.equal(true);
    });

    it("should handle auction with no bids gracefully", async function () {
      // Start new auction with no bids
      await auction.finalizeAuction(); // Finalize first auction
      await auction.startAuction();
      await increaseTime(AUCTION_DURATION + 1);

      await expect(auction.finalizeAuction())
        .to.emit(auction, "AuctionFinalized")
        .withArgs(2, ethers.ZeroAddress, 0, "");
    });
  });

  // ============ Featured Slots Rotation Tests ============
  describe("Featured Slots Rotation", function () {
    it("should rotate slots correctly over multiple days", async function () {
      // Day 1: Alice wins
      await auction.startAuction();
      await auction.connect(alice).placeBid("Alice", "D", "https://alice.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      let slots = await auction.getFeaturedSlots();
      expect(slots[0].winner).to.equal(alice.address);

      // Day 2: Bob wins - Alice moves to slot 2
      await auction.startAuction();
      await auction.connect(bob).placeBid("Bob", "D", "https://bob.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      slots = await auction.getFeaturedSlots();
      expect(slots[0].winner).to.equal(bob.address);
      expect(slots[1].winner).to.equal(alice.address);

      // Day 3: Carol wins - Alice to slot 3, Bob to slot 2
      await auction.startAuction();
      await auction.connect(carol).placeBid("Carol", "D", "https://carol.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      slots = await auction.getFeaturedSlots();
      expect(slots[0].winner).to.equal(carol.address);
      expect(slots[1].winner).to.equal(bob.address);
      expect(slots[2].winner).to.equal(alice.address);

      // Day 4: Dave wins - Alice rotates out
      await auction.startAuction();
      await auction.connect(dave).placeBid("Dave", "D", "https://dave.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      slots = await auction.getFeaturedSlots();
      expect(slots[0].winner).to.equal(dave.address);
      expect(slots[1].winner).to.equal(carol.address);
      expect(slots[2].winner).to.equal(bob.address);
    });

    it("should emit FeaturedSlotsRotated event", async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid("Alice", "D", "https://alice.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);

      await expect(auction.finalizeAuction())
        .to.emit(auction, "FeaturedSlotsRotated");
    });

    it("should set featured duration correctly (3 days)", async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid("Alice", "D", "https://alice.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      const slots = await auction.getFeaturedSlots();
      const now = await getTimestamp();
      
      expect(slots[0].endTime).to.be.closeTo(now + FEATURED_DURATION, 10);
    });
  });

  // ============ Featured Community Metadata Tests ============
  describe("Featured Community Metadata (Admin Only)", function () {
    beforeEach(async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid("Original Name", "Original Desc", "https://original.com", { value: MIN_BID });
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();
    });

    it("should allow admin to update featured community metadata", async function () {
      await expect(
        auction.updateFeaturedCommunity(
          0,
          "Updated Name",
          "Updated Description",
          "https://updated.com"
        )
      )
        .to.emit(auction, "FeaturedCommunityUpdated")
        .withArgs(0, 1, "Updated Name", "Updated Description", "https://updated.com");

      const slots = await auction.getFeaturedSlots();
      expect(slots[0].community.name).to.equal("Updated Name");
      expect(slots[0].community.description).to.equal("Updated Description");
      expect(slots[0].community.link).to.equal("https://updated.com");
    });

    it("should allow added admin to update metadata", async function () {
      await auction.addAdmin(admin.address);

      await expect(
        auction.connect(admin).updateFeaturedCommunity(
          0,
          "Admin Updated",
          "Admin Desc",
          "https://admin.com"
        )
      ).to.emit(auction, "FeaturedCommunityUpdated");
    });

    it("should not allow non-admin to update metadata", async function () {
      await expect(
        auction.connect(alice).updateFeaturedCommunity(
          0,
          "Hacked",
          "Hacked",
          "https://hacked.com"
        )
      ).to.be.revertedWithCustomError(auction, "NotAdmin");
    });

    it("should not allow winner to update their own metadata", async function () {
      await expect(
        auction.connect(alice).updateFeaturedCommunity(
          0,
          "Self Update",
          "Desc",
          "https://self.com"
        )
      ).to.be.revertedWithCustomError(auction, "NotAdmin");
    });

    it("should reject invalid slot index", async function () {
      await expect(
        auction.updateFeaturedCommunity(3, "Name", "Desc", "https://link.com")
      ).to.be.revertedWithCustomError(auction, "InvalidSlotIndex");
    });

    it("should reject empty name in update", async function () {
      await expect(
        auction.updateFeaturedCommunity(0, "", "Desc", "https://link.com")
      ).to.be.revertedWithCustomError(auction, "EmptyString");
    });

    it("should reject empty link in update", async function () {
      await expect(
        auction.updateFeaturedCommunity(0, "Name", "Desc", "")
      ).to.be.revertedWithCustomError(auction, "EmptyString");
    });

    it("should allow admin to update only the link", async function () {
      await expect(
        auction.updateFeaturedLink(0, "https://newlink.com")
      ).to.emit(auction, "FeaturedCommunityUpdated");

      const slots = await auction.getFeaturedSlots();
      expect(slots[0].community.link).to.equal("https://newlink.com");
      expect(slots[0].community.name).to.equal("Original Name"); // Unchanged
    });
  });

  // ============ Settings Tests ============
  describe("Settings", function () {
    it("should allow admin to set minimum bid price", async function () {
      const newMin = ethers.parseEther("0.05");
      
      await expect(auction.setMinimumBidPrice(newMin))
        .to.emit(auction, "MinimumBidPriceUpdated")
        .withArgs(MIN_BID, newMin);

      expect(await auction.minimumBidPrice()).to.equal(newMin);
    });

    it("should allow admin to set bid increment", async function () {
      const newIncrement = ethers.parseEther("0.01");
      
      await expect(auction.setBidIncrement(newIncrement))
        .to.emit(auction, "BidIncrementUpdated")
        .withArgs(BID_INCREMENT, newIncrement);

      expect(await auction.bidIncrement()).to.equal(newIncrement);
    });

    it("should not allow non-admin to change settings", async function () {
      await expect(
        auction.connect(alice).setMinimumBidPrice(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(auction, "NotAdmin");

      await expect(
        auction.connect(alice).setBidIncrement(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(auction, "NotAdmin");
    });

    it("should allow only owner to set treasury", async function () {
      await expect(auction.setTreasury(alice.address))
        .to.emit(auction, "TreasuryUpdated")
        .withArgs(treasury.address, alice.address);

      expect(await auction.treasury()).to.equal(alice.address);
    });

    it("should not allow admin (non-owner) to set treasury", async function () {
      await auction.addAdmin(admin.address);
      
      await expect(
        auction.connect(admin).setTreasury(admin.address)
      ).to.be.reverted;
    });

    it("should not allow zero address for treasury", async function () {
      await expect(
        auction.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(auction, "InvalidAddress");
    });
  });

  // ============ Pause Tests ============
  describe("Pause Functionality", function () {
    it("should allow owner to pause", async function () {
      await auction.pause();
      
      await expect(
        auction.startAuction()
      ).to.be.reverted; // EnforcedPause
    });

    it("should allow owner to unpause", async function () {
      await auction.pause();
      await auction.unpause();

      await expect(auction.startAuction())
        .to.emit(auction, "AuctionStarted");
    });

    it("should not allow non-owner to pause", async function () {
      await expect(
        auction.connect(alice).pause()
      ).to.be.reverted;
    });

    it("should prevent bidding when paused", async function () {
      await auction.startAuction();
      await auction.pause();

      await expect(
        auction.connect(alice).placeBid("A", "D", "https://a.com", { value: MIN_BID })
      ).to.be.reverted;
    });
  });

  // ============ Emergency Functions Tests ============
  describe("Emergency Functions", function () {
    beforeEach(async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid("A", "D", "https://a.com", { value: MIN_BID });
    });

    it("should allow owner to emergency withdraw", async function () {
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      
      const tx = await auction.emergencyWithdraw(owner.address, MIN_BID);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter).to.be.closeTo(ownerBalanceBefore + MIN_BID - gas, ethers.parseEther("0.001"));
    });

    it("should not allow non-owner to emergency withdraw", async function () {
      await expect(
        auction.connect(alice).emergencyWithdraw(alice.address, MIN_BID)
      ).to.be.reverted;
    });

    it("should allow owner to emergency finalize and refund bidder", async function () {
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      
      await expect(auction.emergencyFinalizeAuction(1))
        .to.emit(auction, "RefundIssued")
        .withArgs(alice.address, MIN_BID, 1);

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalanceAfter).to.equal(aliceBalanceBefore + MIN_BID);
    });

    it("should not allow emergency finalize on already finalized", async function () {
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      await expect(
        auction.emergencyFinalizeAuction(1)
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyFinalized");
    });
  });

  // ============ View Functions Tests ============
  describe("View Functions", function () {
    beforeEach(async function () {
      await auction.startAuction();
      await auction.connect(alice).placeBid("Alice", "Desc", "https://alice.com", { value: MIN_BID });
    });

    it("should return time remaining correctly", async function () {
      const remaining = await auction.getTimeRemaining();
      expect(remaining).to.be.closeTo(AUCTION_DURATION, 10);

      await increaseTime(AUCTION_DURATION + 1);
      expect(await auction.getTimeRemaining()).to.equal(0);
    });

    it("should return auction bids correctly", async function () {
      const bids = await auction.getAuctionBids(1);
      expect(bids.length).to.equal(1);
      expect(bids[0].bidder).to.equal(alice.address);
      expect(bids[0].amount).to.equal(MIN_BID);
      expect(bids[0].community.name).to.equal("Alice");
    });

    it("should get active featured communities", async function () {
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      const [names, descriptions, links, winners, activeStatus] = await auction.getActiveFeatured();
      
      expect(names[0]).to.equal("Alice");
      expect(links[0]).to.equal("https://alice.com");
      expect(winners[0]).to.equal(alice.address);
      expect(activeStatus[0]).to.equal(true);
    });

    it("should mark slots as inactive after 3 days", async function () {
      await increaseTime(AUCTION_DURATION + 1);
      await auction.finalizeAuction();

      // Fast forward 3 days
      await increaseTime(FEATURED_DURATION + 1);
      await auction.refreshFeaturedSlots();

      const slots = await auction.getFeaturedSlots();
      expect(slots[0].active).to.equal(false);
    });
  });

  // ============ Version & Upgrade Tests ============
  describe("Version & Upgradeability", function () {
    it("should return correct version", async function () {
      expect(await auction.version()).to.equal("2.0.0");
    });

    it("should receive ETH", async function () {
      await owner.sendTransaction({
        to: await auction.getAddress(),
        value: ethers.parseEther("1")
      });

      const balance = await ethers.provider.getBalance(await auction.getAddress());
      expect(balance).to.equal(ethers.parseEther("1"));
    });
  });
});

