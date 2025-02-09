import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import {
  PORTFOLIO_MANAGER_ABI,
  AI_ORACLE_ABI,
  CONTRACT_ADDRESSES,
  TOKENS,
  AI_TRADER_ABI,
} from "../lib/constants";

interface AutoTradingSettings {
  enabled: boolean;
  minConfidence: number;
  maxRiskScore: number;
  tradeAmount: string;
}

interface TradeLog {
  timestamp: number;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export function AutoTrading() {
  const [settings, setSettings] = useState<AutoTradingSettings>({
    enabled: false,
    minConfidence: 80,
    maxRiskScore: 20,
    tradeAmount: "100",
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const autoTradingInterval = useRef<NodeJS.Timeout | null>(null);
  const TRADE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    loadSettings();
    return () => {
      if (autoTradingInterval.current) {
        clearInterval(autoTradingInterval.current);
      }
    };
  }, []);

  const addLog = (message: string, type: TradeLog["type"] = "info") => {
    setLogs((prev) => [
      {
        timestamp: Date.now(),
        message,
        type,
      },
      ...prev.slice(0, 49),
    ]);
  };

  const loadSettings = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const settings = await portfolioContract.getAutoTradingSettings(
        userAddress
      );
      setSettings({
        enabled: settings[0],
        minConfidence: Number(settings[1]),
        maxRiskScore: Number(settings[2]),
        tradeAmount: ethers.formatUnits(settings[3], 6), // USDC has 6 decimals
      });

      // If auto-trading is enabled, start monitoring
      if (settings[0]) {
        startAutoTrading();
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading auto-trading settings:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load settings"
      );
      setLoading(false);
    }
  };

  const checkAndExecuteTrade = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // Get AI prediction for CBBTC
      const oracleContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiOracle,
        AI_ORACLE_ABI,
        provider
      );

      // Use CBBTC instead of AERO
      const prediction = await oracleContract.getPrediction(TOKENS.CBBTC);
      addLog(
        `Received prediction for CBBTC - Confidence: ${prediction.confidence}%, Risk: ${prediction.riskScore}`
      );

      // Check if prediction meets criteria
      if (Number(prediction.confidence) < settings.minConfidence) {
        addLog("Confidence too low - skipping trade", "warning");
        return;
      }

      if (Number(prediction.riskScore) > settings.maxRiskScore) {
        addLog("Risk too high - skipping trade", "warning");
        return;
      }

      if (prediction.isHoneypot) {
        addLog("Potential honeypot detected - skipping trade", "warning");
        return;
      }

      // Check USDC balance before trading
      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const usdcBalance = await portfolioContract.getTokenBalance(
        userAddress,
        TOKENS.USDC
      );
      const tradeAmount = ethers.parseUnits(settings.tradeAmount, 6);

      if (usdcBalance < tradeAmount) {
        addLog("Insufficient USDC balance for trade", "error");
        return;
      }

      // First approve USDC spending if needed
      const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
      const usdcContract = new ethers.Contract(
        TOKENS.USDC,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
          "function balanceOf(address account) external view returns (uint256)",
        ],
        signer
      );

      // Check Permit2 allowance first
      const permit2Contract = new ethers.Contract(
        PERMIT2_ADDRESS,
        [
          "function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
          "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
        ],
        signer
      );

      // First approve USDC for Permit2 if needed
      const usdcPermit2Allowance = await usdcContract.allowance(
        userAddress,
        PERMIT2_ADDRESS
      );

      if (usdcPermit2Allowance < tradeAmount) {
        addLog("Approving USDC for Permit2...", "info");
        const approveTx = await usdcContract.approve(
          PERMIT2_ADDRESS,
          ethers.MaxUint256 // Infinite approval for Permit2
        );
        addLog("Waiting for Permit2 approval transaction...", "info");
        await approveTx.wait();
        addLog("USDC approved for Permit2!", "success");
      }

      // Now check and set allowance for AI Trader through Permit2
      const [permit2Allowance, permit2Expiration] =
        await permit2Contract.allowance(
          userAddress,
          TOKENS.USDC,
          CONTRACT_ADDRESSES.aiTrader
        );

      if (
        permit2Allowance < tradeAmount ||
        permit2Expiration < Math.floor(Date.now() / 1000)
      ) {
        addLog("Setting Permit2 allowance for AI Trader...", "info");
        const permitTx = await permit2Contract.approve(
          TOKENS.USDC,
          CONTRACT_ADDRESSES.aiTrader,
          BigInt("0x" + "f".repeat(40)), // Max uint160
          BigInt(0xffffffffffff) // Max uint48
        );
        addLog("Waiting for Permit2 allowance transaction...", "info");
        await permitTx.wait();
        addLog("Permit2 allowance set for AI Trader!", "success");
      }

      // Execute trade through AI_Trader contract
      addLog("Executing trade through AI Trader...");
      const aiTraderContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiTrader,
        AI_TRADER_ABI,
        signer
      );

      // Check if tokens are whitelisted
      const isUSDCWhitelisted = await aiTraderContract.whitelistedTokens(
        TOKENS.USDC
      );
      const isCBBTCWhitelisted = await aiTraderContract.whitelistedTokens(
        TOKENS.CBBTC
      );

      if (!isUSDCWhitelisted || !isCBBTCWhitelisted) {
        throw new Error("One or both tokens are not whitelisted for trading");
      }

      // Check minimum trade amount
      const minTradeAmount = await aiTraderContract.MIN_TRADE_AMOUNT();
      if (tradeAmount < minTradeAmount) {
        throw new Error(
          `Trade amount too low. Minimum is ${ethers.formatUnits(
            minTradeAmount,
            6
          )} USDC`
        );
      }

      // Get quote to verify trade
      const quoterContract = new ethers.Contract(
        "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 on Base
        [
          "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
          "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)",
        ],
        provider // Use provider instead of signer since we'll use staticCall
      );

      // First find the best pool with liquidity
      const factoryContract = new ethers.Contract(
        "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // UniswapV3Factory on Base
        ["function getPool(address,address,uint24) view returns (address)"],
        provider
      );

      // Try different fee tiers
      const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
      let foundPool = false;
      let bestPool = "";
      let bestFee = 0;
      let bestLiquidity = BigInt(0);
      let workingPool = false;

      for (const fee of feeTiers) {
        const poolAddress = await factoryContract.getPool(
          TOKENS.USDC,
          TOKENS.CBBTC,
          fee
        );

        if (poolAddress !== "0x0000000000000000000000000000000000000000") {
          // Check pool liquidity
          const usdcContract = new ethers.Contract(
            TOKENS.USDC,
            ["function balanceOf(address) view returns (uint256)"],
            provider
          );

          const liquidity = await usdcContract.balanceOf(poolAddress);
          if (liquidity > 0) {
            addLog(
              `Found pool with fee tier ${
                fee / 10000
              }% and ${ethers.formatUnits(liquidity, 6)} USDC liquidity`,
              "info"
            );

            // Try to get a quote from this pool to verify it's working
            try {
              const params = {
                tokenIn: TOKENS.USDC,
                tokenOut: TOKENS.CBBTC,
                amountIn: ethers.parseUnits(settings.tradeAmount, 6),
                fee: fee,
                sqrtPriceLimitX96: BigInt(0),
              };

              const [testQuote] =
                await quoterContract.quoteExactInputSingle.staticCall(params);

              if (testQuote > 0) {
                addLog(
                  `Pool with fee tier ${
                    fee / 10000
                  }% is working - using this pool`,
                  "success"
                );
                bestLiquidity = liquidity;
                bestPool = poolAddress;
                bestFee = fee;
                foundPool = true;
                workingPool = true;
                break; // Found a working pool, no need to check others
              }
            } catch (quoteError) {
              addLog(
                `Pool with fee tier ${
                  fee / 10000
                }% exists but is not initialized or has issues`,
                "warning"
              );
              // If this pool has more liquidity than our current best, save it as a backup
              if (liquidity > bestLiquidity && !workingPool) {
                bestLiquidity = liquidity;
                bestPool = poolAddress;
                bestFee = fee;
                foundPool = true;
              }
              continue; // Try next fee tier
            }
          }
        }
      }

      if (!foundPool) {
        throw new Error("No pool found with liquidity for USDC/CBBTC pair");
      }

      if (!workingPool) {
        throw new Error(
          "No initialized pool found - all pools with liquidity are not ready for trading"
        );
      }

      const formattedLiquidity = ethers.formatUnits(bestLiquidity, 6);
      addLog(
        `Using pool at ${bestPool} with ${formattedLiquidity} USDC liquidity`,
        "info"
      );
      addLog(`Using fee tier: ${bestFee / 10000}%`, "info");

      addLog(`Getting quote for ${settings.tradeAmount} USDC...`, "info");

      try {
        // Try single pool quote first as it's simpler
        const params = {
          tokenIn: TOKENS.USDC,
          tokenOut: TOKENS.CBBTC,
          amountIn: ethers.parseUnits(settings.tradeAmount, 6), // USDC has 6 decimals
          fee: bestFee,
          sqrtPriceLimitX96: BigInt(0),
        };

        try {
          addLog(
            `Attempting single pool quote with fee tier ${bestFee / 10000}%`,
            "info"
          );
          const [amountOut] =
            await quoterContract.quoteExactInputSingle.staticCall(params);

          if (amountOut === BigInt(0)) {
            throw new Error(
              "Quote returned zero tokens - insufficient liquidity"
            );
          }

          addLog(
            `Quote received: ${ethers.formatUnits(amountOut, 18)} tokens out`,
            "success"
          );
        } catch (error) {
          // If single pool quote fails, try path-based quote
          addLog(
            `Single pool quote failed (${
              error instanceof Error ? error.message : "unknown error"
            }), trying path-based quote...`,
            "info"
          );

          // Encode the path for the quote
          // For Uniswap V3 pools, path format: [tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)]
          const encodedPath = ethers.concat([
            ethers.getBytes(TOKENS.USDC),
            new Uint8Array([
              bestFee & 0xff,
              (bestFee >> 8) & 0xff,
              (bestFee >> 16) & 0xff,
            ]),
            ethers.getBytes(TOKENS.CBBTC),
          ]);

          const [amountOut] = await quoterContract.quoteExactInput.staticCall(
            encodedPath,
            ethers.parseUnits(settings.tradeAmount, 6)
          );

          if (amountOut === BigInt(0)) {
            throw new Error(
              "Quote returned zero tokens - insufficient liquidity"
            );
          }

          addLog(
            `Quote received: ${ethers.formatUnits(amountOut, 18)} tokens out`,
            "success"
          );
        }
      } catch (error: Error | unknown) {
        console.error("Quote error:", error);

        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message?.includes("missing revert data")) {
            throw new Error(
              "Failed to get quote - pool may not be initialized or may have insufficient liquidity. Please try a smaller amount or verify the pool exists."
            );
          }

          if (error.message?.includes("insufficient liquidity")) {
            throw new Error(
              "Pool has insufficient liquidity for this trade amount. Please try a smaller amount."
            );
          }

          // For other errors, provide a more detailed error message
          throw new Error(
            `Failed to get quote: ${error.message} - Please try a different amount or check pool status`
          );
        }

        // For unknown error types
        throw new Error("An unexpected error occurred while getting the quote");
      }

      // Now execute the trade
      addLog("Executing trade...", "info");
      try {
        // First check if the contract has USDC approval
        const usdcAllowance = await usdcContract.allowance(
          userAddress,
          CONTRACT_ADDRESSES.aiTrader
        );
        addLog(
          `Current USDC allowance: ${ethers.formatUnits(
            usdcAllowance,
            6
          )} USDC`,
          "info"
        );

        // Check if the contract is approved to spend USDC
        if (usdcAllowance < tradeAmount) {
          addLog("Approving USDC spend for AI Trader...", "info");
          const approveTx = await usdcContract.approve(
            CONTRACT_ADDRESSES.aiTrader,
            ethers.MaxUint256
          );
          await approveTx.wait();
          addLog("USDC approved for AI Trader", "success");
        }

        // Get current gas price
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);
        addLog(
          `Current gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`,
          "info"
        );

        // Estimate gas for the transaction
        const gasEstimate =
          await aiTraderContract.executeManualTrade.estimateGas(
            TOKENS.USDC,
            TOKENS.CBBTC,
            tradeAmount,
            userAddress,
            { gasLimit: 1000000 }
          );
        addLog(`Estimated gas: ${gasEstimate}`, "info");

        // Execute the trade with the estimated gas * 1.2 for safety
        const tx = await aiTraderContract.executeManualTrade(
          TOKENS.USDC,
          TOKENS.CBBTC,
          tradeAmount,
          userAddress,
          {
            gasLimit: (gasEstimate * BigInt(12)) / BigInt(10),
          }
        );

        addLog(`Transaction sent: ${tx.hash}`, "info");
        addLog("Waiting for transaction confirmation...");

        // Wait for transaction with more detailed error handling
        try {
          const receipt = await tx.wait();

          if (receipt.status === 0) {
            throw new Error(
              "Transaction failed - check if you have sufficient USDC and allowance"
            );
          }

          addLog(`Trade executed successfully! TX: ${tx.hash}`, "success");
          addLog(`Gas used: ${receipt.gasUsed}`, "info");
        } catch (waitError) {
          console.error("Error waiting for transaction:", waitError);
          if (waitError instanceof Error) {
            if (waitError.message.includes("insufficient funds")) {
              throw new Error("Insufficient ETH for gas");
            }
            throw new Error(`Transaction failed: ${waitError.message}`);
          }
          throw new Error("Transaction failed for unknown reason");
        }
      } catch (error) {
        console.error("Trade execution error:", error);

        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes("insufficient allowance")) {
            throw new Error(
              "Insufficient USDC allowance - please approve spending"
            );
          }
          if (error.message.includes("insufficient balance")) {
            throw new Error("Insufficient USDC balance");
          }
          if (error.message.includes("execution reverted")) {
            throw new Error(
              "Trade execution reverted - check USDC balance and allowance"
            );
          }
          throw error;
        }

        throw new Error("Unknown error during trade execution");
      }
    } catch (error) {
      console.error("Error in auto-trading:", error);
      addLog(
        error instanceof Error ? error.message : "Error executing trade",
        "error"
      );
    }
  };

  const startAutoTrading = () => {
    if (autoTradingInterval.current) {
      clearInterval(autoTradingInterval.current);
    }

    // Execute immediately
    checkAndExecuteTrade();

    // Then set up interval
    autoTradingInterval.current = setInterval(
      checkAndExecuteTrade,
      TRADE_CHECK_INTERVAL
    );
    addLog("Auto-trading started", "success");
  };

  const stopAutoTrading = () => {
    if (autoTradingInterval.current) {
      clearInterval(autoTradingInterval.current);
      autoTradingInterval.current = null as unknown as NodeJS.Timeout;
    }
    addLog("Auto-trading stopped", "info");
  };

  const updateSettings = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      setUpdating(true);
      setError(null);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const tx = await portfolioContract.updateAutoTrading(
        settings.enabled,
        settings.minConfidence,
        settings.maxRiskScore,
        ethers.parseUnits(settings.tradeAmount, 6)
      );

      await tx.wait();

      // Start or stop auto-trading based on enabled setting
      if (settings.enabled) {
        startAutoTrading();
      } else {
        stopAutoTrading();
      }

      setUpdating(false);
      addLog("Settings updated successfully", "success");
    } catch (error) {
      console.error("Error updating auto-trading settings:", error);
      setError(
        error instanceof Error ? error.message : "Failed to update settings"
      );
      setUpdating(false);
    }
  };

  const testAutoTrade = async () => {
    try {
      setUpdating(true);
      addLog("Starting test auto trade...", "info");

      // Check if auto-trading is enabled
      if (!settings.enabled) {
        throw new Error("Please enable auto-trading first");
      }

      // Check if trade amount is set
      if (!settings.tradeAmount || parseFloat(settings.tradeAmount) <= 0) {
        throw new Error("Please set a valid trade amount");
      }

      // Setup provider and signer
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      addLog("Checking pool liquidity...", "info");

      try {
        // Use the known CBBTC/USDC pool
        const CBBTC_USDC_POOL = "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef";

        addLog(`Using CBBTC/USDC pool: ${CBBTC_USDC_POOL}`, "info");

        // Get quote to verify trade
        const quoterContract = new ethers.Contract(
          "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 on Base
          [
            "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
            "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)",
          ],
          provider // Use provider instead of signer since we'll use staticCall
        );

        // First find the best pool with liquidity
        const factoryContract = new ethers.Contract(
          "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // UniswapV3Factory on Base
          ["function getPool(address,address,uint24) view returns (address)"],
          provider
        );

        // Try different fee tiers
        const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
        let foundPool = false;
        let bestPool = "";
        let bestFee = 0;
        let bestLiquidity = BigInt(0);
        let workingPool = false;

        for (const fee of feeTiers) {
          const poolAddress = await factoryContract.getPool(
            TOKENS.USDC,
            TOKENS.CBBTC,
            fee
          );

          if (poolAddress !== "0x0000000000000000000000000000000000000000") {
            // Check pool liquidity
            const usdcContract = new ethers.Contract(
              TOKENS.USDC,
              ["function balanceOf(address) view returns (uint256)"],
              provider
            );

            const liquidity = await usdcContract.balanceOf(poolAddress);
            if (liquidity > 0) {
              addLog(
                `Found pool with fee tier ${
                  fee / 10000
                }% and ${ethers.formatUnits(liquidity, 6)} USDC liquidity`,
                "info"
              );

              // Try to get a quote from this pool to verify it's working
              try {
                const params = {
                  tokenIn: TOKENS.USDC,
                  tokenOut: TOKENS.CBBTC,
                  amountIn: ethers.parseUnits(settings.tradeAmount, 6),
                  fee: fee,
                  sqrtPriceLimitX96: BigInt(0),
                };

                const [testQuote] =
                  await quoterContract.quoteExactInputSingle.staticCall(params);

                if (testQuote > 0) {
                  addLog(
                    `Pool with fee tier ${
                      fee / 10000
                    }% is working - using this pool`,
                    "success"
                  );
                  bestLiquidity = liquidity;
                  bestPool = poolAddress;
                  bestFee = fee;
                  foundPool = true;
                  workingPool = true;
                  break; // Found a working pool, no need to check others
                }
              } catch (quoteError) {
                addLog(
                  `Pool with fee tier ${
                    fee / 10000
                  }% exists but is not initialized or has issues`,
                  "warning"
                );
                // If this pool has more liquidity than our current best, save it as a backup
                if (liquidity > bestLiquidity && !workingPool) {
                  bestLiquidity = liquidity;
                  bestPool = poolAddress;
                  bestFee = fee;
                  foundPool = true;
                }
                continue; // Try next fee tier
              }
            }
          }
        }

        if (!foundPool) {
          throw new Error("No pool found with liquidity for USDC/CBBTC pair");
        }

        if (!workingPool) {
          throw new Error(
            "No initialized pool found - all pools with liquidity are not ready for trading"
          );
        }

        const formattedLiquidity = ethers.formatUnits(bestLiquidity, 6);
        addLog(
          `Using pool at ${bestPool} with ${formattedLiquidity} USDC liquidity`,
          "info"
        );
        addLog(`Using fee tier: ${bestFee / 10000}%`, "info");

        addLog(`Getting quote for ${settings.tradeAmount} USDC...`, "info");

        try {
          // Try single pool quote first as it's simpler
          const params = {
            tokenIn: TOKENS.USDC,
            tokenOut: TOKENS.CBBTC,
            amountIn: ethers.parseUnits(settings.tradeAmount, 6), // USDC has 6 decimals
            fee: bestFee,
            sqrtPriceLimitX96: BigInt(0),
          };

          try {
            addLog(
              `Attempting single pool quote with fee tier ${bestFee / 10000}%`,
              "info"
            );
            const [amountOut] =
              await quoterContract.quoteExactInputSingle.staticCall(params);

            if (amountOut === BigInt(0)) {
              throw new Error(
                "Quote returned zero tokens - insufficient liquidity"
              );
            }

            addLog(
              `Quote received: ${ethers.formatUnits(amountOut, 18)} tokens out`,
              "success"
            );
          } catch (error) {
            // If single pool quote fails, try path-based quote
            addLog(
              `Single pool quote failed (${
                error instanceof Error ? error.message : "unknown error"
              }), trying path-based quote...`,
              "info"
            );

            // Encode the path for the quote
            // For Uniswap V3 pools, path format: [tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)]
            const encodedPath = ethers.concat([
              ethers.getBytes(TOKENS.USDC),
              new Uint8Array([
                bestFee & 0xff,
                (bestFee >> 8) & 0xff,
                (bestFee >> 16) & 0xff,
              ]),
              ethers.getBytes(TOKENS.CBBTC),
            ]);

            const [amountOut] = await quoterContract.quoteExactInput.staticCall(
              encodedPath,
              ethers.parseUnits(settings.tradeAmount, 6)
            );

            if (amountOut === BigInt(0)) {
              throw new Error(
                "Quote returned zero tokens - insufficient liquidity"
              );
            }

            addLog(
              `Quote received: ${ethers.formatUnits(amountOut, 18)} tokens out`,
              "success"
            );
          }
        } catch (error: Error | unknown) {
          console.error("Quote error:", error);

          // Handle specific error cases
          if (error instanceof Error) {
            if (error.message?.includes("missing revert data")) {
              throw new Error(
                "Failed to get quote - pool may not be initialized or may have insufficient liquidity. Please try a smaller amount or verify the pool exists."
              );
            }

            if (error.message?.includes("insufficient liquidity")) {
              throw new Error(
                "Pool has insufficient liquidity for this trade amount. Please try a smaller amount."
              );
            }

            // For other errors, provide a more detailed error message
            throw new Error(
              `Failed to get quote: ${error.message} - Please try a different amount or check pool status`
            );
          }

          // For unknown error types
          throw new Error(
            "An unexpected error occurred while getting the quote"
          );
        }
      } catch (error) {
        throw new Error(
          "Failed to check liquidity: " + (error as Error).message
        );
      }

      addLog("Test auto trade completed successfully!", "success");
    } catch (error) {
      console.error("Error in test auto trade:", error);
      addLog(
        error instanceof Error ? error.message : "Test trade failed",
        "error"
      );
      setError(error instanceof Error ? error.message : "Test trade failed");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div>Loading auto-trading settings...</div>;
  }

  return (
    <div className="p-6 rounded-lg shadow-md ">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Auto-Trading Settings</h3>
        <button
          onClick={testAutoTrade}
          disabled={updating || !settings.enabled}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updating ? "Testing..." : "Test Auto Trade"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="ml-2">Enable Auto-Trading</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Minimum Confidence (0-100)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={settings.minConfidence}
            onChange={(e) =>
              setSettings({
                ...settings,
                minConfidence: parseInt(e.target.value),
              })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Maximum Risk Score (0-100)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={settings.maxRiskScore}
            onChange={(e) =>
              setSettings({
                ...settings,
                maxRiskScore: parseInt(e.target.value),
              })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Trade Amount (USDC)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={settings.tradeAmount}
            onChange={(e) =>
              setSettings({
                ...settings,
                tradeAmount: e.target.value,
              })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <button
          onClick={updateSettings}
          disabled={updating}
          className={`w-full px-4 py-2 text-white rounded ${
            updating
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {updating ? "Updating..." : "Update Settings"}
        </button>

        {/* Trading Logs */}
        <div className="mt-6">
          <h4 className="text-lg font-semibold mb-2">Auto-Trading Logs</h4>
          <div className="h-48 overflow-y-auto border rounded-lg p-4 space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-2 rounded ${
                  log.type === "error"
                    ? "bg-red-100 text-red-700"
                    : log.type === "warning"
                    ? "bg-yellow-100 text-yellow-700"
                    : log.type === "success"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                <span className="text-xs text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="ml-2">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-gray-500 text-center">
                No trading activity yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
