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
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedCard, AnimatedTitle, AnimatedValue } from "./AnimatedLog";
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
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <AnimatedTitle>AI Portfolio Manager</AnimatedTitle>
        <NetworkManager />
      </motion.div>

      {isOwner && (
        <AnimatedCard glowColor="purple">
          <h3 className="terminal-header">Admin Panel</h3>
          <motion.button
            onClick={handleApproveToken}
            className="btn-primary"
            disabled={isDepositing}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isDepositing ? "Approving..." : "Approve USDC"}
          </motion.button>
        </AnimatedCard>
      )}

      {loading ? (
        <motion.div
          className="text-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          Loading portfolio data...
        </motion.div>
      ) : !portfolio?.isActive ? (
        <AnimatedCard>
          <h3 className="terminal-header">Create Portfolio</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Risk Level (1-10)
              </label>
              <motion.input
                type="range"
                min="1"
                max="10"
                value={riskLevel}
                onChange={(e) => setRiskLevel(Number(e.target.value))}
                className="w-full"
                whileHover={{ scale: 1.02 }}
              />
              <motion.span
                className="text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {riskLevel}
              </motion.span>
            </div>
            <motion.button
              onClick={createPortfolio}
              className="btn-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create Portfolio
            </motion.button>
          </div>
        </AnimatedCard>
      ) : (
        <div className="grid gap-6">
          <AnimatedCard glowColor="blue">
            <h3 className="terminal-header">Portfolio Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <AnimatedValue
                label="Total Value"
                value={`$${portfolio.totalValue.toFixed(2)}`}
              />
              <AnimatedValue
                label="Risk Level"
                value={`${portfolio.riskLevel}/10`}
              />
            </div>
          </AnimatedCard>

          {/* <div className="terminal-card">
            <h3 className="terminal-header">Token Manager</h3>
            <TokenManager />
          </div> */}

          <AnimatedCard glowColor="purple">
            <h3 className="terminal-header">AI Predictions</h3>
            <div className="grid grid-cols-2 gap-4">
              <AnimatedValue
                label="Confidence"
                value={`${portfolio.predictions.confidence}%`}
              />
              <AnimatedValue
                label="Price Direction"
                value={
                  portfolio.predictions.priceDirection > 0
                    ? "Upward"
                    : portfolio.predictions.priceDirection < 0
                    ? "Downward"
                    : "Neutral"
                }
                trend={
                  portfolio.predictions.priceDirection > 0
                    ? "up"
                    : portfolio.predictions.priceDirection < 0
                    ? "down"
                    : "neutral"
                }
              />
              <AnimatedValue
                label="Risk Score"
                value={`${portfolio.predictions.riskScore}/100`}
              />
              <AnimatedValue
                label="Honeypot Risk"
                value={
                  portfolio.predictions.isHoneypot ? "High Risk" : "Low Risk"
                }
                trend={portfolio.predictions.isHoneypot ? "down" : "up"}
              />
            </div>
          </AnimatedCard>

          <AnimatedCard>
            <h3 className="terminal-header">Deposit/Withdraw Funds</h3>
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-4 p-3 bg-red-900/20 text-red-400 rounded border border-red-800"
                >
                  {errorMessage}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Amount</label>
                <motion.input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Enter amount"
                  disabled={isDepositing}
                  whileHover={{ scale: 1.02 }}
                  whileFocus={{ scale: 1.02 }}
                />
              </div>
              <motion.button
                onClick={handleDeposit}
                className="btn-primary w-full"
                disabled={isDepositing || !depositAmount}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isDepositing ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
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
                    </motion.svg>
                    Processing...
                  </span>
                ) : (
                  "Deposit"
                )}
              </motion.button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <motion.input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={isWithdrawing}
                whileHover={{ scale: 1.02 }}
                whileFocus={{ scale: 1.02 }}
              />
            </div>
            <motion.button
              onClick={handleWithdraw}
              className="btn-primary w-full"
              disabled={isWithdrawing || !withdrawAmount}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isWithdrawing ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
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
                  </motion.svg>
                  Processing...
                </span>
              ) : (
                "Withdraw"
              )}
            </motion.button>
          </AnimatedCard>

          <AnimatedCard glowColor="green">
            <h3 className="terminal-header">Portfolio Dashboard</h3>

            {portfolio?.isActive && (
              <motion.div
                className="mb-4 p-4 bg-[#0253FF]/10 rounded-lg border border-[#0253FF]/20"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <h4 className="text-lg font-semibold mb-2 text-[#0253FF]">
                  Portfolio Balance
                </h4>
                <motion.p
                  className="text-2xl font-bold gradient-text"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {portfolio.usdcBalance} USDC
                </motion.p>
              </motion.div>
            )}

            <div className="trade-card">
              <TradingInterface />
            </div>

            {portfolio?.isActive && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <AutoTrading />
              </motion.div>
            )}
          </AnimatedCard>
        </div>
      )}
    </section>
  );
}
