// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AuctionSystem
 * @notice Slot-based auction where top 3 bidders win
 * @dev Uses OpenZeppelin Ownable & ReentrancyGuard
 */
contract AuctionSystem is Ownable, ReentrancyGuard {
    // ============ Structs ============

    struct Slot {
        address winner;
        uint256 bidAmount;
        string name;
        string description;
        string metadata;
    }

    struct Bidder {
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }

    // ============ State Variables ============

    uint256 public auctionStartTime;
    uint256 public auctionEndTime;
    uint256 public minimumBidAmount;
    uint256 public currentAuctionId;

    mapping(uint256 => Slot[3]) public auctionSlots;
    mapping(uint256 => Bidder[]) public auctionBidders;
    mapping(uint256 => mapping(address => uint256)) public bidderTotalAmount;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => bool) public auctionFinalized;

    // ============ Events ============

    event AuctionCreated(uint256 indexed auctionId, uint256 start, uint256 end, uint256 minBid);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionFinalized(uint256 indexed auctionId, address[3] winners, uint256[3] amounts);
    event RefundClaimed(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event SlotMetadataUpdated(uint256 indexed auctionId, uint256 slotIndex);

    // ============ Modifiers ============

    modifier auctionActive() {
        require(block.timestamp >= auctionStartTime, "Auction not started");
        require(block.timestamp <= auctionEndTime, "Auction ended");
        _;
    }

    modifier auctionEnded() {
        require(block.timestamp > auctionEndTime, "Auction ongoing");
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {
        minimumBidAmount = 0.000001 ether;
    }

    // ============ Admin Functions ============

    function createAuction(
        uint256 _start,
        uint256 _end,
        uint256 _minBid
    ) external onlyOwner {
        require(_start < _end, "Invalid time range");
        require(_end > block.timestamp, "End must be future");
        require(_minBid > 0, "Min bid zero");

        currentAuctionId++;
        auctionStartTime = _start;
        auctionEndTime = _end;
        minimumBidAmount = _minBid;

        emit AuctionCreated(currentAuctionId, _start, _end, _minBid);
    }

    function finalizeAuction() external onlyOwner auctionEnded {
        require(!auctionFinalized[currentAuctionId], "Already finalized");

        (address[3] memory winners, uint256[3] memory amounts) = getTopBidders();

        for (uint256 i = 0; i < 3; i++) {
            auctionSlots[currentAuctionId][i] = Slot({
                winner: winners[i],
                bidAmount: amounts[i],
                name: "",
                description: "",
                metadata: ""
            });
        }

        auctionFinalized[currentAuctionId] = true;

        emit AuctionFinalized(currentAuctionId, winners, amounts);
    }

    function updateSlotMetadata(
        uint256 slot,
        string calldata name,
        string calldata description,
        string calldata metadata
    ) external onlyOwner auctionEnded {
        require(slot < 3, "Invalid slot");
        require(auctionFinalized[currentAuctionId], "Not finalized");

        Slot storage s = auctionSlots[currentAuctionId][slot];
        require(msg.sender == s.winner, "Not winner");
        s.name = name;
        s.description = description;
        s.metadata = metadata;

        emit SlotMetadataUpdated(currentAuctionId, slot);
    }

    function withdrawWinningBids() external onlyOwner nonReentrant {
        require(auctionFinalized[currentAuctionId], "Not finalized");

        uint256 total;
        for (uint256 i = 0; i < 3; i++) {
            total += auctionSlots[currentAuctionId][i].bidAmount;
        }

        require(total > 0, "Nothing to withdraw");

        (bool ok, ) = owner().call{value: total}("");
        require(ok, "ETH transfer failed");
    }

    // ============ Public Functions ============

    function placeBid() external payable auctionActive nonReentrant {
        require(msg.value >= minimumBidAmount, "Below minimum");

        bidderTotalAmount[currentAuctionId][msg.sender] += msg.value;

        auctionBidders[currentAuctionId].push(
            Bidder(msg.sender, msg.value, block.timestamp)
        );

        emit BidPlaced(currentAuctionId, msg.sender, msg.value);
    }

    function claimRefund() external auctionEnded nonReentrant {
        require(auctionFinalized[currentAuctionId], "Not finalized");
        require(!refunded[currentAuctionId][msg.sender], "Already refunded");

        uint256 amount = bidderTotalAmount[currentAuctionId][msg.sender];
        require(amount > 0, "Nothing to refund");

        // winners cannot refund
        for (uint256 i = 0; i < 3; i++) {
            require(
                auctionSlots[currentAuctionId][i].winner != msg.sender,
                "Winner"
            );
        }

        refunded[currentAuctionId][msg.sender] = true;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Refund failed");

        emit RefundClaimed(currentAuctionId, msg.sender, amount);
    }

    // ============ View Functions ============

    function getTopBidders()
        public
        view
        returns (address[3] memory winners, uint256[3] memory amounts)
    {
        Bidder[] memory bids = auctionBidders[currentAuctionId];

        address[] memory seen = new address[](bids.length);
        uint256[] memory totals = new uint256[](bids.length);
        uint256 count;

        for (uint256 i = 0; i < bids.length; i++) {
            address b = bids[i].bidder;
            bool exists;

            for (uint256 j = 0; j < count; j++) {
                if (seen[j] == b) {
                    exists = true;
                    break;
                }
            }

            if (!exists) {
                seen[count] = b;
                totals[count] = bidderTotalAmount[currentAuctionId][b];
                count++;
            }
        }

        for (uint256 i = 0; i < 3 && i < count; i++) {
            uint256 max = i;
            for (uint256 j = i + 1; j < count; j++) {
                if (totals[j] > totals[max]) max = j;
            }
            (totals[i], totals[max]) = (totals[max], totals[i]);
            (seen[i], seen[max]) = (seen[max], seen[i]);

            winners[i] = seen[i];
            amounts[i] = totals[i];
        }
    }

    function getRemainingTime() external view returns (uint256) {
        if (block.timestamp >= auctionEndTime) return 0;
        return auctionEndTime - block.timestamp;
    }

    function getBidderTotalAmount(address bidder) external view returns (uint256) {
    return bidderTotalAmount[currentAuctionId][bidder];
    }

    function getCurrentAuctionSlots() external view returns (Slot[3] memory slots) {
        slots = auctionSlots[currentAuctionId];
    }

    receive() external payable {}
}