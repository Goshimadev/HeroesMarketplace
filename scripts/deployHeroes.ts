import { ethers } from "hardhat";

// Deploy Heroes contract with deployer as minter
async function main() {
  const [owner] = await ethers.getSigners()

  const HeroesFactory = await ethers.getContractFactory("Heroes");
  const heroesContract = await HeroesFactory.deploy(owner.address);

  await heroesContract.deployed();

  console.log("Heroes deployed to:", heroesContract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
