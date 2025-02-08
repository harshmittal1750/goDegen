"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  PAIR_ABI,
  PAIRS_TO_MONITOR,
  CHAIN_CONFIG,
  TOKENS,
} from "../lib/constants";
import {
  fetchPairEvents,
  formatTokenAmount,
  testFetchEvents,
} from "../lib/utils";
import type { Trade } from "../lib/types";

// Move analytics interfaces outside component
interface PriceAnalytics {
  priceImpact: number;
  trendDirection: "up" | "down" | "neutral";
  confidence: number;
  whaleActivity: {
    detected: boolean;
    size: "medium" | "large" | "massive" | null;
    predictedImpact: number;
  };
  marketMaking: {
    detected: boolean;
    addresses: string[];
    confidence: number;
  };
  arbitrage: {
    detected: boolean;
    profitEstimate: number;
    route: string[];
  };
}

export function TradeMonitor() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastFetchedBlock, setLastFetchedBlock] = useState<number>(0);
  const processedTxHashes = useRef<Set<string>>(new Set());
  const [priceAnalytics, setPriceAnalytics] = useState<PriceAnalytics>({
    priceImpact: 0,
    trendDirection: "neutral",
    confidence: 0,
    whaleActivity: {
      detected: false,
      size: null,
      predictedImpact: 0,
    },
    marketMaking: {
      detected: false,
      addresses: [],
      confidence: 0,
    },
    arbitrage: {
      detected: false,
      profitEstimate: 0,
      route: [],
    },
  });

  // Debounce function for analytics updates
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const updateAnalytics = useCallback((trade: Trade, prevTrades: Trade[]) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      const { direction, confidence } = analyzePriceTrend(trade, prevTrades);
      const impact = calculatePriceImpact(trade);
      const whaleActivity = detectWhaleActivity(trade, prevTrades);
      const marketMaking = detectMarketMaking(trade, prevTrades);
      const arbitrage = detectArbitrage(trade, prevTrades);

      setPriceAnalytics({
        priceImpact: impact,
        trendDirection: direction,
        confidence,
        whaleActivity,
        marketMaking,
        arbitrage,
      });
    }, 1000); // Debounce for 1 second
  }, []);

  // Batch process trades
  const batchSize = 5;
  const processTrades = useCallback(
    (newTrades: Trade[]) => {
      setTrades((prevTrades) => {
        const combinedTrades = [...newTrades, ...prevTrades].slice(0, 50); // Keep last 50 trades
        if (newTrades.length > 0) {
          updateAnalytics(newTrades[0], combinedTrades);
        }
        return combinedTrades;
      });
    },
    [updateAnalytics]
  );

  // Volume thresholds in USD for whale detection
  const WHALE_THRESHOLDS = {
    medium: 10000, // $50k
    large: 250000, // $250k
    massive: 1000000, // $1M
  };

  const detectWhaleActivity = (trade: Trade, previousTrades: Trade[]) => {
    // Calculate trade value in USD (assuming token1 is USDC)
    const tradeValueUSD =
      Number(trade.amount1In) > 0
        ? Number(trade.amount1In)
        : Number(trade.amount1Out);
    console.log(tradeValueUSD, "tradeValueUSD");
    console.log(TOKENS, "TOKENS");

    // Determine whale size
    let size: "medium" | "large" | "massive" | null = null;
    if (tradeValueUSD >= WHALE_THRESHOLDS.massive) size = "massive";
    else if (tradeValueUSD >= WHALE_THRESHOLDS.large) size = "large";
    else if (tradeValueUSD >= WHALE_THRESHOLDS.medium) size = "medium";

    // Calculate predicted impact based on historical whale trades
    const similarWhaleTrades = previousTrades.filter(
      (t) =>
        Number(t.amount1In) > WHALE_THRESHOLDS.medium ||
        Number(t.amount1Out) > WHALE_THRESHOLDS.medium
    );

    const predictedImpact =
      similarWhaleTrades.length > 0
        ? similarWhaleTrades.reduce(
            (acc, t) => acc + calculatePriceImpact(t),
            0
          ) / similarWhaleTrades.length
        : 0;

    return {
      detected: size !== null,
      size,
      predictedImpact,
    };
  };

  const detectMarketMaking = (trade: Trade, previousTrades: Trade[]) => {
    // Group trades by address
    const addressTradeCount = previousTrades.reduce((acc, t) => {
      acc[t.sender] = (acc[t.sender] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Find addresses with frequent trades
    const marketMakers = Object.entries(addressTradeCount)
      .filter(([, count]) => count >= 3) // At least 3 trades
      .map(([address]) => address);

    // Calculate confidence based on trade patterns
    const confidence =
      marketMakers.length > 0
        ? Math.min(100, (marketMakers.length / previousTrades.length) * 100)
        : 0;

    return {
      detected: marketMakers.length > 0,
      addresses: marketMakers,
      confidence,
    };
  };

  const detectArbitrage = (trade: Trade, previousTrades: Trade[]) => {
    // Look for quick round-trip trades
    const potentialArbitrage = previousTrades.some(
      (t) =>
        t.sender === trade.recipient &&
        Date.now() - t.timestamp.getTime() < 5000 // Within 5 seconds
    );

    // Estimate profit (simplified)
    const profitEstimate = potentialArbitrage
      ? Math.abs(
          calculatePriceImpact(trade) - calculatePriceImpact(previousTrades[0])
        )
      : 0;

    return {
      detected: potentialArbitrage,
      profitEstimate,
      route: potentialArbitrage ? [trade.token0, trade.token1] : [],
    };
  };

  const calculatePriceImpact = (trade: Trade) => {
    const token0Amount =
      Number(trade.amount0In) > 0
        ? Number(trade.amount0In)
        : Number(trade.amount0Out);
    const token1Amount =
      Number(trade.amount1In) > 0
        ? Number(trade.amount1In)
        : Number(trade.amount1Out);

    if (token0Amount === 0 || token1Amount === 0) return 0;
    return (token1Amount / token0Amount) * 100;
  };

  const analyzePriceTrend = (newTrade: Trade, previousTrades: Trade[]) => {
    if (previousTrades.length < 2)
      return { direction: "neutral" as const, confidence: 0 };

    // Calculate moving average of last 3 trades
    const recentPrices = previousTrades.slice(0, 3).map(calculatePriceImpact);
    const averagePrice =
      recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;

    // Calculate current price
    const currentPrice = calculatePriceImpact(newTrade);

    // Determine trend
    const priceDiff = currentPrice - averagePrice;
    const direction =
      priceDiff > 0
        ? ("up" as const)
        : priceDiff < 0
        ? ("down" as const)
        : ("neutral" as const);

    // Calculate confidence based on consistency of price movement
    const priceChanges = recentPrices.map((price, i) =>
      i === 0 ? 0 : price - recentPrices[i - 1]
    );

    const consistency =
      priceChanges.filter((change) =>
        direction === "up"
          ? change > 0
          : direction === "down"
          ? change < 0
          : change === 0
      ).length / priceChanges.length;

    return {
      direction,
      confidence: consistency * 100,
    };
  };

  useEffect(() => {
    const wsProvider = new ethers.WebSocketProvider(CHAIN_CONFIG.wsRpcUrl!);
    const httpProvider = new ethers.JsonRpcProvider(CHAIN_CONFIG.httpRpcUrl!);
    let mounted = true;
    let pendingTrades: Trade[] = [];
    let processingTimeout: NodeJS.Timeout;

    const processSwapEvent = async (
      pairAddress: string,
      event: ethers.EventLog
    ) => {
      try {
        if (processedTxHashes.current.has(event.transactionHash)) {
          return;
        }

        const SWAP_EVENT_SIGNATURE =
          "Swap(address,address,uint256,uint256,uint256,uint256)";
        const swapEventHash = ethers.id(SWAP_EVENT_SIGNATURE);

        if (event.topics[0] !== swapEventHash) {
          return;
        }

        const pair = PAIRS_TO_MONITOR.find((p) => p.address === pairAddress)!;
        const [sender, amount0In, amount1In, amount0Out, amount1Out, to] =
          event.args!;

        const trade: Trade = {
          pairAddress,
          token0: pair.token0,
          token1: pair.token1,
          sender,
          recipient: to,
          amount0In: formatTokenAmount(amount0In, pair.decimals.token0),
          amount1In: formatTokenAmount(amount1In, pair.decimals.token1),
          amount0Out: formatTokenAmount(amount0Out, pair.decimals.token0),
          amount1Out: formatTokenAmount(amount1Out, pair.decimals.token1),
          timestamp: new Date(),
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
        };

        if (mounted) {
          processedTxHashes.current.add(event.transactionHash);
          pendingTrades.push(trade);

          // Process trades in batches
          if (pendingTrades.length >= batchSize) {
            processTrades([...pendingTrades]);
            pendingTrades = [];
          } else {
            // Set a timeout to process remaining trades
            if (processingTimeout) clearTimeout(processingTimeout);
            processingTimeout = setTimeout(() => {
              if (pendingTrades.length > 0) {
                processTrades([...pendingTrades]);
                pendingTrades = [];
              }
            }, 2000);
          }
        }
      } catch (error) {
        console.error("Error processing swap event:", error);
      }
    };

    // Rate limit for historical fetches
    let lastFetchTime = 0;
    const FETCH_INTERVAL = 1000000; // 10 seconds

    const fetchHistoricalTrades = async () => {
      const now = Date.now();
      if (now - lastFetchTime < FETCH_INTERVAL) {
        return;
      }
      lastFetchTime = now;

      try {
        const currentBlock = await httpProvider.getBlockNumber();
        const fromBlock = lastFetchedBlock || currentBlock - 100; // Reduced block range

        for (const pair of PAIRS_TO_MONITOR) {
          const events = await fetchPairEvents(
            httpProvider,
            pair.address,
            fromBlock,
            currentBlock
          );

          for (const event of events) {
            await processSwapEvent(pair.address, event as ethers.EventLog);
          }
        }

        setLastFetchedBlock(currentBlock);
        setIsConnected(true);
      } catch (error) {
        console.error("Error fetching historical trades:", error);
      }
    };

    // Websocket connection management
    let wsReconnectTimeout: NodeJS.Timeout;
    const setupWebSocket = () => {
      const monitorPair = async (pairInfo: (typeof PAIRS_TO_MONITOR)[0]) => {
        try {
          const pair = new ethers.Contract(
            pairInfo.address,
            PAIR_ABI,
            wsProvider
          );
          pair.on("Swap", async (...args) => {
            const event = args[args.length - 1];
            await processSwapEvent(pairInfo.address, event);
          });
        } catch (error) {
          console.error(`Error monitoring pair ${pairInfo.address}:`, error);
        }
      };

      wsProvider.on("error", (error) => {
        console.error("WebSocket error:", error);
        wsReconnectTimeout = setTimeout(setupWebSocket, 5000);
      });

      PAIRS_TO_MONITOR.forEach(monitorPair);
    };

    // Initialize
    setupWebSocket();
    fetchHistoricalTrades();

    // Reduced polling frequency
    const fetchInterval = setInterval(fetchHistoricalTrades, FETCH_INTERVAL);

    return () => {
      mounted = false;
      if (processingTimeout) clearTimeout(processingTimeout);
      if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      clearInterval(fetchInterval);
      wsProvider.removeAllListeners();
      processedTxHashes.current.clear();
    };
  }, [processTrades]);

  const handleTestFetch = async () => {
    await testFetchEvents(
      "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d" // AERO/USDC pair
    );
  };

  // Function to determine trade type
  const getTradeType = (trade: Trade) => {
    const isBuy = Number(trade.amount0Out) > 0;
    return isBuy ? "buy" : "sell";
  };

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">Trade Monitor</h2>

      <div className="grid gap-6">
        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Monitored Pairs</h3>
          <div className="flex gap-2 flex-wrap">
            {PAIRS_TO_MONITOR.map((pair) => (
              <div
                key={pair.address}
                className="px-3 py-1  rounded-full text-sm"
              >
                {pair.name}
              </div>
            ))}
          </div>
          <p
            className={`mt-4 font-medium ${
              isConnected ? "text-green-600" : "text-red-600"
            }`}
          >
            {isConnected ? "Monitoring trades..." : "Connecting..."}
          </p>
        </div>

        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Price Analysis</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg ">
              <p className="text-sm text-gray-500">Price Impact</p>
              <p className="text-lg font-semibold">
                {priceAnalytics.priceImpact.toFixed(2)}%
              </p>
            </div>
            <div className="p-4 rounded-lg ">
              <p className="text-sm text-gray-500">Trend</p>
              <p
                className={`text-lg font-semibold ${
                  priceAnalytics.trendDirection === "up"
                    ? "text-green-600"
                    : priceAnalytics.trendDirection === "down"
                    ? "text-red-600"
                    : "text-gray-600"
                }`}
              >
                {priceAnalytics.trendDirection === "up"
                  ? "↑ Upward"
                  : priceAnalytics.trendDirection === "down"
                  ? "↓ Downward"
                  : "→ Neutral"}
              </p>
            </div>
            <div className="p-4 rounded-lg ">
              <p className="text-sm text-gray-500">Confidence</p>
              <p className="text-lg font-semibold">
                {priceAnalytics.confidence.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Advanced Analytics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Whale Activity */}
            <div className="p-4 rounded-lg ">
              <h4 className="font-semibold mb-2">Whale Activity</h4>
              {priceAnalytics.whaleActivity.detected ? (
                <>
                  <p className="text-amber-600 font-bold">
                    🐋 {priceAnalytics.whaleActivity.size} Whale Detected
                  </p>
                  <p className="text-sm">
                    Predicted Impact:{" "}
                    {priceAnalytics.whaleActivity.predictedImpact.toFixed(2)}%
                  </p>
                </>
              ) : (
                <p className="text-gray-500">No whale activity detected</p>
              )}
            </div>

            {/* Market Making */}
            <div className="p-4 rounded-lg ">
              <h4 className="font-semibold mb-2">Market Making</h4>
              {priceAnalytics.marketMaking.detected ? (
                <>
                  <p className="text-blue-600 font-bold">
                    🤖 Market Making Activity
                  </p>
                  <p className="text-sm">
                    Confidence:{" "}
                    {priceAnalytics.marketMaking.confidence.toFixed(0)}%
                  </p>
                </>
              ) : (
                <p className="text-gray-500">No market making detected</p>
              )}
            </div>

            {/* Arbitrage */}
            <div className="p-4 rounded-lg ">
              <h4 className="font-semibold mb-2">Arbitrage</h4>
              {priceAnalytics.arbitrage.detected ? (
                <>
                  <p className="text-green-600 font-bold">
                    ⚡ Arbitrage Opportunity
                  </p>
                  <p className="text-sm">
                    Est. Profit:{" "}
                    {priceAnalytics.arbitrage.profitEstimate.toFixed(2)}%
                  </p>
                </>
              ) : (
                <p className="text-gray-500">No arbitrage detected</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Recent Trades</h3>
          {trades.length === 0 ? (
            <p className="text-gray-500">No trades detected yet...</p>
          ) : (
            <div className="space-y-4">
              {trades.map((trade, index) => {
                const tradeType = getTradeType(trade);
                const isNewest = index === 0;
                return (
                  <div
                    key={trade.transactionHash}
                    className={`p-4 rounded-lg border transition-all duration-500 ${
                      isNewest ? "animate-fadeIn" : ""
                    } ${
                      tradeType === "buy"
                        ? "border-green-500 bg-green-50"
                        : "border-red-500 bg-red-50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-bold ${
                              tradeType === "buy"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {tradeType === "buy" ? "BUY" : "SELL"}
                          </span>
                          <p className="text-sm text-gray-500">
                            {trade.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                        <p className="font-medium">
                          {
                            PAIRS_TO_MONITOR.find(
                              (p) => p.address === trade.pairAddress
                            )?.name
                          }
                        </p>
                      </div>
                      <a
                        href={`${CHAIN_CONFIG.explorerUrl}/tx/${trade.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 text-sm"
                      >
                        View on {CHAIN_CONFIG.name}scan ↗
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Amount In</p>
                        {Number(trade.amount0In) > 0 && (
                          <p className={`${isNewest ? "animate-slideIn" : ""}`}>
                            {trade.amount0In}{" "}
                            {
                              PAIRS_TO_MONITOR.find(
                                (p) => p.address === trade.pairAddress
                              )?.token0
                            }
                          </p>
                        )}
                        {Number(trade.amount1In) > 0 && (
                          <p className={`${isNewest ? "animate-slideIn" : ""}`}>
                            {trade.amount1In}{" "}
                            {
                              PAIRS_TO_MONITOR.find(
                                (p) => p.address === trade.pairAddress
                              )?.token1
                            }
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-gray-500">Amount Out</p>
                        {Number(trade.amount0Out) > 0 && (
                          <p className={`${isNewest ? "animate-slideIn" : ""}`}>
                            {trade.amount0Out}{" "}
                            {
                              PAIRS_TO_MONITOR.find(
                                (p) => p.address === trade.pairAddress
                              )?.token0
                            }
                          </p>
                        )}
                        {Number(trade.amount1Out) > 0 && (
                          <p className={`${isNewest ? "animate-slideIn" : ""}`}>
                            {trade.amount1Out}{" "}
                            {
                              PAIRS_TO_MONITOR.find(
                                (p) => p.address === trade.pairAddress
                              )?.token1
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleTestFetch}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Test Fetch Events
      </button>
    </section>
  );
}
