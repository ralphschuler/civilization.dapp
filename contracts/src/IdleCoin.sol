// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Legacy deployment draft retained during the Civilization DApp transition.
/// @dev Deliberately not deployed; production needs an audited claim authority.
contract IdleCoin {
    string public constant name = "Idle Coin";
    string public constant symbol = "IDC";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() { owner = msg.sender; }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) { uint256 allowed = allowance[from][msg.sender]; require(allowed >= value, "allowance"); allowance[from][msg.sender] = allowed - value; _transfer(from, to, value); return true; }
    function mint(address to, uint256 value) external { require(msg.sender == owner, "owner"); totalSupply += value; balanceOf[to] += value; emit Transfer(address(0), to, value); }
    function _transfer(address from, address to, uint256 value) internal { require(to != address(0) && balanceOf[from] >= value, "transfer"); balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); }
}
