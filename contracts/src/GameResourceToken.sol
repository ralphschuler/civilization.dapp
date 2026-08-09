// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-20 resource token controlled by the authoritative game contract.
/// @dev Wood, Clay and Stone allow movement only through registered game venues.
/// Gold can be configured as settlement-capable, but no swap mechanism lives here.
contract GameResourceToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable gameController;
    bool public immutable externalSettlementAllowed;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isGameVenue;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event GameVenueSet(address indexed venue, bool allowed);

    error NotGameController();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OutsideGameVenue();

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address controller,
        bool canSettleExternally
    ) {
        if (controller == address(0)) revert ZeroAddress();
        name = tokenName;
        symbol = tokenSymbol;
        gameController = controller;
        externalSettlementAllowed = canSettleExternally;
    }

    modifier onlyGameController() {
        if (msg.sender != gameController) revert NotGameController();
        _;
    }

    function setGameVenue(address venue, bool allowed) external onlyGameController {
        if (venue == address(0)) revert ZeroAddress();
        isGameVenue[venue] = allowed;
        emit GameVenueSet(venue, allowed);
    }

    function mint(address to, uint256 value) external onlyGameController {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function burn(address from, uint256 value) external onlyGameController {
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted < value) revert InsufficientAllowance();
        if (permitted != type(uint256).max) allowance[from][msg.sender] = permitted - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < value) revert InsufficientBalance();
        if (!externalSettlementAllowed && !isGameVenue[from] && !isGameVenue[to] && msg.sender != gameController) {
            revert OutsideGameVenue();
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
