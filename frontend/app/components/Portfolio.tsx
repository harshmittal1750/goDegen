"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  PORTFOLIO_MANAGER_ABI,
  AI_ORACLE_ABI,
  CONTRACT_ADDRESSES,
  TOKENS,
} from "../lib/constants";
import { NetworkManager } from "./NetworkManager";
import { TradingInterface } from "./TradingInterface";
import { AutoTrading } from "./AutoTrading";

interface PortfolioData {
  totalValue: number;
  riskLevel: number;
  isActive: boolean;
  usdcBalance?: string;
  predictions: {
    confidence: number;
    priceDirection: number;
    timestamp: number;
    isHoneypot: boolean;
    riskScore: number;
  };
}

export function Portfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskLevel, setRiskLevel] = useState(5);
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS.USDC);
  const [isDepositing, setIsDepositing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();

        const portfolioContract = new ethers.Contract(
          CONTRACT_ADDRESSES.portfolioManager,
          PORTFOLIO_MANAGER_ABI,
          signer
        );

        const oracleContract = new ethers.Contract(
          CONTRACT_ADDRESSES.aiOracle,
          AI_ORACLE_ABI,
          provider
        );

        // Get portfolio data
        const portfolioData = await portfolioContract.userPortfolios(
          userAddress
        );

        // Get USDC balance
        let usdcBalance = "0";
        if (portfolioData.isActive) {
          const balance = await portfolioContract.getTokenBalance(
            userAddress,
            TOKENS.USDC
          );
          usdcBalance = ethers.formatUnits(balance, 6); // USDC has 6 decimals
        }

        // Get AI predictions for the selected token
        const predictions = await oracleContract.getPrediction(selectedToken);

        setPortfolio({
          totalValue: Number(portfolioData.totalValue),
          riskLevel: Number(portfolioData.riskLevel),
          isActive: portfolioData.isActive,
          usdcBalance,
          predictions: {
            confidence: Number(predictions.confidence),
            priceDirection: Number(predictions.priceDirection),
            timestamp: Number(predictions.timestamp),
            isHoneypot: predictions.isHoneypot,
            riskScore: Number(predictions.riskScore),
          },
        });

        setLoading(false);
      } catch (error) {
        console.error("Error loading portfolio:", error);
        setLoading(false);
      }
    };

    loadPortfolio();
  }, [selectedToken]);

  const createPortfolio = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const tx = await contract.createPortfolio(riskLevel);
      await tx.wait();

      // Reload portfolio data
      window.location.reload();
    } catch (error) {
      console.error("Error creating portfolio:", error);
    }
  };

  const handleDeposit = async () => {
    try {
      setIsDepositing(true);
      setErrorMessage(null);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // First check if token is approved in PortfolioManager
      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      // Check if token is approved in the contract
      const isTokenApproved = await portfolioContract.approvedTokens(
        selectedToken
      );
      if (!isTokenApproved) {
        setErrorMessage(
          "Token not approved in portfolio manager. Please contact admin."
        );
        return;
      }

      // Get token contract
      const tokenContract = new ethers.Contract(
        selectedToken,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
          "function decimals() external view returns (uint8)",
        ],
        signer
      );

      // Get token decimals
      const decimals = await tokenContract.decimals();
      const amount = ethers.parseUnits(depositAmount, decimals);

      // Check current allowance
      const currentAllowance = await tokenContract.allowance(
        userAddress,
        CONTRACT_ADDRESSES.portfolioManager
      );

      // If allowance is insufficient, approve
      if (currentAllowance < amount) {
        console.log("Approving token spend...");
        try {
          const approveTx = await tokenContract.approve(
            CONTRACT_ADDRESSES.portfolioManager,
            amount
          );
          const approveReceipt = await approveTx.wait();
          console.log("Approval successful", approveReceipt);
        } catch (approveError) {
          console.error("Error approving token:", approveError);
          setErrorMessage(
            "Failed to approve token spending. Please try again."
          );
          return;
        }
      }

      // Now proceed with deposit
      console.log("Depositing tokens...");
      const tx = await portfolioContract.deposit(selectedToken, amount);
      await tx.wait();
      console.log("Deposit successful");

      // Reload portfolio data
      window.location.reload();
    } catch (error: any) {
      console.error("Error depositing:", error);
      setErrorMessage(
        error.reason ||
          "Error depositing tokens. Please make sure you have sufficient balance and approved the token spend."
      );
    } finally {
      setIsDepositing(false);
    }
  };

  // Add a function to check token approval status
  const checkTokenApproval = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const isApproved = await portfolioContract.approvedTokens(selectedToken);
      if (!isApproved) {
        setErrorMessage(
          "Selected token is not approved in the portfolio manager"
        );
      } else {
        setErrorMessage(null);
      }
    } catch (error) {
      console.error("Error checking token approval:", error);
    }
  };

  // Add useEffect to check token approval when token changes
  useEffect(() => {
    if (selectedToken) {
      checkTokenApproval();
    }
  }, [selectedToken]);

  const checkOwnership = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        [
          ...PORTFOLIO_MANAGER_ABI,
          "function owner() external view returns (address)",
        ],
        provider
      );

      const ownerAddress = await portfolioContract.owner();
      setIsOwner(ownerAddress.toLowerCase() === userAddress.toLowerCase());
    } catch (error) {
      console.error("Error checking ownership:", error);
    }
  };

  useEffect(() => {
    checkOwnership();
  }, []);

  const handleApproveToken = async () => {
    if (!isOwner) {
      setErrorMessage("Only contract owner can approve tokens");
      return;
    }

    try {
      setIsDepositing(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const tx = await portfolioContract.addToken(TOKENS.USDC);
      await tx.wait();

      setErrorMessage(null);
      checkTokenApproval();
    } catch (error: any) {
      console.error("Error approving token:", error);
      setErrorMessage(error.reason || "Error approving token");
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">AI Portfolio Manager</h2>

      <NetworkManager />

      {isOwner && (
        <div className="p-4 bg-gray-100 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Admin Panel</h3>
          <button
            onClick={handleApproveToken}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            disabled={isDepositing}
          >
            {isDepositing ? "Approving..." : "Approve USDC"}
          </button>
        </div>
      )}

      {loading ? (
        <div>Loading portfolio data...</div>
      ) : !portfolio?.isActive ? (
        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Create Portfolio</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Risk Level (1-10)
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={riskLevel}
                onChange={(e) => setRiskLevel(Number(e.target.value))}
                className="w-full"
              />
              <span className="text-sm">{riskLevel}</span>
            </div>
            <button
              onClick={createPortfolio}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Create Portfolio
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4">Portfolio Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-lg font-semibold">
                  ${portfolio.totalValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Risk Level</p>
                <p className="text-lg font-semibold">
                  {portfolio.riskLevel}/10
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4">AI Predictions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Confidence</p>
                <p className="text-lg font-semibold">
                  {portfolio.predictions.confidence}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Price Direction</p>
                <p
                  className={`text-lg font-semibold ${
                    portfolio.predictions.priceDirection > 0
                      ? "text-green-600"
                      : portfolio.predictions.priceDirection < 0
                      ? "text-red-600"
                      : "text-gray-600"
                  }`}
                >
                  {portfolio.predictions.priceDirection > 0
                    ? "↑ Up"
                    : portfolio.predictions.priceDirection < 0
                    ? "↓ Down"
                    : "→ Neutral"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Risk Score</p>
                <p className="text-lg font-semibold">
                  {portfolio.predictions.riskScore}/100
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Honeypot Risk</p>
                <p
                  className={`text-lg font-semibold ${
                    portfolio.predictions.isHoneypot
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {portfolio.predictions.isHoneypot ? "High Risk" : "Low Risk"}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4">Deposit Funds</h3>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                {errorMessage}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Amount</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full p-2 border rounded"
                  placeholder="Enter amount"
                  disabled={isDepositing}
                />
              </div>
              <button
                onClick={handleDeposit}
                className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDepositing ? "cursor-not-allowed" : ""
                }`}
                disabled={isDepositing || !depositAmount}
              >
                {isDepositing ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
          </div>

          <div className="p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4">Portfolio Dashboard</h3>

            {portfolio?.isActive && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-lg font-semibold mb-2">
                  Portfolio Balance
                </h4>
                <p className="text-2xl font-bold text-blue-600">
                  {portfolio.usdcBalance} USDC
                </p>
              </div>
            )}

            <TradingInterface />

            {/* Add AutoTrading component */}
            {portfolio?.isActive && (
              <div className="mt-6">
                <AutoTrading />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
