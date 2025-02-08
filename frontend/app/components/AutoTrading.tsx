import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import {
  PORTFOLIO_MANAGER_ABI,
  AI_ORACLE_ABI,
  CONTRACT_ADDRESSES,
  TOKENS,
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
  const autoTradingInterval = useRef<ReturnType<typeof setInterval>>();
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

      const provider = new ethers.BrowserProvider(window.ethereum as any);
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

      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // Get AI prediction
      const oracleContract = new ethers.Contract(
        CONTRACT_ADDRESSES.aiOracle,
        AI_ORACLE_ABI,
        provider
      );

      const prediction = await oracleContract.getPrediction(TOKENS.AERO);
      addLog(
        `Received prediction - Confidence: ${prediction.confidence}%, Risk: ${prediction.riskScore}`
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

      if (Number(prediction.priceDirection) <= 0) {
        addLog("No positive price direction - skipping trade", "info");
        return;
      }

      // Execute trade
      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      // Check USDC balance before trading
      const usdcBalance = await portfolioContract.getTokenBalance(
        userAddress,
        TOKENS.USDC
      );
      const tradeAmount = ethers.parseUnits(settings.tradeAmount, 6);

      if (usdcBalance < tradeAmount) {
        addLog("Insufficient USDC balance for trade", "error");
        return;
      }

      addLog("Executing trade...");
      const tx = await portfolioContract.executeAITrade(
        userAddress,
        TOKENS.USDC,
        TOKENS.AERO,
        tradeAmount
      );

      addLog("Waiting for transaction confirmation...");
      await tx.wait();
      addLog(`Trade executed successfully! TX: ${tx.hash}`, "success");
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
      autoTradingInterval.current = undefined;
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

      const provider = new ethers.BrowserProvider(window.ethereum as any);
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

  if (loading) {
    return <div>Loading auto-trading settings...</div>;
  }

  return (
    <div className="p-6 rounded-lg shadow-md ">
      <h3 className="text-xl font-semibold mb-4">Auto-Trading Settings</h3>

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
