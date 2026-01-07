const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuctionSystem", function () {
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

    AuctionSystem = await ethers.getContractFactory("AuctionSystem");
    auction = await AuctionSystem.deploy();
    await auction.waitForDeployment();
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
      ).to.be.reverted;
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
      const gas = receipt.gasUsed * receipt.gasPrice;

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
      const gas = receipt.gasUsed * receipt.gasPrice;

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
  });
});