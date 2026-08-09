// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Governance registry for external Gold settlement assets.
/// @dev This contract cannot custody Gold or external assets and cannot execute a swap.
///      A separate audited settlement adapter and price/risk controls are required before launch.
contract GoldSettlementRegistry {
    address public owner;
    address public immutable goldToken;
    mapping(address => bool) public isSettlementAsset;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SettlementAssetSet(address indexed asset, bool allowed);

    error NotOwner();
    error ZeroAddress();

    constructor(address gold) {
        if (gold == address(0)) revert ZeroAddress();
        owner = msg.sender;
        goldToken = gold;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function setSettlementAsset(address asset, bool allowed) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        isSettlementAsset[asset] = allowed;
        emit SettlementAssetSet(asset, allowed);
    }
}
