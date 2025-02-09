"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Eip1193Provider } from "ethers";
import { CONTRACT_ADDRESSES, TOKENS } from "../lib/constants";
import {
  AI_ORACLE_ABI,
  PORTFOLIO_MANAGER_ABI,
  AI_TRADER_ABI,
} from "../lib/abis";

interface TradePrediction {
  confidence: number;
  priceDirection: number;
  timestamp: number;
  isHoneypot: boolean;
  riskScore: number;
}

interface TokenSettings {
  enabled: boolean;
  minConfidence: number;
  maxRiskScore: number;
  tradeAmount: string;
  name?: string; // Optional token name/symbol
}

interface TradeSettings {
  [tokenAddress: string]: TokenSettings;
}

interface TradeLog {
  timestamp: number;
  message: string;
  type: "info" | "success" | "warning" | "error";
  token?: string; // Token address this log is related to
}

interface TokenPredictions {
  [tokenAddress: string]: TradePrediction | null;
}

export function TradingInterface() {
  const [predictions, setPredictions] = useState<TokenPredictions>({});
  const [tradingLogs, setTradingLogs] = useState<TradeLog[]>([]);
  const [settings, setSettings] = useState<TradeSettings>({
    [TOKENS.AERO]: {
      enabled: true,
      minConfidence: 70,
      maxRiskScore: 50,
      tradeAmount: "",
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [lastTradeTimes, setLastTradeTimes] = useState<{
    [key: string]: number;
  }>({});
  const TRADE_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [addingToken, setAddingToken] = useState(false);
  const [degenMode, setDegenMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);

  const addLog = (
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    token?: string
  ) => {
    setTradingLogs((prev) =>
      [
        {
          timestamp: Date.now(),
          message,
          type,
          token,
        },
        ...prev,
      ].slice(0, 50)
    );
  };

  const fetchPrediction = async (tokenAddress: string) => {
    try {
      setIsLoading(true);
      setError(null);
      addLog(
        `Fetching prediction for ${getTokenSymbol(tokenAddress)}...`,
        "info",
        tokenAddress
      );

      if (!window.ethereum) {
        throw new Error("No ethereum provider found");
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const oracleContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiOracle,
        AI_ORACLE_ABI,
        provider
      );

      const prediction = await oracleContract.getPrediction(tokenAddress);
      const newPrediction = {
        confidence: Number(prediction.confidence),
        priceDirection: Number(prediction.priceDirection),
        timestamp: Number(prediction.timestamp),
        isHoneypot: prediction.isHoneypot,
        riskScore: Number(prediction.riskScore),
      };

      setPredictions((prev) => ({
        ...prev,
        [tokenAddress]: newPrediction,
      }));

      addLog(
        `Prediction received for ${getTokenSymbol(
          tokenAddress
        )} - Confidence: ${prediction.confidence}%, Direction: ${
          prediction.priceDirection > 0
            ? "Buy"
            : prediction.priceDirection < 0
            ? "Sell"
            : "Hold"
        }`,
        "info",
        tokenAddress
      );
    } catch (error) {
      console.error("Error fetching prediction:", error);
      setError("Failed to fetch prediction");
      addLog("Failed to fetch prediction", "error", tokenAddress);
    } finally {
      setIsLoading(false);
    }
  };

  const checkPoolLiquidity = async (
    tokenIn: string,
    tokenOut: string,
    amount: string
  ) => {
    try {
      if (!window.ethereum) throw new Error("No ethereum provider found");

      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
      const goDegenContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiTrader,
        AI_TRADER_ABI,
        provider
      );

      // First find the best pool
      addLog("Finding best pool...", "info");
      const [pool, fee] = await goDegenContract.findBestPool(tokenIn, tokenOut);
      if (!pool) {
        throw new Error("No liquidity pool found");
      }
      addLog(`Found pool with fee tier ${fee / 10000}%`, "success");

      // Get quote to check if trade is possible
      const quoterContract = new ethers.Contract(
        "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 on Base
        [
          "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
        ],
        provider
      );

      const amountIn = ethers.parseUnits(amount, 6); // USDC has 6 decimals
      addLog(`Getting quote for ${amount} USDC...`, "info");

      try {
        const [amountOut] = await quoterContract.quoteExactInputSingle(
          tokenIn,
          tokenOut,
          fee,
          amountIn,
          0 // sqrtPriceLimitX96
        );

        addLog(
          `Quote received: ${ethers.formatUnits(amountOut, 18)} tokens out`,
          "success"
        );
        return amountOut > 0;
      } catch (error: Error | unknown) {
        console.error("Quote error:", error);
        // Check if it's a specific error we can handle
        if (
          error instanceof Error &&
          error.message?.includes("insufficient liquidity")
        ) {
          throw new Error("Insufficient liquidity in pool");
        }
        throw new Error(
          `Failed to get quote: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    } catch (error) {
      console.error("Error checking liquidity:", error);
      throw error;
    }
  };

  const executeTrade = async (tokenAddress: string) => {
    const prediction = predictions[tokenAddress];
    const tokenSettings = settings[tokenAddress];
    if (!prediction || !tokenSettings || !tokenSettings.enabled) return;

    // Add validation for trade amount
    if (
      !tokenSettings.tradeAmount ||
      parseFloat(tokenSettings.tradeAmount) <= 0
    ) {
      setError("Please enter a valid trade amount");
      addLog("Trade failed: Invalid trade amount", "error", tokenAddress);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (!window.ethereum) {
        throw new Error("No ethereum provider found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // First check if tokens are whitelisted
      const aiTraderContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiTrader,
        AI_TRADER_ABI,
        provider
      );

      addLog("Checking token whitelist status...", "info", tokenAddress);
      const isUSDCWhitelisted = await aiTraderContract.whitelistedTokens(
        TOKENS.USDC
      );
      const isTokenWhitelisted = await aiTraderContract.whitelistedTokens(
        tokenAddress
      );

      if (!isUSDCWhitelisted || !isTokenWhitelisted) {
        throw new Error("One or both tokens are not whitelisted for trading");
      }
      addLog("Tokens are whitelisted ✓", "success", tokenAddress);

      // Check liquidity before proceeding
      addLog("Checking pool liquidity...", "info", tokenAddress);
      const hasLiquidity = await checkPoolLiquidity(
        TOKENS.USDC,
        tokenAddress,
        tokenSettings.tradeAmount
      );

      if (!hasLiquidity) {
        throw new Error("Insufficient liquidity in pool");
      }
      addLog("Pool has sufficient liquidity ✓", "success", tokenAddress);

      // Only check conditions if DEGEN MODE is off
      if (!degenMode) {
        // Validate trade conditions
        if (prediction.confidence < tokenSettings.minConfidence) {
          const message = `Confidence too low (${prediction.confidence}% < ${tokenSettings.minConfidence}%) - Waiting for better conditions`;
          addLog(message, "warning", tokenAddress);
          return;
        }

        if (prediction.riskScore > tokenSettings.maxRiskScore) {
          const message = `Risk score too high (${prediction.riskScore} > ${tokenSettings.maxRiskScore}) - Waiting for safer conditions`;
          addLog(message, "warning", tokenAddress);
          return;
        }

        if (prediction.isHoneypot) {
          const message =
            "Target token is potential honeypot - Trade cancelled";
          addLog(message, "error", tokenAddress);
          return;
        }

        const lastTradeTime = lastTradeTimes[tokenAddress] || 0;
        if (Date.now() - lastTradeTime < TRADE_COOLDOWN) {
          const remainingTime = Math.ceil(
            (TRADE_COOLDOWN - (Date.now() - lastTradeTime)) / 1000
          );
          const message = `Cooldown period active for ${getTokenSymbol(
            tokenAddress
          )} - Please wait ${remainingTime} seconds`;
          addLog(message, "warning", tokenAddress);
          return;
        }
      } else {
        // Log warnings in DEGEN MODE but continue with trade
        if (prediction.confidence < tokenSettings.minConfidence) {
          addLog(
            `DEGEN MODE: Ignoring low confidence (${prediction.confidence}%)`,
            "warning",
            tokenAddress
          );
        }
        if (prediction.riskScore > tokenSettings.maxRiskScore) {
          addLog(
            `DEGEN MODE: Ignoring high risk score (${prediction.riskScore})`,
            "warning",
            tokenAddress
          );
        }
        if (prediction.isHoneypot) {
          addLog(
            "DEGEN MODE: Ignoring honeypot warning",
            "warning",
            tokenAddress
          );
        }
      }

      // Execute trade
      addLog(
        `Preparing trade: ${tokenSettings.tradeAmount} USDC → ${getTokenSymbol(
          tokenAddress
        )}`,
        "info",
        tokenAddress
      );

      const amount = ethers.parseUnits(tokenSettings.tradeAmount, 6);

      // First check USDC balance
      addLog("Checking USDC balance...", "info", tokenAddress);
      const usdcContract = new ethers.Contract(
        TOKENS.USDC,
        [
          "function balanceOf(address) view returns (uint256)",
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
        ],
        signer
      );

      const balance = await usdcContract.balanceOf(userAddress);
      if (balance < amount) {
        throw new Error(
          `Insufficient USDC balance. You have ${ethers.formatUnits(
            balance,
            6
          )} USDC`
        );
      }
      addLog("USDC balance sufficient ✓", "success", tokenAddress);

      // Check and approve USDC spending
      addLog("Checking USDC allowance...", "info", tokenAddress);
      const allowance = await usdcContract.allowance(
        userAddress,
        CONTRACT_ADDRESSES.aiTrader
      );

      if (allowance < amount) {
        addLog("Approving USDC spending...", "info", tokenAddress);
        const approveTx = await usdcContract.approve(
          CONTRACT_ADDRESSES.aiTrader,
          ethers.MaxUint256
        );
        addLog("Waiting for approval transaction...", "info", tokenAddress);
        await approveTx.wait();
        addLog("USDC approved for spending ✓", "success", tokenAddress);
      } else {
        addLog("USDC already approved ✓", "success", tokenAddress);
      }

      // Execute trade through GoDegen (AI_Trader) contract
      addLog("Executing trade...", "info", tokenAddress);
      const aiTraderWithSigner = aiTraderContract.connect(
        signer
      ) as ethers.Contract & {
        executeManualTrade(
          tokenIn: string,
          tokenOut: string,
          amountIn: ethers.BigNumberish,
          recipient: string,
          options?: { gasLimit: number }
        ): Promise<ethers.ContractTransactionResponse>;
      };

      const tx = await aiTraderWithSigner.executeManualTrade(
        TOKENS.USDC,
        tokenAddress,
        amount,
        userAddress,
        {
          gasLimit: 1000000, // Add gas limit to prevent transaction failures
        }
      );

      addLog("Waiting for transaction confirmation...", "info", tokenAddress);
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Failed to get transaction receipt");
      }
      addLog(
        `Trade executed successfully! TX: ${receipt.hash}`,
        "success",
        tokenAddress
      );

      setLastTradeTimes((prev) => ({
        ...prev,
        [tokenAddress]: Date.now(),
      }));
    } catch (error) {
      console.error("Error executing trade:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute trade";
      setError(errorMessage);
      addLog(errorMessage, "error", tokenAddress);
    } finally {
      setIsLoading(false);
    }
  };

  const getTokenSymbol = (address: string): string => {
    // First check if it's a known token from TOKENS constant
    const knownToken = Object.entries(TOKENS).find(
      ([, tokenAddress]) => tokenAddress === address
    )?.[0];
    if (knownToken) return knownToken;

    // Then check if it has a custom name in settings
    return settings[address]?.name || "Unknown";
  };

  // Initial prediction fetch for all enabled tokens
  useEffect(() => {
    Object.entries(settings).forEach(([tokenAddress, tokenSettings]) => {
      if (tokenSettings.enabled) {
        fetchPrediction(tokenAddress);
      }
    });
  }, []);

  // Function to validate Ethereum address
  const isValidAddress = (address: string): boolean => {
    return ethers.isAddress(address);
  };

  // Function to check and approve tokens for trading
  const checkAndApproveTokens = async (tokenAddress: string) => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // Check if token is approved in PortfolioManager
      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const isTokenApproved = await portfolioContract.approvedTokens(
        tokenAddress
      );
      if (!isTokenApproved) {
        addLog(
          "Token not approved in PortfolioManager. Requesting approval...",
          "info"
        );
        const tx = await portfolioContract.addToken(tokenAddress);
        await tx.wait();
        addLog("Token approved in PortfolioManager", "success");
      }

      // Get token contract
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
        ],
        signer
      );

      // Check allowance for AI_Trader
      const allowance = await tokenContract.allowance(
        userAddress,
        CONTRACT_ADDRESSES.aiTrader
      );
      if (allowance.toString() === "0") {
        addLog("Approving token for AI_Trader...", "info");
        const approveTx = await tokenContract.approve(
          CONTRACT_ADDRESSES.aiTrader,
          ethers.MaxUint256 // Approve maximum amount
        );
        await approveTx.wait();
        addLog("Token approved for AI_Trader", "success");
      }

      return true;
    } catch (error) {
      console.error("Error approving tokens:", error);
      addLog("Failed to approve tokens: " + (error as Error).message, "error");
      return false;
    }
  };

  // Function to add a new token
  const addToken = async () => {
    try {
      console.log("Adding new token:", newTokenAddress);
      if (!isValidAddress(newTokenAddress)) {
        const error = "Invalid token address";
        console.error(error);
        setError(error);
        addLog(error, "error");
        return;
      }

      setAddingToken(true);
      setError(null);
      addLog(`Attempting to add token: ${newTokenAddress}`, "info");

      // Check if token already exists
      if (settings[newTokenAddress]) {
        const error = "Token already added";
        console.error(error);
        setError(error);
        addLog(error, "error");
        return;
      }

      if (!window.ethereum) {
        throw new Error("No ethereum provider found");
      }

      // First approve the token
      addLog("Checking token approval status...", "info");
      const isApproved = await checkAndApproveTokens(newTokenAddress);
      if (!isApproved) {
        throw new Error("Failed to approve token");
      }

      // Try to get token info
      const provider = new ethers.BrowserProvider(window.ethereum);
      const tokenContract = new ethers.Contract(
        newTokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)",
          "function name() view returns (string)",
        ],
        provider
      );

      let tokenSymbol, tokenName;
      try {
        tokenSymbol = await tokenContract.symbol();
        tokenName = await tokenContract.name();
        addLog(`Found token: ${tokenName} (${tokenSymbol})`, "info");
      } catch (error) {
        console.error("Error getting token info:", error);
        tokenSymbol = "Unknown Token";
        tokenName = "Unknown Token";
      }

      // Add new token to settings
      addLog("Adding token to trading list...", "info");
      setSettings((prev) => ({
        ...prev,
        [newTokenAddress]: {
          enabled: false,
          minConfidence: 70,
          maxRiskScore: 50,
          tradeAmount: "",
          name: `${tokenName} (${tokenSymbol})`,
        },
      }));

      // Clear input
      setNewTokenAddress("");
      addLog(
        `Successfully added token: ${tokenName} (${tokenSymbol}) at ${newTokenAddress}`,
        "success"
      );
    } catch (error) {
      console.error("Error adding token:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to add token";
      setError(errorMessage);
      addLog(errorMessage, "error");
    } finally {
      setAddingToken(false);
    }
  };

  // Function to remove a token
  const removeToken = (tokenAddress: string) => {
    setSettings((prev) => {
      const newSettings = { ...prev };
      delete newSettings[tokenAddress];
      return newSettings;
    });
    addLog(`Removed token: ${getTokenSymbol(tokenAddress)}`, "info");
  };

  return (
    <div className="p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-4">Manual Trading Dashboard</h3>

      {/* Add DEGEN MODE toggle at the top */}
      <div className="mb-6 flex items-center justify-between p-4 border rounded-lg bg-red-50">
        <div>
          <h4 className="text-lg font-semibold text-red-600">DEGEN MODE</h4>
          <p className="text-sm text-red-500">
            Warning: Bypasses all safety checks!
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={degenMode}
            onChange={(e) => setDegenMode(e.target.checked)}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
        </label>
      </div>

      <div className="grid gap-6">
        {/* Token Management */}
        <div className="p-4 border rounded-lg">
          <h4 className="text-lg font-semibold mb-4">Token Management</h4>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newTokenAddress}
              onChange={(e) => setNewTokenAddress(e.target.value)}
              placeholder="Enter token contract address"
              className="flex-1 p-2 border rounded"
              disabled={addingToken}
            />
            <button
              onClick={addToken}
              disabled={!newTokenAddress || addingToken}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {addingToken ? "Adding..." : "Add Token"}
            </button>
          </div>

          <div className="space-y-2">
            <h5 className="font-medium">Your Trading List:</h5>
            {Object.entries(settings).length === 0 ? (
              <p className="text-gray-500">No tokens added yet</p>
            ) : (
              <div className="grid gap-2">
                {Object.entries(settings).map(([address]) => (
                  <div
                    key={address}
                    className="flex items-center justify-between p-2 rounded"
                  >
                    <div>
                      <span className="font-medium">
                        {getTokenSymbol(address)}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        {address}
                      </span>
                    </div>
                    <button
                      onClick={() => removeToken(address)}
                      className="text-red-600 hover:text-red-800"
                      title="Remove token"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Token Settings and Trading */}
        {Object.entries(settings).map(([tokenAddress, tokenSettings]) => (
          <div key={tokenAddress} className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {getTokenSymbol(tokenAddress)}
              </h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={tokenSettings.enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      [tokenAddress]: {
                        ...prev[tokenAddress],
                        enabled: e.target.checked,
                      },
                    }))
                  }
                  className="mr-2"
                />
                Enable Trading
              </label>
            </div>

            {/* AI Predictions */}
            {predictions[tokenAddress] && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">Confidence</p>
                  <p className="text-lg font-semibold">
                    {predictions[tokenAddress].confidence}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Risk Score</p>
                  <p className="text-lg font-semibold">
                    {predictions[tokenAddress].riskScore}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Price Direction</p>
                  <p
                    className={`text-lg font-semibold ${
                      predictions[tokenAddress].priceDirection > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {predictions[tokenAddress].priceDirection > 0
                      ? "Up"
                      : "Down"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Honeypot Risk</p>
                  <p
                    className={`text-lg font-semibold ${
                      predictions[tokenAddress].isHoneypot
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {predictions[tokenAddress].isHoneypot
                      ? "High Risk"
                      : "Safe"}
                  </p>
                </div>
              </div>
            )}

            {/* Add Trade Amount Input */}
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">
                Trade Amount (USDC)
              </label>
              <input
                type="number"
                min="0"
                step="0.000001"
                value={tokenSettings.tradeAmount}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    [tokenAddress]: {
                      ...prev[tokenAddress],
                      tradeAmount: e.target.value,
                    },
                  }))
                }
                className="w-full p-2 border rounded mb-2"
                placeholder="Enter amount in USDC"
              />
            </div>

            {/* Prediction Display */}
            {predictions[tokenAddress] && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm text-gray-500">AI Confidence</p>
                  <p className="text-lg font-semibold">
                    {predictions[tokenAddress]?.confidence ?? 0}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Price Direction</p>
                  <div
                    className={`text-lg font-semibold ${
                      predictions[tokenAddress]?.priceDirection
                        ? predictions[tokenAddress]!.priceDirection > 0
                          ? "text-green-600"
                          : predictions[tokenAddress]!.priceDirection < 0
                          ? "text-red-600"
                          : "text-gray-600"
                        : "text-gray-600"
                    }`}
                  >
                    {predictions[tokenAddress]?.priceDirection
                      ? predictions[tokenAddress]!.priceDirection > 0
                        ? "↑ Buy Signal"
                        : predictions[tokenAddress]!.priceDirection < 0
                        ? "↓ Sell Signal"
                        : "→ Hold"
                      : "→ Hold"}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Risk Score</p>
                  <p className="text-lg font-semibold">
                    {predictions[tokenAddress]?.riskScore ?? 0}/100
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Honeypot Risk</p>
                  <p
                    className={`text-lg font-semibold ${
                      predictions[tokenAddress]?.isHoneypot
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {predictions[tokenAddress]?.isHoneypot
                      ? "High Risk"
                      : "Safe"}
                  </p>
                </div>
              </div>
            )}

            <div>
              <button
                onClick={() => {
                  console.log("Trade button clicked for", tokenAddress);
                  addLog(
                    `Initiating trade for ${getTokenSymbol(tokenAddress)}...`,
                    "info",
                    tokenAddress
                  );
                  if (
                    !tokenSettings.tradeAmount ||
                    parseFloat(tokenSettings.tradeAmount) <= 0
                  ) {
                    setError("Please enter a valid trade amount");
                    addLog(
                      "Trade failed: Invalid trade amount",
                      "error",
                      tokenAddress
                    );
                    return;
                  }
                  executeTrade(tokenAddress);
                }}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                disabled={
                  isLoading ||
                  !tokenSettings.enabled ||
                  !tokenSettings.tradeAmount
                }
              >
                {isLoading
                  ? "Processing..."
                  : `Execute Manual Trade (${getTokenSymbol(tokenAddress)})`}
              </button>
            </div>
          </div>
        ))}
        ,{/* Trading Logs */}
        <div className="mt-6">
          <h4 className="text-lg font-semibold mb-2">Trading Logs</h4>
          <div className="h-64 overflow-y-auto border rounded-lg p-4 space-y-2">
            {tradingLogs.map((log, index) => (
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
                {log.token && (
                  <span className="text-xs font-medium ml-2">
                    [{getTokenSymbol(log.token)}]
                  </span>
                )}
                <span className="ml-2">{log.message}</span>
              </div>
            ))}
            {tradingLogs.length === 0 && (
              <p className="text-gray-500 text-center">
                No trading activity yet
              </p>
            )}
          </div>
        </div>
        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}
      </div>
    </div>
  );
}
