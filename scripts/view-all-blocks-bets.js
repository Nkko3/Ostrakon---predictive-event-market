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
  // getEventInfo function
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
  // getBlockInfo function
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
  // getUserChoice function
  {
    "inputs": [
      {"internalType": "uint256", "name": "_blockId", "type": "uint256"},
      {"internalType": "address", "name": "_user", "type": "address"}
    ],
    "name": "getUserChoice",
    "outputs": [
      {"internalType": "uint256", "name": "choice", "type": "uint256"},
      {"internalType": "uint256", "name": "registrationDate", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Initialize provider with fallback
async function createProvider() {
  for (const url of RPC_URLS) {
    try {
      console.log(`🔗 Trying to connect to: ${url}`);
      const provider = new ethers.JsonRpcProvider(url);
      
      // Test the connection
      await provider.getNetwork();
      console.log(`✅ Successfully connected to: ${url}`);
      return provider;
    } catch (error) {
      console.log(`❌ Failed to connect to: ${url}`);
      continue;
    }
  }
  throw new Error("❌ All RPC endpoints failed");
}

// Utility functions
function formatDate(timestamp) {
  if (!timestamp || timestamp === 0) return "N/A";
  return new Date(Number(timestamp) * 1000).toISOString().replace('T', ' ').split('.')[0] + " UTC";
}

function formatEther(value) {
  if (!value) return "0";
  return ethers.formatEther(value.toString());
}

// Generate sequential bet_id for display (mimics database auto-increment)
let globalBetId = 1;

// Main function to get all blocks and bets
async function getAllBlocksBets() {
  try {
    console.log("🎯 Getting all betting blocks and bets...\n");
    
    // Create provider and contract instance
    const provider = await createProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get event info to know how many blocks exist
    console.log("📊 Getting event information...");
    const eventInfo = await contract.getEventInfo();
    
    const currentBlockId = Number(eventInfo[4]); // currentBlockId
    const totalBets = Number(eventInfo[5]); // currentBets
    
    console.log(`📈 Event Summary:`);
    console.log(`   Current Block ID: ${currentBlockId}`);
    console.log(`   Total Bets: ${totalBets}`);
    console.log(`   Event Owner: ${eventInfo[0]}`);
    console.log(`   Description: ${eventInfo[1]}`);
    console.log(`   Event Open: ${eventInfo[8] ? 'Yes' : 'No'}\n`);
    
    // Array to store all bets data (similar to API response)
    const allBets = [];
    
    // Process each block from 1 to currentBlockId
    console.log("🔄 Processing all blocks...\n");
    
    for (let blockId = 1; blockId <= currentBlockId; blockId++) {
      try {
        console.log(`📦 Processing Block ${blockId}:`);
        
        // Get block information
        const blockInfo = await contract.getBlockInfo(blockId);
        
        const blockData = {
          blockId: Number(blockInfo[0]),
          blockBetValue: blockInfo[1],
          blockSFactor: blockInfo[2],
          blockSize: Number(blockInfo[3]),
          availableDates: blockInfo[4],
          availableDatesForBetting: blockInfo[5],
          users: blockInfo[6],
          isBlockOpen: blockInfo[7]
        };
        
        console.log(`   Bet Value: ${formatEther(blockData.blockBetValue)} ETH`);
        console.log(`   Block Size: ${blockData.blockSize}`);
        console.log(`   Users with bets: ${blockData.users.length}`);
        console.log(`   Block Open: ${blockData.isBlockOpen ? 'Yes' : 'No'}`);
        
        // First, add all available dates (without bets) - similar to blockchain-sync.js logic
        for (let dateIndex = 0; dateIndex < blockData.availableDates.length; dateIndex++) {
          const availableDate = Number(blockData.availableDates[dateIndex]);
          
          // Check if this date has a bet (user associated)
          let userForThisDate = null;
          let registrationDate = null;
          
          // Search through users to find who bet on this date
          for (let userIndex = 0; userIndex < blockData.users.length; userIndex++) {
            const userAddress = blockData.users[userIndex];
            
            if (userAddress && userAddress !== ethers.ZeroAddress) {
              try {
                // Get user's choice for this block
                const userChoice = await contract.getUserChoice(blockId, userAddress);
                const userChosenDate = Number(userChoice[0]); // choice
                const userRegistrationTimestamp = Number(userChoice[1]); // registrationDate
                
                // If this user chose this date, associate them
                if (userChosenDate === availableDate) {
                  userForThisDate = userAddress;
                  registrationDate = userRegistrationTimestamp;
                  break;
                }
              } catch (error) {
                console.log(`     ⚠️ Error getting choice for user ${userAddress}: ${error.message}`);
              }
            }
          }
          
          // Check if date is available for betting (must be at least 5 days in the future)
          const currentTimestamp = Math.floor(Date.now() / 1000);
          const fiveDaysInSeconds = 5 * 24 * 60 * 60; // 5 days in seconds
          const minimumBettingTimestamp = currentTimestamp + fiveDaysInSeconds;
          const isDateAvailableForBetting = availableDate >= minimumBettingTimestamp;
          
          // Add bet record (similar to API structure)
          const betRecord = {
            bet_id: globalBetId++,
            address: userForThisDate, // null if available, address if occupied
            bet_date: new Date(availableDate * 1000).toISOString(),
            registration_date: registrationDate ? new Date(registrationDate * 1000).toISOString() : null,
            block_id: blockId,
            is_expired: !isDateAvailableForBetting // Add flag to identify expired dates
          };
          
          allBets.push(betRecord);
          
          if (userForThisDate) {
            console.log(`   ✅ Bet: ${userForThisDate} -> ${formatDate(availableDate)} (registered: ${formatDate(registrationDate)})`);
          } else {
            // Show "Available" only for dates 5+ days in the future, "Expired" otherwise
            const statusText = isDateAvailableForBetting ? "Available" : "Expired";
            const statusIcon = isDateAvailableForBetting ? "⏸️" : "⏰";
            console.log(`   ${statusIcon} ${statusText}: ${formatDate(availableDate)}`);
          }
        }
        
        console.log(`   📊 Block ${blockId} processed: ${blockData.availableDates.length} total slots\n`);
        
      } catch (error) {
        console.error(`❌ Error processing block ${blockId}:`, error.message);
      }
    }
    
    // Display summary
    console.log("=".repeat(50));
    console.log("📋 ALL BLOCKS BETTING SUMMARY");
    console.log("=".repeat(50));
    
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   Total Blocks: ${currentBlockId}`);
    console.log(`   Total Slots: ${allBets.length}`);
    console.log(`   Occupied Slots: ${allBets.filter(bet => bet.address !== null).length}`);
    console.log(`   Available Slots: ${allBets.filter(bet => bet.address === null && !bet.is_expired).length}`);
    console.log(`   Expired Slots: ${allBets.filter(bet => bet.address === null && bet.is_expired).length}`);
    
    // Group by block for display
    console.log(`\n📦 Bets by Block:`);
    for (let blockId = 1; blockId <= currentBlockId; blockId++) {
      const blockBets = allBets.filter(bet => bet.block_id === blockId);
      const occupiedBets = blockBets.filter(bet => bet.address !== null);
      const availableBets = blockBets.filter(bet => bet.address === null && !bet.is_expired);
      const expiredBets = blockBets.filter(bet => bet.address === null && bet.is_expired);
      
      console.log(`\n   Block ${blockId}:`);
      console.log(`     Total Slots: ${blockBets.length}`);
      console.log(`     Occupied: ${occupiedBets.length}`);
      console.log(`     Available: ${availableBets.length}`);
      console.log(`     Expired: ${expiredBets.length}`);
      
      // Show occupied bets details
      if (occupiedBets.length > 0) {
        console.log(`     Occupied Bets:`);
        occupiedBets.forEach(bet => {
          console.log(`       ID: ${bet.bet_id} | ${bet.address} -> ${formatDate(Number(new Date(bet.bet_date).getTime() / 1000))}`);
        });
      }
    }
    
    // Display recent bets (last 10)
    console.log(`\n🕒 Most Recent Bets (Last 10):`);
    const recentBets = allBets
      .filter(bet => bet.address !== null)
      .sort((a, b) => new Date(b.registration_date) - new Date(a.registration_date))
      .slice(0, 10);
    
    if (recentBets.length > 0) {
      recentBets.forEach(bet => {
        console.log(`   ID: ${bet.bet_id} | Block: ${bet.block_id} | ${bet.address}`);
        console.log(`     Bet Date: ${formatDate(Number(new Date(bet.bet_date).getTime() / 1000))}`);
        console.log(`     Registered: ${formatDate(Number(new Date(bet.registration_date).getTime() / 1000))}`);
        console.log();
      });
    } else {
      console.log("   No bets found");
    }
    
    return allBets;
    
  } catch (error) {
    console.error("❌ Error getting blocks data:", error);
    throw error;
  }
}

// Execute the script
if (require.main === module) {
  getAllBlocksBets()
    .then((data) => {
      console.log("\n✅ Script completed successfully!");
      console.log(`📊 Retrieved ${data.length} total betting records`);
    })
    .catch((error) => {
      console.error("\n❌ Script failed:", error.message);
      process.exit(1);
    });
}

module.exports = { getAllBlocksBets };