const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AuctionSystemUpgradeable", function () {
  let AuctionSystem;
  let auction;
  let owner, alice, bob, carol, dave;

  const MIN_BID = ethers.parseEther("0.01");

  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }

  beforeEach(async function () {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();

    AuctionSystem = await ethers.getContractFactory("AuctionSystemUpgradeable");
    auction = await upgrades.deployProxy(AuctionSystem, [], { initializer: "initialize" });
    await auction.waitForDeployment();
  });

  describe("Initialization", function () {
    it("should set owner and make owner an admin", async function () {
      expect(await auction.owner()).to.equal(owner.address);
      expect(await auction.admins(owner.address)).to.equal(true);
    });

    it("should not allow initialize twice", async function () {
      await expect(auction.initialize()).to.be.reverted;
    });
  });

  describe("Auction Creation", function () {
    it("should allow owner to create auction", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(
        auction.createAuction(
          now + 10,
          now + 100,
          MIN_BID
        )
      ).to.emit(auction, "AuctionCreated");

      expect(await auction.minimumBidAmount()).to.equal(MIN_BID);
    });

    it("should revert if non-owner creates auction", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(
        auction.connect(alice).createAuction(
          now + 10,
          now + 100,
          MIN_BID
        )
      ).to.be.revertedWith("Not admin");
    });

    it("should allow owner to add admin and admin can create auction", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(auction.addAdmin(alice.address))
        .to.emit(auction, "AdminUpdated")
        .withArgs(alice.address, true);

      await expect(
        auction.connect(alice).createAuction(
          now + 10,
          now + 100,
          MIN_BID
        )
      ).to.emit(auction, "AuctionCreated");
    });

    it("should not allow non-owner to add admin", async function () {
      await expect(
        auction.connect(alice).addAdmin(bob.address)
      ).to.be.reverted;
    });

    it("should prevent removed admin from creating auction", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await auction.addAdmin(alice.address);
      await expect(auction.removeAdmin(alice.address))
        .to.emit(auction, "AdminUpdated")
        .withArgs(alice.address, false);

      await expect(
        auction.connect(alice).createAuction(
          now + 10,
          now + 100,
          MIN_BID
        )
      ).to.be.revertedWith("Not admin");
    });
  });

  describe("Bidding", function () {
    beforeEach(async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 100, MIN_BID);
      await increaseTime(2);
    });

    it("should accept valid bids", async function () {
      await expect(
        auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") })
      ).to.emit(auction, "BidPlaced");

      const total = await auction.getBidderTotalAmount(alice.address);
      expect(total).to.equal(ethers.parseEther("0.05"));
    });

    it("should reject bids below minimum", async function () {
      await expect(
        auction.connect(alice).placeBid({ value: ethers.parseEther("0.001") })
      ).to.be.revertedWith("Below minimum");
    });

    it("should allow multiple bids from same user", async function () {
      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.02") });
      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.03") });

      const total = await auction.getBidderTotalAmount(alice.address);
      expect(total).to.equal(ethers.parseEther("0.05"));
    });
  });

  describe("Finalization", function () {
    beforeEach(async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);

      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") });
      await auction.connect(bob).placeBid({ value: ethers.parseEther("0.10") });
      await auction.connect(carol).placeBid({ value: ethers.parseEther("0.08") });
      await auction.connect(dave).placeBid({ value: ethers.parseEther("0.02") });

      await increaseTime(60);
    });

    it("should finalize auction and pick top 3 bidders", async function () {
      await expect(auction.finalizeAuction())
        .to.emit(auction, "AuctionFinalized");

      const slots = await auction.getCurrentAuctionSlots();

      const winners = slots.map(s => s.winner);

      expect(winners).to.include(bob.address);
      expect(winners).to.include(carol.address);
      expect(winners).to.include(alice.address);
      expect(winners).to.not.include(dave.address);
    });

    it("should not allow finalization twice", async function () {
      await auction.finalizeAuction();
      await expect(auction.finalizeAuction()).to.be.revertedWith("Already finalized");
    });
  });

  describe("Refunds", function () {
    beforeEach(async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);

      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") });
      await auction.connect(bob).placeBid({ value: ethers.parseEther("0.10") });
      await auction.connect(carol).placeBid({ value: ethers.parseEther("0.08") });
      await auction.connect(dave).placeBid({ value: ethers.parseEther("0.02") });

      await increaseTime(60);
      await auction.finalizeAuction();
    });

    it("should allow non-winner to claim refund", async function () {
      const before = await ethers.provider.getBalance(dave.address);

      const tx = await auction.connect(dave).claimRefund();
      const receipt = await tx.wait();
      const gasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice;
      const gas = receipt.gasUsed * gasPrice;

      const after = await ethers.provider.getBalance(dave.address);

      expect(after).to.be.closeTo(
        before + ethers.parseEther("0.02") - gas,
        ethers.parseEther("0.001")
      );
    });

    it("should not allow winner to claim refund", async function () {
      await expect(
        auction.connect(bob).claimRefund()
      ).to.be.revertedWith("Winner");
    });

    it("should not allow claiming refund twice", async function () {
      await auction.connect(dave).claimRefund();
      await expect(auction.connect(dave).claimRefund()).to.be.revertedWith(
        "Already refunded"
      );
    });
  });

  describe("Owner Withdrawal", function () {
    beforeEach(async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);

      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") });
      await auction.connect(bob).placeBid({ value: ethers.parseEther("0.10") });
      await auction.connect(carol).placeBid({ value: ethers.parseEther("0.08") });

      await increaseTime(60);
      await auction.finalizeAuction();
    });

    it("should allow owner to withdraw winning bids", async function () {
      const before = await ethers.provider.getBalance(owner.address);

      const tx = await auction.withdrawWinningBids();
      const receipt = await tx.wait();
      const gasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice;
      const gas = receipt.gasUsed * gasPrice;

      const after = await ethers.provider.getBalance(owner.address);

      const expected = ethers.parseEther("0.23"); // 0.10 + 0.08 + 0.05

      expect(after).to.be.closeTo(
        before + expected - gas,
        ethers.parseEther("0.001")
      );
    });

    it("should reject withdrawal by non-owner", async function () {
      await expect(
        auction.connect(alice).withdrawWinningBids()
      ).to.be.reverted;
    });

    it("should reject withdrawal if auction not finalized", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);
      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") });
      await increaseTime(60);

      await expect(auction.withdrawWinningBids()).to.be.revertedWith(
        "Not finalized"
      );
    });
  });

  describe("Slot Metadata", function () {
    beforeEach(async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);

      await auction.connect(alice).placeBid({ value: ethers.parseEther("0.05") });
      await auction.connect(bob).placeBid({ value: ethers.parseEther("0.10") });
      await auction.connect(carol).placeBid({ value: ethers.parseEther("0.08") });
      await auction.connect(dave).placeBid({ value: ethers.parseEther("0.02") });

      await increaseTime(60);
      await auction.finalizeAuction();
    });

    it("should allow a winning slot owner to set metadata once", async function () {
      const auctionId = await auction.currentAuctionId();

      const slots = await auction.getCurrentAuctionSlots();
      const slotIndex = slots.findIndex((s) => s.winner === bob.address);
      expect(slotIndex).to.not.equal(-1);

      await expect(
        auction
          .connect(bob)
          .addMetadata(slotIndex, "Slot Name", "Desc", "ipfs://cid")
      )
        .to.emit(auction, "SlotMetadataUpdated")
        .withArgs(auctionId, slotIndex);

      const meta = await auction.getSlotMetadata(auctionId, slotIndex);
      expect(meta.winner).to.equal(bob.address);
      expect(meta.name).to.equal("Slot Name");
      expect(meta.description).to.equal("Desc");
      expect(meta.metadata).to.equal("ipfs://cid");

      await expect(
        auction
          .connect(bob)
          .addMetadata(slotIndex, "Again", "Again", "Again")
      ).to.be.revertedWith("Name already set");
    });

    it("should reject metadata update from non-winner", async function () {
      const slots = await auction.getCurrentAuctionSlots();
      const slotIndex = slots.findIndex((s) => s.winner === bob.address);
      expect(slotIndex).to.not.equal(-1);

      await expect(
        auction
          .connect(dave)
          .addMetadata(slotIndex, "X", "Y", "Z")
      ).to.be.revertedWith("Not winner");
    });

    it("should reject empty name", async function () {
      const slots = await auction.getCurrentAuctionSlots();
      const slotIndex = slots.findIndex((s) => s.winner === bob.address);
      expect(slotIndex).to.not.equal(-1);

      await expect(
        auction
          .connect(bob)
          .addMetadata(slotIndex, "", "Desc", "ipfs://cid")
      ).to.be.revertedWith("Name cannot be empty");
    });

    it("should allow admin to modify metadata (post-auction)", async function () {
      const auctionId = await auction.currentAuctionId();

      // Set initial metadata by the winner
      const slots = await auction.getCurrentAuctionSlots();
      const slotIndex = slots.findIndex((s) => s.winner === bob.address);
      expect(slotIndex).to.not.equal(-1);

      await auction
        .connect(bob)
        .addMetadata(slotIndex, "Slot Name", "Desc", "ipfs://cid");

      // Admin override
      await expect(
        auction.modifyMetadata(
          slotIndex,
          auctionId,
          "Admin Name",
          "Admin Desc",
          "admin://meta"
        )
      )
        .to.emit(auction, "SlotMetadataUpdated")
        .withArgs(auctionId, slotIndex);

      const meta = await auction.getSlotMetadata(auctionId, slotIndex);
      expect(meta.name).to.equal("Admin Name");
      expect(meta.description).to.equal("Admin Desc");
      expect(meta.metadata).to.equal("admin://meta");
    });
  });

  describe("Validation / Timing Reverts", function () {
    it("should reject invalid auction creation params", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(
        auction.createAuction(now + 100, now + 10, MIN_BID)
      ).to.be.revertedWith("Invalid time range");

      await expect(
        auction.createAuction(now - 100, now - 1, MIN_BID)
      ).to.be.revertedWith("End must be future");

      await expect(
        auction.createAuction(now + 1, now + 10, 0)
      ).to.be.revertedWith("Min bid zero");
    });

    it("should reject finalizeAuction before auction end", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await auction.createAuction(now + 1, now + 50, MIN_BID);
      await increaseTime(2);

      await expect(auction.finalizeAuction()).to.be.revertedWith("Auction ongoing");
    });
  });
});