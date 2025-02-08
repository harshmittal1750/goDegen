"use client";

import { useState, useEffect } from "react";
import { CHAIN_CONFIG } from "../lib/constants";

export function NetworkManager() {
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const checkNetwork = async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
          const chainId = await window.ethereum.request({
            method: "eth_chainId",
          });
          const chainIdNumber = parseInt(chainId as string, 16);
          setCurrentChainId(chainIdNumber);
          setIsCorrectNetwork(chainIdNumber === CHAIN_CONFIG.chainId);
        } catch (error) {
          console.error("Error checking network:", error);
        }
      }
    };

    checkNetwork();

    // Listen for network changes
    if (window.ethereum) {
      window.ethereum.on("chainChanged", (params: unknown) => {
        const chainId = params as string;
        const chainIdNumber = parseInt(chainId, 16);
        setCurrentChainId(chainIdNumber);
        setIsCorrectNetwork(chainIdNumber === CHAIN_CONFIG.chainId);
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("chainChanged", () => {});
      }
    };
  }, []);

  const switchNetwork = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    setIsSwitching(true);
    try {
      // Try switching to Base
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}` }],
      });
    } catch (switchError: unknown) {
      // This error code indicates that the chain has not been added to MetaMask
      if ((switchError as { code: number }).code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${CHAIN_CONFIG.chainId.toString(16)}`,
                chainName: "Base Mainnet",
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"],
              },
            ],
          });
        } catch (addError) {
          console.error("Error adding network:", addError);
        }
      }
      console.error("Error switching network:", switchError);
    } finally {
      setIsSwitching(false);
    }
  };

  if (!currentChainId) {
    return null;
  }

  if (isCorrectNetwork) {
    return (
      <div className="p-2 bg-green-100 text-green-800 rounded-lg flex items-center justify-between">
        <span>Connected to Base Mainnet</span>
        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg flex items-center justify-between">
      <span>Please connect to Base Mainnet to use this application</span>
      <button
        onClick={switchNetwork}
        disabled={isSwitching}
        className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
      >
        {isSwitching ? "Switching..." : "Switch Network"}
      </button>
    </div>
  );
}
