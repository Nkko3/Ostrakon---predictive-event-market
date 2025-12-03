const { ethers } = require("ethers");

// ⚠️ USER CONFIGURATION - MODIFY THESE VARIABLES ⚠️
// =================================================

// Insert your private key here (NEVER share this information!)
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";

// Your wallet address
const USER_ADDRESS = "YOUR_WALLET_ADDRESS_HERE";

// ID of the block where you placed your bet
// You can find this by checking your betting history or using view-event-data.js
const USER_BLOCK_ID = 1;

// Vote to end the event: true = vote to end, false = vote against ending
const VOTE_TO_END = true;

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
  // endEvent function
  {
    "inputs": [
      {"internalType": "uint256", "name": "_userBlockId", "type": "uint256"},
      {"internalType": "bool", "name": "_voteToEnd", "type": "bool"}
    ],
    "name": "endEvent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // getVotingInfo function to check voting status
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

// Function to extract revert reason from various error formats
function extractRevertReason(error) {
  const methods = [
    () => error.reason,
    () => error.data?.message,
    () => error.error?.message,
    () => error.message,
    () => error.data,
    () => error.error?.data,
    () => error.transaction?.data,
    () => error.receipt?.data
  ];

  for (const method of methods) {
    try {
      const result = method();
      if (result && typeof result === 'string' && result !== 'null') {
        return result;
      }
    } catch (e) {
      // Continue to next method
    }
  }
  return null;
}

// Function to decode revert reason from hex data
function decodeRevertReason(data) {
  if (!data || typeof data !== 'string') return null;
  
  try {
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    
    if (hex.startsWith('08c379a0')) {
      const reason = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + hex.slice(8))[0];
      return reason;
    }
    
    const bytes = ethers.getBytes('0x' + hex);
    const decoded = ethers.toUtf8String(bytes);
    if (decoded && decoded.length > 0) {
      return decoded;
    }
  } catch (e) {
    // Failed to decode
  }
  return null;
}

