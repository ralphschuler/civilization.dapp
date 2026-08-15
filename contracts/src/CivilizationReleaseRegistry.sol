// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Append-only release evidence.  It deliberately has no game-state
/// code or storage and is owned by the timelock that governs ProxyAdmin.
contract CivilizationReleaseRegistry {
    struct Release {
        address proxy;
        uint64 version;
        address implementation;
        bytes32 implementationCodehash;
        bytes32 sourceCommit;
        bytes32 storageLayoutHash;
    }
    address public immutable owner;
    Release[] private _releases;
    event ReleaseRecorded(
        address indexed proxy,
        uint64 indexed version,
        address indexed implementation,
        bytes32 implementationCodehash,
        bytes32 sourceCommit,
        bytes32 storageLayoutHash
    );
    error Unauthorized();
    error InvalidRelease();
    constructor(address owner_, Release memory initialRelease) {
        if (owner_ == address(0)) revert InvalidRelease();
        owner = owner_;
        if (initialRelease.proxy != address(0)) _record(initialRelease);
    }
    function releaseCount() external view returns (uint256) {
        return _releases.length;
    }
    function releaseAt(uint256 index) external view returns (Release memory) {
        return _releases[index];
    }
    function record(Release calldata release_) external {
        if (msg.sender != owner) revert Unauthorized();
        _record(release_);
    }
    function _record(Release memory release_) private {
        if (
            release_.proxy == address(0) ||
            release_.version == 0 ||
            release_.implementation == address(0) ||
            release_.implementation.code.length == 0 ||
            release_.implementationCodehash == bytes32(0) ||
            release_.implementation.codehash !=
                release_.implementationCodehash ||
            release_.sourceCommit == bytes32(0) ||
            release_.storageLayoutHash == bytes32(0)
        ) revert InvalidRelease();
        if (
            _releases.length != 0 &&
            (release_.proxy != _releases[0].proxy ||
                release_.version <= _releases[_releases.length - 1].version)
        ) revert InvalidRelease();
        _releases.push(release_);
        emit ReleaseRecorded(
            release_.proxy,
            release_.version,
            release_.implementation,
            release_.implementationCodehash,
            release_.sourceCommit,
            release_.storageLayoutHash
        );
    }
}
