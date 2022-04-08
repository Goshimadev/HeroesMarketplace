// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Heroes.sol";
import "./HRSToken.sol";

contract Marketplace is Ownable, ERC721Holder {
    using SafeERC20 for IERC20;

    /// Listing events
    event Listing(address indexed seller, uint256 indexed tokenId, uint256 price);
    event Cancel(address indexed seller, uint256 indexed tokenId);
    event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    /// Auction events
    event AuctionStarted(uint256 indexed tokenId, address indexed seller, uint256 startTime);
    event Bid(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionFinished(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 finalPrice);
    event AuctionCancelled(uint256 indexed tokenId, address indexed seller);

    struct ListingInfo {
        address seller;
        uint256 price;
    }

    /**
        @dev Auction info
     */
    struct Auction {
        address seller; /// seller address
        address bidder; /// bidder address
        uint256 currentBid; /// bidder offer size
        uint256 startedAt; /// auction start time
        uint256 bidsCount; /// total bids count for this auction
    }

    uint256 public auctionDuration = 3 days;
    uint256 public minBids = 2;

    ///@dev NFT's for sale
    Heroes public nftContract;
    ///@dev ERC20 token that accepted for payments
    IERC20 public paymentToken;

    /**
      @dev Listings of tokens that available fot instant buy
      tokenId to listing info
     */
    mapping(uint256 => ListingInfo) private _directListings;

    /**
        @dev TokenId to Auction
     */
    mapping(uint256 => Auction) private _auctions;

    constructor() {
        nftContract = new Heroes();
        paymentToken = new HRSToken();
    }

    function setAuctionDuration(uint256 duration) external onlyOwner {
        require(duration > 0, "Auction duration can not be 0");
        auctionDuration = duration;
    }

    function setMinBids(uint256 _minBids) external onlyOwner {
        minBids = _minBids;
    }

    /**
      @dev Mint new token
     */
    function createItem(string memory uri) external {
        nftContract.safeMint(msg.sender, uri);
    }

    /**
        @dev Return info about token listing
        @param tokenId Id of token
        @return listing info
     */
    function listingInfo(uint256 tokenId) external view returns (ListingInfo memory) {
        ListingInfo memory listing = _directListings[tokenId];
        require(listing.price > 0, "Item not listed");
        return listing;
    }

    /**
        @dev List token on marketplace for direct sell
        @param tokenId Token for sale
        @param price Price of item in HRS tokens
     */
    function listItem(uint256 tokenId, uint256 price) external {
        require(price > 0, "Price must be greater then zero");
        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);
        _directListings[tokenId] = ListingInfo(msg.sender, price);
        emit Listing(msg.sender, tokenId, price);
    }

    /**
        @dev Cancel token from direct listing
        @param tokenId Id of token that listing must be calcelled
     */
    function cancel(uint256 tokenId) external {
        _checkIsTokenListed(tokenId);
        require(_directListings[tokenId].seller == msg.sender, "Only seller can cancel auction");
        delete _directListings[tokenId];

        nftContract.safeTransferFrom(address(this), msg.sender, tokenId);
        emit Cancel(msg.sender, tokenId);
    }

    /**
        @dev Buy token from direct listing
        @param tokenId item to buy
     */
    function buyItem(uint256 tokenId) external {
        _checkIsTokenListed(tokenId);

        ListingInfo memory listing = _directListings[tokenId];
        delete _directListings[tokenId];

        nftContract.safeTransferFrom(address(this), msg.sender, tokenId);
        paymentToken.safeTransferFrom(msg.sender, listing.seller, listing.price);

        emit ItemSold(tokenId, listing.seller, msg.sender, listing.price);
    }

    function _checkIsTokenListed(uint256 tokenId) private view {
        require(_directListings[tokenId].price != 0, "Token not listed for sale");
    }

    /**
        @dev Get info abount ongoing auction
        @param tokenId id of token of ongoing auction
     */
    function auction(uint256 tokenId) public view returns (Auction memory) {
        Auction memory _auction = _auctions[tokenId];
        require(_auction.seller != address(0), "No auctions for this item");
        return _auction;
    }

    /**
        @dev List item on auction
     */
    function listItemOnAuction(uint256 tokenId) external {
        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);
        _auctions[tokenId] = Auction({
            seller: msg.sender,
            bidder: address(0),
            currentBid: 0,
            startedAt: block.timestamp,
            bidsCount: 0
        });
        emit AuctionStarted({ tokenId: tokenId, seller: msg.sender, startTime: block.timestamp });
    }

    /**
        @dev Make bid for auction
        @param tokenId item to buy
        @param bidAmount new bid price for auction
     */
    function makeBid(uint256 tokenId, uint256 bidAmount) external {
        Auction memory _auction = auction(tokenId);
        require(bidAmount > _auction.currentBid, "Bid amount must be greater than current bid");
        require(block.timestamp < _auction.startedAt + auctionDuration, "Auction ended");

        //return funds to previous bidder
        if (_auction.currentBid > 0) {
            paymentToken.safeTransfer(_auction.bidder, _auction.currentBid);
        }

        paymentToken.safeTransferFrom(msg.sender, address(this), bidAmount);

        _auction.bidder = msg.sender;
        _auction.currentBid = bidAmount;
        _auction.bidsCount++;

        _auctions[tokenId] = _auction;

        emit Bid({ tokenId: tokenId, bidder: msg.sender, amount: bidAmount });
    }

    function finishAuction(uint256 tokenId) external {
        Auction memory _auction = auction(tokenId);
        require(block.timestamp > _auction.startedAt + auctionDuration, "Auction still in progress");

        if (_auction.bidsCount > minBids) {
            nftContract.safeTransferFrom(address(this), _auction.bidder, tokenId);
            paymentToken.safeTransfer(_auction.seller, _auction.currentBid);
            emit AuctionFinished(tokenId, _auction.seller, _auction.bidder, _auction.currentBid);
        } else {
            nftContract.safeTransferFrom(address(this), _auction.seller, tokenId);
            if (_auction.currentBid > 0) {
                paymentToken.safeTransfer(_auction.bidder, _auction.currentBid);
            }
            emit AuctionCancelled(tokenId, _auction.seller);
        }

        delete _auctions[tokenId];
    }
}
