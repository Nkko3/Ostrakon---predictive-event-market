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

// Chosen winning date (Unix timestamp at 00:00:00 UTC)
// Example: 1768435200 corresponds to 2026-01-15 00:00:00 UTC
const CHOSEN_DATE =  1768435200;

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

// Contract ABI - only functions we need
const CONTRACT_ABI = [
  // getEventInfo function
  {
    inputs: [],
    name: "getEventInfo",
    outputs: [
      { internalType: "address", name: "eventOwner", type: "address" },
      { internalType: "string", name: "eventDescription", type: "string" },
      { internalType: "uint256", name: "currentBetValue", type: "uint256" },
      { internalType: "uint256", name: "currentSFactor", type: "uint256" },
      { internalType: "uint256", name: "currentBlockId", type: "uint256" },
      { internalType: "uint256", name: "currentBets", type: "uint256" },
      { internalType: "uint256", name: "vault", type: "uint256" },
      { internalType: "uint256", name: "contributionVault", type: "uint256" },
      { internalType: "bool", name: "isEventOpen", type: "bool" },
      { internalType: "uint256", name: "baseTimestamp", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // getBlockInfo function
  {
    inputs: [{ internalType: "uint256", name: "blockId", type: "uint256" }],
    name: "getBlockInfo",
    outputs: [
      { internalType: "uint256", name: "blockId", type: "uint256" },
      { internalType: "uint256", name: "blockBetValue", type: "uint256" },
      { internalType: "uint256", name: "blockSFactor", type: "uint256" },
      { internalType: "uint256", name: "blockSize", type: "uint256" },
      { internalType: "uint256[]", name: "availableDates", type: "uint256[]" },
      { internalType: "uint256[]", name: "availableDatesForBetting", type: "uint256[]" },
      { internalType: "address[]", name: "users", type: "address[]" },
      { internalType: "bool", name: "isBlockOpen", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // getUserChoice function
  {
    inputs: [
      { internalType: "uint256", name: "_blockId", type: "uint256" },
      { internalType: "address", name: "_user", type: "address" }
    ],
    name: "getUserChoice",
    outputs: [
      { internalType: "uint256", name: "choice", type: "uint256" },
      { internalType: "uint256", name: "registrationDate", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // getWinningDateVotingInfo
  {
    inputs: [],
    name: "getWinningDateVotingInfo",
    outputs: [
      { internalType: "bool", name: "votingStarted", type: "bool" },
      { internalType: "uint256", name: "votingDeadline", type: "uint256" },
      { internalType: "uint256[]", name: "proposedDates", type: "uint256[]" },
      { internalType: "uint256", name: "timeRemaining", type: "uint256" },
      { internalType: "uint256", name: "currentRound", type: "uint256" },
      { internalType: "uint256", name: "eventCompletedTimestamp", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // getAllDateVoteCounts
  {
    inputs: [],
    name: "getAllDateVoteCounts",
    outputs: [
      { internalType: "uint256[]", name: "dates", type: "uint256[]" },
      { internalType: "uint256[]", name: "voteCounts", type: "uint256[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // getPrizeInfo
  {
    inputs: [],
    name: "getPrizeInfo",
    outputs: [
      { internalType: "bool", name: "canWithdraw", type: "bool" },
      { internalType: "uint256", name: "totalPrize", type: "uint256" },
      { internalType: "uint256", name: "vaultAmount", type: "uint256" },
      { internalType: "uint256", name: "contributionAmount", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "uint256", name: "winningDate", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // eventCompleted function
  {
    inputs: [
      { internalType: "uint256", name: "_userBlockId", type: "uint256" },
      { internalType: "uint256", name: "_winningDate", type: "uint256" }
    ],
    name: "eventCompleted",
    outputs: [
      { internalType: "uint256", name: "winningDate", type: "uint256" },
      { internalType: "uint256", name: "voteCount", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
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
      if (result && typeof result === "string" && result !== "null") {
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
  if (!data || typeof data !== "string") return null;

  try {
    const hex = data.startsWith("0x") ? data.slice(2) : data;

    if (hex.startsWith("08c379a0")) {
      const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + hex.slice(8))[0];
      return reason;
    }

    const bytes = ethers.getBytes("0x" + hex);
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
async function tryStaticCall(contract, userBlockId, chosenDate) {
  try {
    console.log("🔍 Checking transaction validity...");
    await contract.eventCompleted.staticCall(userBlockId, chosenDate);
    console.log("✅ Transaction validation passed");
    return null;
  } catch (staticError) {
    console.log("❌ Transaction validation failed");
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

  if (PRIVATE_KEY === "YOUR_PRIVATE_KEY_HERE") {
    console.error("❌ Error: Configure your PRIVATE_KEY in the script!");
    process.exit(1);
  }

  if (USER_ADDRESS === "YOUR_WALLET_ADDRESS_HERE") {
    console.error("❌ Error: Configure your USER_ADDRESS in the script!");
    process.exit(1);
  }

  if (!Number.isInteger(CHOSEN_DATE) || CHOSEN_DATE <= 0) {
    console.error("❌ Error: Configure a valid CHOSEN_DATE (Unix timestamp) in the script!");
    process.exit(1);
  }

  try {
    const provider = await connectWithFallback();
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`👤 Using wallet: ${wallet.address}`);
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}`);

    if (wallet.address.toLowerCase() !== USER_ADDRESS.toLowerCase()) {
      console.error("❌ Error: Wallet address does not match private key!");
      process.exit(1);
    }

    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);

    const minBalance = ethers.parseEther("0.001");
    if (balance < minBalance) {
      console.error("❌ Error: Insufficient balance for gas fees!");
      process.exit(1);
    }

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

    if (isEventOpen) {
      console.error("❌ Error: Event is still open! You must close it via voting (endEvent) before calling eventCompleted.");
      process.exit(1);
    }

    // Check block info and if user has a bet in this block
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

      const userHasBetInBlock = users.some(
        (userAddr) => userAddr.toLowerCase() === wallet.address.toLowerCase()
      );

      if (!userHasBetInBlock) {
        console.error(`❌ Error: You have not placed a bet in block ${USER_BLOCK_ID}!`);
        console.log("💡 Tip: Check your betting history or use a different block ID");
        process.exit(1);
      }

      console.log(`✅ Confirmed: You have placed a bet in block ${USER_BLOCK_ID}`);

      // Optional: show user's original bet date
      try {
        const userChoice = await bettingEvent.getUserChoice(USER_BLOCK_ID, wallet.address);
        const choiceDate = new Date(Number(userChoice.choice) * 1000);
        console.log(`📅 Your bet date in this block: ${choiceDate.toISOString()}`);
      } catch (e) {
        console.log("⚠️ Could not fetch your bet date (getUserChoice)");
      }
    } catch (error) {
      console.error(`❌ Error: Block ${USER_BLOCK_ID} does not exist or is invalid!`);
      process.exit(1);
    }

    const chosenDateJs = new Date(Number(CHOSEN_DATE) * 1000);
    console.log("\n🎯 === EVENT COMPLETED VOTE ===");
    console.log(`🆔 Block ID: ${USER_BLOCK_ID}`);
    console.log(`📅 Chosen date (Unix): ${CHOSEN_DATE}`);
    console.log(`📅 Chosen date (UTC): ${chosenDateJs.toISOString()}`);

    // Show winning-date voting info
    try {
      const winningInfo = await bettingEvent.getWinningDateVotingInfo();
      const [votingStarted, votingDeadline, proposedDates, timeRemaining, currentRound, eventCompletedTimestamp] = winningInfo;

      console.log("\n🗳️ Winning date voting info:");
      console.log(`  Voting started: ${votingStarted}`);
      console.log(`  Current round: ${currentRound}`);
      console.log(`  Time remaining (s): ${timeRemaining}`);
      if (Number(votingDeadline) > 0) {
        console.log(`  Consensus deadline: ${new Date(Number(votingDeadline) * 1000).toISOString()}`);
      }
    } catch (e) {
      console.log("⚠️ Could not fetch winning date voting info");
    }

    // Try static call first
    const staticCallError = await tryStaticCall(bettingEvent, USER_BLOCK_ID, CHOSEN_DATE);
    if (staticCallError) {
      console.error(`\n❌ Transaction will fail with error: ${staticCallError}`);
      console.error("💡 Fix the issue before sending the transaction to avoid gas costs.");
    }

    console.log("\n⏳ Sending eventCompleted transaction...");

    const tx = await bettingEvent.eventCompleted(USER_BLOCK_ID, CHOSEN_DATE, {
      gasLimit: 400000
    });

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();

    if (receipt.status === 1n || receipt.status === 1) {
      console.log("✅ Transaction confirmed!");
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔗 View on Etherscan: https://etherscan.io/tx/${tx.hash}`);

      // Check updated vote counts
      try {
        console.log("\n📊 Updated vote counts for proposed dates:");
        const dateVotes = await bettingEvent.getAllDateVoteCounts();
        const { dates, voteCounts } = dateVotes;

        for (let i = 0; i < dates.length; i++) {
          const d = new Date(Number(dates[i]) * 1000);
          console.log(`  ${d.toISOString()}: ${voteCounts[i]} votes`);
        }
      } catch (e) {
        console.log("⚠️ Could not fetch updated vote counts");
      }

      // Check prize info
      try {
        console.log("\n🏆 Prize info after vote:");
        const prizeInfo = await bettingEvent.getPrizeInfo();
        const { canWithdraw, totalPrize, vaultAmount, contributionAmount, winner, winningDate } = prizeInfo;
        console.log(`  Can withdraw: ${canWithdraw}`);
        console.log(`  Total prize: ${ethers.formatEther(totalPrize)} ETH`);
        console.log(`  Winner address: ${winner}`);
        if (winningDate > 0) {
          console.log(`  Winning date: ${new Date(Number(winningDate) * 1000).toISOString()}`);
        }
      } catch (e) {
        console.log("⚠️ Could not fetch prize info");
      }

      console.log("\n💡 NEXT STEPS:");
      console.log("📊 Use a view script to keep tracking votes and status");
      console.log("💰 Once canWithdraw=true and you are the winner, call withdrawPrize");
    } else {
      console.log("❌ Transaction failed!");
    }
  } catch (error) {
    console.error("\n❌ Error during eventCompleted call:");

    let errorMessage = extractRevertReason(error);

    if (!errorMessage && error.data) {
      errorMessage = decodeRevertReason(error.data);
    }

    if (!errorMessage) {
      errorMessage = error.message || "Unknown error";
    }

    console.error(`   ${errorMessage}`);

    // Specific guidance based on common revert messages
    if (errorMessage.includes("Event is still open")) {
      console.error("\n💡 SPECIFIC ISSUE: The event is still open.");
      console.error("💡 SOLUTION: Close the event first via voting (endEvent).");
    } else if (errorMessage.includes("User has not bet in the specified block")) {
      console.error("\n💡 SPECIFIC ISSUE: You haven't placed a bet in this block.");
      console.error("💡 SOLUTION: Use the correct block ID where you placed your bet.");
    } else if (errorMessage.includes("User's bet date must be before current time")) {
      console.error("\n💡 SPECIFIC ISSUE: Your bet date has not passed yet.");
      console.error("💡 SOLUTION: Wait until your bet date is in the past.");
    } else if (errorMessage.includes("Invalid winning date choice")) {
      console.error("\n💡 SPECIFIC ISSUE: The chosen winning date is invalid.");
      console.error("💡 SOLUTION: Ensure CHOSEN_DATE:");
      console.error("   - Is a 00:00:00 UTC timestamp (multiple of 86400)");
      console.error("   - Is >= baseTimestamp and < current block timestamp (not in future)");
      console.error("   - Is within the allowed range configured in the contract.");
    } else if (error.code === "INSUFFICIENT_FUNDS") {
      console.error("\n💡 SPECIFIC ISSUE: Insufficient ETH for gas fees.");
      console.error("💡 SOLUTION: Add more ETH to your wallet.");
    } else if (error.code === "NETWORK_ERROR") {
      console.error("\n💡 SPECIFIC ISSUE: Network connection problem.");
      console.error("💡 SOLUTION: Check your internet connection and RPC URL.");
    } else {
      console.error("\n💡 GENERAL GUIDANCE:");
      console.error("💡 Check the contract requirements and your parameters.");
      console.error("💡 Ensure the event is closed and you bet in the right block.");
      console.error("💡 Verify CHOSEN_DATE follows all validity rules.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
