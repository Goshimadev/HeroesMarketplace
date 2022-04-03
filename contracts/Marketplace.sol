// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Heroes.sol";

contract Marketplace is Ownable, IERC721Receiver {
    event NewListing(uint256 tokenId, uint256 price);

    /**
      @dev Tokens that available for sale
      Key - tokenId, value - price
     */
    mapping(uint256 => uint256) public listings;

    Heroes public nftContract;

    /**
      @param contractAddress address of Heroes contract
     */
    constructor(Heroes contractAddress) {
        nftContract = contractAddress;
    }

    /**
      @dev Mint new token
     */
    function createItem(string memory uri) external onlyOwner {
        nftContract.safeMint(address(this), uri);
    }

    /**
    @dev See {IERC721Receiver-onERC721Received}
    */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
      
        return IERC721Receiver.onERC721Received.selector;
    }
}
