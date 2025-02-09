# GoDegen - AI-Powered DeFi Trading Platform

## Short Description

🤖 GoDegen: AI-powered DeFAI trading platform on Base that automates trades using real-time market predictions, advanced pool analytics, and risk management. Trade smarter with AI! #DeFi #Base #Trading

## Description

GoDegen revolutionizes DeFi trading by combining artificial intelligence with automated trading strategies on the Base network. At its core, it's a sophisticated trading platform that leverages AI predictions to execute optimal trades while managing risk, check honeypots, The platform enables users to create AI-managed portfolios that automatically execute trades based on market predictions and risk parameters.

Key innovations:

- **AI-Driven Trading**: Real-time market predictions and risk assessment using our custom AI Oracle
- **Dynamic Pool Management**: Automatic discovery and optimization of Uniswap V3 pools across multiple fee tiers
- **Advanced Analytics**: Real-time whale detection, market making patterns, and arbitrage opportunity identification
- **Risk Management**: Multi-layer protection including honeypot detection, slippage control, and liquidity verification

## How it's Made

GoDegen is built using a modern tech stack carefully chosen for reliability, speed, and user experience:

### Smart Contracts (Solidity)

- **Portfolio Manager**: Built with Solidity 0.8.x, manages user portfolios and handles token deposits/withdrawals
- **AI Trader**: Integrates with Uniswap V3, implementing custom pool discovery and quote optimization algorithms
- **AI Oracle**: Provides real-time market predictions using a sophisticated scoring system
- **Security**: Implements permit2 for gasless approvals and multi-step validation for trades

### Frontend (Next.js + TypeScript)

- **Real-time Updates**: Uses WebSocket connections for live trade and block monitoring
- **State Management**: Custom hooks for efficient data handling and real-time updates
- **UI Components**: Built with Tailwind CSS for a responsive and modern interface
- **Web3 Integration**: Ethers.js v6 for blockchain interactions and transaction management

### Trading Engine

- **Pool Discovery**: Custom algorithms to find and validate the best pools for trading
- **Quote Optimization**: Multi-strategy approach with fallback mechanisms
- **Analytics Engine**: Real-time analysis of market conditions, whale activity, and trading patterns
- **Error Handling**: Comprehensive error detection and recovery system

### Notable Technical Achievements:

1. **Dynamic Fee Optimization**: Automatically tests multiple fee tiers (0.01%, 0.05%, 0.3%, 1%) to find the most efficient trading route
2. **Advanced Quote System**: Implements both direct pool and path-based quotes with automatic fallback
3. **Real-time Analytics**: Custom algorithms for detecting whale activity, market making patterns, and arbitrage opportunities
4. **Gas Optimization**: Efficient contract design and permit2 integration for reduced gas costs

GoDegen consists of three main components:

1. **Smart Contracts (Solidity)**

   - `PortfolioManager.sol`: Manages user portfolios and executes trades
   - `GoDegen.sol` (AI_Trader): Handles trade execution through Uniswap V3
   - `AIOracleV1.sol`: Provides AI-powered market predictions
   - `Interfaces.sol`: Contains necessary interface definitions

2. **Frontend (Next.js + TypeScript)**

   - Modern, responsive UI built with React and Tailwind CSS
   - Real-time trading interface and portfolio management
   - Auto-trading configuration dashboard
   - Advanced market analytics and monitoring

3. **AI Oracle System**
   - Provides real-time market predictions
   - Analyzes market sentiment and trends
   - Detects potential risks and opportunities
   - Honeypot detection and risk scoring

## Key Features

### 1. Portfolio Management

- Create personalized portfolios with custom risk levels
- Deposit and withdraw tokens
- Track portfolio value and performance
- View real-time token balances
- Configure auto-trading parameters

### 2. AI-Powered Trading

- Automated trading based on AI predictions
- Configurable trading parameters:
  - Minimum confidence threshold (0-100)
  - Maximum risk score (0-100)
  - Trade amount in USDC
  - Auto-trading toggle
- Real-time market analysis and predictions
- Multiple quote strategies (direct pool and path-based)

### 3. Risk Management

- Honeypot detection
- Slippage protection
- Risk score assessment
- Multi-level validation before trade execution
- Pool liquidity verification
- Dynamic fee tier selection

### 4. Real-Time Monitoring

- Live trade monitoring with detailed analytics:
  - Price impact analysis
  - Trend direction and confidence
  - Whale activity detection
  - Market making detection
  - Arbitrage opportunity identification
- Block monitoring
- Transaction tracking
- Pool liquidity monitoring

