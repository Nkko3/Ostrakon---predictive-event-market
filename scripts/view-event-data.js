const { ethers } = require("ethers");

// Multiple RPC URLs with fallback system
const RPC_URLS = [           
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://rpc.flashbots.net/"                      
];

// Contract address on Ethereum mainnet
const CONTRACT_ADDRESS = "0x5e91A52266139Ae87d012d0a47A5EBAc2aD084f2";

// Contract ABI - Only the view functions we need
const CONTRACT_ABI = [
  // getEventInfo function - returns individual values, not a struct
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
  // getBlockInfo function - returns individual values, not a struct
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
  }
];

async function connectWithFallback() {
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      console.log(`🔄 Trying RPC ${i + 1}/${RPC_URLS.length}...`);
      const provider = new ethers.JsonRpcProvider(RPC_URLS[i]);
      
      // Test connection with timeout
      const networkPromise = provider.getNetwork();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      await Promise.race([networkPromise, timeoutPromise]);
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

function formatDate(timestamp) {
  if (timestamp === 0) return "Not set";
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

async function main() {
  console.log("🌐 Connecting to Ethereum mainnet...");
  console.log("📖 Reading event data (no gas fees)...\n");

  try {
    // Connect with fallback system (read-only, no wallet needed)
    const provider = await connectWithFallback();
    
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}\n`);
    
    // Connect to contract (read-only)
    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get event information
    console.log("📊 === EVENT INFORMATION ===");
    const eventInfo = await bettingEvent.getEventInfo();
    
    // The getEventInfo function returns an array:
    // [eventOwner, eventDescription, currentBetValue, currentSFactor, currentBlockId, currentBets, vault, contributionVault, isEventOpen, baseTimestamp]
    console.log(`👤 Owner: ${eventInfo[0]}`);
    console.log(`📝 Description: ${eventInfo[1]}`);
    console.log(`💰 Current bet value: ${ethers.formatEther(eventInfo[2])} ETH`);
    console.log(`🆔 Current block ID: ${eventInfo[4]}`);
    console.log(`🎯 Total bets placed: ${eventInfo[5]}`);
    console.log(`🏦 Vault: ${ethers.formatEther(eventInfo[6])} ETH`);
    console.log(`🏦 Contribution vault: ${ethers.formatEther(eventInfo[7])} ETH`);
    console.log(`💎 Total prize pool: ${ethers.formatEther(BigInt(eventInfo[6]) + BigInt(eventInfo[7]))} ETH`);
    console.log(`🔓 Event status: ${eventInfo[8] ? 'OPEN' : 'CLOSED'}`);
    console.log(`📅 Base timestamp: ${eventInfo[9]} (${formatDate(eventInfo[9])})`);

    // Get current block information (latest block)
    const currentBlockId = eventInfo[4];
    console.log(`\n🧱 === LATEST BLOCK (ID: ${currentBlockId}) INFORMATION ===`);
    const blockInfo = await bettingEvent.getBlockInfo(currentBlockId);
    
    // The getBlockInfo function returns an array:
    // [blockId, blockBetValue, blockSFactor, blockSize, availableDates, availableDatesForBetting, users, isBlockOpen]
    console.log(`🆔 Block ID: ${blockInfo[0]}`);
    console.log(`💰 Block value: ${ethers.formatEther(blockInfo[1])} ETH`);
    console.log(`📊 S-Factor: ${ethers.formatEther(blockInfo[2])} ETH`);
    console.log(`📏 Block size: ${blockInfo[3]}`);
    console.log(`👥 bettors in the current block: ${blockInfo[6].length}/${blockInfo[3]}`);
    console.log(`🔓 Block status: ${blockInfo[7] ? 'OPEN' : 'CLOSED'}`);

    // Show all block dates
    if (blockInfo[4].length > 0) {
      console.log(`📅 All block dates (You should expect to see the date in your time zone):`);
      for (let i = 0; i < blockInfo[4].length; i++) {
        const timestamp = Number(blockInfo[4][i]);
        console.log(`   - ${formatDate(timestamp)} - ${timestamp}`);
      }
    }

    // Show available dates for betting
    if (blockInfo[5].length > 0) {
      console.log(`🎯 Available dates:`);
      for (let i = 0; i < blockInfo[5].length; i++) {
        const timestamp = Number(blockInfo[5][i]);
        console.log(`   - ${formatDate(timestamp)} - ${timestamp}`);
      }
    } else {
      console.log(`🎯 No available dates for betting`);
    }
    
    console.log(`\n✅ Data retrieved successfully!`);

  } catch (error) {
    console.error("❌ Error reading contract data:", error.reason || error.message);
    
    if (error.code === 'NETWORK_ERROR') {
      console.error("💡 Tip: Check your internet connection");
    } else if (error.message.includes('could not detect network')) {
      console.error("💡 Tip: All RPC URLs might be temporarily unavailable");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });