// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AIOracleV1 {
    struct Prediction {
        uint256 confidence;
        int256 priceDirection; // 1 for up, -1 for down, 0 for neutral
        uint256 timestamp;
        bool isHoneypot;
        uint256 riskScore;
    }

    mapping(address => Prediction) public tokenPredictions;
    mapping(address => bool) public authorizedUpdaters;
    address public owner;

    event PredictionUpdated(
        address indexed token,
        uint256 confidence,
        int256 priceDirection,
        bool isHoneypot,
        uint256 riskScore
    );

    constructor() {
        owner = msg.sender;
        authorizedUpdaters[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedUpdaters[msg.sender], "Not authorized");
        _;
    }

    function addUpdater(address _updater) external onlyOwner {
        authorizedUpdaters[_updater] = true;
    }

    function removeUpdater(address _updater) external onlyOwner {
        authorizedUpdaters[_updater] = false;
    }

    function updatePrediction(
        address _token,
        uint256 _confidence,
        int256 _priceDirection,
        bool _isHoneypot,
        uint256 _riskScore
    ) external onlyAuthorized {
        require(_confidence <= 100, "Invalid confidence");
        require(_riskScore <= 100, "Invalid risk score");

        tokenPredictions[_token] = Prediction({
            confidence: _confidence,
            priceDirection: _priceDirection,
            timestamp: block.timestamp,
            isHoneypot: _isHoneypot,
            riskScore: _riskScore
        });

        emit PredictionUpdated(
            _token,
            _confidence,
            _priceDirection,
            _isHoneypot,
            _riskScore
        );
    }

    function getPrediction(
        address _token
    )
        external
        view
        returns (
            uint256 confidence,
            int256 priceDirection,
            uint256 timestamp,
            bool isHoneypot,
            uint256 riskScore
        )
    {
        Prediction memory pred = tokenPredictions[_token];
        return (
            pred.confidence,
            pred.priceDirection,
            pred.timestamp,
            pred.isHoneypot,
            pred.riskScore
        );
    }
}
