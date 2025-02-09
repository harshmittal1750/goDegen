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
      const usdcContract = new ethers.Contract(
        TOKENS.USDC,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
          "function balanceOf(address account) external view returns (uint256)",
        ],
        signer
      );

      // Check allowance
      const allowance = await usdcContract.allowance(
        userAddress,
        CONTRACT_ADDRESSES.aiTrader
      );

      if (allowance < tradeAmount) {
        addLog("Approving USDC spending...", "info");
        const approveTx = await usdcContract.approve(
          CONTRACT_ADDRESSES.aiTrader,
          ethers.MaxUint256 // Infinite approval
        );
        addLog("Waiting for approval transaction...", "info");
        await approveTx.wait();
        addLog("USDC approved successfully!", "success");
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

      // Use the known CBBTC/USDC pool
      const CBBTC_USDC_POOL = "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef";
      const POOL_FEE = 500; // 0.05% fee tier for this pool

      addLog(`Using CBBTC/USDC pool: ${CBBTC_USDC_POOL}`, "info");

      // Get quote to verify trade
      const quoterContract = new ethers.Contract(
        "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 on Base
        [
          "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
        ],
        provider
      );

      try {
        addLog("Getting quote for trade...", "info");

        // Call the quote function with individual parameters
        const [amountOut] =
          await quoterContract.quoteExactInputSingle.staticCall(
            TOKENS.USDC,
            TOKENS.CBBTC,
            POOL_FEE,
            tradeAmount,
            0,
            { gasLimit: 500000 }
          );

        if (amountOut <= 0) {
          throw new Error("Quote returned zero output amount");
        }

        const formattedAmountOut = ethers.formatUnits(amountOut, 8); // CBBTC has 8 decimals
        addLog(
          `Pool has sufficient liquidity. Expected output: ${formattedAmountOut} CBBTC`,
          "success"
        );

        // Now execute the trade
        const aiTraderContract = new ethers.Contract(
          CONTRACT_ADDRESSES.aiTrader,
          AI_TRADER_ABI,
          signer
        );

        addLog("Executing trade...", "info");
        const tx = await aiTraderContract.executeManualTrade(
          TOKENS.USDC,
          TOKENS.CBBTC,
          tradeAmount,
          userAddress,
          {
            gasLimit: 1000000,
          }
        );

        addLog("Waiting for transaction confirmation...");
        await tx.wait();
        addLog(`Trade executed successfully! TX: ${tx.hash}`, "success");
      } catch (quoteError) {
        console.error("Quote error:", quoteError);
        // Add more specific error handling
        if (quoteError instanceof Error) {
          if (quoteError.message.includes("missing revert data")) {
            throw new Error(
              "Failed to get quote - pool may not be initialized or may have insufficient liquidity"
            );
          }
          if (quoteError.message.includes("execution reverted")) {
            throw new Error(
              "Quote execution reverted - please try a smaller amount or check pool status"
            );
          }
          if (quoteError.message.includes("STF")) {
            throw new Error(
              "Transfer failed - please check your USDC balance and allowance"
            );
          }
        }
        throw new Error(
          "Failed to quote trade - please check pool liquidity and try again"
        );
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
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      const amountIn = ethers.parseUnits(settings.tradeAmount, 6); // USDC has 6 decimals
      addLog("Checking pool liquidity...", "info");

      try {
        // Use the known CBBTC/USDC pool
        const CBBTC_USDC_POOL = "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef";
        const POOL_FEE = 500; // 0.05% fee tier for this pool

        addLog(`Using CBBTC/USDC pool: ${CBBTC_USDC_POOL}`, "info");

        // Get quote to verify trade
        const quoterContract = new ethers.Contract(
          "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 on Base
          [
            "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
          ],
          provider
        );

        try {
          addLog("Getting quote for trade...", "info");

          // Call the quote function with individual parameters
          const [amountOut] =
            await quoterContract.quoteExactInputSingle.staticCall(
              TOKENS.USDC,
              TOKENS.CBBTC,
              POOL_FEE,
              amountIn,
              0,
              { gasLimit: 500000 }
            );

          if (amountOut <= 0) {
            throw new Error("Quote returned zero output amount");
          }

          const formattedAmountOut = ethers.formatUnits(amountOut, 8); // CBBTC has 8 decimals
          addLog(
            `Pool has sufficient liquidity. Expected output: ${formattedAmountOut} CBBTC`,
            "success"
          );

          // Now execute the trade
          const aiTraderContract = new ethers.Contract(
            CONTRACT_ADDRESSES.aiTrader,
            AI_TRADER_ABI,
            signer
          );

          addLog("Executing trade...", "info");
          const tx = await aiTraderContract.executeManualTrade(
            TOKENS.USDC,
            TOKENS.CBBTC,
            amountIn,
            userAddress,
            {
              gasLimit: 1000000,
            }
          );

          addLog("Waiting for transaction confirmation...");
          await tx.wait();
          addLog(`Trade executed successfully! TX: ${tx.hash}`, "success");
        } catch (quoteError) {
          console.error("Quote error:", quoteError);
          // Add more specific error handling
          if (quoteError instanceof Error) {
            if (quoteError.message.includes("missing revert data")) {
              throw new Error(
                "Failed to get quote - pool may not be initialized or may have insufficient liquidity"
              );
            }
            if (quoteError.message.includes("execution reverted")) {
              throw new Error(
                "Quote execution reverted - please try a smaller amount or check pool status"
              );
            }
            if (quoteError.message.includes("STF")) {
              throw new Error(
                "Transfer failed - please check your USDC balance and allowance"
              );
            }
          }
          throw new Error(
            "Failed to quote trade - please check pool liquidity and try again"
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
