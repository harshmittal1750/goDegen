// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Interfaces.sol";

interface IOwnable {
    function owner() external view returns (address);
}

interface IPermit2 {
    function approve(
        address token,
        address spender,
        uint160 amount,
        uint48 expiration
    ) external;

    function transferFrom(
        address from,
        address to,
        uint160 amount,
        address token
    ) external;
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
        swapRouter = ISwapRouter(0x2626664c2603336E57B271c5C0b26F421741e481); // SwapRouter02 on Base
        factory = IUniswapV3Factory(0x33128a8fC17869897dcE68Ed026d694621f6FDfD); // Factory on Base
        quoter = IQuoterV2(0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a); // QuoterV2 on Base
        permit2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3); // Permit2 on Base
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

        for (uint256 i = 0; i < SUPPORTED_FEES.length; i++) {
            address currentPool = factory.getPool(
                _tokenIn,
                _tokenOut,
                SUPPORTED_FEES[i]
            );
            if (currentPool != address(0)) {
                uint256 liquidity = IERC20(_tokenIn).balanceOf(currentPool);
                if (liquidity > bestLiquidity) {
                    bestLiquidity = liquidity;
                    pool = currentPool;
                    fee = SUPPORTED_FEES[i];
                }
            }
        }
        require(pool != address(0), "No pool found");
    }

    function executeTrade(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        address _recipient,
        bytes calldata /*_aiData*/
    ) external onlyAIOracle returns (uint256 amountOut) {
        require(
            whitelistedTokens[_tokenIn] && whitelistedTokens[_tokenOut],
            "Tokens not whitelisted"
        );
        require(_amountIn >= MIN_TRADE_AMOUNT, "Amount too low");

        // Find best pool and fee
        (, uint24 fee) = findBestPool(_tokenIn, _tokenOut);

        // Get quote for minimum amount out
        (uint256 quotedAmount, , , ) = quoter.quoteExactInputSingle(
            _tokenIn,
            _tokenOut,
            fee,
            _amountIn,
            0
        );

        uint256 minAmountOut = (quotedAmount * (10000 - MAX_SLIPPAGE)) / 10000;

        // Transfer tokens from portfolio manager
        IERC20(_tokenIn).transferFrom(msg.sender, address(this), _amountIn);

        // Approve router
        IERC20(_tokenIn).approve(address(swapRouter), _amountIn);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                fee: fee,
                recipient: _recipient,
                deadline: block.timestamp + DEADLINE_EXTENSION,
                amountIn: _amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            });

        amountOut = swapRouter.exactInputSingle(params);

        emit TradeExecuted(
            _tokenIn,
            _tokenOut,
            _amountIn,
            amountOut,
            _recipient,
            fee
        );

        return amountOut;
    }

    function executeManualTrade(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        address _recipient
    ) external returns (uint256 amountOut) {
        require(
            whitelistedTokens[_tokenIn] && whitelistedTokens[_tokenOut],
            "Tokens not whitelisted"
        );
        require(_amountIn >= MIN_TRADE_AMOUNT, "Amount too low (min 0.1 USDC)");

        // Find best pool and fee
        (, uint24 fee) = findBestPool(_tokenIn, _tokenOut);

        // Get quote for minimum amount out
        try
            quoter.quoteExactInputSingle(
                _tokenIn,
                _tokenOut,
                fee,
                _amountIn,
                0 // sqrtPriceLimitX96
            )
        returns (
            uint256 quotedAmount,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        ) {
            require(quotedAmount > 0, "Quote returned zero amount");

            // Cache the quote
            bytes32 quoteKey = keccak256(
                abi.encodePacked(_tokenIn, _tokenOut, _amountIn, fee)
            );
            poolQuotes[quoteKey] = PoolQuote({
                timestamp: block.timestamp,
                quotedAmount: quotedAmount,
                fee: fee
            });

            uint256 minAmountOut = (quotedAmount * (10000 - MAX_SLIPPAGE)) /
                10000;

            // Transfer tokens using Permit2
            permit2.transferFrom(
                msg.sender,
                address(this),
                uint160(_amountIn),
                _tokenIn
            );

            // Approve router through Permit2
            permit2.approve(
                _tokenIn,
                address(swapRouter),
                uint160(_amountIn),
                uint48(block.timestamp + DEADLINE_EXTENSION)
            );

            // Execute swap with the cached quote
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: _tokenIn,
                    tokenOut: _tokenOut,
                    fee: fee,
                    recipient: _recipient,
                    deadline: block.timestamp + DEADLINE_EXTENSION,
                    amountIn: _amountIn,
                    amountOutMinimum: minAmountOut,
                    sqrtPriceLimitX96: 0
                });

            amountOut = swapRouter.exactInputSingle(params);
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
            revert(string(abi.encodePacked("Quote failed: ", reason)));
        } catch (bytes memory /*lowLevelData*/) {
            revert("Failed to get quote - try increasing amount");
        }
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
