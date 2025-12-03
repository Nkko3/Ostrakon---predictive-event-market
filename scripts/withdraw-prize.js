const { ethers } = require("ethers");

// ⚠️ USER CONFIGURATION – CHANGE THESE VALUES ⚠️
// ====================================================

// Private key of the wallet that MIGHT be the winner
// (NEVER share this publicly; use only in a secure local environment)
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";

// Wallet address corresponding to the PRIVATE_KEY above
const USER_ADDRESS = "YOUR_WALLET_ADDRESS_HERE";

// Multiple RPC URLs with fallback (Ethereum mainnet)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://rpc.flashbots.net/"
];

// ====================================================
// DO NOT MODIFY BELOW THIS LINE (unless you know what you're doing)

// Contract address on Ethereum mainnet
const CONTRACT_ADDRESS = "0x5e91A52266139Ae87d012d0a47A5EBAc2aD084f2";

// Minimal ABI: only what we need
const CONTRACT_ABI = [
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
  // withdrawPrize
  {
    inputs: [],
    name: "withdrawPrize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// Utility to extract revert reason
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
    } catch (_) {
      // continua
    }
  }
  return null;
}

// Decode revert reason (when it comes in hex format)
function decodeRevertReason(data) {
  if (!data || typeof data !== "string") return null;

  try {
    const hex = data.startsWith("0x") ? data.slice(2) : data;

    // Padrão Error(string)
    if (hex.startsWith("08c379a0")) {
      const reason = ethers.AbiCoder.defaultAbiCoder().decode(
        ["string"],
        "0x" + hex.slice(8)
      )[0];
      return reason;
    }

    const bytes = ethers.getBytes("0x" + hex);
    const decoded = ethers.toUtf8String(bytes);
    if (decoded && decoded.length > 0) {
      return decoded;
    }
  } catch (_) {
    // ignore
  }
  return null;
}

// Try to connect to each RPC URL until one works
async function connectWithFallback() {
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      console.log(`🔄 Tentando RPC ${i + 1}/${RPC_URLS.length}...`);
      const provider = new ethers.JsonRpcProvider(RPC_URLS[i]);
      await provider.getNetwork();
      console.log(`✅ Conectado à RPC ${i + 1}`);
      return provider;
    } catch (error) {
      console.log(`❌ RPC ${i + 1} falhou: ${error.message}`);
      if (i === RPC_URLS.length - 1) {
        throw new Error("Todas as RPCs falharam");
      }
    }
  }
}

// Use a static call to check if withdrawPrize will revert
async function tryStaticWithdraw(contract) {
  try {
    console.log("🔍 Validating withdrawPrize via static call...");
    await contract.withdrawPrize.staticCall();
    console.log("✅ Static call approved – the transaction could be successful");
    return null;
  } catch (staticError) {
    console.log("❌ Static call failed");
    const reason = extractRevertReason(staticError);
    const decoded = staticError.data ? decodeRevertReason(staticError.data) : null;
    const errorMsg = decoded || reason || staticError.message;
    console.log(`🔍 Specific reason: ${errorMsg}`);
    return errorMsg;
  }
}

