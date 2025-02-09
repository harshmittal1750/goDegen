"use client";

import { useState, useEffect } from "react";
import { ethers, Eip1193Provider } from "ethers";
import {
  PORTFOLIO_MANAGER_ABI,
  AI_ORACLE_ABI,
  CONTRACT_ADDRESSES,
  TOKENS,
} from "../lib/constants";
import { NetworkManager } from "./NetworkManager";
import { TradingInterface } from "./TradingInterface";
import { AutoTrading } from "./AutoTrading";
// import { TokenManager } from "./TokenManager";

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
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        if (!window.ethereum) {
          throw new Error("Please install MetaMask!");
        }
        const provider = new ethers.BrowserProvider(
          window.ethereum as Eip1193Provider
        );
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
        const predictions = await oracleContract.getPrediction(TOKENS.USDC);

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
  }, []);

  const createPortfolio = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }
      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
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

      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }
      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
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
        TOKENS.USDC
      );
      if (!isTokenApproved) {
        setErrorMessage(
          "Token not approved in portfolio manager. Please contact admin."
        );
        return;
      }

      // Get token contract
      const tokenContract = new ethers.Contract(
        TOKENS.USDC,
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
      const tx = await portfolioContract.deposit(TOKENS.USDC, amount);
      await tx.wait();
      console.log("Deposit successful");

      // Reload portfolio data
      window.location.reload();
    } catch (error: Error | unknown) {
      console.error("Error depositing:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error depositing tokens. Please make sure you have sufficient balance and approved the token spend."
      );
    } finally {
      setIsDepositing(false);
    }
  };

  // Add a function to check token approval status
  const checkTokenApproval = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }
      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
      const signer = await provider.getSigner();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      const isApproved = await portfolioContract.approvedTokens(TOKENS.USDC);
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
    checkTokenApproval();
  }, []);

  const checkOwnership = async () => {
    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }
      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
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
      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }
      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
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
    } catch (error: Error | unknown) {
      console.error("Error approving token:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Error approving token"
      );
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setIsWithdrawing(true);
      setErrorMessage(null);

      if (!window.ethereum) {
        throw new Error("Please install MetaMask!");
      }

      if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
        throw new Error("Please enter a valid withdrawal amount");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as Eip1193Provider
      );
      const signer = await provider.getSigner();

      const portfolioContract = new ethers.Contract(
        CONTRACT_ADDRESSES.portfolioManager,
        PORTFOLIO_MANAGER_ABI,
        signer
      );

      // Check if user has sufficient balance
      const userAddress = await signer.getAddress();
      const balance = await portfolioContract.getTokenBalance(
        userAddress,
        TOKENS.USDC
      );
      const withdrawAmountWei = ethers.parseUnits(withdrawAmount, 6); // USDC has 6 decimals

      if (balance < withdrawAmountWei) {
        throw new Error(
          `Insufficient balance. You have ${ethers.formatUnits(
            balance,
            6
          )} USDC`
        );
      }

      // Execute withdrawal
      console.log("Withdrawing tokens...");
      const tx = await portfolioContract.withdraw(
        TOKENS.USDC,
        withdrawAmountWei
      );
      await tx.wait();
      console.log("Withdrawal successful");

      // Reset form and reload portfolio data
      setWithdrawAmount("");
      window.location.reload();
    } catch (error: Error | unknown) {
      console.error("Error withdrawing:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error withdrawing tokens. Please try again."
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="gradient-text text-2xl font-bold">
          AI Portfolio Manager
        </h2>
        <NetworkManager />
      </div>

      {isOwner && (
        <div className="terminal-card">
          <h3 className="terminal-header">Admin Panel</h3>
          <button
            onClick={handleApproveToken}
            className="btn-primary"
            disabled={isDepositing}
          >
            {isDepositing ? "Approving..." : "Approve USDC"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-primary">Loading portfolio data...</div>
      ) : !portfolio?.isActive ? (
        <div className="terminal-card">
          <h3 className="terminal-header">Create Portfolio</h3>
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
            <button onClick={createPortfolio} className="btn-primary">
              Create Portfolio
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="stats-card">
            <h3 className="terminal-header">Portfolio Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Total Value</p>
                <p className="text-lg font-semibold gradient-text">
                  ${portfolio.totalValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Risk Level</p>
                <p className="text-lg font-semibold gradient-text">
                  {portfolio.riskLevel}/10
                </p>
              </div>
            </div>
          </div>

          {/* <div className="terminal-card">
            <h3 className="terminal-header">Token Manager</h3>
            <TokenManager />
          </div> */}

          <div className="terminal-card">
            <h3 className="terminal-header">AI Predictions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Confidence</p>
                <p className="text-lg font-semibold gradient-text">
                  {portfolio.predictions.confidence}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Price Direction</p>
                <p
                  className={`text-lg font-semibold ${
                    portfolio.predictions.priceDirection > 0
                      ? "text-green-400"
                      : portfolio.predictions.priceDirection < 0
                      ? "text-red-400"
                      : "text-gray-400"
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
                <p className="text-sm text-gray-400">Risk Score</p>
                <p className="text-lg font-semibold gradient-text">
                  {portfolio.predictions.riskScore}/100
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Honeypot Risk</p>
                <p
                  className={`text-lg font-semibold ${
                    portfolio.predictions.isHoneypot
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {portfolio.predictions.isHoneypot ? "High Risk" : "Low Risk"}
                </p>
              </div>
            </div>
          </div>

          <div className="terminal-card">
            <h3 className="terminal-header">Deposit/Withdraw Funds</h3>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded border border-red-800">
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
                  placeholder="Enter amount"
                  disabled={isDepositing}
                />
              </div>
              <button
                onClick={handleDeposit}
                className="btn-primary w-full"
                disabled={isDepositing || !depositAmount}
              >
                {isDepositing ? (
                  <span className="flex items-center justify-center gap-2">
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

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={isWithdrawing}
              />
            </div>
            <button
              onClick={handleWithdraw}
              className="btn-primary w-full"
              disabled={isWithdrawing || !withdrawAmount}
            >
              {isWithdrawing ? (
                <span className="flex items-center justify-center gap-2">
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
                "Withdraw"
              )}
            </button>
          </div>

          <div className="terminal-card">
            <h3 className="terminal-header">Portfolio Dashboard</h3>

            {portfolio?.isActive && (
              <div className="mb-4 p-4 bg-[#0253FF]/10 rounded-lg border border-[#0253FF]/20">
                <h4 className="text-lg font-semibold mb-2 text-[#0253FF]">
                  Portfolio Balance
                </h4>
                <p className="text-2xl font-bold gradient-text">
                  {portfolio.usdcBalance} USDC
                </p>
              </div>
            )}

            <div className="trade-card">
              <TradingInterface />
            </div>

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
