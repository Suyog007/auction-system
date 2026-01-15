# Featured Community Auction

A Solidity smart contract for running daily auctions where communities compete for Featured Community exposure slots.

## Features

- **Daily 24-hour Auctions**: New auction starts every day
- **3-Day Featured Rotation**: Winners get 3 days of featured placement
- **3 Visible Slots**: Newest winner at top, rotating down daily
- **No Pre-registration**: Community details submitted directly with bids
- **Admin Control**: Only admins can edit featured community metadata
- **UUPS Upgradeable**: Contract can be upgraded without losing state

## Simplified Flow

```
User places bid with (name, description, link) → Wins auction → Featured in Slot #1
                                                                        ↓
                                          Admin can edit metadata if needed
```

### Featured Slot Rotation

```
Day 1: Winner A → Slot #1
Day 2: Winner B → Slot #1, Winner A → Slot #2
Day 3: Winner C → Slot #1, Winner B → Slot #2, Winner A → Slot #3
Day 4: Winner D → Slot #1, Winner C → Slot #2, Winner B → Slot #3, Winner A rotates out
```

## Role Hierarchy

| Role | Capabilities |
|------|--------------|
| **Owner** | Add/remove admins, update treasury, pause/unpause, emergency functions, upgrade contract, all Admin privileges |
| **Admin** | Start auctions, edit featured community metadata (name, description, link), update bid settings |
| **User** | Place bids with community details, finalize ended auctions |

## Installation

```bash
npm install
cp .env.example .env
# Edit .env with your values
```

## Usage

```bash
# Compile
npm run compile

# Test
npm run test

# Deploy
npm run deploy:sepolia   # Testnet
npm run deploy:mainnet   # Mainnet

# Upgrade (set PROXY_ADDRESS in .env first)
npm run upgrade:sepolia
```

## Contract Functions

### Bidding

```solidity
// Place a bid with community details
function placeBid(
    string calldata _name,
    string calldata _description,
    string calldata _link
) external payable;
```

### Featured Community Management (Admin Only)

```solidity
// Update all metadata for a featured slot
function updateFeaturedCommunity(
    uint256 _slotIndex,        // 0, 1, or 2
    string calldata _name,
    string calldata _description,
    string calldata _link
) external;

// Update only the link
function updateFeaturedLink(uint256 _slotIndex, string calldata _link) external;
```

### Key View Functions

```solidity
// Get all 3 featured slots with full details
function getFeaturedSlots() external view returns (FeaturedSlot[3] memory);

// Get active featured communities
function getActiveFeatured() external view returns (
    string[3] memory names,
    string[3] memory descriptions,
    string[3] memory links,
    address[3] memory winners,
    bool[3] memory activeStatus
);

// Get current auction info
function getCurrentAuction() external view returns (...);

// Get minimum bid required
function getMinimumBid() external view returns (uint256);
```

## Events

```solidity
event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, string communityName, string communityLink);
event AuctionFinalized(uint256 indexed auctionId, address indexed winner, uint256 winningBid, string communityName);
event FeaturedCommunityUpdated(uint256 indexed slotIndex, uint256 indexed auctionId, string newName, string newDescription, string newLink);
event FeaturedSlotsRotated(uint256[3] auctionIds);
```

## Security Features

- ReentrancyGuard on all ETH transfers
- Pausable for emergencies
- UUPS upgradeable pattern
- Automatic refund of outbid users
- Custom errors for gas efficiency

## License

MIT