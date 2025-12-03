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
  // getWinningDateVotingInfo function - returns individual values, not a struct
  {
    "inputs": [],
    "name": "getWinningDateVotingInfo",
    "outputs": [
      {"internalType": "bool", "name": "votingStarted", "type": "bool"},
      {"internalType": "uint256", "name": "votingDeadline", "type": "uint256"},
      {"internalType": "uint256[]", "name": "proposedDates", "type": "uint256[]"},
      {"internalType": "uint256", "name": "timeRemaining", "type": "uint256"},
      {"internalType": "uint256", "name": "currentRound", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // getAllDateVoteCounts function - returns two arrays
  {
    "inputs": [],
    "name": "getAllDateVoteCounts",
    "outputs": [
      {"internalType": "uint256[]", "name": "dates", "type": "uint256[]"},
      {"internalType": "uint256[]", "name": "voteCounts", "type": "uint256[]"}
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

function calculateTimeRemaining(timeRemainingSeconds) {
  if (timeRemainingSeconds === 0 || timeRemainingSeconds === "0") return "No time remaining";
  
  const remaining = Number(timeRemainingSeconds);
  if (remaining <= 0) return "Voting period ended";
  
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
  console.log("🏆 Reading winning date voting data (no gas fees)...\n");

  try {
    // Connect with fallback system
    const provider = await connectWithFallback();
    
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}\n`);
    
    // Connect to contract (read-only)
    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get winning date voting information
    console.log("🏆 === WINNING DATE VOTING INFORMATION ===");
    const winningDateInfo = await bettingEvent.getWinningDateVotingInfo();
    
    // The getWinningDateVotingInfo function returns an array:
    // [votingStarted, votingDeadline, proposedDates, timeRemaining, currentRound]
    console.log(`📊 Voting started: ${winningDateInfo[0] ? 'YES' : 'NO'}`);
    console.log(`⏰ Voting deadline: ${winningDateInfo[1]} (${formatDate(winningDateInfo[1])})`);
    console.log(`⏱️  Time remaining: ${calculateTimeRemaining(winningDateInfo[3])}`);
    console.log(`🔄 Current round: ${winningDateInfo[4]}`);
    console.log(`📅 Number of proposed dates: ${winningDateInfo[2].length}`);
    
    // Show proposed dates
    if (winningDateInfo[2].length > 0) {
      console.log(`\n📅 Proposed dates:`);
      for (let i = 0; i < winningDateInfo[2].length; i++) {
        const timestamp = Number(winningDateInfo[2][i]);
        console.log(`   ${i + 1}. ${formatDate(timestamp)} (${timestamp})`);
      }
    } else {
      console.log(`📅 No dates have been proposed yet`);
    }
    
    // Get vote counts for all proposed dates
    console.log(`\n🗳️  === VOTE COUNTS FOR PROPOSED DATES ===`);
    
    try {
      const voteCounts = await bettingEvent.getAllDateVoteCounts();
      
      // The getAllDateVoteCounts function returns two arrays:
      // [dates, voteCounts]
      const dates = voteCounts[0];
      const counts = voteCounts[1];
      
      if (dates.length > 0 && counts.length > 0) {
        let totalVotes = 0;
        for (let i = 0; i < counts.length; i++) {
          totalVotes += Number(counts[i]);
        }
        
        console.log(`📊 Total votes cast: ${totalVotes}`);
        console.log(`\n🏆 Voting results:`);
        
        // Create array of date-vote pairs for sorting
        const dateVotePairs = [];
        for (let i = 0; i < dates.length; i++) {
          dateVotePairs.push({
            date: Number(dates[i]),
            votes: Number(counts[i]),
            percentage: totalVotes > 0 ? ((Number(counts[i]) / totalVotes) * 100).toFixed(1) : "0.0"
          });
        }
        
        // Sort by vote count (highest first)
        dateVotePairs.sort((a, b) => b.votes - a.votes);
        
        // Display sorted results
        for (let i = 0; i < dateVotePairs.length; i++) {
          const pair = dateVotePairs[i];
          const position = i === 0 ? "1." : i === 1 ? "2." : i === 2 ? "3." : `${i + 1}.`;
          const bar = "█".repeat(Math.ceil((pair.votes / Math.max(...dateVotePairs.map(p => p.votes))) * 20));
          
          console.log(`   ${position} ${formatDate(pair.date)}`);
          console.log(`       Votes: ${pair.votes} (${pair.percentage}%) ${bar}`);
          console.log(`       Timestamp: ${pair.date}`);
          console.log(``);
        }
        
        // Analysis
        console.log(`📋 === VOTING ANALYSIS ===`);
        
        if (winningDateInfo[0]) {
          // Voting is active
          console.log(`🔴 Status: WINNING DATE VOTING IN PROGRESS`);
          
          if (totalVotes > 0) {
            const topVotes = dateVotePairs[0].votes;
            const topPercentage = parseFloat(dateVotePairs[0].percentage);
            
            console.log(`🏆 Leading date: ${formatDate(dateVotePairs[0].date)}`);
            console.log(`📊 Leading votes: ${topVotes} (${topPercentage}%)`);
            
            // Show consensus requirements
            const minVoteToEnd = 30; // As defined in the contract
            console.log(`🎯 Minimum votes needed: ${minVoteToEnd}`);
            console.log(`📊 Progress: ${totalVotes}/${minVoteToEnd} (${((totalVotes / minVoteToEnd) * 100).toFixed(1)}%)`);
            
            if (totalVotes >= minVoteToEnd) {
              console.log(`✅ Minimum vote threshold MET`);
              
              if (topPercentage >= 80) {
                console.log(`🎉 CONSENSUS REACHED (≥80%)`);
                console.log(`✅ Winner likely: ${formatDate(dateVotePairs[0].date)}`);
              } else if (topPercentage >= 50) {
                console.log(`⏳ PARTIAL CONSENSUS (50-79%)`);
                console.log(`🔄 Voting extended for more consensus`);
              } else {
                console.log(`❌ NO CONSENSUS (<50%)`);
                console.log(`🔄 Event may reopen if voting fails`);
              }
            } else {
              const remaining = minVoteToEnd - totalVotes;
              console.log(`⏳ Need ${remaining} more votes to reach minimum`);
            }
          } else {
            console.log(`📊 No votes cast yet`);
          }
          
        } else {
          // No voting active
          console.log(`🟢 Status: NO ACTIVE WINNING DATE VOTING`);
          console.log(`ℹ️  Winning date voting has not been initiated`);
          
          if (totalVotes > 0) {
            console.log(`📜 Previous voting session data:`);
            console.log(`   - Total votes: ${totalVotes}`);
            console.log(`   - Top choice: ${formatDate(dateVotePairs[0].date)} (${dateVotePairs[0].votes} votes)`);
          }
        }
        
      } else {
        console.log(`📊 No vote data available`);
        console.log(`ℹ️  No dates have been proposed or voted on yet`);
      }
      
    } catch (error) {
      console.log(`📊 No vote counts available (${error.message})`);
      console.log(`ℹ️  This is normal if no votes have been cast yet`);
    }
    
    console.log(`\n💡 === WINNING DATE VOTING REQUIREMENTS ===`);
    console.log(`📅 Event must be closed (ended) first`);
    console.log(`📅 Bet date must be before current time`);
    console.log(`⏰ Voting duration: 20 days`);
    console.log(`✅ Minimum total votes: 30`);
    console.log(`🎯 Consensus threshold: 80% for immediate win`);
    console.log(`⏳ Partial consensus: 50-79% extends voting`);
    console.log(`❌ Failed consensus: <50% reopens event`);
    
    console.log(`\n✅ Winning date voting data displayed successfully`);

  } catch (error) {
    console.error("❌ Error reading winning date voting data:", error.reason || error.message);
    
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