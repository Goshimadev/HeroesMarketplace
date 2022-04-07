import { task } from "hardhat/config";
import { parseUnits } from "ethers/lib/utils";

const contractInfo = require("./DeployedContracts.json");

task(
    "createItem",
    `Create new NFT. Test uri:
    https://gateway.pinata.cloud/ipfs/QmcrrUjqWbUAKhqC84W2Bb6aGpbB7K4WWuYTwzgKZbgzSD
    https://gateway.pinata.cloud/ipfs/QmPFhAWMTbKJqbKt6Ndz4dfSJ6qdjKD9gx957mHmtRxBwh
    https://gateway.pinata.cloud/ipfs/QmUFmiG9cPV4krLKfTk4ckjU1v9y6oHBZJjSDVTqTS1ys5`
)
    .addParam("uri", "NFT uri")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("Marketplace", contractInfo.marketplaceAddress);
        await contract.createItem(taskArgs.uri);
    });

task("listItemOnAuction", "List nft on auction")
    .addParam("tokenid", "Token Id")
    .setAction(async (taskArgs, hre) => {
        const marketplace = await hre.ethers.getContractAt("Marketplace", contractInfo.marketplaceAddress);
        const nft = await hre.ethers.getContractAt("Heroes", contractInfo.nftContractAddress);

        await nft.approve(marketplace.address, taskArgs.tokenid);
        await marketplace.listItemOnAuction(taskArgs.tokenid);
    });

task("makeBid", "Make bid on auction")
    .addParam("tokenid", "Token Id")
    .addParam("amount", "Amount")
    .setAction(async (taskArgs, hre) => {
        const [owner] = await hre.ethers.getSigners();

        const marketplace = await hre.ethers.getContractAt("Marketplace", contractInfo.marketplaceAddress);
        const paymentToken = await hre.ethers.getContractAt("HRSToken", contractInfo.paymentTokenAddress);

        await paymentToken.mint(owner.address, parseUnits(taskArgs.amount));
        await paymentToken.approve(marketplace.address, parseUnits(taskArgs.amount));
        await marketplace.makeBid(taskArgs.tokenid, parseUnits(taskArgs.amount));
    });

task("finishAuction", "Make bid on auction")
    .addParam("tokenid", "Token Id")
    .setAction(async (taskArgs, hre) => {
        const [owner] = await hre.ethers.getSigners();

        const marketplace = await hre.ethers.getContractAt("Marketplace", contractInfo.marketplaceAddress);
        const paymentToken = await hre.ethers.getContractAt("HRSToken", contractInfo.paymentTokenAddress);

        await marketplace.finishAuction(taskArgs.tokenid);
    });

module.exports = {};
