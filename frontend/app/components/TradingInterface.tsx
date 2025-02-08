"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, TOKENS } from "../lib/constants";
import { AI_ORACLE_ABI, PORTFOLIO_MANAGER_ABI } from "../lib/abis";

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
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [autoTrading, setAutoTrading] = useState(false);
  const [tradingLogs, setTradingLogs] = useState<TradeLog[]>([]);
  const [settings, setSettings] = useState<TradeSettings>({
    [TOKENS.AERO]: {
      enabled: true,
      minConfidence: 70,
      maxRiskScore: 50,
      tradeAmount: "",
    },
    // Add more tokens here as needed
  });
  const [error, setError] = useState<string | null>(null);
  const [lastTradeTimes, setLastTradeTimes] = useState<{
    [key: string]: number;
  }>({});
  const TRADE_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [addingToken, setAddingToken] = useState(false);

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
      setLoading((prev) => ({ ...prev, [tokenAddress]: true }));
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
      setLoading((prev) => ({ ...prev, [tokenAddress]: false }));
    }
  };

  const executeTrade = async (tokenAddress: string) => {
    const prediction = predictions[tokenAddress];
    const tokenSettings = settings[tokenAddress];
    if (!prediction || !tokenSettings || !tokenSettings.enabled) return;

    try {
      setLoading((prev) => ({ ...prev, [tokenAddress]: true }));
      setError(null);

      if (!window.ethereum) {
        throw new Error("No ethereum provider found");
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      addLog("Checking portfolio status...", "info", tokenAddress);
      const portfolioManager = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const portfolio = await portfolioManager.userPortfolios(userAddress);
      if (!portfolio.isActive) {
        const message = "No active portfolio found";
        setError(message);
        addLog(message, "error", tokenAddress);
        return;
      }

      addLog("Validating token approvals...", "info", tokenAddress);
      const isUSDCApproved = await portfolioManager.approvedTokens(TOKENS.USDC);
      const isTargetApproved = await portfolioManager.approvedTokens(
        tokenAddress
      );
      if (!isUSDCApproved || !isTargetApproved) {
        const message = "One or more tokens not approved for trading";
        setError(message);
        addLog(message, "error", tokenAddress);
        return;
      }

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
        const message = "Target token is potential honeypot - Trade cancelled";
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

      // Execute trade
      addLog(
        `Executing trade: ${tokenSettings.tradeAmount} USDC → ${getTokenSymbol(
          tokenAddress
        )}`,
        "info",
        tokenAddress
      );
      const amount = ethers.parseUnits(tokenSettings.tradeAmount, 6);
      const tx = await portfolioManager.executeAITrade(
        userAddress,
        TOKENS.USDC,
        tokenAddress,
        amount
      );

      addLog("Waiting for transaction confirmation...", "info", tokenAddress);
      await tx.wait();
      addLog(
        `Trade executed successfully! TX: ${tx.hash}`,
        "success",
        tokenAddress
      );

      setLastTradeTimes((prev) => ({
        ...prev,
        [tokenAddress]: Date.now(),
      }));
    } catch (error: unknown) {
      console.error("Error executing trade:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute trade";
      setError(errorMessage);
      addLog(errorMessage, "error", tokenAddress);
    } finally {
      setLoading((prev) => ({ ...prev, [tokenAddress]: false }));
    }
  };

  const toggleAutoTrading = async () => {
    try {
      setAutoTrading(!autoTrading);
      if (!autoTrading) {
        startAutoTrading();
      }
    } catch (error) {
      console.error("Error toggling auto-trading:", error);
    }
  };

  const startAutoTrading = async () => {
    while (autoTrading) {
      // Fetch predictions and execute trades for all enabled tokens
      for (const [tokenAddress, tokenSettings] of Object.entries(settings)) {
        if (tokenSettings.enabled) {
          await fetchPrediction(tokenAddress);
          if (predictions[tokenAddress] && !error) {
            await executeTrade(tokenAddress);
          }
        }
      }
      addLog(`Waiting ${TRADE_COOLDOWN / 1000} seconds before next check...`);
      await new Promise((resolve) => setTimeout(resolve, TRADE_COOLDOWN));
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

  // Function to add a new token
  const addToken = async () => {
    try {
      if (!isValidAddress(newTokenAddress)) {
        setError("Invalid token address");
        return;
      }

      setAddingToken(true);
      setError(null);

      // Check if token already exists
      if (settings[newTokenAddress]) {
        setError("Token already added");
        return;
      }

      if (!window.ethereum) {
        throw new Error("No ethereum provider found");
      }

      // Try to get token info
      const provider = new ethers.BrowserProvider(window.ethereum);
      const tokenContract = new ethers.Contract(
        newTokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)",
        ],
        provider
      );

      let tokenSymbol;
      try {
        tokenSymbol = await tokenContract.symbol();
      } catch (error) {
        console.error("Error getting token symbol:", error);
        tokenSymbol = "Unknown Token";
      }

      // Add new token to settings
      setSettings((prev) => ({
        ...prev,
        [newTokenAddress]: {
          enabled: false,
          minConfidence: 70,
          maxRiskScore: 50,
          tradeAmount: "",
          name: tokenSymbol,
        },
      }));

      // Clear input
      setNewTokenAddress("");
      addLog(`Added new token: ${tokenSymbol} (${newTokenAddress})`, "success");
    } catch (error) {
      console.error("Error adding token:", error);
      setError("Failed to add token");
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
      <h3 className="text-xl font-semibold mb-4">AI Trading Dashboard</h3>

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
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
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
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
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

        {/* Token Settings */}
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Minimum Confidence (%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tokenSettings.minConfidence}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      [tokenAddress]: {
                        ...prev[tokenAddress],
                        minConfidence: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full"
                  disabled={!tokenSettings.enabled}
                />
                <span className="text-sm">{tokenSettings.minConfidence}%</span>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Maximum Risk Score
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tokenSettings.maxRiskScore}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      [tokenAddress]: {
                        ...prev[tokenAddress],
                        maxRiskScore: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full"
                  disabled={!tokenSettings.enabled}
                />
                <span className="text-sm">{tokenSettings.maxRiskScore}</span>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Trade Amount (USDC)
                </label>
                <input
                  type="number"
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
                  className="w-full p-2 border rounded"
                  placeholder="Enter amount"
                  disabled={!tokenSettings.enabled}
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

              <button
                onClick={() => executeTrade(tokenAddress)}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                disabled={
                  loading[tokenAddress] ||
                  !tokenSettings.tradeAmount ||
                  autoTrading ||
                  !tokenSettings.enabled
                }
              >
                {loading[tokenAddress]
                  ? "Processing..."
                  : `Execute Manual Trade (${getTokenSymbol(tokenAddress)})`}
              </button>
            </div>
          </div>
        ))}

        {/* Trading Logs */}
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

        {/* Auto-Trading Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Auto-Trading (All Enabled Tokens)
            </span>
            <button
              onClick={toggleAutoTrading}
              className={`px-4 py-2 rounded ${
                autoTrading
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white`}
              disabled={Object.values(loading).some((isLoading) => isLoading)}
            >
              {autoTrading ? "Stop Trading" : "Start Trading"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
