# Auction System (Base / EVM)

Slot-based auction smart contract where the **top 3 bidders** win **3 slots**. Runs on any EVM chain (Base, Base Sepolia, etc).

## Requirements covered

- **Admin sets auction start time and end time**
- **Admin sets minimum bid amount**
- **Each auction has 3 slots** (winner + metadata fields)
- **Top 3 bidders win the 3 slots**
- **Admin can refund everyone except top 3** (batch refund)

## Tech stack

- **Solidity**: `0.8.20`
- **Hardhat** + **ethers v6**
- **OpenZeppelin**: `Ownable`, `ReentrancyGuard`

## Project structure

- **Contract**: `contracts/AuctionSystem.sol`
- **Tests**: `test/AuctionSystem.test.js`
- **Deploy script**: `scripts/deploy.js`
- **Example admin script**: `scripts/adminAction.js`
- **Config**: `hardhat.config.js`

## Install

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm test
```

## Add an admin (owner-only)

If you deployed the contract behind a proxy, use the **proxy address**:

```bash
npx hardhat run scripts/addAdmin.js --network <network>
```

## Environment variables

Create a `.env` file in `auction-system/`:

```bash
PRIVATE_KEY=0xyour_private_key
SEPOLIA_RPC_URL=https://...
```

## Contract overview

### Core state

- **`currentAuctionId`**: increments each time `createAuction()` is called
- **`auctionStartTime` / `auctionEndTime`**: active auction time window
- **`minimumBidAmount`**: minimum value per bid transaction
- **`auctionSlots[auctionId][0..2]`**: the 3 slot records (winner + bidAmount + metadata)
- **`bidderTotalAmount[auctionId][bidder]`**: cumulative total bid per bidder

### How bidding works

- Users call **`placeBid()`** and send ETH.
- Each call must send at least **`minimumBidAmount`**.
- Contract keeps a running total per bidder; winners are computed from totals.

### Determine winners (top 3)

- Winners are derived by calling **`getTopBidders()`**, which returns:
  - `address[3] winners`
  - `uint256[3] amounts`

### Typical flow (admin + users)

1) **Admin: create auction**

- `createAuction(startTimestamp, endTimestamp, minBidWei)`

2) **Users: bid**

- `placeBid()` (payable)

3) **Admin: finalize after end**

- `finalizeAuction()`
- Sets slot winners and their winning bid totals.

4) **Refund non-winners**

Two supported approaches:

- **Admin batch refund (one transaction)**:
  - `refundAllExceptTop3()`
  - Iterates all bidders for the current auction and refunds everyone except winners.
  - ⚠️ Can run out of gas if there are many bidders.

- **User self-claim**:
  - `claimRefund()`
  - Reverts for winners, and for already-refunded bidders.

5) **Admin withdraws winning bids**

- `withdrawWinningBids()`
- Transfers the sum of the 3 winning bid totals to the contract owner.

### Slot metadata

Each auction has 3 slots:

- `Slot.winner` (address)
- `Slot.bidAmount` (uint256)
- `Slot.name` (string)
- `Slot.description` (string)
- `Slot.metadata` (string)

Admin can set slot metadata **before finalization**:

- `updateSlotMetadata(slotIndex, name, description, metadata)`