## Advanced Trading Features

### 1. Dynamic Pool Selection

```
- Automatic discovery of available pools
- Testing multiple fee tiers (0.01%, 0.05%, 0.3%, 1%)
- Liquidity verification for each pool
- Selection of best pool based on:
  - Available liquidity
  - Fee tier optimization
  - Quote testing
```

### 2. Quote Optimization

```
- Multi-strategy quote retrieval:
  1. Direct pool quote (quoteExactInputSingle)
  2. Path-based quote fallback (quoteExactInput)
- Quote validation and verification
- Zero-amount quote protection
- Pool initialization checks
```

### 3. Market Analytics

```
- Real-time price impact calculation
- Trend analysis with confidence scoring
- Whale detection with size classification:
  - Medium (>$10k)
  - Large (>$250k)
  - Massive (>$1M)
- Market making pattern detection
- Arbitrage opportunity identification
```

### 4. Error Handling

```
- Comprehensive error detection:
  - Pool liquidity issues
  - Initialization status
  - Quote failures
  - Execution reverts
- Detailed error reporting
- Automatic fallback strategies
- Transaction monitoring
```

## Trading Flow

1. **Initial Setup**

```
User -> Configure Auto-Trading Settings
- Enable/disable auto-trading
- Set minimum confidence (0-100)
- Set maximum risk score (0-100)
- Set trade amount (USDC)
```

2. **Trade Preparation**

```
System -> Check Conditions
- Verify AI prediction confidence
- Check risk score
- Validate honeypot status
- Verify USDC balance
```

3. **Pool Discovery**

```
System -> Find Best Pool
- Check all fee tiers
- Verify pool existence
- Test pool liquidity
- Validate pool initialization
```

4. **Quote Process**

```
System -> Get Quote
1. Try direct pool quote
2. Fallback to path-based quote
3. Validate quote amount
4. Check price impact
```

5. **Trade Execution**

```
System -> Execute Trade
- Verify approvals
- Set appropriate gas limit
- Execute with slippage protection
- Monitor transaction
- Log results
```

## Technical Implementation

### Smart Contract Integration

```typescript
// AI Trader Interface
interface IAITrader {
  executeManualTrade(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    address recipient
  ) external returns (uint256 amountOut);

  findBestPool(
    address tokenIn,
    address tokenOut
  ) external view returns (address pool, uint24 fee);
}

// Portfolio Manager Interface
interface IPortfolioManager {
  updateAutoTrading(
    bool enabled,
    uint256 minConfidence,
    uint256 maxRiskScore,
    uint256 tradeAmount
  ) external;

  getAutoTradingSettings(address user) external view returns (
    bool enabled,
    uint256 minConfidence,
    uint256 maxRiskScore,
    uint256 tradeAmount
  );
}
```

### Market Analytics Implementation

```typescript
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
```

## Getting Started

### Prerequisites

- Node.js v16+
- MetaMask wallet
- Base network connection

### Installation

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/goDegen.git
   cd goDegen
   ```

2. Install dependencies

   ```bash
   # Install contract dependencies
   cd contracts
   npm install

   # Install frontend dependencies
   cd frontend
   npm install
   ```

3. Configure environment variables

   ```bash
   # Frontend (.env.local)
   NEXT_PUBLIC_WS_RPC_URL=your_websocket_url
   NEXT_PUBLIC_HTTP_RPC_URL=your_http_url
   ```

4. Run the development server
   ```bash
   npm run dev
   ```

## Security Features

- Smart contract access controls
- Slippage protection
- Token whitelist system
- Multi-step trade validation
- Honeypot detection
- Risk assessment
- Pool validation
- Quote verification

## Technical Stack

- Solidity (Smart Contracts)
- TypeScript (Frontend)
- Next.js (Framework)
- ethers.js (Blockchain Interaction)
- Tailwind CSS (Styling)
- Uniswap V3 (DEX Integration)
- WebSocket (Real-time Updates)

## Network Information

- Network: Base
- Chain ID: 8453
- Explorer: https://basescan.org

## Contract Addresses

```typescript
portfolioManager: "0x70861c3004Cf269Bb0907Fdd9E05e9897a11B75e";
aiTrader: "0xDBdEF0fEe36D2fdA21278b42dF6b3AB8B555913b";
aiOracle: "0xab4a060e71905C906EF63Ccb4cDca88111c27483";
```

## Disclaimer

Trading cryptocurrencies carries significant risk. This platform uses AI predictions which, while based on sophisticated algorithms, are not guaranteed to be accurate. Users should carefully consider their risk tolerance before using the auto-trading features.