async function main() {
  console.log("🌐 Connecting to Ethereum mainnet network...");

  // Validate basic configuration
  if (PRIVATE_KEY === "YOUR_PRIVATE_KEY_HERE") {
    console.error("❌ Error: Please configure your PRIVATE_KEY in the script!");
    process.exit(1);
  }

  if (USER_ADDRESS === "YOUR_WALLET_ADDRESS_HERE") {
    console.error("❌ Error: Please configure your USER_ADDRESS in the script!");
    process.exit(1);
  }

  try {
    const provider = await connectWithFallback();
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`👤 Using wallet: ${wallet.address}`);
    console.log(`📍 Contract address: ${CONTRACT_ADDRESS}`);

    if (wallet.address.toLowerCase() !== USER_ADDRESS.toLowerCase()) {
      console.error("❌ Error: USER_ADDRESS does not match PRIVATE_KEY!");
      process.exit(1);
    }

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);

    const minBalance = ethers.parseEther("0.001");
    if (balance < minBalance) {
      console.error("❌ Error: Balance may be insufficient to pay for gas! (min 0.001 ETH)");
      process.exit(1);
    }

    const bettingEvent = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    console.log("\n🏆 Consultando informações do prêmio (getPrizeInfo)...");
    const prizeInfo = await bettingEvent.getPrizeInfo();

    // prizeInfo pode vir como array ou objeto, dependendo da versão do ethers
    const canWithdraw = prizeInfo.canWithdraw ?? prizeInfo[0];
    const totalPrize = prizeInfo.totalPrize ?? prizeInfo[1];
    const vaultAmount = prizeInfo.vaultAmount ?? prizeInfo[2];
    const contributionAmount = prizeInfo.contributionAmount ?? prizeInfo[3];
    const winner = prizeInfo.winner ?? prizeInfo[4];
    const winningDate = prizeInfo.winningDate ?? prizeInfo[5];

    console.log(`  canWithdraw: ${canWithdraw}`);
    console.log(`  totalPrize: ${ethers.formatEther(totalPrize)} ETH`);
    console.log(`  vaultAmount: ${ethers.formatEther(vaultAmount)} ETH`);
    console.log(`  contributionAmount: ${ethers.formatEther(contributionAmount)} ETH`);
    console.log(`  winner: ${winner}`);
    if (winningDate > 0n || Number(winningDate) > 0) {
      const dateNum = Number(winningDate);
      console.log(
        `  winningDate: ${dateNum} (${new Date(dateNum * 1000).toISOString()})`
      );
    }

    // Check 1: is there a winner configured?
    if (!winner || winner === ethers.ZeroAddress) {
      console.error("❌ Error: No winner defined in the contract (winner == address(0)).");
      console.error("💡 Make sure that the eventCompleted function has been executed successfully.");
      process.exit(1);
    }

    // Check 2: is this wallet the winner?
    if (winner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error("❌ Error: This wallet is NOT the winner.");
      console.error(`   Winner in the contract: ${winner}`);
      console.error(`   Your wallet:            ${wallet.address}`);
      console.error("💡 Use the private key/address of the winning wallet.");
      process.exit(1);
    }

    // Check 3: does the contract indicate that it is already possible to withdraw?
    if (!canWithdraw) {
      console.error("❌ Error: canWithdraw == false – it is not yet possible to withdraw.");
      console.error("💡 Check if the event has been correctly finalized (eventCompleted).");
      process.exit(1);
    }

    // Static call para prever erro de revert
    const staticError = await tryStaticWithdraw(bettingEvent);
    if (staticError) {
      console.error("\n❌ The actual transaction will likely fail.");
      console.error("💡 Fix the issue before sending to avoid wasting gas.");
      process.exit(1);
    }

    console.log("\n⏳ Sending withdrawPrize transaction...");
    const tx = await bettingEvent.withdrawPrize({
      gasLimit: 400000
    });

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();

    if (receipt.status === 1n || receipt.status === 1) {
      console.log("✅ Transaction confirmed successfully!");
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔗 See on Etherscan: https://etherscan.io/tx/${tx.hash}`);

      // Show new wallet balance
      const newBalance = await provider.getBalance(wallet.address);
      console.log(
        `💰 New wallet balance: ${ethers.formatEther(newBalance)} ETH`
      );

      // Query prizeInfo again
      try {
        console.log("\n🏆 Prize info after withdrawal:");
        const prizeInfoAfter = await bettingEvent.getPrizeInfo();
        const canWithdrawAfter = prizeInfoAfter.canWithdraw ?? prizeInfoAfter[0];
        const totalPrizeAfter = prizeInfoAfter.totalPrize ?? prizeInfoAfter[1];
        const vaultAmountAfter = prizeInfoAfter.vaultAmount ?? prizeInfoAfter[2];
        const contributionAmountAfter =
          prizeInfoAfter.contributionAmount ?? prizeInfoAfter[3];
        const winnerAfter = prizeInfoAfter.winner ?? prizeInfoAfter[4];

        console.log(`  canWithdraw: ${canWithdrawAfter}`);
        console.log(
          `  totalPrize: ${ethers.formatEther(totalPrizeAfter)} ETH`
        );
        console.log(
          `  vaultAmount: ${ethers.formatEther(vaultAmountAfter)} ETH`
        );
        console.log(
          `  contributionAmount: ${ethers.formatEther(
            contributionAmountAfter
          )} ETH`
        );
        console.log(`  winner: ${winnerAfter}`);
      } catch (e) {
        console.log("⚠️ Could not fetch prizeInfo after withdrawal.");
      }
    } else {
      console.error("❌ Transaction failed (status != 1).");
    }
  } catch (error) {
    console.error("\n❌ Error during withdrawPrize call:");

    let errorMessage = extractRevertReason(error);

    if (!errorMessage && error.data) {
      errorMessage = decodeRevertReason(error.data);
    }

    if (!errorMessage) {
      errorMessage = error.message || "Unknown error";
    }

    console.error(`   ${errorMessage}`);

    // Suggestions based on common error messages
    if (errorMessage.includes("Event is still open")) {
      console.error("\n💡 SPECIFIC ISSUE: The event is still open.");
      console.error("💡 SOLUTION: Close the event via voting (endEvent + eventCompleted).");
    } else if (errorMessage.includes("Only winner can withdraw")) {
      console.error("\n💡 SPECIFIC ISSUE: Only the winner can withdraw.");
      console.error("💡 SOLUTION: Use the wallet of the winner returned by getPrizeInfo().");
    } else if (errorMessage.includes("Prize already withdrawn")) {
      console.error("\n💡 SPECIFIC ISSUE: The prize has already been withdrawn.");
    } else if (error.code === "INSUFFICIENT_FUNDS") {
      console.error("\n💡 SPECIFIC ISSUE: Insufficient balance to pay for gas.");
      console.error("💡 SOLUTION: Send more ETH to this wallet.");
    } else if (error.code === "NETWORK_ERROR") {
      console.error("\n💡 SPECIFIC ISSUE: Network connection error.");
      console.error("💡 SOLUTION: Check your internet connection and the RPC URLs.");
    } else {
      console.error("\n💡 GENERAL GUIDANCE:");
      console.error("💡 Check if the event has been closed and if you are the winner.");
      console.error("💡 Confirm that canWithdraw == true in getPrizeInfo().");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });