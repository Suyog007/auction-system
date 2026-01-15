const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Deploying FeaturedCommunityAuction");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("");

  // ============ Configuration ============
  // Set these values before deploying
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const MINIMUM_BID_PRICE = ethers.parseEther(process.env.MIN_BID || "0.01"); // 0.01 ETH
  const BID_INCREMENT = ethers.parseEther(process.env.BID_INCREMENT || "0.005"); // 0.005 ETH

  console.log("Configuration:");
  console.log("  Treasury:", TREASURY_ADDRESS);
  console.log("  Minimum Bid:", ethers.formatEther(MINIMUM_BID_PRICE), "ETH");
  console.log("  Bid Increment:", ethers.formatEther(BID_INCREMENT), "ETH");
  console.log("");

  // ============ Deploy ============
  const FeaturedCommunityAuction = await ethers.getContractFactory(
    "FeaturedCommunityAuction"
  );

  console.log("Deploying proxy...");

  const proxy = await upgrades.deployProxy(
    FeaturedCommunityAuction,
    [TREASURY_ADDRESS, MINIMUM_BID_PRICE, BID_INCREMENT],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("");
  console.log("=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("Proxy Address:", proxyAddress);
  console.log("Implementation Address:", implementationAddress);
  console.log("");
  console.log("Owner:", await proxy.owner());
  console.log("Treasury:", await proxy.treasury());
  console.log("Min Bid:", ethers.formatEther(await proxy.minimumBidPrice()), "ETH");
  console.log("Bid Increment:", ethers.formatEther(await proxy.bidIncrement()), "ETH");
  console.log("Version:", await proxy.version());
  console.log("");

  // ============ Verification Commands ============
  console.log("To verify on Etherscan/Basescan:");
  console.log(`npx hardhat verify --network <network> ${implementationAddress}`);
  console.log("");

  console.log("Save these addresses:");
  console.log(`PROXY_ADDRESS=${proxyAddress}`);
  console.log(`IMPLEMENTATION_ADDRESS=${implementationAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
