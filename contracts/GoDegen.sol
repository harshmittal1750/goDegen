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

    uint24[] public SUPPORTED_FEES = [100, 500, 3000, 10000];
    uint256 public constant DEADLINE_EXTENSION = 20 minutes;
    uint256 public constant MAX_SLIPPAGE = 200; // 2%
    uint256 public constant MIN_TRADE_AMOUNT = 1e6; // 1 USDC

    mapping(address => bool) public whitelistedTokens;

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
        swapRouter = ISwapRouter(_router);
        factory = IUniswapV3Factory(_factory);
        quoter = IQuoterV2(_quoter);
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
        bytes calldata _aiData
    ) external onlyAIOracle returns (uint256 amountOut) {
        require(
            whitelistedTokens[_tokenIn] && whitelistedTokens[_tokenOut],
            "Tokens not whitelisted"
        );
        require(_amountIn >= MIN_TRADE_AMOUNT, "Amount too low");

        // Find best pool and fee
        (address pool, uint24 fee) = findBestPool(_tokenIn, _tokenOut);

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
