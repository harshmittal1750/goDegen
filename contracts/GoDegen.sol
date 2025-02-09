// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Interfaces.sol";

interface IOwnable {
    function owner() external view returns (address);
}

contract GoDegen {
    address public owner;
    address public aiOracle;
    ISwapRouter public immutable swapRouter;
    IUniswapV3Factory public immutable factory;
    IQuoterV2 public immutable quoter;
    IPermit2 public immutable permit2;

    uint24[] public SUPPORTED_FEES = [100, 500, 3000, 10000];
    uint256 public constant DEADLINE_EXTENSION = 20 minutes;
    uint256 public constant MAX_SLIPPAGE = 5000;
    uint256 public constant MIN_TRADE_AMOUNT = 1e5; // 0.1 USDC

    mapping(address => bool) public whitelistedTokens;

    // Add pool quote cache to prevent slippage between quote and execution
    struct PoolQuote {
        uint256 timestamp;
        uint256 quotedAmount;
        uint24 fee;
    }
    mapping(bytes32 => PoolQuote) private poolQuotes;

    event TradeExecuted(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient,
        uint24 fee
    );

    constructor(
        address _oracle,
        address _router,
        address _factory,
        address _quoter
    ) {
        owner = msg.sender;
        aiOracle = _oracle;
        swapRouter = ISwapRouter(0x2626664c2603336E57B271c5C0b26F421741e481);
        factory = IUniswapV3Factory(0x33128a8fC17869897dcE68Ed026d694621f6FDfD);
        quoter = IQuoterV2(0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a);
        permit2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAIOracle() {
        require(msg.sender == aiOracle, "Not AI Oracle");
        _;
    }

    function whitelistToken(address _token, bool _status) external onlyOwner {
        whitelistedTokens[_token] = _status;
    }

    function findBestPool(
        address _tokenIn,
        address _tokenOut
    ) public view returns (address pool, uint24 fee) {
        uint256 bestLiquidity = 0;
        bool foundPool = false;

        // First try known fee tiers in order of preference
        uint24[4] memory preferredFees = [
            uint24(500),
            uint24(3000),
            uint24(100),
            uint24(10000)
        ]; // 0.05%, 0.3%, 0.01%, 1%

        for (uint256 i = 0; i < preferredFees.length; i++) {
            address currentPool = factory.getPool(
                _tokenIn,
                _tokenOut,
                preferredFees[i]
            );
            if (currentPool != address(0)) {
                uint256 liquidity = IERC20(_tokenIn).balanceOf(currentPool);
                if (liquidity > bestLiquidity) {
                    bestLiquidity = liquidity;
                    pool = currentPool;
                    fee = preferredFees[i];
                    foundPool = true;
                }
            }
        }

        // If no pool found with liquidity, return the first existing pool
        if (!foundPool) {
            for (uint256 i = 0; i < preferredFees.length; i++) {
                address currentPool = factory.getPool(
                    _tokenIn,
                    _tokenOut,
                    preferredFees[i]
                );
                if (currentPool != address(0)) {
                    pool = currentPool;
                    fee = preferredFees[i];
                    foundPool = true;
                    break;
                }
            }
        }

        require(foundPool, "No pool found for token pair");
        require(pool != address(0), "Invalid pool address");
        return (pool, fee);
    }

    // Helper function to validate basic trade parameters
    function validateTradeParams(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal view {
        require(
            whitelistedTokens[_tokenIn] && whitelistedTokens[_tokenOut],
            "Tokens not whitelisted"
        );
        require(_amountIn >= MIN_TRADE_AMOUNT, "Amount too low (min 0.1 USDC)");
    }

    // Helper function to get quote from pool
    function getQuoteFromPool(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint24 _fee
    ) internal returns (uint256 quotedAmount, bytes32 quoteKey) {
        // First verify the pool exists
        address pool = factory.getPool(_tokenIn, _tokenOut, _fee);
        require(pool != address(0), "Pool does not exist");

        // Check if pool has liquidity
        uint256 poolLiquidity = IERC20(_tokenIn).balanceOf(pool);
        require(poolLiquidity > 0, "Pool has no liquidity");

        // Try to get quote with error handling
        try
            quoter.quoteExactInputSingle(
                _tokenIn,
                _tokenOut,
                _fee,
                _amountIn,
                0 // sqrtPriceLimitX96
            )
        returns (
            uint256 amountOut,
            uint160 /*sqrtPriceX96After*/,
            uint32 /*initializedTicksCrossed*/,
            uint256 /*gasEstimate*/
        ) {
            require(amountOut > 0, "Quote returned zero amount");

            quoteKey = keccak256(
                abi.encodePacked(_tokenIn, _tokenOut, _amountIn, _fee)
            );
            poolQuotes[quoteKey] = PoolQuote({
                timestamp: block.timestamp,
                quotedAmount: amountOut,
                fee: _fee
            });

            return (amountOut, quoteKey);
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Quote failed: ", reason)));
        } catch {
            revert("Pool may not be initialized - try a different fee tier");
        }
    }

    // Helper function to execute swap
    function executeSwap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _minAmountOut,
        address _recipient,
        uint24 _fee
    ) internal returns (uint256) {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                fee: _fee,
                recipient: _recipient,
                deadline: block.timestamp + DEADLINE_EXTENSION,
                amountIn: _amountIn,
                amountOutMinimum: _minAmountOut,
                sqrtPriceLimitX96: 0
            });

        return swapRouter.exactInputSingle(params);
    }

    function executeManualTrade(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        address _recipient
    ) public returns (uint256 amountOut) {
        // Validate basic parameters
        validateTradeParams(_tokenIn, _tokenOut, _amountIn);

        // Find best pool and fee
        (, uint24 fee) = findBestPool(_tokenIn, _tokenOut);

        // Get quote and cache it
        (uint256 quotedAmount, bytes32 quoteKey) = getQuoteFromPool(
            _tokenIn,
            _tokenOut,
            _amountIn,
            fee
        );

        uint256 minAmountOut = (quotedAmount * (10000 - MAX_SLIPPAGE)) / 10000;

        // Define max uint160 value
        uint160 maxUint160 = type(uint160).max;

        // Transfer tokens using Permit2
        try
            permit2.transferFrom(
                msg.sender, // from
                address(this), // to
                uint160(_amountIn), // amount
                _tokenIn // token
            )
        {
            // Approve router through Permit2
            permit2.approve(
                _tokenIn,
                address(swapRouter),
                maxUint160, // Use max uint160 instead of uint256
                uint48(block.timestamp + DEADLINE_EXTENSION)
            );

            // Execute the swap
            amountOut = executeSwap(
                _tokenIn,
                _tokenOut,
                _amountIn,
                minAmountOut,
                _recipient,
                fee
            );

            require(amountOut >= minAmountOut, "Insufficient output amount");

            // Clear the quote cache
            delete poolQuotes[quoteKey];

            emit TradeExecuted(
                _tokenIn,
                _tokenOut,
                _amountIn,
                amountOut,
                _recipient,
                fee
            );

            return amountOut;
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Transfer failed: ", reason)));
        } catch {
            revert("Transfer failed - check balance and allowance");
        }
    }

    function executeTrade(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        address _recipient,
        bytes calldata /*_aiData*/
    ) external onlyAIOracle returns (uint256) {
        return executeManualTrade(_tokenIn, _tokenOut, _amountIn, _recipient);
    }
}

contract HoneypotChecker {
    function isHoneypot(address _token) public view returns (bool) {
        (bool success, ) = _token.staticcall(
            abi.encodeWithSignature("sell(uint256)", 1e18)
        );
        if (!success) return true;

        uint256 ownerBalance = IERC20(_token).balanceOf(
            IOwnable(_token).owner()
        );
        uint256 totalSupply = IERC20(_token).totalSupply();
        return (ownerBalance * 100) / totalSupply > 80;
    }
}
