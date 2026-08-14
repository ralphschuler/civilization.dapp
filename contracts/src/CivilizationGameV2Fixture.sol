// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CivilizationGame} from "./CivilizationGame.sol";

/// @dev Test-only upgrade target. New data is isolated in its own namespace so
/// V1 -> V2 -> V1 -> V2 retains both V1 state and this fixture's state.
contract CivilizationGameV2Fixture is CivilizationGame {
    /// @custom:storage-location erc7201:civilization.game.v2.fixture
    struct V2Storage { uint256 marker; }
    bytes32 private constant V2_STORAGE_LOCATION = 0xe51226c242a13dc23b11f15253e6590affe4764d8637efa53dc8d857385adf00;
    function _v2() private pure returns (V2Storage storage $) { assembly { $.slot := V2_STORAGE_LOCATION } }
    function setV2Marker(uint256 value) external { _v2().marker = value; }
    function v2Marker() external view returns (uint256) { return _v2().marker; }
    function releaseVersion() external pure returns (uint64) { return 2; }
}
