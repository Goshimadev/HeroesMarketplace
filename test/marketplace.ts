import { expect } from "chai";
import { ethers, network } from "hardhat";
import { any } from "hardhat/internal/core/params/argumentTypes";
import { Heroes, Marketplace__factory } from "../typechain";
import { Marketplace } from "../typechain/Marketplace";

describe("Marketplace", function () {
    let clean: any;

    let heroesContract: Heroes;
    let marketplaceContract: Marketplace;

    before(async () => {
        const HeroesFactory = await ethers.getContractFactory("Heroes");
        heroesContract = await HeroesFactory.deploy();
        await heroesContract.deployed();

        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        marketplaceContract = await MarketplaceFactory.deploy(heroesContract.address);
        await marketplaceContract.deployed();

        await heroesContract.setMinter(marketplaceContract.address);

        clean = network.provider.request({
            method: "evm_snapshot",
            params: [],
        });
    });

    afterEach(async () => {
        network.provider.request({
            method: "evm-revert",
            params: [clean],
        });
        clean = network.provider.request({
            method: "evm_snapshot",
            params: [],
        });
    });

    describe("Deploy", function () {
        it("Should set nft contract address", async () => {
            expect(await marketplaceContract.nftContract()).to.be.equal(heroesContract.address);
        });
    });

    describe("Create item", function () {
        it("Should create new item", async () => {
            await marketplaceContract.createItem("testUri");
            expect(await heroesContract.ownerOf(0)).to.be.equal(marketplaceContract.address);
        });
    });
});
