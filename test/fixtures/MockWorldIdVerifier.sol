// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only verifier. A revert toggle proves CivilizationGame calls the
/// external World ID verifier before it persists a registration.
contract MockWorldIdVerifier {
    bool public rejectProof;
    bool public enforceV4Arguments;
    bool public enforceLegacyArguments;

    uint256 private expectedV4Nullifier;
    uint256 private expectedV4Action;
    uint64 private expectedV4RpId;
    uint256 private expectedV4Nonce;
    uint256 private expectedV4SignalHash;
    uint64 private expectedV4ExpiresAtMin;
    uint64 private expectedV4IssuerSchemaId;
    uint256 private expectedV4CredentialGenesisIssuedAtMin;
    bytes32 private expectedV4ProofHash;

    uint256 private expectedLegacyRoot;
    uint256 private expectedLegacyGroupId;
    uint256 private expectedLegacySignalHash;
    uint256 private expectedLegacyNullifier;
    uint256 private expectedLegacyExternalNullifier;
    bytes32 private expectedLegacyProofHash;

    function setRejectProof(bool value) external {
        rejectProof = value;
    }

    function expectV4(
        uint256 nullifier,
        uint256 action,
        uint64 rpId,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        uint256[5] calldata proof
    ) external {
        expectedV4Nullifier = nullifier;
        expectedV4Action = action;
        expectedV4RpId = rpId;
        expectedV4Nonce = nonce;
        expectedV4SignalHash = signalHash;
        expectedV4ExpiresAtMin = expiresAtMin;
        expectedV4IssuerSchemaId = issuerSchemaId;
        expectedV4CredentialGenesisIssuedAtMin = credentialGenesisIssuedAtMin;
        expectedV4ProofHash = keccak256(abi.encode(proof));
        enforceV4Arguments = true;
    }

    function expectLegacy(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external {
        expectedLegacyRoot = root;
        expectedLegacyGroupId = groupId;
        expectedLegacySignalHash = signalHash;
        expectedLegacyNullifier = nullifierHash;
        expectedLegacyExternalNullifier = externalNullifierHash;
        expectedLegacyProofHash = keccak256(abi.encode(proof));
        enforceLegacyArguments = true;
    }

    function verify(
        uint256 nullifier,
        uint256 action,
        uint64 rpId,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        uint256[5] calldata proof
    ) external view {
        require(!rejectProof, "proof rejected");
        if (!enforceV4Arguments) return;
        require(nullifier == expectedV4Nullifier, "v4 nullifier");
        require(action == expectedV4Action, "v4 action");
        require(rpId == expectedV4RpId, "v4 rp id");
        require(nonce == expectedV4Nonce, "v4 nonce");
        require(signalHash == expectedV4SignalHash, "v4 signal");
        require(expiresAtMin == expectedV4ExpiresAtMin, "v4 expiry");
        require(issuerSchemaId == expectedV4IssuerSchemaId, "v4 issuer");
        require(credentialGenesisIssuedAtMin == expectedV4CredentialGenesisIssuedAtMin, "v4 genesis");
        require(keccak256(abi.encode(proof)) == expectedV4ProofHash, "v4 proof");
    }

    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view {
        require(!rejectProof, "proof rejected");
        if (!enforceLegacyArguments) return;
        require(root == expectedLegacyRoot, "v3 root");
        require(groupId == expectedLegacyGroupId, "v3 group");
        require(signalHash == expectedLegacySignalHash, "v3 signal");
        require(nullifierHash == expectedLegacyNullifier, "v3 nullifier");
        require(externalNullifierHash == expectedLegacyExternalNullifier, "v3 external nullifier");
        require(keccak256(abi.encode(proof)) == expectedLegacyProofHash, "v3 proof");
    }
}
