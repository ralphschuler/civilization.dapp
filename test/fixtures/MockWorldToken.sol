// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only ERC-20 used to exercise WLD payment behavior on the local EVM.
contract MockWorldToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint16 public feeBps;
    bool public transferFails;

    function setFeeBps(uint16 value) external {
        feeBps = value;
    }
    function setTransferFails(bool value) external {
        transferFails = value;
    }

    function mint(address account, uint256 value) external {
        balanceOf[account] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool) {
        if (allowance[from][msg.sender] < value || balanceOf[from] < value)
            return false;
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value - ((value * feeBps) / 10_000);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (transferFails) return false;
        if (balanceOf[msg.sender] < value) return false;
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}
