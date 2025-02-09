import { PairInfo } from "./types";
import { AI_TRADER_ABI, PORTFOLIO_MANAGER_ABI, AI_ORACLE_ABI } from "./abis";

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
  USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  GAME: "0x1C4CcA7C5DB003824208aDDA61Bd749e55F463a3",
  CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  WETH: "0x4200000000000000000000000000000000000006",
  DICKBUTT: "0x1234567890abcdef1234567890abcdef12345678",
} as const;

export const POOLS = {
  AERO_USDC: "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d", // Aerodrome pool
  GAME_VIRTUAL: "0xd418dfe7670c21f682e041f34250c114db5d7789", // Uniswap V2
  CBBTC_USDC: "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef", // Uniswap V3
} as const;

export const POOL_FEES = {
  AERO_USDC: 10000, // 1% for Aerodrome
  GAME_VIRTUAL: 3000, // 0.3% for Uniswap V2
  CBBTC_USDC: 500, // 0.05% for Uniswap V3
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
  {
    address: "0xa46d5090499efb9c5dd7d95f7ca69f996b9fb761",
    token0: "DICKBUTT",
    token1: "USDC",
    name: "DICKBUTT/USDC",
    token0Address: TOKENS.DICKBUTT,
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

// export const PORTFOLIO_MANAGER_ABI = [
//   "function createPortfolio(uint256 _riskLevel) external",
//   "function deposit(address _token, uint256 _amount) external",
//   "function withdraw(address _token, uint256 _amount) external",
//   "function userPortfolios(address user) external view returns (uint256 totalValue, uint256 riskLevel, bool isActive)",
//   "event PortfolioCreated(address indexed user, uint256 riskLevel)",
//   "event TradeExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amount)",
//   "function approvedTokens(address token) external view returns (bool)",
//   "function addToken(address _token) external",
//   "function removeToken(address _token) external",
// ] as const;

// export const AI_ORACLE_ABI = [
//   "function getPrediction(address _token) external view returns (uint256 confidence, int256 priceDirection, uint256 timestamp, bool isHoneypot, uint256 riskScore)",
//   "event PredictionUpdated(address indexed token, uint256 confidence, int256 priceDirection, bool isHoneypot, uint256 riskScore)",
// ] as const;

export const CONTRACT_ADDRESSES = {
  portfolioManager: "0x5311762b56488E6A5bE780910bAb20353A93FBdb",
  aiTrader: "0x3d66bc567613a5E7D3b49bb3b8C7BFf53EEB82f6",
  aiOracle: "0x8e5aF933650BE4af3A58d949e5B817194aC5d91f",
} as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
] as const;

export type Token = keyof typeof TOKENS;

// Re-export ABIs
export { AI_TRADER_ABI, PORTFOLIO_MANAGER_ABI, AI_ORACLE_ABI };
