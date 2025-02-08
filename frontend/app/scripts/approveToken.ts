import { ethers } from "ethers";
import {
  PORTFOLIO_MANAGER_ABI,
  CONTRACT_ADDRESSES,
  TOKENS,
} from "../lib/constants";

async function approveUSDC() {
  try {
    // Connect to Base network
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");

    // Replace with your private key (contract owner's private key)
    const privateKey = "YOUR_PRIVATE_KEY"; // IMPORTANT: Never commit this!
    const signer = new ethers.Wallet(privateKey, provider);

    // Get PortfolioManager contract
    const portfolioManager = new ethers.Contract(
      CONTRACT_ADDRESSES.portfolioManager,
      PORTFOLIO_MANAGER_ABI,
      signer
    );

    // Check if token is already approved
    const isApproved = await portfolioManager.approvedTokens(TOKENS.USDC);
    if (isApproved) {
      console.log("USDC is already approved!");
      return;
    }

    // Add USDC token
    console.log("Approving USDC...");
    const tx = await portfolioManager.addToken(TOKENS.USDC);
    await tx.wait();
    console.log("USDC approved successfully!");
  } catch (error) {
    console.error("Error approving token:", error);
  }
}

approveUSDC();
