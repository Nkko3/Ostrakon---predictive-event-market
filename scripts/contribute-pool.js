const { ethers } = require("ethers");

// ⚠️ USER CONFIGURATION - MODIFY THESE VARIABLES ⚠️
// =================================================

// Insert your private key here (NEVER share this information!)
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";

// Your wallet address
const USER_ADDRESS = "YOUR_WALLET_ADDRESS_HERE";

// Contribution value in ETH (example: "0.0052")
// Note: Must be greater than the genesis block bet value (0.00516 ETH)
const CONTRIBUTION_VALUE = "0.0052";

// Multiple RPC URLs with fallback system
const RPC_URLS = [           
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://rpc.flashbots.net/" 
];

// =================================================
// Don't modify below this line

// Contract address on Ethereum mainnet
const CONTRACT_ADDRESS = "0x5e91A52266139Ae87d012d0a47A5EBAc2aD084f2";

// Contract ABI - Only the functions we need
const CONTRACT_ABI = [
  // getEventInfo function - to get genesis block bet value for validation
  {
    "inputs": [],
    "name": "getEventInfo",
    "outputs": [
      {"internalType": "address", "name": "eventOwner", "type": "address"},
      {"internalType": "string", "name": "eventDescription", "type": "string"},
      {"internalType": "uint256", "name": "currentBetValue", "type": "uint256"},
      {"internalType": "uint256", "name": "currentSFactor", "type": "uint256"},
      {"internalType": "uint256", "name": "currentBlockId", "type": "uint256"},
      {"internalType": "uint256", "name": "currentBets", "type": "uint256"},
      {"internalType": "uint256", "name": "vault", "type": "uint256"},
      {"internalType": "uint256", "name": "contributionVault", "type": "uint256"},
      {"internalType": "bool", "name": "isEventOpen", "type": "bool"},
      {"internalType": "uint256", "name": "baseTimestamp", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // getBlockInfo function - to get genesis block bet value
  {
    "inputs": [{"internalType": "uint256", "name": "blockId", "type": "uint256"}],
    "name": "getBlockInfo",
    "outputs": [
      {"internalType": "uint256", "name": "blockId", "type": "uint256"},
      {"internalType": "uint256", "name": "blockBetValue", "type": "uint256"},
      {"internalType": "uint256", "name": "blockSFactor", "type": "uint256"},
      {"internalType": "uint256", "name": "blockSize", "type": "uint256"},
      {"internalType": "uint256[]", "name": "availableDates", "type": "uint256[]"},
      {"internalType": "uint256[]", "name": "availableDatesForBetting", "type": "uint256[]"},
      {"internalType": "address[]", "name": "users", "type": "address[]"},
      {"internalType": "bool", "name": "isBlockOpen", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // contributeToPool function
  {
    "inputs": [],
    "name": "contributeToPool",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

async function connectWithFallback() {
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      console.log(`🔄 Trying RPC ${i + 1}/${RPC_URLS.length}...`);
      const provider = new ethers.JsonRpcProvider(RPC_URLS[i]);
      
      // Test connection
      await provider.getNetwork();
      console.log(`✅ Connected to RPC ${i + 1}`);
      return provider;
      
    } catch (error) {
      console.log(`❌ RPC ${i + 1} failed: ${error.message}`);
      if (i === RPC_URLS.length - 1) {
        throw new Error("All RPC URLs failed");
      }
    }
  }
}

async function main() {
  console.log("🌐 Connecting to Ethereum mainnet...");
  
  // Check if variables have been configured
  if (PRIVATE_KEY === "YOUR_PRIVATE_KEY_HERE") {
    console.error("❌ Error: Configure your PRIVATE_KEY in the script!");
    process.exit(1);
  }
  
  if (USER_ADDRESS === "YOUR_WALLET_ADDRESS_HERE") {
    console.error("❌ Error: Configure your USER_ADDRESS in the script!");
    process.exit(1);
  }

  try {
    // Connect with fallback system
    const provider = await connectWithFallback();
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`👤 Using wallet: ${wallet.address}`);
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}`);
    
    // Check if wallet address matches the provided one
    if (wallet.address.toLowerCase() !== USER_ADDRESS.toLowerCase()) {
      console.error("❌ Error: Wallet address does not match private key!");
      process.exit(1);
    }

    // Connect to contract
    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
    
    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    const contributionValueWei = ethers.parseEther(CONTRIBUTION_VALUE);
    if (balance < contributionValueWei) {
      console.error("❌ Error: Insufficient balance for the contribution!");
      process.exit(1);
    }

    // Get event information
    console.log("\n📊 === EVENT INFORMATION ===");
    const eventInfoResult = await bettingEvent.getEventInfo();
    
    // Destructure the returned array
    const [
      eventOwner,
      eventDescription,
      currentBetValue,
      currentSFactor,
      currentBlockId,
      currentBets,
      vault,
      contributionVault,
      isEventOpen,
      baseTimestamp
    ] = eventInfoResult;
    
    console.log(`📝 Description: ${eventDescription}`);
    console.log(`🏦 Current vault: ${ethers.formatEther(vault)} ETH`);
    console.log(`💰 Current contribution vault: ${ethers.formatEther(contributionVault)} ETH`);
    console.log(`🔓 Event open: ${isEventOpen}`);

    if (!isEventOpen) {
      console.error("❌ Error: Event is closed for contributions!");
      process.exit(1);
    }

    // Get genesis block information to check minimum contribution requirement
    const genesisBlockInfo = await bettingEvent.getBlockInfo(1);
    const genesisBetValue = genesisBlockInfo[1]; // blockBetValue
    
    console.log(`\n💡 === CONTRIBUTION REQUIREMENTS ===`);
    console.log(`🎯 Genesis block bet value: ${ethers.formatEther(genesisBetValue)} ETH`);
    console.log(`💰 Your contribution: ${CONTRIBUTION_VALUE} ETH`);
    
    // Check if contribution meets minimum requirement
    if (contributionValueWei <= genesisBetValue) {
      console.error(`❌ Error: Contribution must be greater than genesis block bet value!`);
      console.error(`   Minimum required: > ${ethers.formatEther(genesisBetValue)} ETH`);
      console.error(`   Your contribution: ${CONTRIBUTION_VALUE} ETH`);
      console.log(`💡 Tip: Increase CONTRIBUTION_VALUE to more than "${ethers.formatEther(genesisBetValue)}"`);
      process.exit(1);
    }

    console.log(`✅ Contribution amount is valid!`);

    // Make the contribution
    console.log(`\n💰 === CONTRIBUTING TO POOL ===`);
    console.log(`💰 Contribution value: ${CONTRIBUTION_VALUE} ETH`);
    console.log(`📈 This will increase the contribution vault from ${ethers.formatEther(contributionVault)} ETH to ${ethers.formatEther(contributionVault + contributionValueWei)} ETH`);

    console.log(`\n⏳ Sending transaction...`);
    
    const tx = await bettingEvent.contributeToPool({
      value: contributionValueWei,
      gasLimit: 200000
    });

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Contribution successful!`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔗 View on Etherscan: https://etherscan.io/tx/${tx.hash}`);
      
      // Show updated information
      console.log(`\n📊 === UPDATED INFORMATION ===`);
      const updatedEventInfoResult = await bettingEvent.getEventInfo();
      const updatedContributionVault = updatedEventInfoResult[7]; // contributionVault
      
      console.log(`💰 Updated contribution vault: ${ethers.formatEther(updatedContributionVault)} ETH`);
      console.log(`📈 Your contribution of ${CONTRIBUTION_VALUE} ETH has been added to the pool!`);
      
    } else {
      console.log(`❌ Transaction failed!`);
    }

  } catch (error) {
    console.error("❌ Error during contribution:", error.reason || error.message);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("💡 Tip: Check if you have enough ETH for contribution + gas fees");
    } else if (error.code === 'NETWORK_ERROR') {
      console.error("💡 Tip: Check your internet connection and RPC URL");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });