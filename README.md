# GoDegen - AI-Powered DeFi Trading Platform

GoDegen is an advanced DeFi trading platform that combines artificial intelligence with automated trading strategies on the Base network. The platform enables users to create AI-managed portfolios that automatically execute trades based on market predictions and risk parameters.

## Overview

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

3. **AI Oracle System**
   - Provides real-time market predictions
   - Analyzes market sentiment and trends
   - Detects potential risks and opportunities

## Key Features

### 1. Portfolio Management

- Create personalized portfolios with custom risk levels
- Deposit and withdraw tokens
- Track portfolio value and performance
- View real-time token balances

### 2. AI-Powered Trading

- Automated trading based on AI predictions
- Configurable trading parameters:
  - Minimum confidence threshold
  - Maximum risk score
  - Trade amount
  - Auto-trading toggle
- Real-time market analysis and predictions

### 3. Risk Management

- Honeypot detection
- Slippage protection
- Risk score assessment
- Multi-level validation before trade execution

### 4. Real-Time Monitoring

- Live trade monitoring
- Block monitoring
- Price impact analysis
- Whale activity detection

## Smart Contract Architecture

### PortfolioManager Contract

- Manages user portfolios and token balances
- Handles deposits and withdrawals
- Executes trades through AI_Trader
- Manages auto-trading settings

### AI_Trader Contract (GoDegen)

- Integrates with Uniswap V3
- Finds best trading pools
- Implements slippage protection
- Executes trades with optimal routing

### AI Oracle Contract

- Provides market predictions
- Assesses token risks
- Calculates confidence scores
- Updates price directions

## How It Works

1. **Portfolio Creation**

   ```
   User -> PortfolioManager -> Create Portfolio
   Set Risk Level (1-10)
   ```

2. **Deposit Process**

   ```
   User -> Approve Token -> PortfolioManager
   Token transferred to contract
   Balance updated in portfolio
   ```

3. **Auto-Trading Flow**

   ```
   AI Oracle -> Market Prediction
   PortfolioManager -> Validate Conditions
   AI_Trader -> Execute Trade (if conditions met)
   ```

4. **Trading Validation**
   - Check portfolio status
   - Verify token approvals
   - Validate prediction confidence
   - Assess risk scores
   - Check for honeypot risks
   - Verify sufficient balance

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

## Technical Stack

- Solidity (Smart Contracts)
- TypeScript (Frontend)
- Next.js (Framework)
- ethers.js (Blockchain Interaction)
- Tailwind CSS (Styling)
- Uniswap V3 (DEX Integration)

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