// Function to use staticCall to get better error messages
async function tryStaticCall(contract, userBlockId, voteToEnd) {
  try {
    console.log(`🔍 Checking transaction validity...`);
    await contract.endEvent.staticCall(userBlockId, voteToEnd);
    console.log(`✅ Transaction validation passed`);
    return null;
  } catch (staticError) {
    console.log(`❌ Transaction validation failed`);
    const reason = extractRevertReason(staticError);
    const decoded = staticError.data ? decodeRevertReason(staticError.data) : null;
    
    const errorMsg = decoded || reason || staticError.message;
    console.log(`🔍 Specific error: ${errorMsg}`);
    
    return errorMsg;
  }
}

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
    
    // Check wallet balance for gas fees
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    // Minimum balance for gas fees (0.001 ETH should be enough)
    const minBalance = ethers.parseEther("0.001");
    if (balance < minBalance) {
      console.error("❌ Error: Insufficient balance for gas fees!");
      process.exit(1);
    }

    // Get event information
    console.log("\n📊 === EVENT INFORMATION ===");
    const eventInfoResult = await bettingEvent.getEventInfo();
    
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
    console.log(`🎯 Total bets: ${currentBets}`);
    console.log(`🔓 Event open: ${isEventOpen}`);
    console.log(`🏦 Vault: ${ethers.formatEther(vault)} ETH`);

    if (!isEventOpen) {
      console.error("❌ Error: Event is already closed!");
      process.exit(1);
    }

    // Check if the specified block exists and get its information
    try {
      const blockInfoResult = await bettingEvent.getBlockInfo(USER_BLOCK_ID);
      const [
        blockId,
        blockBetValue,
        blockSFactor,
        blockSize,
        availableDatesAll,
        availableDatesForBetting,
        users,
        isBlockOpen
      ] = blockInfoResult;
      
      console.log(`\n🧱 === BLOCK ${USER_BLOCK_ID} INFORMATION ===`);
      console.log(`👥 Users in block: ${users.length}`);
      console.log(`💰 Block bet value: ${ethers.formatEther(blockBetValue)} ETH`);
      
      // Check if user has bet in this block
      const userHasBetInBlock = users.some(userAddr => 
        userAddr.toLowerCase() === wallet.address.toLowerCase()
      );
      
      if (!userHasBetInBlock) {
        console.error(`❌ Error: You have not placed a bet in block ${USER_BLOCK_ID}!`);
        console.log(`💡 Tip: Check your betting history or use a different block ID`);
        process.exit(1);
      }
      
      console.log(`✅ Confirmed: You have placed a bet in block ${USER_BLOCK_ID}`);
      
    } catch (error) {
      console.error(`❌ Error: Block ${USER_BLOCK_ID} does not exist or is invalid!`);
      process.exit(1);
    }

    console.log(`\n🗳️  === VOTING ACTION ===`);
    console.log(`🆔 Block ID: ${USER_BLOCK_ID}`);
    console.log(`🗳️  Vote: ${VOTE_TO_END ? 'YES - End the event' : 'NO - Keep the event running'}`);
    
    // Try static call first to get better error message
    const staticCallError = await tryStaticCall(bettingEvent, USER_BLOCK_ID, VOTE_TO_END);
    if (staticCallError) {
      console.error(`\n❌ Transaction will fail with error: ${staticCallError}`);
      console.error(`💡 Fix the issue before sending the transaction to avoid gas costs.`);
      // Still continue to show what would happen
    }
    
    // Call endEvent function
    console.log(`\n⏳ Initiating voting transaction...`);
    
    const tx = await bettingEvent.endEvent(USER_BLOCK_ID, VOTE_TO_END, {
      gasLimit: 200000 // Reasonable gas limit for voting
    });

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Vote submitted successfully!`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔗 View on Etherscan: https://etherscan.io/tx/${tx.hash}`);
      
      console.log(`\n💡 === NEXT STEPS ===`);
      console.log(`📊 Use "view-voting-info.js" to check the current voting status`);
      console.log(`🗳️  Your vote: ${VOTE_TO_END ? 'TO END' : 'AGAINST ENDING'} the event`);
      
    } else {
      console.log(`❌ Transaction failed!`);
    }

  } catch (error) {
    console.error("\n❌ Error during voting:");
    
    // Extract the most specific error message available
    let errorMessage = extractRevertReason(error);
    
    // Try to decode hex data if available
    if (!errorMessage && error.data) {
      errorMessage = decodeRevertReason(error.data);
    }
    
    // Fallback to generic message
    if (!errorMessage) {
      errorMessage = error.message || 'Unknown error';
    }
    
    console.error(`   ${errorMessage}`);
    
    // Provide specific guidance based on error content
    if (errorMessage.includes("User has already voted")) {
      console.error("\n💡 SPECIFIC ISSUE: This address has already voted in the current voting round");
      console.error("💡 SOLUTION: Wait for the next voting round or use a different address");
    } else if (errorMessage.includes("Event is closed")) {
      console.error("\n💡 SPECIFIC ISSUE: The betting event has been closed");
      console.error("💡 SOLUTION: Event voting has ended");
    } else if (errorMessage.includes("Not enough bets placed")) {
      console.error("\n💡 SPECIFIC ISSUE: Event needs at least 10 bets before voting can start");
      console.error("💡 SOLUTION: Wait for more participants to place bets");
    } else if (errorMessage.includes("User is punished")) {
      console.error("\n💡 SPECIFIC ISSUE: Your address is temporarily blocked from voting");
      console.error("💡 SOLUTION: Wait for the punishment period to expire");
    } else if (errorMessage.includes("User has not placed a bet")) {
      console.error("\n💡 SPECIFIC ISSUE: You haven't placed a bet in the specified block");
      console.error(`💡 SOLUTION: Check if you bet in block ${USER_BLOCK_ID} or use the correct block ID`);
    } else if (errorMessage.includes("100 days have not passed") || errorMessage.includes("1 days")) {
      console.error("\n💡 SPECIFIC ISSUE: Event voting period has not started yet");
      console.error("💡 SOLUTION: Event needs to be 1+ days old for testing");
    } else if (errorMessage.includes("Bet value is less than")) {
      console.error("\n💡 SPECIFIC ISSUE: Your bet value is too small");
      console.error("💡 SOLUTION: Bet must be ≥0.33% of total vault");
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("\n💡 SPECIFIC ISSUE: Insufficient ETH for gas fees");
      console.error("💡 SOLUTION: Add more ETH to your wallet");
    } else if (error.code === 'NETWORK_ERROR') {
      console.error("\n💡 SPECIFIC ISSUE: Network connection problem");
      console.error("💡 SOLUTION: Check your internet connection and RPC URL");
    } else {
      console.error("\n💡 GENERAL GUIDANCE:");
      console.error("💡 Check the contract requirements and your parameters");
      console.error("💡 Ensure your address has bet in the correct block");
      console.error("💡 Verify the event is old enough and has enough bets");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });