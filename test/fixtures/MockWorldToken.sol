// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only ERC-20 used to exercise WLD payment behavior on the local EVM.
contract MockWorldToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 value) external {
        balanceOf[account] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] < value || balanceOf[from] < value) return false;
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}
