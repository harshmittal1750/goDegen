// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Interfaces.sol";

contract PortfolioManager {
    struct Portfolio {
        uint256 totalValue;
        uint256 riskLevel; // 1-10, where 1 is lowest risk
        mapping(address => uint256) tokenBalances;
        bool isActive;
    }

    mapping(address => Portfolio) public userPortfolios;
    mapping(address => bool) public approvedTokens;
    address[] public approvedTokenList;

    address public owner;
    address public aiTrader;

    uint256 public constant MIN_DEPOSIT = 1e6; // 1 USDC
    uint256 public constant MAX_TOKENS_PER_PORTFOLIO = 10;

    event PortfolioCreated(address indexed user, uint256 riskLevel);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event Deposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event Withdrawn(
        address indexed user,
        address indexed token,
        uint256 amount,
        address recipient
    );
    event TradeExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address _aiTrader) {
        owner = msg.sender;
        aiTrader = _aiTrader;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAI() {
        require(msg.sender == aiTrader, "Not AI trader");
        _;
    }

    function addToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token");
        approvedTokens[_token] = true;
        approvedTokenList.push(_token);
        emit TokenAdded(_token);
    }

    function removeToken(address _token) external onlyOwner {
        approvedTokens[_token] = false;
        // Remove from approvedTokenList
        for (uint256 i = 0; i < approvedTokenList.length; i++) {
            if (approvedTokenList[i] == _token) {
                approvedTokenList[i] = approvedTokenList[
                    approvedTokenList.length - 1
                ];
                approvedTokenList.pop();
                break;
            }
        }
        emit TokenRemoved(_token);
    }

    function createPortfolio(uint256 _riskLevel) external {
        require(_riskLevel > 0 && _riskLevel <= 10, "Invalid risk level");
        require(!userPortfolios[msg.sender].isActive, "Portfolio exists");

        Portfolio storage newPortfolio = userPortfolios[msg.sender];
        newPortfolio.riskLevel = _riskLevel;
        newPortfolio.isActive = true;

        emit PortfolioCreated(msg.sender, _riskLevel);
    }

    function deposit(address _token, uint256 _amount) external {
        require(approvedTokens[_token], "Token not approved");
        require(_amount >= MIN_DEPOSIT, "Amount too low");
        require(userPortfolios[msg.sender].isActive, "No active portfolio");

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        userPortfolios[msg.sender].tokenBalances[_token] += _amount;

        emit Deposited(msg.sender, _token, _amount);
    }

    function withdraw(
        address _token,
        uint256 _amount,
        address _recipient
    ) external {
        require(userPortfolios[msg.sender].isActive, "No active portfolio");
        require(_recipient != address(0), "Invalid recipient");
        require(
            userPortfolios[msg.sender].tokenBalances[_token] >= _amount,
            "Insufficient balance"
        );

        userPortfolios[msg.sender].tokenBalances[_token] -= _amount;
        IERC20(_token).transfer(_recipient, _amount);

        emit Withdrawn(msg.sender, _token, _amount, _recipient);
    }

    function executeAITrade(
        address _user,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external onlyAI {
        require(
            approvedTokens[_tokenIn] && approvedTokens[_tokenOut],
            "Unapproved tokens"
        );

        Portfolio storage portfolio = userPortfolios[_user];
        require(portfolio.isActive, "No active portfolio");
        require(
            portfolio.tokenBalances[_tokenIn] >= _amountIn,
            "Insufficient balance"
        );

        // Update input token balance
        portfolio.tokenBalances[_tokenIn] -= _amountIn;

        // Approve AI_Trader
        IERC20(_tokenIn).approve(aiTrader, _amountIn);

        // Execute trade
        uint256 amountOut = AI_Trader(aiTrader).executeTrade(
            _tokenIn,
            _tokenOut,
            _amountIn,
            address(this),
            "" // AI data
        );

        // Update output token balance
        portfolio.tokenBalances[_tokenOut] += amountOut;

        emit TradeExecuted(_user, _tokenIn, _tokenOut, _amountIn, amountOut);
    }

    function getPortfolioTokens(
        address _user
    )
        external
        view
        returns (address[] memory tokens, uint256[] memory balances)
    {
        Portfolio storage portfolio = userPortfolios[_user];
        require(portfolio.isActive, "No active portfolio");

        tokens = new address[](MAX_TOKENS_PER_PORTFOLIO);
        balances = new uint256[](MAX_TOKENS_PER_PORTFOLIO);

        uint256 count = 0;
        for (
            uint256 i = 0;
            i < approvedTokenList.length && count < MAX_TOKENS_PER_PORTFOLIO;
            i++
        ) {
            address token = approvedTokenList[i];
            if (portfolio.tokenBalances[token] > 0) {
                tokens[count] = token;
                balances[count] = portfolio.tokenBalances[token];
                count++;
            }
        }

        // Resize arrays to actual count
        assembly {
            mstore(tokens, count)
            mstore(balances, count)
        }
    }
}
