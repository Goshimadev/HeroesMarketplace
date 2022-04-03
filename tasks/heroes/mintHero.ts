import { task } from "hardhat/config";
import { parseUnits } from "ethers/lib/utils";
import { Heroes } from "../../typechain";

const contractInfo = require("./HeroesContractInfo.json");

task("mintHero", "Mint Hero NFT")
    .addParam("uri", "URI to nft metadata")
    .setAction(async (taskArgs, hre) => {
        const [owner] = await hre.ethers.getSigners();
        let contract: Heroes = await hre.ethers.getContractAt("Heroes", contractInfo.contractAddress);
        let tx = await contract.safeMint(owner.address, taskArgs.uri);
        tx.wait();

        console.log("Hero minted: ", tx);
    });

module.exports = {};
