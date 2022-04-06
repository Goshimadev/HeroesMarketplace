// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "./Heroes.sol";
import "./HRSToken.sol";

contract Marketplace is Ownable, ERC721Holder {
    using SafeERC20 for IERC20;

    event Listing(address indexed seller, uint256 indexed tokenId, uint256 price);
    event Cancel(address indexed seller, uint256 indexed tokenId);
    event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    struct ListingInfo {
        address seller;
        uint256 price;
    }

    /**
      @dev Listings of tokens that available fot instant buy
      tokenId to listing info
     */
    mapping(uint256 => ListingInfo) private _directListings;

    ///@dev NFT's for sale
    Heroes public nftContract;

    ///@dev ERC20 token that accepted for payments
    IERC20 public paymentToken;

    constructor() {
        nftContract = new Heroes();
        paymentToken = new HRSToken();
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
     */
    function listingInfo(uint256 tokenId) public view returns (ListingInfo memory) {
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
}