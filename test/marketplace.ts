import { BlockForkEvent } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { Heroes, HRSToken } from "../typechain";
import { Marketplace } from "../typechain/Marketplace";

describe("Marketplace", function () {
    let clean: any;

    let marketplaceContract: Marketplace;
    let nftContract: Heroes;
    let paymentTokenContract: HRSToken;

    let owner: SignerWithAddress, seller: SignerWithAddress, buyer: SignerWithAddress, buyer2: SignerWithAddress;

    const TEST_TOKEN_URI = "test_token_uri";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const TOKEN_ID = 0;

    before(async () => {
        [owner, seller, buyer, buyer2] = await ethers.getSigners();

        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        marketplaceContract = await MarketplaceFactory.deploy();
        await marketplaceContract.deployed();

        nftContract = await ethers.getContractAt("Heroes", await marketplaceContract.nftContract());
        paymentTokenContract = await ethers.getContractAt("HRSToken", await marketplaceContract.paymentToken());

        clean = await network.provider.request({
            method: "evm_snapshot",
            params: [],
        });
    });

    afterEach(async () => {
        await network.provider.request({
            method: "evm_revert",
            params: [clean],
        });
        clean = await network.provider.request({
            method: "evm_snapshot",
            params: [],
        });
    });

    function mintNFT(minter: SignerWithAddress) {
        return marketplaceContract.connect(minter).createItem(TEST_TOKEN_URI);
    }

    async function networkWait(seconds: number) {
        await network.provider.request({
            method: "evm_increaseTime",
            params: [seconds],
        });
        await network.provider.request({
            method: "evm_mine",
            params: [],
        });
    }

    describe("Deploy", function () {
        it("Should set nft contract address", async () => {
            expect(await marketplaceContract.nftContract()).to.be.equal(nftContract.address);
        });
    });

    describe("#createItem()", function () {
        it("Should create new item", async () => {
            await mintNFT(owner);
            expect(await nftContract.ownerOf(TOKEN_ID)).to.be.equal(owner.address);
        });
    });

    describe("Direct listings", function () {
        const itemPrice = parseUnits("100");

        describe("#listItem()", function () {
            it("Should revert if try to list token with zero price", async () => {
                await expect(marketplaceContract.connect(seller).listItem(TOKEN_ID, 0)).to.be.revertedWith(
                    "Price must be greater then zero"
                );
            });

            it("Should list item for sell", async () => {
                //Mint and approve token
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);

                await expect(marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice))
                    // Check NFT listed
                    .to.emit(marketplaceContract, "Listing")
                    .withArgs(seller.address, TOKEN_ID, itemPrice)
                    // CHeck Nft transferred from selled to makeketplace
                    .and.emit(nftContract, "Transfer")
                    .withArgs(seller.address, marketplaceContract.address, TOKEN_ID);
                expect((await marketplaceContract.listingInfo(TOKEN_ID)).price).to.be.equal(itemPrice);
            });
        });

        describe("#cancel()", function () {
            it("Should fail when item not listed", async () => {
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await expect(marketplaceContract.connect(seller).cancel(TOKEN_ID)).to.be.revertedWith(
                    "Token not listed for sale"
                );
            });

            it("Should cancel listing", async () => {
                // List token
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice);

                await expect(marketplaceContract.connect(seller).cancel(TOKEN_ID))
                    // Check listing cancelled
                    .to.emit(marketplaceContract, "Cancel")
                    .withArgs(seller.address, TOKEN_ID)
                    // Check NFT returned to owner
                    .and.emit(nftContract, "Transfer")
                    .withArgs(marketplaceContract.address, seller.address, TOKEN_ID);
                await expect(marketplaceContract.listingInfo(TOKEN_ID)).to.be.revertedWith("Item not listed");
            });
        });

        describe("#buyItem()", async () => {
            it("Should sell item to buyer", async () => {
                // Mint approve and list token for sale
                await mintNFT(seller);
                await paymentTokenContract.mint(buyer.address, itemPrice);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await paymentTokenContract.connect(buyer).approve(marketplaceContract.address, itemPrice);
                await marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice);

                await expect(marketplaceContract.connect(buyer).buyItem(TOKEN_ID))
                    // Check item sold
                    .to.emit(marketplaceContract, "ItemSold")
                    .withArgs(TOKEN_ID, seller.address, buyer.address, itemPrice)
                    // Check nft transferred to buyer
                    .and.emit(nftContract, "Transfer")
                    .withArgs(marketplaceContract.address, buyer.address, TOKEN_ID)
                    // Check seller receive payment token
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(buyer.address, seller.address, itemPrice);
            });
        });
    });

    describe("Auction", function () {
        describe("#listItem()", function () {
            it("Should list item for sale", async () => {
                // Mint and approve token
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);

                // ??? check emit after transaction complited

                await expect(marketplaceContract.connect(seller).listItemOnAuction(TOKEN_ID))
                    // Check auction started
                    .to.emit(marketplaceContract, "AuctionStarted")
                    //.withArgs(TOKEN_ID, seller.address, ???block.Timestamp);
                    // Check nft deposited to marketplace
                    .and.emit(nftContract, "Transfer")
                    .withArgs(seller.address, marketplaceContract.address, TOKEN_ID);

                const auction = await marketplaceContract.auction(TOKEN_ID);
                expect(auction.seller).to.be.equal(seller.address);
            });
        });

        describe("#makeBid()", function () {
            const firstBidAmount = parseUnits("100");
            const secondBidAmount = parseUnits("200");

            async function mintAndListItem(seller: SignerWithAddress) {
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await marketplaceContract.connect(seller).listItemOnAuction(TOKEN_ID);
            }

            it("Should fail if there is no auction for this item", async () => {
                await expect(marketplaceContract.makeBid(TOKEN_ID, firstBidAmount)).to.be.revertedWith(
                    "No auctions for this item"
                );
            });

            it("Should fail if new bid not greater then current bid", async () => {
                await mintAndListItem(seller);

                await expect(marketplaceContract.connect(buyer).makeBid(TOKEN_ID, 0)).to.be.revertedWith(
                    "Bid amount must be greater than current bid"
                );
            });

            it("Should fail if auction ended", async () => {
                await mintAndListItem(seller);

                const duration = (await marketplaceContract.auctionDuration()).toNumber();
                await networkWait(duration);
                
                await expect(marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount)).to.be.revertedWith(
                    "Auction ended"
                );
            });

            it("Should accept bid", async () => {
                await mintAndListItem(seller);
                await paymentTokenContract.connect(buyer).mint(buyer.address, firstBidAmount);
                await paymentTokenContract.connect(buyer).approve(marketplaceContract.address, firstBidAmount);

                await expect(marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount))
                    // Check bid happen
                    .to.emit(marketplaceContract, "Bid")
                    .withArgs(TOKEN_ID, buyer.address, firstBidAmount)
                    // Check payment deposited
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(buyer.address, marketplaceContract.address, firstBidAmount);

                // Check that auction info updated
                const auction = await marketplaceContract.auction(TOKEN_ID);
                expect(auction.bidder).to.be.equal(buyer.address);
                expect(auction.currentBid).to.be.equal(firstBidAmount);
                expect(auction.bidsCount).to.be.equal(1);
            });

            it("Should replace bid of previous bidder", async () => {
                await mintAndListItem(seller);

                // Approve and make 1st bid
                await paymentTokenContract.connect(buyer).mint(buyer.address, firstBidAmount);
                await paymentTokenContract.connect(buyer).approve(marketplaceContract.address, firstBidAmount);
                await marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount);

                // Approve and make 2nd bid
                await paymentTokenContract.connect(buyer2).mint(buyer2.address, secondBidAmount);
                await paymentTokenContract.connect(buyer2).approve(marketplaceContract.address, secondBidAmount);
                await expect(marketplaceContract.connect(buyer2).makeBid(TOKEN_ID, secondBidAmount))
                    // Check bid happen
                    .to.emit(marketplaceContract, "Bid")
                    .withArgs(TOKEN_ID, buyer2.address, secondBidAmount)
                    // Check payment deposited
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(buyer2.address, marketplaceContract.address, firstBidAmount)
                    // Check that contract return deposit to 1st bidder
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(marketplaceContract.address, buyer.address, firstBidAmount);

                // Check that auction info updated
                const auction = await marketplaceContract.auction(TOKEN_ID);
                expect(auction.bidder).to.be.equal(buyer2.address);
                expect(auction.currentBid).to.be.equal(secondBidAmount);
                expect(auction.bidsCount).to.be.equal(2);
            });
        });
    });
});
