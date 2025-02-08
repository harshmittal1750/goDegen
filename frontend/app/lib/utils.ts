import { ethers } from "ethers";
import { PAIR_ABI } from "./constants";

export async function fetchPairEvents(
  provider: ethers.Provider,
  pairAddress: string,
  fromBlock: number,
  toBlock: number
) {
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);

  try {
    const swapFilter = pair.filters.Swap();
    const events = await pair.queryFilter(swapFilter, fromBlock, toBlock);
    return events;
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

export function formatTokenAmount(amount: bigint, decimals: number) {
  const formatted = ethers.formatUnits(amount, decimals);
  // Trim trailing zeros and decimal point if whole number
  return formatted.replace(/\.?0+$/, "");
}

export async function testFetchEvents(pairAddress: string) {
  const provider = new ethers.JsonRpcProvider(
    process.env.NEXT_PUBLIC_HTTP_RPC_URL
  );

  const currentBlock = await provider.getBlockNumber();
  console.log("Current block:", currentBlock);

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);

  try {
    // Query last 1000 blocks for Swap events only
    const fromBlock = currentBlock - 1000;
    const swapEvents = await pair.queryFilter(
      pair.filters.Swap(),
      fromBlock,
      currentBlock
    );
    // const events = await Promise.all([
    //   // Get Swap events
    //   pair.queryFilter(pair.filters.Swap(), fromBlock, currentBlock),
    //   // Get Sync events to track reserves
    //   pair.queryFilter(pair.filters.Sync(), fromBlock, currentBlock),
    // ]);

    // const [swapEvents, syncEvents] = events;
    console.log(`Found ${swapEvents.length} swap events`);

    // Process swap events
    for (const event of swapEvents) {
      const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = (
        event as ethers.EventLog
      ).args!;

      console.log({
        type: "Swap",
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        sender,
        to,
        amounts: {
          amount0In: ethers.formatUnits(amount0In, 18),
          amount1In: ethers.formatUnits(amount1In, 6),
          amount0Out: ethers.formatUnits(amount0Out, 18),
          amount1Out: ethers.formatUnits(amount1Out, 6),
        },
      });

      // Get the transaction receipt for more details
      const receipt = await provider.getTransactionReceipt(
        event.transactionHash
      );
      console.log("Transaction receipt:", {
        gasUsed: receipt?.gasUsed.toString(),
        status: receipt?.status,
      });
    }
    // Process sync events to track reserves
    // for (const event of syncEvents) {
    //   const { reserve0, reserve1 } = event.args!;
    //   console.log({
    //     type: "Sync",
    //     blockNumber: event.blockNumber,
    //     reserves: {
    //       reserve0: ethers.formatUnits(reserve0, 18),
    //       reserve1: ethers.formatUnits(reserve1, 6),
    //     },
    //   });
    // }
  } catch (error) {
    console.error("Error fetching events:", error);
  }
}
