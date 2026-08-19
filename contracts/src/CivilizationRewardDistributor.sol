// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICivilizationRewardMinter {
    function mintReward(address recipient, uint256 amount) external;
}

/// @title CivilizationRewardDistributor
/// @notice Timelock-governed, bounded EIP-712 CGOLD reward issuer.
/// @dev This deliberately owns the signature and campaign state outside the
/// game proxy. The proxy only accepts this contract as its dedicated mint
/// caller, preserving released game storage and its EIP-170 size envelope.
contract CivilizationRewardDistributor {
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "RewardClaim(address recipient,uint256 amount,bytes32 rewardId,uint256 nonce,uint256 deadline,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256(
        "Civilization CGOLD Rewards"
    );
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct RewardClaim {
        address recipient;
        uint256 amount;
        bytes32 rewardId;
        uint256 nonce;
        uint256 deadline;
        uint256 chainId;
        address verifyingContract;
    }

    ICivilizationRewardMinter public immutable game;
    address public immutable timelock;
    address public issuer;
    uint256 public perClaimCap;
    uint256 public periodCap;
    uint64 public periodSeconds;
    bool public claimsPaused;
    mapping(bytes32 => bool) public rewardIdUsed;
    mapping(address => mapping(uint256 => bool)) public rewardNonceUsed;
    mapping(uint256 => uint256) public rewardPeriodIssued;

    event IssuerConfigured(
        address indexed issuer,
        uint256 perClaimCap,
        uint256 periodCap,
        uint64 periodSeconds
    );
    event ClaimsPauseUpdated(bool paused);
    event IssuerRevoked(address indexed previousIssuer);
    event RewardClaimed(
        bytes32 indexed rewardId,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 period
    );

    error UnauthorizedGovernance();
    error ZeroAddress();
    error InvalidConfiguration();
    error ClaimsPaused();
    error IssuerNotConfigured();
    error ClaimExpired(uint256 deadline);
    error InvalidClaimDomain();
    error InvalidSignature();
    error RewardIdAlreadyUsed(bytes32 rewardId);
    error RewardNonceAlreadyUsed(address recipient, uint256 nonce);
    error PerClaimCapExceeded(uint256 cap);
    error PeriodCapExceeded(uint256 available);

    constructor(address game_, address timelock_) {
        if (game_ == address(0) || timelock_ == address(0))
            revert ZeroAddress();
        game = ICivilizationRewardMinter(game_);
        timelock = timelock_;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert UnauthorizedGovernance();
        _;
    }

    /// @notice Sets the signing issuer and hard issuance caps through the
    /// Safe-governed timelock. Caps are measured in CGOLD wei.
    function configureIssuer(
        address issuer_,
        uint256 perClaimCap_,
        uint256 periodCap_,
        uint64 periodSeconds_
    ) external onlyTimelock {
        if (
            issuer_ == address(0) ||
            perClaimCap_ == 0 ||
            periodCap_ == 0 ||
            periodSeconds_ == 0 ||
            perClaimCap_ > periodCap_
        ) revert InvalidConfiguration();
        issuer = issuer_;
        perClaimCap = perClaimCap_;
        periodCap = periodCap_;
        periodSeconds = periodSeconds_;
        emit IssuerConfigured(
            issuer_,
            perClaimCap_,
            periodCap_,
            periodSeconds_
        );
    }

    /// @notice Pauses only distributor claims. The game ERC-20 and its
    /// deterministic claim/raid issuance are not called or paused here.
    function setClaimsPaused(bool paused) external onlyTimelock {
        claimsPaused = paused;
        emit ClaimsPauseUpdated(paused);
    }

    function revokeIssuer() external onlyTimelock {
        address previousIssuer = issuer;
        issuer = address(0);
        claimsPaused = true;
        emit IssuerRevoked(previousIssuer);
        emit ClaimsPauseUpdated(true);
    }

    /// @notice Anyone may relay a valid authorization, but minting is always
    /// directed to its signed recipient. The explicit chain/contract fields and
    /// the EIP-712 domain independently bind this claim to this deployment.
    function claim(
        RewardClaim calldata claim_,
        bytes calldata signature
    ) external {
        if (claimsPaused) revert ClaimsPaused();
        address configuredIssuer = issuer;
        if (configuredIssuer == address(0)) revert IssuerNotConfigured();
        if (block.timestamp > claim_.deadline)
            revert ClaimExpired(claim_.deadline);
        if (
            claim_.chainId != block.chainid ||
            claim_.verifyingContract != address(this)
        ) revert InvalidClaimDomain();
        if (claim_.amount == 0 || claim_.amount > perClaimCap)
            revert PerClaimCapExceeded(perClaimCap);
        if (rewardIdUsed[claim_.rewardId])
            revert RewardIdAlreadyUsed(claim_.rewardId);
        if (rewardNonceUsed[claim_.recipient][claim_.nonce])
            revert RewardNonceAlreadyUsed(claim_.recipient, claim_.nonce);
        uint256 period = block.timestamp / periodSeconds;
        uint256 issued = rewardPeriodIssued[period];
        if (issued >= periodCap) revert PeriodCapExceeded(0);
        uint256 available = periodCap - issued;
        if (claim_.amount > available) revert PeriodCapExceeded(available);
        if (_recover(claim_, signature) != configuredIssuer)
            revert InvalidSignature();

        rewardIdUsed[claim_.rewardId] = true;
        rewardNonceUsed[claim_.recipient][claim_.nonce] = true;
        rewardPeriodIssued[period] = issued + claim_.amount;
        game.mintReward(claim_.recipient, claim_.amount);
        emit RewardClaimed(
            claim_.rewardId,
            claim_.recipient,
            claim_.amount,
            claim_.nonce,
            period
        );
    }

    function _recover(
        RewardClaim calldata claim_,
        bytes calldata signature
    ) private view returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                claim_.recipient,
                claim_.amount,
                claim_.rewardId,
                claim_.nonce,
                claim_.deadline,
                claim_.chainId,
                claim_.verifyingContract
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1N_DIV_2 || (v != 27 && v != 28))
            return address(0);
        signer = ecrecover(digest, v, r, s);
    }
}
