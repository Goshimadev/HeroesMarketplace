import { ethers } from "hardhat";
import * as fs from "fs";
import { Heroes } from "../typechain";

// Deploy Heroes contract with deployer as minter
async function main() {
    const [owner] = await ethers.getSigners();

    const HeroesFactory = await ethers.getContractFactory("Heroes");
    const heroesContract: Heroes = await HeroesFactory.deploy(owner.address);

    await heroesContract.deployed();

    console.log("Heroes deployed to:", heroesContract.address);

    const contracts = {
        contractAddress: heroesContract.address,
        deployer: owner.address,
    };

    fs.writeFile("./tasks/heroes/HeroesContractInfo.json", JSON.stringify(contracts), (err) => {
        if (err) throw err;
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
