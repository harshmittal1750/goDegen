export interface Trade {
  pairAddress: string;
  token0: string;
  token1: string;
  sender: string;
  recipient: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  timestamp: Date;
  transactionHash: string;
  blockNumber: number;
}

export interface PairInfo {
  address: string;
  token0: string;
  token1: string;
  name: string;
  token0Address: string;
  token1Address: string;
  decimals: {
    token0: number;
    token1: number;
  };
}

export interface BlockData {
  number: number;
  timestamp: number;
  hash: string;
  transactions: number;
}
