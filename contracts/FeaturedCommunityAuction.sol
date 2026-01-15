// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title FeaturedCommunityAuction
 * @notice Daily auction system for Featured Community slots with 3-day rotation
 * @dev Simplified: No pre-registration - community details submitted with bids
 * 
 * Key Features:
 * - Daily 24-hour auctions
 * - 3 featured slots with automatic rotation
 * - Community details attached directly to bids
 * - Only admins can edit featured community metadata
 * - Owner manages admins
 */
contract FeaturedCommunityAuction is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    // ============ Constants ============
    uint256 public constant AUCTION_DURATION = 24 hours;
    uint256 public constant FEATURED_DURATION = 3 days;
    uint256 public constant MAX_FEATURED_SLOTS = 3;

    // ============ Structs ============
    
    /**
     * @notice Community details attached to bids
     */
    struct CommunityInfo {
        string name;
        string description;
        string link;
    }

    /**
     * @notice Bid structure
     */
    struct Bid {
        address bidder;
        uint256 amount;
        CommunityInfo community;
        uint256 timestamp;
    }

    /**
     * @notice Auction structure
     */
    struct Auction {
        uint256 auctionId;
        uint256 startTime;
        uint256 endTime;
        uint256 highestBid;
        address highestBidder;
        CommunityInfo winningCommunity;
        bool finalized;
        uint256 totalBids;
    }

    /**
     * @notice Featured slot structure
     */
    struct FeaturedSlot {
        uint256 auctionId;
        address winner;
        uint256 winningBid;
        CommunityInfo community;
        uint256 startTime;
        uint256 endTime;
        bool active;
    }

    // ============ State Variables ============
    
    // Admin management
    mapping(address => bool) private _admins;
    address[] private _adminList;

    // Auctions
    mapping(uint256 => Auction) public auctions;
    uint256 public currentAuctionId;
    
    // Bids per auction: auctionId => array of bids
    mapping(uint256 => Bid[]) private _auctionBids;

    // Featured slots (index 0 = newest winner at top)
    FeaturedSlot[3] public featuredSlots;

    // Auction settings
    uint256 public minimumBidPrice;
    uint256 public bidIncrement;

    // Treasury
    address public treasury;

    // ============ Events ============
    
    event AdminAdded(address indexed admin, address indexed addedBy);
    event AdminRemoved(address indexed admin, address indexed removedBy);
    
    event AuctionStarted(uint256 indexed auctionId, uint256 startTime, uint256 endTime);
    event BidPlaced(
        uint256 indexed auctionId, 
        address indexed bidder, 
        uint256 amount, 
        string communityName,
        string communityLink
    );
    event BidOutbid(
        uint256 indexed auctionId, 
        address indexed previousBidder, 
        address indexed newBidder, 
        uint256 previousAmount, 
        uint256 newAmount
    );
    event AuctionFinalized(
        uint256 indexed auctionId, 
        address indexed winner, 
        uint256 winningBid, 
        string communityName
    );
    
    event FeaturedCommunityUpdated(
        uint256 indexed slotIndex, 
        uint256 indexed auctionId, 
        string newName, 
        string newDescription, 
        string newLink
    );
    event FeaturedSlotsRotated(uint256[3] auctionIds);
    
    event MinimumBidPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BidIncrementUpdated(uint256 oldIncrement, uint256 newIncrement);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    
    event FundsWithdrawn(address indexed to, uint256 amount);
    event RefundIssued(address indexed to, uint256 amount, uint256 auctionId);

    // ============ Errors ============
    
    error NotAdmin();
    error InvalidAddress();
    error InvalidAmount();
    error AuctionNotActive();
    error AuctionStillActive();
    error AuctionAlreadyFinalized();
    error BidTooLow();
    error AlreadyAdmin();
    error NotAnAdmin();
    error CannotRemoveOwner();
    error NoActiveAuction();
    error TransferFailed();
    error EmptyString();
    error InvalidSlotIndex();

    // ============ Modifiers ============
    
    modifier onlyAdmin() {
        if (!_admins[msg.sender] && msg.sender != owner()) {
            revert NotAdmin();
        }
        _;
    }

    // ============ Initializer ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract
     * @param _treasury Address to receive auction proceeds
     * @param _minimumBidPrice Minimum bid price in wei
     * @param _bidIncrement Minimum increment for new bids
     */
    function initialize(
        address _treasury,
        uint256 _minimumBidPrice,
        uint256 _bidIncrement
    ) public initializer {
        if (_treasury == address(0)) revert InvalidAddress();
        
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        treasury = _treasury;
        minimumBidPrice = _minimumBidPrice;
        bidIncrement = _bidIncrement;

        // Owner is automatically an admin
        _admins[msg.sender] = true;
        _adminList.push(msg.sender);

        emit AdminAdded(msg.sender, msg.sender);
    }

    // ============ Admin Management ============
    
    /**
     * @notice Adds a new admin (Owner only)
     */
    function addAdmin(address _admin) external onlyOwner {
        if (_admin == address(0)) revert InvalidAddress();
        if (_admins[_admin]) revert AlreadyAdmin();

        _admins[_admin] = true;
        _adminList.push(_admin);

        emit AdminAdded(_admin, msg.sender);
    }

    /**
     * @notice Removes an admin (Owner only)
     */
    function removeAdmin(address _admin) external onlyOwner {
        if (_admin == owner()) revert CannotRemoveOwner();
        if (!_admins[_admin]) revert NotAnAdmin();

        _admins[_admin] = false;
        
        for (uint256 i = 0; i < _adminList.length; i++) {
            if (_adminList[i] == _admin) {
                _adminList[i] = _adminList[_adminList.length - 1];
                _adminList.pop();
                break;
            }
        }

        emit AdminRemoved(_admin, msg.sender);
    }

    /**
     * @notice Checks if an address is an admin
     */
    function isAdmin(address _account) external view returns (bool) {
        return _admins[_account] || _account == owner();
    }

    /**
     * @notice Returns all admin addresses
     */
    function getAdmins() external view returns (address[] memory) {
        return _adminList;
    }

    // ============ Auction Management ============
    
    /**
     * @notice Starts a new auction (Admin only)
     */
    function startAuction() external onlyAdmin whenNotPaused {
        if (currentAuctionId > 0) {
            Auction storage currentAuction = auctions[currentAuctionId];
            if (block.timestamp < currentAuction.endTime && !currentAuction.finalized) {
                revert AuctionStillActive();
            }
            if (!currentAuction.finalized) {
                revert AuctionStillActive();
            }
        }

        uint256 newAuctionId = ++currentAuctionId;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + AUCTION_DURATION;

        Auction storage newAuction = auctions[newAuctionId];
        newAuction.auctionId = newAuctionId;
        newAuction.startTime = startTime;
        newAuction.endTime = endTime;

        emit AuctionStarted(newAuctionId, startTime, endTime);
    }

    /**
     * @notice Places a bid with community details
     * @param _name Community name
     * @param _description Community description
     * @param _link Community link/URL
     */
    function placeBid(
        string calldata _name,
        string calldata _description,
        string calldata _link
    ) external payable nonReentrant whenNotPaused {
        if (currentAuctionId == 0) revert NoActiveAuction();
        if (bytes(_name).length == 0) revert EmptyString();
        if (bytes(_link).length == 0) revert EmptyString();
        
        Auction storage auction = auctions[currentAuctionId];
        
        if (block.timestamp < auction.startTime || block.timestamp >= auction.endTime) {
            revert AuctionNotActive();
        }

        uint256 minRequired = auction.highestBid == 0 
            ? minimumBidPrice 
            : auction.highestBid + bidIncrement;

        if (msg.value < minRequired) revert BidTooLow();

        // Refund previous highest bidder
        address previousBidder = auction.highestBidder;
        uint256 previousBid = auction.highestBid;
        
        if (previousBidder != address(0) && previousBid > 0) {
            (bool success, ) = previousBidder.call{value: previousBid}("");
            if (!success) revert TransferFailed();
            emit RefundIssued(previousBidder, previousBid, currentAuctionId);
            emit BidOutbid(currentAuctionId, previousBidder, msg.sender, previousBid, msg.value);
        }

        // Update auction state
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;
        auction.winningCommunity = CommunityInfo({
            name: _name,
            description: _description,
            link: _link
        });
        auction.totalBids++;

        // Record bid history
        _auctionBids[currentAuctionId].push(Bid({
            bidder: msg.sender,
            amount: msg.value,
            community: CommunityInfo({
                name: _name,
                description: _description,
                link: _link
            }),
            timestamp: block.timestamp
        }));

        emit BidPlaced(currentAuctionId, msg.sender, msg.value, _name, _link);
    }

    /**
     * @notice Finalizes the current auction and updates featured slots
     */
    function finalizeAuction() external nonReentrant whenNotPaused {
        if (currentAuctionId == 0) revert NoActiveAuction();
        
        Auction storage auction = auctions[currentAuctionId];
        
        if (block.timestamp < auction.endTime) revert AuctionStillActive();
        if (auction.finalized) revert AuctionAlreadyFinalized();

        auction.finalized = true;

        if (auction.highestBidder != address(0)) {
            // Transfer winning bid to treasury
            (bool success, ) = treasury.call{value: auction.highestBid}("");
            if (!success) revert TransferFailed();

            // Rotate featured slots
            featuredSlots[2] = featuredSlots[1];
            featuredSlots[1] = featuredSlots[0];

            // Add new winner to top slot
            featuredSlots[0] = FeaturedSlot({
                auctionId: currentAuctionId,
                winner: auction.highestBidder,
                winningBid: auction.highestBid,
                community: auction.winningCommunity,
                startTime: block.timestamp,
                endTime: block.timestamp + FEATURED_DURATION,
                active: true
            });

            _updateSlotStatus();

            emit FeaturedSlotsRotated([
                featuredSlots[0].auctionId,
                featuredSlots[1].auctionId,
                featuredSlots[2].auctionId
            ]);
        }

        emit AuctionFinalized(
            currentAuctionId,
            auction.highestBidder,
            auction.highestBid,
            auction.winningCommunity.name
        );
    }

    /**
     * @notice Updates slot status based on time
     */
    function _updateSlotStatus() internal {
        for (uint256 i = 0; i < MAX_FEATURED_SLOTS; i++) {
            if (featuredSlots[i].endTime > 0 && block.timestamp >= featuredSlots[i].endTime) {
                featuredSlots[i].active = false;
            }
        }
    }

    // ============ Featured Slot Management (Admin Only) ============
    
    /**
     * @notice Updates featured community metadata (Admin only)
     * @param _slotIndex Slot index (0, 1, or 2)
     * @param _name New community name
     * @param _description New community description
     * @param _link New community link
     */
    function updateFeaturedCommunity(
        uint256 _slotIndex,
        string calldata _name,
        string calldata _description,
        string calldata _link
    ) external onlyAdmin {
        if (_slotIndex >= MAX_FEATURED_SLOTS) revert InvalidSlotIndex();
        if (bytes(_name).length == 0) revert EmptyString();
        if (bytes(_link).length == 0) revert EmptyString();

        featuredSlots[_slotIndex].community = CommunityInfo({
            name: _name,
            description: _description,
            link: _link
        });

        emit FeaturedCommunityUpdated(
            _slotIndex,
            featuredSlots[_slotIndex].auctionId,
            _name,
            _description,
            _link
        );
    }

    /**
     * @notice Updates only the link of a featured community (Admin only)
     */
    function updateFeaturedLink(uint256 _slotIndex, string calldata _link) external onlyAdmin {
        if (_slotIndex >= MAX_FEATURED_SLOTS) revert InvalidSlotIndex();
        if (bytes(_link).length == 0) revert EmptyString();

        featuredSlots[_slotIndex].community.link = _link;

        emit FeaturedCommunityUpdated(
            _slotIndex,
            featuredSlots[_slotIndex].auctionId,
            featuredSlots[_slotIndex].community.name,
            featuredSlots[_slotIndex].community.description,
            _link
        );
    }

    // ============ View Functions ============
    
    /**
     * @notice Gets all featured slots
     */
    function getFeaturedSlots() external view returns (FeaturedSlot[3] memory) {
        return featuredSlots;
    }

    /**
     * @notice Gets active featured communities with details
     */
    function getActiveFeatured() external view returns (
        string[3] memory names,
        string[3] memory descriptions,
        string[3] memory links,
        address[3] memory winners,
        bool[3] memory activeStatus
    ) {
        for (uint256 i = 0; i < MAX_FEATURED_SLOTS; i++) {
            bool isActive = featuredSlots[i].active && 
                           featuredSlots[i].auctionId > 0 && 
                           block.timestamp < featuredSlots[i].endTime;
            
            if (isActive) {
                names[i] = featuredSlots[i].community.name;
                descriptions[i] = featuredSlots[i].community.description;
                links[i] = featuredSlots[i].community.link;
                winners[i] = featuredSlots[i].winner;
            }
            activeStatus[i] = isActive;
        }
    }

    /**
     * @notice Gets current auction details
     */
    function getCurrentAuction() external view returns (
        uint256 auctionId,
        uint256 startTime,
        uint256 endTime,
        uint256 highestBid,
        address highestBidder,
        string memory leadingCommunityName,
        string memory leadingCommunityLink,
        bool finalized,
        uint256 totalBids
    ) {
        if (currentAuctionId == 0) revert NoActiveAuction();
        Auction storage auction = auctions[currentAuctionId];
        
        return (
            auction.auctionId,
            auction.startTime,
            auction.endTime,
            auction.highestBid,
            auction.highestBidder,
            auction.winningCommunity.name,
            auction.winningCommunity.link,
            auction.finalized,
            auction.totalBids
        );
    }

    /**
     * @notice Checks if auction is active
     */
    function isAuctionActive() external view returns (bool) {
        if (currentAuctionId == 0) return false;
        Auction storage auction = auctions[currentAuctionId];
        return block.timestamp >= auction.startTime && 
               block.timestamp < auction.endTime && 
               !auction.finalized;
    }

    /**
     * @notice Gets time remaining in current auction
     */
    function getTimeRemaining() external view returns (uint256) {
        if (currentAuctionId == 0) return 0;
        Auction storage auction = auctions[currentAuctionId];
        if (block.timestamp >= auction.endTime) return 0;
        return auction.endTime - block.timestamp;
    }

    /**
     * @notice Gets minimum bid amount for current auction
     */
    function getMinimumBid() external view returns (uint256) {
        if (currentAuctionId == 0) return minimumBidPrice;
        Auction storage auction = auctions[currentAuctionId];
        if (auction.highestBid == 0) return minimumBidPrice;
        return auction.highestBid + bidIncrement;
    }

    /**
     * @notice Gets all bids for an auction
     */
    function getAuctionBids(uint256 _auctionId) external view returns (Bid[] memory) {
        return _auctionBids[_auctionId];
    }

    /**
     * @notice Gets bid count for current auction
     */
    function getCurrentBidCount() external view returns (uint256) {
        if (currentAuctionId == 0) return 0;
        return _auctionBids[currentAuctionId].length;
    }

    /**
     * @notice Refreshes featured slot status
     */
    function refreshFeaturedSlots() external {
        _updateSlotStatus();
    }

    // ============ Settings (Admin Only) ============
    
    function setMinimumBidPrice(uint256 _newPrice) external onlyAdmin {
        uint256 oldPrice = minimumBidPrice;
        minimumBidPrice = _newPrice;
        emit MinimumBidPriceUpdated(oldPrice, _newPrice);
    }

    function setBidIncrement(uint256 _newIncrement) external onlyAdmin {
        uint256 oldIncrement = bidIncrement;
        bidIncrement = _newIncrement;
        emit BidIncrementUpdated(oldIncrement, _newIncrement);
    }

    function setTreasury(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }

    // ============ Emergency Functions ============
    
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address _to, uint256 _amount) external onlyOwner {
        if (_to == address(0)) revert InvalidAddress();
        if (_amount > address(this).balance) revert InvalidAmount();
        
        (bool success, ) = _to.call{value: _amount}("");
        if (!success) revert TransferFailed();
        
        emit FundsWithdrawn(_to, _amount);
    }

    function emergencyFinalizeAuction(uint256 _auctionId) external onlyOwner {
        Auction storage auction = auctions[_auctionId];
        if (auction.finalized) revert AuctionAlreadyFinalized();
        
        auction.finalized = true;
        
        if (auction.highestBidder != address(0) && auction.highestBid > 0) {
            (bool success, ) = auction.highestBidder.call{value: auction.highestBid}("");
            if (!success) revert TransferFailed();
            emit RefundIssued(auction.highestBidder, auction.highestBid, _auctionId);
        }
    }

    // ============ UUPS Upgrade ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function version() external pure returns (string memory) {
        return "2.0.0";
    }

    // ============ Receive ============
    
    receive() external payable {}
}
