// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

contract PortfolioManager {
    struct Portfolio {
        uint256 totalValue;
        uint256 riskLevel; // 1-10, where 1 is lowest risk
        mapping(address => uint256) tokenBalances;
        bool isActive;
    }

    mapping(address => Portfolio) public userPortfolios;
    mapping(address => bool) public approvedTokens;
    address public owner;
    address public aiTrader;

    event PortfolioCreated(address indexed user, uint256 riskLevel);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event TradeExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amount
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

    function createPortfolio(uint256 _riskLevel) external {
        require(_riskLevel > 0 && _riskLevel <= 10, "Invalid risk level");
        require(!userPortfolios[msg.sender].isActive, "Portfolio exists");

        Portfolio storage newPortfolio = userPortfolios[msg.sender];
        newPortfolio.riskLevel = _riskLevel;
        newPortfolio.isActive = true;

        emit PortfolioCreated(msg.sender, _riskLevel);
    }

    function addToken(address _token) external onlyOwner {
        approvedTokens[_token] = true;
        emit TokenAdded(_token);
    }

    function removeToken(address _token) external onlyOwner {
        approvedTokens[_token] = false;
        emit TokenRemoved(_token);
    }

    function executeAITrade(
        address _user,
        address _tokenIn,
        address _tokenOut,
        uint256 _amount
    ) external onlyAI {
        require(
            approvedTokens[_tokenIn] && approvedTokens[_tokenOut],
            "Unapproved tokens"
        );
        require(userPortfolios[_user].isActive, "No active portfolio");

        Portfolio storage portfolio = userPortfolios[_user];
        require(
            portfolio.tokenBalances[_tokenIn] >= _amount,
            "Insufficient balance"
        );

        // Execute trade logic here
        portfolio.tokenBalances[_tokenIn] -= _amount;
        // Calculate received amount based on actual trade
        uint256 receivedAmount = _amount; // This should be actual received amount
        portfolio.tokenBalances[_tokenOut] += receivedAmount;

        emit TradeExecuted(_user, _tokenIn, _tokenOut, _amount);
    }

    function deposit(address _token, uint256 _amount) external {
        require(approvedTokens[_token], "Token not approved");
        require(userPortfolios[msg.sender].isActive, "No active portfolio");

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        userPortfolios[msg.sender].tokenBalances[_token] += _amount;
    }

    function withdraw(address _token, uint256 _amount) external {
        require(userPortfolios[msg.sender].isActive, "No active portfolio");
        require(
            userPortfolios[msg.sender].tokenBalances[_token] >= _amount,
            "Insufficient balance"
        );

        userPortfolios[msg.sender].tokenBalances[_token] -= _amount;
        IERC20(_token).transfer(msg.sender, _amount);
    }
}
