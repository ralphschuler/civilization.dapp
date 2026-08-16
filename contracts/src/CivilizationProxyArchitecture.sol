// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// These are intentionally stock OpenZeppelin 5.x contracts: deployment code
// instantiates TransparentUpgradeableProxy and ProxyAdmin directly, never a
// project-owned proxy or UUPS implementation.
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract CivilizationProxyArchitectureImports {}
