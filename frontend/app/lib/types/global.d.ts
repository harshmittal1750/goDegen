interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (eventName: string, handler: (params: unknown) => void) => void;
    removeListener: (
      eventName: string,
      handler: (params: unknown) => void
    ) => void;
  };
}

interface CustomToken {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  isApproved?: boolean;
}

interface CustomPool {
  address: string;
  token0: string;
  token1: string;
  name: string;
  fee: number;
  isVerified?: boolean;
}

interface TokenBalance {
  token: CustomToken;
  balance: string;
  usdValue?: string;
}
