import { ethers } from "hardhat";
import * as fs from "fs";
import { Heroes, Marketplace } from "../typechain";

// Deploy Heroes contract with deployer as minter
async function main() {
    const [owner] = await ethers.getSigners();

    const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
    const marketplaceContract: Marketplace = await MarketplaceFactory.deploy();

    await marketplaceContract.deployed();

    const nftAddress = await marketplaceContract.nftContract();
    const paymentTokenAddress = await marketplaceContract.paymentToken();

    console.log("Marketplace deployed to:", marketplaceContract.address);
    console.log("NFT contract address:", nftAddress);
    console.log("Payment token deployed to:", paymentTokenAddress);

    const contracts = {
        marketplaceAddress: marketplaceContract.address,
        nftContractAddress: nftAddress,
        paymentTokenAddress: paymentTokenAddress,
        deployer: owner.address,
    };

    fs.writeFile("./tasks/DeployedContracts.ts", JSON.stringify(contracts), (err) => {
        if (err) throw err;
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
