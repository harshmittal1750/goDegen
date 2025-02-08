// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external;
    function approve(address spender, uint256 amount) external;
}

contract AI_Trader {
    address public owner;
    address public aiOracle;

    constructor(address _oracle) {
        owner = msg.sender;
        aiOracle = _oracle;
    }

    
    function executeTrade(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        bytes calldata _aiData 
    ) external {
        require(msg.sender == aiOracle, "Only AI Oracle");
        
        IERC20(_tokenIn).approve(address(this), _amountIn);
        IERC20(_tokenIn).transferFrom(owner, address(this), _amountIn);
        
        
        (bool success, ) = _tokenOut.call{value: _amountIn}("");
        require(success, "Trade failed");
    }
}
contract HoneypotChecker {
    function isHoneypot(address _token) public view returns (bool) {
       
        (bool success,) = _token.staticcall(abi.encodeWithSignature("sell(uint256)", 1e18));
        if (!success) return true;
        
        uint256 ownerBalance = IERC20(_token).balanceOf(IOwnable(_token).owner());
        uint256 totalSupply = IERC20(_token).totalSupply();
        return (ownerBalance * 100) / totalSupply > 80;
    }
}   

