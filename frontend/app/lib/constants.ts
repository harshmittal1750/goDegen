import { PairInfo } from "./types";

export const FACTORY_ABI = [
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
] as const;

export const PAIR_ABI = [
  "event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)",
  // "event Sync(uint112 reserve0, uint112 reserve1)",
  // "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  // "event Fees(address indexed sender, uint256 amount0, uint256 amount1)",
  // "event Transfer(address indexed from, address indexed to, uint256 amount)",
  // "function token0() external view returns (address)",
  // "function token1() external view returns (address)",
  // "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  // "function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external",
  // "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
] as const;

export const TOKENS = {
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

export const PAIRS_TO_MONITOR: PairInfo[] = [
  {
    address: "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d",
    token0: "AERO",
    token1: "USDC",
    name: "AERO/USDC",
    token0Address: TOKENS.AERO,
    token1Address: TOKENS.USDC,
    decimals: {
      token0: 18,
      token1: 6,
    },
  },
];

export const CHAIN_CONFIG = {
  name: "Base",
  factoryAddress: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  explorerUrl: "https://basescan.org",
  wsRpcUrl: process.env.NEXT_PUBLIC_WS_RPC_URL,
  httpRpcUrl: process.env.NEXT_PUBLIC_HTTP_RPC_URL,
  chainId: 8453,
} as const;
