import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { utils } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { Heroes, Marketplace__factory } from "../typechain";
import { Marketplace } from "../typechain/Marketplace";

describe("Marketplace", function () {
    let clean: any;

    let heroesContract: Heroes;
    let marketplaceContract: Marketplace;

    let owner: SignerWithAddress, seller: SignerWithAddress, buyer: SignerWithAddress;

    const TEST_TOKEN_URI = "test_token_uri";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const TOKEN_ID = 0;

    before(async () => {
        [owner, seller, buyer] = await ethers.getSigners();

        const HeroesFactory = await ethers.getContractFactory("Heroes");
        heroesContract = await HeroesFactory.deploy();
        await heroesContract.deployed();

        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        marketplaceContract = await MarketplaceFactory.deploy(heroesContract.address);
        await marketplaceContract.deployed();

        await heroesContract.setMinter(marketplaceContract.address);

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

    function mintToken(minter: SignerWithAddress) {
        return marketplaceContract.connect(minter).createItem(TEST_TOKEN_URI);
    }

    describe("Deploy", function () {
        it("Should set nft contract address", async () => {
            expect(await marketplaceContract.nftContract()).to.be.equal(heroesContract.address);
        });
    });

    describe("#createItem()", function () {
        it("Should create new item", async () => {
            heroesContract.on(heroesContract.filters.Transfer(null, null, null), (event) => {
                console.log(event);
            });
            await mintToken(owner);
            expect(await heroesContract.ownerOf(TOKEN_ID)).to.be.equal(owner.address);
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
                await mintToken(seller);
                await heroesContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await expect(marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice))
                    .to.emit(marketplaceContract, "Listing")
                    .withArgs(seller.address, TOKEN_ID, itemPrice);
                expect(await marketplaceContract.listingPrice(seller.address, TOKEN_ID)).to.be.equal(itemPrice);
            });
        });

        describe("#cancel()", function () {
            it("Should fail when item not listed", async () => {
                await mintToken(seller);
                await heroesContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await expect(marketplaceContract.connect(seller).cancel(TOKEN_ID)).to.be.revertedWith(
                    "Token not listed for sale"
                );
            });

            it("Should cancel listing", async () => {
                // List token
                await mintToken(seller);
                await heroesContract.connect(seller).approve(marketplaceContract.address, TOKEN_ID);
                await marketplaceContract.connect(seller).listItem(TOKEN_ID, itemPrice);

                await expect(marketplaceContract.connect(seller).cancel(TOKEN_ID))
                    .to.emit(marketplaceContract, "Cancel")
                    .withArgs(seller.address, TOKEN_ID);
                await expect(marketplaceContract.listingPrice(seller.address, TOKEN_ID)).to.be.revertedWith(
                    "Item not listed"
                );
            });
        });
    });
});
