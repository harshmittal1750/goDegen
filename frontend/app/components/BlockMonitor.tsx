"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import type { BlockData } from "../lib/types";
import { CHAIN_CONFIG } from "../lib/constants";

export function BlockMonitor() {
  const [latestBlock, setLatestBlock] = useState<BlockData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const provider = new ethers.WebSocketProvider(CHAIN_CONFIG.wsRpcUrl!);

    const subscribeToBlocks = async () => {
      provider.on("block", async (blockNumber) => {
        try {
          const block = await provider.getBlock(blockNumber);
          if (block) {
            setLatestBlock({
              number: block.number,
              timestamp: block.timestamp,
              hash: block.hash || "",
              transactions: block.transactions.length,
            });
          }
        } catch (error) {
          console.error("Error fetching block:", error);
        }
      });

      setIsConnected(true);
    };

    subscribeToBlocks();
    console.log(`Monitoring ${CHAIN_CONFIG.name} blocks...`);

    return () => {
      provider.removeAllListeners("block");
    };
  }, []);

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">Block Monitor</h2>

      <div className="grid gap-6">
        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Connection Status</h3>
          <p
            className={`font-medium ${
              isConnected ? "text-green-600" : "text-red-600"
            }`}
          >
            {isConnected
              ? `Connected to ${CHAIN_CONFIG.name} network`
              : "Connecting..."}
          </p>
        </div>

        {latestBlock && (
          <div className="p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4">Latest Block</h3>
            <div className="space-y-2">
              <p>
                <span className="font-medium">Block Number:</span>{" "}
                {latestBlock.number}
              </p>
              <p>
                <span className="font-medium">Timestamp:</span>{" "}
                {new Date(latestBlock.timestamp * 1000).toLocaleString()}
              </p>
              <p>
                <span className="font-medium">Hash:</span> {latestBlock.hash}
              </p>
              <p>
                <span className="font-medium">Transactions:</span>{" "}
                {latestBlock.transactions}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
