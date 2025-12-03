const { ethers } = require("ethers");

// ⚠️ USER CONFIGURATION - MODIFY THESE VARIABLES ⚠️
// =================================================

// Insert your private key here (NEVER share this information!)
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";

// Your wallet address
const USER_ADDRESS = "YOUR_WALLET_ADDRESS_HERE";

// Bet value in ETH (View the value of the current block using "view-event-data.js") 
// (example: "0.00516")
const BET_VALUE = "0.00516";

// Timestamp of the chosen date for the bet
// Example: 1766016000 = 18 December 2025 00:00:00 UTC
// Use https://www.epochconverter.com/ to convert dates
// You should expect to see the date in your time zone (hour + minutes)
const CHOICE_TIMESTAMP = 1766016000;

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
  },
  // placeBet function
  {
    "inputs": [{"internalType": "uint256", "name": "choiceTimestamp", "type": "uint256"}],
    "name": "placeBet",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  // placeBetAndCreateBlock function
  {
    "inputs": [{"internalType": "uint256", "name": "choiceTimestamp", "type": "uint256"}],
    "name": "placeBetAndCreateBlock",
    "outputs": [],
    "stateMutability": "payable",
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
async function tryStaticCall(contract, functionName, args, value = null) {
  try {
    console.log(`🔍 Checking transaction validity...`);
    if (functionName === 'placeBet') {
      await contract.placeBet.staticCall(args[0], { value });
    } else if (functionName === 'placeBetAndCreateBlock') {
      await contract.placeBetAndCreateBlock.staticCall(args[0], { value });
    }
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
    
    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    const betValueWei = ethers.parseEther(BET_VALUE);
    if (balance < betValueWei) {
      console.error("❌ Error: Insufficient balance for the bet!");
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
    console.log(`💰 Current bet value: ${ethers.formatEther(currentBetValue)} ETH`);
    console.log(`🆔 Current block ID: ${currentBlockId}`);
    console.log(`🎯 Current bets in block: ${currentBets}`);
    console.log(`🔓 Event open: ${isEventOpen}`);

    if (!isEventOpen) {
      console.error("❌ Error: Event is closed for betting!");
      process.exit(1);
    }

    // Check if bet value is correct
    if (betValueWei !== currentBetValue) {
      console.error(`❌ Error: Incorrect bet value!`);
      console.error(`   Expected: ${ethers.formatEther(currentBetValue)} ETH`);
      console.error(`   Provided: ${BET_VALUE} ETH`);
      console.log(`💡 Tip: Update BET_VALUE variable to "${ethers.formatEther(currentBetValue)}"`);
      process.exit(1);
    }

    // Get current block information
    const blockInfoResult = await bettingEvent.getBlockInfo(currentBlockId);
    
    // Destructure the returned array
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
    
    console.log(`\n🧱 === BLOCK ${currentBlockId} INFORMATION ===`);
    console.log(`📏 Block size: ${blockSize}`);
    console.log(`👥 Current bettors: ${users.length}/${blockSize}`);
    console.log(`🔓 Block open: ${isBlockOpen}`);

    if (!isBlockOpen) {
      console.error("❌ Error: Current block is closed for betting!");
      process.exit(1);
    }

    // Filter dates that are at least 5 days in the future
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const fiveDaysInSeconds = 5 * 24 * 60 * 60; // 5 days in seconds
    const minValidTimestamp = currentTimestamp + fiveDaysInSeconds;
    
    const validDatesForBetting = availableDatesForBetting.filter(date => Number(date) >= minValidTimestamp);
    
    // Check if chosen date is available AND valid (5+ days in future)
    const isDateAvailable = availableDatesForBetting.some(date => Number(date) === CHOICE_TIMESTAMP);
    const isDateValid = CHOICE_TIMESTAMP >= minValidTimestamp;
    
    if (availableDatesForBetting.length > 0) {
      console.log(`🎯 Available dates for betting:`);
      for (let i = 0; i < availableDatesForBetting.length; i++) {
        const timestamp = Number(availableDatesForBetting[i]);
        const isSelected = timestamp === CHOICE_TIMESTAMP ? "👈 SELECTED" : "";
        const isValidFuture = timestamp >= minValidTimestamp ? "" : "❌ (Less than 5 days)";
        console.log(`   - ${new Date(timestamp * 1000).toLocaleString()} (${timestamp}) ${isSelected} ${isValidFuture}`);
      }
      
      console.log(`\n🎯 Valid dates for betting (5+ days in future):`);
      if (validDatesForBetting.length > 0) {
        for (let i = 0; i < validDatesForBetting.length; i++) {
          const timestamp = Number(validDatesForBetting[i]);
          const isSelected = timestamp === CHOICE_TIMESTAMP ? "👈 SELECTED" : "";
          console.log(`   - ${new Date(timestamp * 1000).toLocaleString()} (${timestamp}) ${isSelected}`);
        }
      } else {
        console.log(`   ❌ No dates available that are 5+ days in the future`);
      }
    }

    if (!isDateAvailable) {
      console.error(`❌ Error: The date ${new Date(CHOICE_TIMESTAMP * 1000).toLocaleString()} is not available for betting! The date was already chosen by another user or is invalid.`);
      process.exit(1);
    }
    
    if (!isDateValid) {
      console.error(`❌ Error: The date ${new Date(CHOICE_TIMESTAMP * 1000).toLocaleString()} must be at least 5 days in the future!`);
      console.error(`💡 Minimum valid date: ${new Date(minValidTimestamp * 1000).toLocaleString()}`);
      process.exit(1);
    }

    // Determine if this will be the last bet in the block
    const isLastBet = (users.length + 1) >= blockSize;
    const functionToCall = isLastBet ? "placeBetAndCreateBlock" : "placeBet";
    
    console.log(`\n💰 === PLACING BET ===`);
    console.log(`🎯 Function to call: ${functionToCall}`);
    console.log(`💰 Bet value: ${BET_VALUE} ETH`);
    console.log(`📅 Chosen date: ${new Date(CHOICE_TIMESTAMP * 1000).toLocaleString()} (You should expect to see the date in your time zone (hour + minutes))`);
    console.log(`🔢 Timestamp: ${CHOICE_TIMESTAMP}`);
    
    if (isLastBet) {
      console.log(`🚀 This will be the last bet in the block - a new block will be created!`);
    }

    // Try static call first to validate transaction
    const staticCallError = await tryStaticCall(
      bettingEvent, 
      functionToCall, 
      [CHOICE_TIMESTAMP], 
      betValueWei
    );
    
    if (staticCallError) {
      console.error(`\n❌ Transaction will fail with error: ${staticCallError}`);
      console.error(`💡 Fix the issue before sending the transaction to avoid gas costs.`);
      // Still continue to show what would happen
    }

    // Place the bet
    console.log(`\n⏳ Sending transaction...`);
    
    let tx;
    if (isLastBet) {
      tx = await bettingEvent.placeBetAndCreateBlock(CHOICE_TIMESTAMP, {
        value: betValueWei,
        gasLimit: 500000 // Higher gas limit for block creation
      });
    } else {
      tx = await bettingEvent.placeBet(CHOICE_TIMESTAMP, {
        value: betValueWei,
        gasLimit: 300000
      });
    }

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Bet placed successfully!`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔗 View on Etherscan: https://etherscan.io/tx/${tx.hash}`);
      
      // Show updated information
      console.log(`\n📊 === UPDATED INFORMATION ===`);
      const updatedEventInfoResult = await bettingEvent.getEventInfo();
      const [
        ,, // eventOwner, eventDescription (not needed)
        ,, // currentBetValue, currentSFactor (not needed)
        updatedCurrentBlockId,
        updatedCurrentBets,
        updatedVault,
        // contributionVault, isEventOpen, baseTimestamp (not needed)
      ] = updatedEventInfoResult;
      
      console.log(`🏦 Updated vault: ${ethers.formatEther(updatedVault)} ETH`);
      console.log(`🆔 Current block: ${updatedCurrentBlockId}`);
      console.log(`🎯 Bets in current block: ${updatedCurrentBets}`);
      
    } else {
      console.log(`❌ Transaction failed!`);
    }

  } catch (error) {
    console.error("\n❌ Error during betting:");
    
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
    if (errorMessage.includes("User has already placed a bet")) {
      console.error("\n💡 SPECIFIC ISSUE: This address has already placed a bet in the event");
      console.error("💡 SOLUTION: Each address can only bet once per event");
    } else if (errorMessage.includes("Incorrect bet value")) {
      console.error("\n💡 SPECIFIC ISSUE: The bet amount doesn't match the required value");
      console.error("💡 SOLUTION: Check the current bet value and update BET_VALUE variable");
    } else if (errorMessage.includes("Event is closed")) {
      console.error("\n💡 SPECIFIC ISSUE: The betting event has been closed");
      console.error("💡 SOLUTION: Event is no longer accepting bets");
    } else if (errorMessage.includes("Current block is closed")) {
      console.error("\n💡 SPECIFIC ISSUE: The current betting block is full");
      console.error("💡 SOLUTION: Wait for a new block to be created");
    } else if (errorMessage.includes("Block is full")) {
      console.error("\n💡 SPECIFIC ISSUE: The betting block has reached maximum capacity");
      console.error("💡 SOLUTION: Wait for the next block or use placeBetAndCreateBlock");
    } else if (errorMessage.includes("Invalid date choice") || errorMessage.includes("date already taken")) {
      console.error("\n💡 SPECIFIC ISSUE: The chosen date is invalid or already taken");
      console.error("💡 SOLUTION: Choose a different available date");
    } else if (errorMessage.includes("Date must be at least") || errorMessage.includes("days in the future")) {
      console.error("\n💡 SPECIFIC ISSUE: The chosen date is too close to current time");
      console.error("💡 SOLUTION: Choose a date at least 5 days in the future");
    } else if (errorMessage.includes("This is the last bet available")) {
      console.error("\n💡 SPECIFIC ISSUE: This is the final slot in the block");
      console.error("💡 SOLUTION: Use placeBetAndCreateBlock function instead");
    } else if (errorMessage.includes("This is not the last bet available")) {
      console.error("\n💡 SPECIFIC ISSUE: The block is not full yet");
      console.error("💡 SOLUTION: Use placeBet function instead of placeBetAndCreateBlock");
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("\n💡 SPECIFIC ISSUE: Insufficient ETH for bet + gas fees");
      console.error("💡 SOLUTION: Add more ETH to your wallet");
    } else if (error.code === 'NETWORK_ERROR') {
      console.error("\n💡 SPECIFIC ISSUE: Network connection problem");
      console.error("💡 SOLUTION: Check your internet connection and RPC URL");
    } else {
      console.error("\n💡 GENERAL GUIDANCE:");
      console.error("💡 Check if you have enough ETH for bet + gas fees");
      console.error("💡 Verify the bet value matches the current block requirement");
      console.error("💡 Ensure the chosen date is available and valid");
      console.error("💡 Confirm the event and block are open for betting");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });