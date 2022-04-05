// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./Heroes.sol";

contract Marketplace is Ownable, ERC721Holder {
    event Listing(address indexed seller, uint256 indexed tokenId, uint256 price);
    event Cancel(address indexed seller, uint256 indexed tokenId);

    /**
      @dev Listings of tokens that available fot instant buy
      Mapping of Addresses and their listings (tokenId to price)
     */
    mapping(address => mapping(uint256 => uint256)) private _directListings;

    Heroes public nftContract;

    constructor() {
        address heroesAddress = Create2.deploy(0, 0x0000000000000000000000000000000000000000000000000000000000000001, type(Heroes).creationCode);
        nftContract = Heroes(heroesAddress);
    }

    /**
      @dev Mint new token
     */
    function createItem(string memory uri) external {
        nftContract.safeMint(msg.sender, uri);
    }

    function listingPrice(address seller, uint256 tokenId) public view returns (uint256) {
        uint256 price = _directListings[seller][tokenId];
        require(price > 0, "Item not listed");
        return price;
    }

    /**
        @dev List token on marketplace for direct sell
        @param tokenId Token for sale
        @param price Price of item in HRS tokens
     */
    function listItem(uint256 tokenId, uint256 price) external {
        require(price > 0, "Price must be greater then zero");
        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);
        _directListings[msg.sender][tokenId] = price;
        emit Listing(msg.sender, tokenId, price);
    }

    /**
        @dev Cancel token from direct listing
        @param tokenId Id of token that listing must be calcelled
     */
    function cancel(uint256 tokenId) external {
        require(_directListings[msg.sender][tokenId] != 0, "Token not listed for sale");
        delete _directListings[msg.sender][tokenId];
        nftContract.safeTransferFrom(address(this), msg.sender, tokenId);
        emit Cancel(msg.sender, tokenId);
    }
}
