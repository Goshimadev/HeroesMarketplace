import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { Heroes, HRSToken } from "../typechain";
import { Marketplace } from "../typechain/Marketplace";

describe("Marketplace", function () {
    let clean: any;

    let marketplaceContract: Marketplace;
    let nftContract: Heroes;
    let paymentTokenContract: HRSToken;

    let owner: SignerWithAddress,
        seller: SignerWithAddress,
        buyer: SignerWithAddress,
        buyer2: SignerWithAddress,
        buyer3: SignerWithAddress;

    const TEST_TOKEN_URI = "https://gateway.pinata.cloud/ipfs/QmcrrUjqWbUAKhqC84W2Bb6aGpbB7K4WWuYTwzgKZbgzSD";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const TOKEN_ID = 0;

    before(async () => {
        [owner, seller, buyer, buyer2, buyer3] = await ethers.getSigners();

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

    describe("Common methods", function () {
        describe("#createItem()", function () {
            it("Should create new item", async () => {
                await mintNFT(owner);
                expect(await nftContract.ownerOf(TOKEN_ID)).to.be.equal(owner.address);
            });
        });

        describe("#setAuctionDuration()", function () {
            it("Should set new duration", async () => {
                const duration = 60;
                await marketplaceContract.setAuctionDuration(duration);

                expect(await marketplaceContract.auctionDuration()).to.be.equal(duration);
            });

            it("Should be reverted if duration equal to zero", async () => {
                await expect(marketplaceContract.setAuctionDuration(0)).to.be.revertedWith(
                    "Auction duration can not be 0"
                );
            });

            it("Only owner", async () => {
                await expect(marketplaceContract.connect(buyer).setAuctionDuration(60)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });
        });

        describe("#setMinBids()", function () {
            it("Should set min bids count", async () => {
                const count = 5;
                await marketplaceContract.setMinBids(count);

                expect(await marketplaceContract.minBids()).to.be.equal(count);
            });

            it("Only owner", async () => {
                await expect(marketplaceContract.connect(buyer).setMinBids(1)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });
        });
    });

    describe("Direct listing", function () {
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
                
                // TODO test multiple events throught tx receipt and logs
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

            it("Should fail when not seller try to cancel auction", async () => {
                // List token
                await mintNFT(seller);
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice);

                await expect(marketplaceContract.connect(buyer).cancel(TOKEN_ID)).to.be.revertedWith(
                    "Only seller can cancel auction"
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
                await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice);
                await paymentTokenContract.mint(buyer.address, itemPrice);
                await paymentTokenContract.connect(buyer).approve(marketplaceContract.address, itemPrice);

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
        const firstBidAmount = parseUnits("100");
        const secondBidAmount = parseUnits("200");
        const thirdBidAmount = parseUnits("300");

        async function mintAndListItem(seller: SignerWithAddress) {
            await mintNFT(seller);
            await nftContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
            await marketplaceContract.connect(seller).listItemOnAuction(TOKEN_ID);
        }

        async function mintTokensAndApproveSpend(user: SignerWithAddress, amount: BigNumber) {
            await paymentTokenContract.connect(user).mint(user.address, amount);
            await paymentTokenContract.connect(user).approve(marketplaceContract.address, amount);
        }

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
                await mintTokensAndApproveSpend(buyer, firstBidAmount);

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
                await mintTokensAndApproveSpend(buyer, firstBidAmount);
                await marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount);

                // Approve and make 2nd bid
                await mintTokensAndApproveSpend(buyer2, secondBidAmount);
                await expect(marketplaceContract.connect(buyer2).makeBid(TOKEN_ID, secondBidAmount))
                    // Check bid happen
                    .to.emit(marketplaceContract, "Bid")
                    .withArgs(TOKEN_ID, buyer2.address, secondBidAmount)
                    // Check payment deposited
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(buyer2.address, marketplaceContract.address, firstBidAmount)
                    // Check that contract return deposit to previous bidder
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(marketplaceContract.address, buyer.address, firstBidAmount);

                // Check that auction info updated
                const auction = await marketplaceContract.auction(TOKEN_ID);
                expect(auction.bidder).to.be.equal(buyer2.address);
                expect(auction.currentBid).to.be.equal(secondBidAmount);
                expect(auction.bidsCount).to.be.equal(2);
            });
        });

        describe("#finishAuction()", function () {
            it("Should fail if there is no auction for this item", async () => {
                await expect(marketplaceContract.finishAuction(TOKEN_ID)).to.be.revertedWith(
                    "No auctions for this item"
                );
            });

            it("Should revert if auction still in progress", async () => {
                await mintAndListItem(seller);
                await expect(marketplaceContract.finishAuction(TOKEN_ID)).to.be.revertedWith(
                    "Auction still in progress"
                );
            });

            it("Should be canceled if there were less than two bids. NFT and last bid should be returned to owners.", async () => {
                await mintAndListItem(seller);
                await mintTokensAndApproveSpend(buyer, firstBidAmount);
                await marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount);

                const duration = (await marketplaceContract.auctionDuration()).toNumber();
                await networkWait(duration);

                await expect(marketplaceContract.finishAuction(TOKEN_ID))
                    // Check that auction cancelled
                    .to.emit(marketplaceContract, "AuctionCancelled")
                    .withArgs(TOKEN_ID, seller.address)
                    // Check that NFT returned to seller
                    .and.emit(nftContract, "Transfer")
                    .withArgs(marketplaceContract.address, seller.address, TOKEN_ID)
                    // Check that funds returned to bidder
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(marketplaceContract.address, buyer.address, firstBidAmount);

                // Auction removed
                await expect(marketplaceContract.auction(TOKEN_ID)).to.be.revertedWith("No auctions for this item");
            });

            it("Should be successfully anded", async () => {
                await mintAndListItem(seller);

                // First bid
                await mintTokensAndApproveSpend(buyer, firstBidAmount);
                await marketplaceContract.connect(buyer).makeBid(TOKEN_ID, firstBidAmount);

                // Secondd bid
                await mintTokensAndApproveSpend(buyer2, secondBidAmount);
                await marketplaceContract.connect(buyer2).makeBid(TOKEN_ID, secondBidAmount);

                //Third bid
                await mintTokensAndApproveSpend(buyer3, thirdBidAmount);
                await marketplaceContract.connect(buyer3).makeBid(TOKEN_ID, thirdBidAmount);

                //Wait auction end
                const duration = (await marketplaceContract.auctionDuration()).toNumber();
                await networkWait(duration);

                await expect(marketplaceContract.finishAuction(TOKEN_ID))
                    // Check that auction finished
                    .to.emit(marketplaceContract, "AuctionFinished")
                    .withArgs(TOKEN_ID, seller.address, buyer3.address, thirdBidAmount)
                    // Check that NFT transfered to buyer
                    .and.emit(nftContract, "Transfer")
                    .withArgs(marketplaceContract.address, buyer3.address, TOKEN_ID)
                    // Check that funds transfered to seller
                    .and.emit(paymentTokenContract, "Transfer")
                    .withArgs(marketplaceContract.address, seller.address, thirdBidAmount);

                // Auction removed
                await expect(marketplaceContract.auction(TOKEN_ID)).to.be.revertedWith("No auctions for this item");
            });
        });
    });
});
