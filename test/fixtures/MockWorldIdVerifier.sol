// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only verifier. A revert toggle proves CivilizationGame calls the
/// external World ID verifier before it persists a registration.
contract MockWorldIdVerifier {
    bool public rejectProof;

    function setRejectProof(bool value) external {
        rejectProof = value;
    }

    function verify(
        uint256,
        uint256,
        uint64,
        uint256,
        uint256,
        uint64,
        uint64,
        uint256,
        uint256[5] calldata
    ) external view {
        require(!rejectProof, "proof rejected");
    }
}
