const { ethers } = require("ethers");

// Multiple RPC URLs with fallback system
const RPC_URLS = [          
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://rpc.flashbots.net/"                       
];

// Contract address on Ethereum mainnet
const CONTRACT_ADDRESS = "0x5e91A52266139Ae87d012d0a47A5EBAc2aD084f2";

// Contract ABI - Only the view function we need
const CONTRACT_ABI = [
  // getVotingInfo function - returns individual values, not a struct
  {
    "inputs": [],
    "name": "getVotingInfo",
    "outputs": [
      {"internalType": "bool", "name": "votingStarted", "type": "bool"},
      {"internalType": "uint256", "name": "votingStartTimestamp", "type": "uint256"},
      {"internalType": "uint256", "name": "votingDeadline", "type": "uint256"},
      {"internalType": "uint256", "name": "votesToEnd", "type": "uint256"},
      {"internalType": "uint256", "name": "votesAgainstEnd", "type": "uint256"},
      {"internalType": "uint256", "name": "totalVotes", "type": "uint256"}
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
  if (timestamp === 0 || timestamp === "0") return "Not set";
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function calculateTimeRemaining(deadline) {
  if (deadline === 0 || deadline === "0") return "No deadline set";
  
  const now = Math.floor(Date.now() / 1000);
  const deadlineNum = Number(deadline);
  
  if (deadlineNum <= now) {
    return "Voting period ended";
  }
  
  const remaining = deadlineNum - now;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  
  if (days > 0) {
    return `${days} days, ${hours} hours, ${minutes} minutes`;
  } else if (hours > 0) {
    return `${hours} hours, ${minutes} minutes`;
  } else {
    return `${minutes} minutes`;
  }
}

async function main() {
  console.log("🌐 Connecting to Ethereum mainnet...");
  console.log("🗳️  Reading voting data (no gas fees)...\n");

  try {
    // Connect with fallback system (read-only, no wallet needed)
    const provider = await connectWithFallback();
    
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}\n`);
    
    // Connect to contract (read-only)
    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get voting information
    console.log("🗳️  === VOTING INFORMATION ===");
    const votingInfo = await bettingEvent.getVotingInfo();
    
    // The getVotingInfo function returns an array:
    // [votingStarted, votingStartTimestamp, votingDeadline, votesToEnd, votesAgainstEnd, totalVotes]
    console.log(`📊 Voting started: ${votingInfo[0] ? 'YES' : 'NO'}`);
    console.log(`⏰ Voting start timestamp: ${votingInfo[1]} (${formatDate(votingInfo[1])})`);
    console.log(`⏰ Voting deadline: ${votingInfo[2]} (${formatDate(votingInfo[2])})`);
    console.log(`✅ Votes to end event: ${votingInfo[3]}`);
    console.log(`❌ Votes against ending: ${votingInfo[4]}`);
    console.log(`📊 Total votes: ${votingInfo[5]}`);
    
    // Additional calculations and status
    console.log(`\n📋 === VOTING ANALYSIS ===`);
    
    if (votingInfo[0]) {
      // Voting is active
      console.log(`🔴 Status: VOTING IN PROGRESS`);
      console.log(`⏱️  Time remaining: ${calculateTimeRemaining(votingInfo[2])}`);
      
      if (Number(votingInfo[5]) > 0) {
        const votesToEnd = Number(votingInfo[3]);
        const votesAgainst = Number(votingInfo[4]);
        const totalVotes = Number(votingInfo[5]);
        
        const percentageToEnd = ((votesToEnd / totalVotes) * 100).toFixed(1);
        const percentageAgainst = ((votesAgainst / totalVotes) * 100).toFixed(1);
        
        console.log(`📈 Support for ending: ${percentageToEnd}% (${votesToEnd} votes)`);
        console.log(`📉 Opposition to ending: ${percentageAgainst}% (${votesAgainst} votes)`);
        
        // Show progress towards minimum requirement
        const minVoteToEnd = 30; // As defined in the contract
        console.log(`🎯 Minimum votes needed: ${minVoteToEnd}`);
        console.log(`📊 Progress: ${votesToEnd}/${minVoteToEnd} (${((votesToEnd / minVoteToEnd) * 100).toFixed(1)}%)`);
        
        if (votesToEnd >= minVoteToEnd) {
          console.log(`✅ Minimum vote threshold MET`);
          
          const contestationRate = (votesAgainst * 100) / totalVotes;
          if (contestationRate >= 10) {
            console.log(`⚠️  High contestation rate: ${contestationRate.toFixed(1)}% (≥10%)`);
            console.log(`❌ Voting may FAIL due to contestation`);
          } else {
            console.log(`✅ Low contestation rate: ${contestationRate.toFixed(1)}% (<10%)`);
            console.log(`🎉 Voting likely to SUCCEED`);
          }
        } else {
          const remaining = minVoteToEnd - votesToEnd;
          console.log(`⏳ Need ${remaining} more votes to reach minimum`);
        }
      } else {
        console.log(`📊 No votes cast yet`);
      }
      
    } else {
      // No voting active
      console.log(`🟢 Status: NO ACTIVE VOTING`);
      console.log(`ℹ️  Event ending voting has not been initiated`);
      
      if (Number(votingInfo[5]) > 0) {
        console.log(`📜 Previous voting session data:`);
        console.log(`   - Total votes: ${votingInfo[5]}`);
        console.log(`   - Votes to end: ${votingInfo[3]}`);
        console.log(`   - Votes against: ${votingInfo[4]}`);
      }
    }
    
    console.log(`\n💡 === VOTING REQUIREMENTS ===`);
    console.log(`📅 Minimum event age: 50 days`);
    console.log(`🎯 Minimum total bets: 100`);
    console.log(`⏰ Voting duration: 10 days`);
    console.log(`✅ Minimum "yes" votes: 30`);
    console.log(`❌ Maximum contestation rate: 10%`);
    
    console.log(`\n✅ Voting data displayed successfully`);

  } catch (error) {
    console.error("❌ Error reading voting data:", error.reason || error.message);
    
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