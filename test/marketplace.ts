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

    let owner: SignerWithAddress, seller: SignerWithAddress, buyer: SignerWithAddress;

    const TEST_TOKEN_URI = "test_token_uri";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const TOKEN_ID = 0;

    before(async () => {
        [owner, seller, buyer] = await ethers.getSigners();

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
});
