// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWorldToken {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface ICivilizationRevenueSplitter {
    function token() external view returns (IERC20);
    function timelock() external view returns (address);
    function processMonthlyPayout() external;
}

/// @dev Official legacy World ID 3 router interface.
interface IWorldIDLegacyRouter {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

/// @dev Official World ID 4 verifier interface deployed on World Chain mainnet.
interface IWorldIDVerifier {
    function verify(
        uint256 nullifier,
        uint256 action,
        uint64 rpId,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        uint256[5] calldata zeroKnowledgeProof
    ) external view;
}

/// @title CivilizationGame
/// @notice Source-only World Chain game-state draft with wallet registration.
/// @dev The historical World ID entrypoints remain as dormant compatibility
/// surface. New clients initialize their own wallet with registerWallet().
/// @dev Wood, clay and stone are internal game units. Gold is an in-game ERC-20
/// minted only by deterministic claim and raid rules. WLD can pay only to reduce
/// construction time and is transferred directly to the configured WLD revenue
/// splitter. There is no native-token, withdrawal, redemption, or game custody.
contract CivilizationGame is Initializable {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_OFFLINE_SECONDS = 24 hours;
    /// @notice V1 proxy release cooldown.  Measured exclusively from chain time.
    uint256 public constant CLAIM_COOLDOWN = 60 seconds;
    uint256 public constant RAID_MARCH_DURATION = 1 minutes;
    uint256 public constant MAX_BUILDING_LEVEL = 30;
    /// @notice A construction can never take more than one 365-day year.
    uint256 public constant MAX_BUILD_DURATION_SECONDS = 365 days;
    uint256 public constant GOLD_UNIT = 1e18;
    uint256 public constant WORLD_TOKEN_UNIT = 1e18;
    uint256 public constant BOOST_DURATION = 1 hours;
    /// @dev Covers the bounded ten-recipient splitter payout, including ten
    /// ERC-20 transfers, while retaining a finite best-effort call budget.
    uint256 public constant MONTHLY_PAYOUT_CALL_GAS = 600_000;

    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant PRESTIGE_BONUS_BPS = 1_000;
    uint256 private constant FRACTION_SCALE = 1 days * BASIS_POINTS;
    uint256 public constant WORLD_ID_LEGACY_GROUP_ID = 1;

    enum Building { Townhall, Timber, Claypit, Quarry, Warehouse, Workshop, Goldmine, Barracks }
    enum Troop { Spear, Archer, Rider }
    enum Resource { Wood, Clay, Stone, Gold }

    string public constant name = "Civilization Gold";
    string public constant symbol = "CGOLD";
    uint8 public constant decimals = 18;

    struct Resources { uint256 wood; uint256 clay; uint256 stone; uint256 gold; }
    struct Buildings { uint256 townhall; uint256 timber; uint256 claypit; uint256 quarry; uint256 warehouse; uint256 workshop; uint256 goldmine; uint256 barracks; }
    struct Troops { uint256 spear; uint256 archer; uint256 rider; }
    struct Construction {
        bool pending;
        Building building;
        uint64 completesAt;
    }
    struct Raid {
        address defender;
        uint64 arrivesAt;
        uint256 spear;
        uint256 archer;
        uint256 rider;
    }
    struct Player {
        bool registered;
        uint64 lastAccruedAt;
        uint64 lastClaimedAt;
        Resources stored;
        Resources field;
        Resources accrualRemainder;
        Buildings buildings;
        Troops troops;
        Raid pendingRaid;
        Construction construction;
        uint256 prestigeCount;
    }

    /// @custom:storage-location erc7201:civilization.game.storage.v1
    struct GameStorage {
        uint256 totalSupply;
        mapping(address => uint256) balanceOf;
        mapping(address => mapping(address => uint256)) allowance;
        IWorldIDVerifier worldIdVerifier;
        uint256 worldIdAction;
        uint64 worldIdRpId;
        uint64 worldIdIssuerSchemaId;
        uint256 worldIdCredentialGenesisIssuedAtMin;
        IWorldIDLegacyRouter worldIdLegacyRouter;
        uint256 worldIdLegacyExternalNullifier;
        address worldToken;
        address revenueSplitter;
        address timelock;
        mapping(address => Player) players;
        mapping(uint256 => address) nullifierOwner;
    }
    struct InitConfig {
        address worldIdVerifier;
        string worldActionId;
        uint64 worldRpId;
        uint64 worldIssuerSchemaId;
        uint256 credentialGenesisIssuedAtMin;
        address worldIdLegacyRouter;
        string worldIdLegacyAppId;
        string worldIdLegacyActionId;
        address worldToken;
        address revenueSplitter;
        address timelock;
    }
    bytes32 private constant GAME_STORAGE_LOCATION = 0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00;
    function _game() internal pure returns (GameStorage storage $) { assembly { $.slot := GAME_STORAGE_LOCATION } }

    event WorldIdRegistered(address indexed player, uint256 indexed nullifierHash);
    event WalletRegistered(address indexed player);
    event ResourcesClaimed(address indexed player, uint256 wood, uint256 clay, uint256 stone, uint256 gold);
    event UpgradeStarted(address indexed player, Building indexed building, uint64 completesAt);
    event BuildingUpgraded(address indexed player, Building indexed building, uint256 newLevel);
    event TroopsTrained(address indexed player, Troop indexed troop, uint256 amount);
    event RaidStarted(address indexed attacker, address indexed defender, uint64 arrivesAt, uint256 spear, uint256 archer, uint256 rider);
    event RaidResolved(address indexed attacker, address indexed defender, bool attackerWon, uint256 attack, uint256 defense, uint256 wood, uint256 clay, uint256 stone, uint256 gold);
    event Prestiged(address indexed player, uint256 prestigeCount, uint256 productionMultiplierBps);
    event ConstructionBoosted(address indexed player, uint256 hoursBoosted, uint256 wldPaid, uint64 completesAt);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event RevenueSplitterUpdated(address indexed oldSplitter, address indexed newSplitter);
    event MonthlyPayoutDeferred(address indexed splitter, bytes32 indexed reasonHash);

    error ZeroAddress();
    error AlreadyRegistered();
    error NullifierAlreadyUsed();
    error InvalidWorldIdConfiguration();
    error UnexpectedWorldIdCredential();
    error Unregistered();
    error ClaimOnCooldown(uint64 availableAt);
    error NothingToClaim();
    error BuildingMaxLevel();
    error ConstructionAlreadyPending(uint64 completesAt);
    error NoConstructionPending();
    error ConstructionNotReady(uint64 completesAt);
    error PrestigeRequirementNotMet();
    error MissingBuildingRequirement();
    error InsufficientResources();
    error InvalidAmount();
    error SelfRaid();
    error RaidAlreadyPending();
    error NoRaidPending();
    error RaidNotArrived(uint64 arrivesAt);
    error InsufficientTroops();
    error InsufficientGoldBalance();
    error InsufficientAllowance();
    error NoBoostableConstruction();
    error BoostExceedsRemainingTime();
    error WorldTokenTransferFailed();
    error UnauthorizedGovernance();
    error WorldTokenAmountMismatch();
    error InvalidBuildingLevel();
    error InvalidRevenueSplitter(address splitter);

    constructor() { _disableInitializers(); }

    function initialize(InitConfig calldata config) external initializer {
        if (
            config.worldIdVerifier == address(0)
                || config.worldIdLegacyRouter == address(0)
                || config.worldToken == address(0)
                || config.revenueSplitter == address(0) || config.timelock == address(0)
        ) revert ZeroAddress();
        if (
            bytes(config.worldActionId).length == 0
                || config.worldRpId == 0
                || config.worldIssuerSchemaId == 0
                || bytes(config.worldIdLegacyAppId).length == 0
                || bytes(config.worldIdLegacyActionId).length == 0
        ) revert InvalidWorldIdConfiguration();
        _validateRevenueSplitter(config.revenueSplitter, config.worldToken, config.timelock);
        GameStorage storage $ = _game();
        $.worldIdVerifier = IWorldIDVerifier(config.worldIdVerifier);
        $.worldIdAction = _hashToField(bytes(config.worldActionId));
        $.worldIdRpId = config.worldRpId;
        $.worldIdIssuerSchemaId = config.worldIssuerSchemaId;
        $.worldIdCredentialGenesisIssuedAtMin = config.credentialGenesisIssuedAtMin;
        $.worldIdLegacyRouter = IWorldIDLegacyRouter(config.worldIdLegacyRouter);
        $.worldIdLegacyExternalNullifier = _hashToField(
            abi.encodePacked(_hashToField(bytes(config.worldIdLegacyAppId)), config.worldIdLegacyActionId)
        );
        $.worldToken = config.worldToken;
        $.revenueSplitter = config.revenueSplitter;
        $.timelock = config.timelock;
    }

    function totalSupply() external view returns (uint256) { return _game().totalSupply; }
    function balanceOf(address account) external view returns (uint256) { return _game().balanceOf[account]; }
    function allowance(address owner, address spender) external view returns (uint256) { return _game().allowance[owner][spender]; }
    function nullifierOwner(uint256 value) external view returns (address) { return _game().nullifierOwner[value]; }
    function worldIdVerifier() external view returns (IWorldIDVerifier) { return _game().worldIdVerifier; }
    function worldIdAction() external view returns (uint256) { return _game().worldIdAction; }
    function worldIdRpId() external view returns (uint64) { return _game().worldIdRpId; }
    function worldIdLegacyRouter() external view returns (IWorldIDLegacyRouter) { return _game().worldIdLegacyRouter; }
    function worldIdLegacyExternalNullifier() external view returns (uint256) { return _game().worldIdLegacyExternalNullifier; }
    function worldToken() external view returns (address) { return _game().worldToken; }
    function revenueSplitter() external view returns (address) { return _game().revenueSplitter; }
    function timelock() external view returns (address) { return _game().timelock; }
    function setRevenueSplitter(address splitter) external {
        GameStorage storage $ = _game();
        if (msg.sender != $.timelock) revert UnauthorizedGovernance();
        _validateRevenueSplitter(splitter, $.worldToken, $.timelock);
        address oldSplitter = $.revenueSplitter;
        $.revenueSplitter = splitter;
        emit RevenueSplitterUpdated(oldSplitter, splitter);
    }

    /// @notice Initializes msg.sender's village once, without a proof or relayer.
    /// @dev This is the active wallet-only registration path. It deliberately
    /// accepts no address argument: a wallet can create only its own village.
    function registerWallet() external {
        if (_game().players[msg.sender].registered) revert AlreadyRegistered();
        _initializePlayer();
        emit WalletRegistered(msg.sender);
        _tryMonthlyPayout();
    }

    /// @notice Verifies a World ID 4 proof on World Chain and registers msg.sender once.
    /// @dev The wallet address is the proof signal, binding an otherwise valid
    /// proof to this account. The verifier enforces ZK proof validity and the
    /// configured RP, action, credential schema, and freshness constraints.
    function registerWorldId(
        uint256 nullifierHash,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256[5] calldata proof
    ) external {
        _requireAvailableRegistration(nullifierHash, signalHash);
        GameStorage storage $ = _game();
        if (issuerSchemaId != $.worldIdIssuerSchemaId) revert UnexpectedWorldIdCredential();
        $.worldIdVerifier.verify(
            nullifierHash,
            $.worldIdAction,
            $.worldIdRpId,
            nonce,
            signalHash,
            expiresAtMin,
            issuerSchemaId,
            $.worldIdCredentialGenesisIssuedAtMin,
            proof
        );
        _registerPlayer(nullifierHash);
    }

    /// @notice Verifies an Orb World ID 3 proof and registers msg.sender once.
    /// @dev The router, app ID and action are constructor-bound. Their official
    /// legacy external nullifier is hashToField(hashToField(appId) || action).
    /// The same player/nullifier state is shared with the World ID 4 path.
    function registerWorldIdLegacy(
        uint256 root,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        _requireAvailableRegistration(nullifierHash, signalHash);
        _game().worldIdLegacyRouter.verifyProof(
            root,
            WORLD_ID_LEGACY_GROUP_ID,
            signalHash,
            nullifierHash,
            _game().worldIdLegacyExternalNullifier,
            proof
        );
        _registerPlayer(nullifierHash);
    }

    function _requireAvailableRegistration(uint256 nullifierHash, uint256 signalHash) private view {
        if (_game().players[msg.sender].registered) revert AlreadyRegistered();
        if (_game().nullifierOwner[nullifierHash] != address(0)) revert NullifierAlreadyUsed();
        if (signalHash != _hashToField(abi.encodePacked(msg.sender))) revert InvalidWorldIdConfiguration();
    }

    function _registerPlayer(uint256 nullifierHash) private {
        _game().nullifierOwner[nullifierHash] = msg.sender;
        _initializePlayer();
        emit WorldIdRegistered(msg.sender, nullifierHash);
        _tryMonthlyPayout();
    }

    function _initializePlayer() private {
        Player storage player = _game().players[msg.sender];
        player.registered = true;
        player.lastAccruedAt = uint64(block.timestamp);
        player.buildings = Buildings(0, 1, 1, 1, 1, 0, 0, 0);
        player.stored = Resources(80, 80, 80, 0);
    }

    function claim() external onlyRegistered {
        Player storage player = _game().players[msg.sender];
        uint64 availableAt = _claimAvailableAt(player);
        if (block.timestamp < availableAt) revert ClaimOnCooldown(availableAt);
        _accrue(player);
        Resources memory claimed;
        uint256 capacity = _capacity(player.buildings.warehouse);
        (claimed.wood, player.stored.wood, player.field.wood) = _claimOne(player.stored.wood, player.field.wood, capacity);
        (claimed.clay, player.stored.clay, player.field.clay) = _claimOne(player.stored.clay, player.field.clay, capacity);
        (claimed.stone, player.stored.stone, player.field.stone) = _claimOne(player.stored.stone, player.field.stone, capacity);
        claimed.gold = player.field.gold;
        player.field.gold = 0;
        // A claim must be economically meaningful.  In particular, a full
        // warehouse may not burn a cooldown merely because field production
        // was settled first.
        if (claimed.wood == 0 && claimed.clay == 0 && claimed.stone == 0 && claimed.gold == 0) revert NothingToClaim();
        if (claimed.gold != 0) _mintGold(msg.sender, claimed.gold * GOLD_UNIT);
        player.lastClaimedAt = uint64(block.timestamp);
        emit ResourcesClaimed(msg.sender, claimed.wood, claimed.clay, claimed.stone, claimed.gold);
        _tryMonthlyPayout();
    }

    function upgrade(Building building) external onlyRegistered {
        Player storage player = _game().players[msg.sender];
        if (player.construction.pending) revert ConstructionAlreadyPending(player.construction.completesAt);
        _accrue(player);
        if (_buildingLevel(player.buildings, building) >= MAX_BUILDING_LEVEL) revert BuildingMaxLevel();
        _requireBuildingRequirements(player.buildings, building);
        Resources memory price = _buildingCost(player.buildings, building);
        _spend(player, msg.sender, price);
        uint64 completesAt = uint64(block.timestamp + buildDuration(building, _buildingLevel(player.buildings, building) + 1));
        player.construction = Construction(true, building, completesAt);
        emit UpgradeStarted(msg.sender, building, completesAt);
        _tryMonthlyPayout();
    }

    function completeUpgrade() external onlyRegistered {
        Player storage player = _game().players[msg.sender];
        Construction memory construction = player.construction;
        if (!construction.pending) revert NoConstructionPending();
        if (block.timestamp < construction.completesAt) revert ConstructionNotReady(construction.completesAt);
        uint256 cappedEnd = _accrueForCompletion(player, construction.completesAt);
        uint256 newLevel = _incrementBuilding(player.buildings, construction.building);
        delete player.construction;
        _accrueUntil(player, cappedEnd);
        // Completion is the one flow that may split an accrual interval around
        // a level change.  Once its 24-hour allowance has been consumed, drop
        // the remaining offline wall time instead of leaving it available to
        // the next action as another capped interval.
        if (cappedEnd < block.timestamp) player.lastAccruedAt = uint64(block.timestamp);
        emit BuildingUpgraded(msg.sender, construction.building, newLevel);
        _tryMonthlyPayout();
    }

    /// @notice Pays exactly one WLD per requested full hour to reduce pending construction time.
    /// @dev WLD is sent directly to the configured revenue splitter; this contract never holds it.
    function boostConstruction(uint256 hoursToBoost) external onlyRegistered {
        if (hoursToBoost == 0) revert InvalidAmount();
        Player storage player = _game().players[msg.sender];
        Construction storage construction = player.construction;
        if (!construction.pending || block.timestamp >= construction.completesAt) revert NoBoostableConstruction();
        uint256 duration = hoursToBoost * BOOST_DURATION;
        if (duration > uint256(construction.completesAt) - block.timestamp) revert BoostExceedsRemainingTime();
        uint256 wldPaid = hoursToBoost * WORLD_TOKEN_UNIT;
        construction.completesAt = uint64(uint256(construction.completesAt) - duration);
        GameStorage storage $ = _game();
        uint256 beforeBalance = IERC20($.worldToken).balanceOf($.revenueSplitter);
        IERC20($.worldToken).safeTransferFrom(msg.sender, $.revenueSplitter, wldPaid);
        if (IERC20($.worldToken).balanceOf($.revenueSplitter) - beforeBalance != wldPaid) revert WorldTokenAmountMismatch();
        emit ConstructionBoosted(msg.sender, hoursToBoost, wldPaid, construction.completesAt);
        _tryMonthlyPayout();
    }

    function train(Troop troop, uint256 amount) external onlyRegistered {
        if (amount == 0) revert InvalidAmount();
        Player storage player = _game().players[msg.sender];
        _accrue(player);
        _requireTroopRequirements(player.buildings, troop);
        Resources memory price = _troopCost(troop, amount);
        _spend(player, msg.sender, price);
        if (troop == Troop.Spear) player.troops.spear += amount;
        else if (troop == Troop.Archer) player.troops.archer += amount;
        else player.troops.rider += amount;
        emit TroopsTrained(msg.sender, troop, amount);
        _tryMonthlyPayout();
    }

    /// @notice Reserves troops immediately; only the attacker can resolve after the march.
    function startRaid(address defender, uint256 spear, uint256 archer, uint256 rider) external onlyRegistered {
        if (defender == msg.sender) revert SelfRaid();
        if (!_game().players[defender].registered) revert Unregistered();
        if (spear + archer + rider == 0) revert InvalidAmount();
        Player storage attacker = _game().players[msg.sender];
        if (attacker.pendingRaid.defender != address(0)) revert RaidAlreadyPending();
        _accrue(attacker);
        if (spear > attacker.troops.spear || archer > attacker.troops.archer || rider > attacker.troops.rider) revert InsufficientTroops();
        attacker.troops.spear -= spear;
        attacker.troops.archer -= archer;
        attacker.troops.rider -= rider;
        attacker.pendingRaid = Raid(defender, uint64(block.timestamp + RAID_MARCH_DURATION), spear, archer, rider);
        emit RaidStarted(msg.sender, defender, attacker.pendingRaid.arrivesAt, spear, archer, rider);
        _tryMonthlyPayout();
    }

    function resolveRaid() external onlyRegistered {
        Player storage attacker = _game().players[msg.sender];
        Raid memory raid = attacker.pendingRaid;
        if (raid.defender == address(0)) revert NoRaidPending();
        if (block.timestamp < raid.arrivesAt) revert RaidNotArrived(raid.arrivesAt);
        Player storage defender = _game().players[raid.defender];
        _accrue(attacker);
        _accrue(defender);
        uint256 attack = raid.spear * 10 + raid.archer * 17 + raid.rider * 31;
        uint256 defense = _defense(defender);
        bool won = attack >= defense;
        (uint256 spearLost, uint256 archerLost, uint256 riderLost) = _casualties(raid.spear, raid.archer, raid.rider, won ? 8 : 38);
        attacker.troops.spear += raid.spear - spearLost;
        attacker.troops.archer += raid.archer - archerLost;
        attacker.troops.rider += raid.rider - riderLost;
        if (won) {
            defender.troops.spear -= (defender.troops.spear * 6) / 100;
            defender.troops.archer -= (defender.troops.archer * 6) / 100;
            defender.troops.rider -= (defender.troops.rider * 6) / 100;
        }
        delete attacker.pendingRaid;
        Resources memory stolen = won ? _loot(msg.sender, attacker, defender, (raid.spear + raid.archer + raid.rider) * 18) : Resources(0, 0, 0, 0);
        emit RaidResolved(msg.sender, raid.defender, won, attack, defense, stolen.wood, stolen.clay, stolen.stone, stolen.gold);
        _tryMonthlyPayout();
    }

    /// @notice Resets the village after full townhall completion and adds a permanent production bonus.
    /// @dev Prestige never bypasses the World-ID registration gate and does not move an external asset.
    function prestige() external onlyRegistered {
        Player storage player = _game().players[msg.sender];
        if (player.buildings.townhall != MAX_BUILDING_LEVEL || player.construction.pending) revert PrestigeRequirementNotMet();
        player.prestigeCount += 1;
        player.lastAccruedAt = uint64(block.timestamp);
        player.lastClaimedAt = 0;
        player.stored = Resources(80, 80, 80, 0);
        player.field = Resources(0, 0, 0, 0);
        player.accrualRemainder = Resources(0, 0, 0, 0);
        player.buildings = Buildings(0, 1, 1, 1, 1, 0, 0, 0);
        player.troops = Troops(0, 0, 0);
        delete player.pendingRaid;
        delete player.construction;
        emit Prestiged(msg.sender, player.prestigeCount, _productionMultiplier(player.prestigeCount));
        _tryMonthlyPayout();
    }

    function playerState(address account) external view returns (bool registered, uint64 lastAccruedAt, uint64 claimAvailableAt, Resources memory stored, Resources memory field, Buildings memory buildings, Troops memory troops, Raid memory pendingRaid, Construction memory construction, uint256 prestigeCount) {
        Player storage player = _game().players[account];
        return (player.registered, player.lastAccruedAt, _claimAvailableAt(player), player.stored, player.field, player.buildings, player.troops, player.pendingRaid, player.construction, player.prestigeCount);
    }

    /// @notice Returns the state as if production were settled at the current block.
    /// @dev Read-only UI helper; a transaction still settles and stores the same rule.
    function previewPlayerState(address account) external view returns (bool registered, uint64 lastAccruedAt, uint64 claimAvailableAt, Resources memory stored, Resources memory field, Buildings memory buildings, Troops memory troops, Raid memory pendingRaid, Construction memory construction, uint256 prestigeCount) {
        Player storage player = _game().players[account];
        stored = player.stored;
        field = player.field;
        buildings = player.buildings;
        troops = player.troops;
        pendingRaid = player.pendingRaid;
        construction = player.construction;
        prestigeCount = player.prestigeCount;
        registered = player.registered;
        lastAccruedAt = player.lastAccruedAt;
        claimAvailableAt = _claimAvailableAt(player);
        if (!registered) return (registered, lastAccruedAt, claimAvailableAt, stored, field, buildings, troops, pendingRaid, construction, prestigeCount);
        (field, ) = _accruedField(field, player.accrualRemainder, buildings, prestigeCount, lastAccruedAt, block.timestamp);
        lastAccruedAt = uint64(block.timestamp);
    }

    /// @notice Exact production snapshot for clients that support the proxy
    /// release.  It has no side effects and exposes the same fixed-point
    /// remainder used by accrual, so UI animation cannot invent resources.
    function previewAccrual(address account) external view returns (Resources memory wholeField, Resources memory fractionalRemainder, uint256 fractionScale, uint64 asOf) {
        Player storage player = _game().players[account];
        wholeField = player.field;
        fractionalRemainder = player.accrualRemainder;
        asOf = player.lastAccruedAt;
        if (player.registered) {
            (wholeField, fractionalRemainder) = _accruedField(wholeField, fractionalRemainder, player.buildings, player.prestigeCount, asOf, block.timestamp);
            asOf = uint64(block.timestamp);
        }
        return (wholeField, fractionalRemainder, FRACTION_SCALE, asOf);
    }

    function productionMultiplierBps(address account) external view returns (uint256) {
        return _productionMultiplier(_game().players[account].prestigeCount);
    }

    function prestigeMultiplierBps(uint256 prestigeCount) external pure returns (uint256) {
        return _productionMultiplier(prestigeCount);
    }

    /// @notice Returns the authoritative construction duration for a building level.
    /// @dev All building kinds share this minute curve:
    /// 1.1 * 1.569772144168414^(level - 1) + 0.9.  The factor is represented
    /// exactly as 1_569_772_144_168_414_000 / 1e18 WAD. Its bounded power is
    /// calculated with deterministic integer WAD multiplication (rounding the
    /// intermediate WAD down), then the final result is converted to seconds
    /// and rounded upward: 54 + ceil(66 * powerWad / 1e18). Finally, the hard
    /// 365-day cap applies. Thus level 1 is exactly 120 seconds; the uncapped
    /// level-30 value is 31,536,001 seconds and is capped at 31,536,000.
    function buildDuration(Building, uint256 nextLevel) public pure returns (uint256) {
        if (nextLevel == 0 || nextLevel > MAX_BUILDING_LEVEL) revert InvalidBuildingLevel();
        uint256 wad = 1e18;
        uint256 factorWad = 1_569_772_144_168_414_000;
        uint256 powerWad = wad;
        for (uint256 level = 1; level < nextLevel; ++level) {
            powerWad = powerWad * factorWad / wad;
        }
        uint256 durationSeconds = 54 + (66 * powerWad + wad - 1) / wad;
        return _min(durationSeconds, MAX_BUILD_DURATION_SECONDS);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _game().allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transferGold(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 permitted = _game().allowance[from][msg.sender];
        if (permitted < value) revert InsufficientAllowance();
        if (permitted != type(uint256).max) {
            _game().allowance[from][msg.sender] = permitted - value;
            emit Approval(from, msg.sender, _game().allowance[from][msg.sender]);
        }
        _transferGold(from, to, value);
        return true;
    }

    modifier onlyRegistered() { if (!_game().players[msg.sender].registered) revert Unregistered(); _; }

    function _accrue(Player storage player) private {
        _accrueUntil(player, block.timestamp);
    }

    function _accrueUntil(Player storage player, uint256 to) private {
        if (to <= player.lastAccruedAt) return;
        (player.field, player.accrualRemainder) = _accruedField(player.field, player.accrualRemainder, player.buildings, player.prestigeCount, player.lastAccruedAt, to);
        player.lastAccruedAt = uint64(to);
    }

    /// @dev A construction boundary may split production rates, but can never
    /// turn one offline interval into two independent 24-hour accrual windows.
    function _accrueForCompletion(Player storage player, uint64 completesAt) private returns (uint256 cappedEnd) {
        cappedEnd = _min(block.timestamp, uint256(player.lastAccruedAt) + MAX_OFFLINE_SECONDS);
        uint256 boundary = _min(cappedEnd, completesAt);
        _accrueUntil(player, boundary);
        // The caller increments the building then settles only up to cappedEnd.
    }

    function _accruedField(Resources memory field, Resources memory remainder, Buildings memory buildings, uint256 prestigeCount, uint64 from, uint256 to) private pure returns (Resources memory, Resources memory) {
        uint256 elapsed = _cappedElapsed(from, to);
        if (elapsed == 0) return (field, remainder);
        uint256 capacity = _capacity(buildings.warehouse);
        uint256 multiplier = BASIS_POINTS + prestigeCount * PRESTIGE_BONUS_BPS;
        (field.wood, remainder.wood) = _accrueOne(field.wood, remainder.wood, elapsed, 300 * buildings.timber * multiplier, capacity);
        (field.clay, remainder.clay) = _accrueOne(field.clay, remainder.clay, elapsed, 270 * buildings.claypit * multiplier, capacity);
        (field.stone, remainder.stone) = _accrueOne(field.stone, remainder.stone, elapsed, 240 * buildings.quarry * multiplier, capacity);
        (field.gold, remainder.gold) = _accrueOne(field.gold, remainder.gold, elapsed, 12 * buildings.goldmine * multiplier, capacity);
        return (field, remainder);
    }

    function _cappedElapsed(uint64 from, uint256 to) private pure returns (uint256 elapsed) {
        elapsed = to - from;
        if (elapsed > MAX_OFFLINE_SECONDS) elapsed = MAX_OFFLINE_SECONDS;
    }

    function _accrueOne(uint256 field, uint256 remainder, uint256 elapsed, uint256 rate, uint256 capacity) private pure returns (uint256, uint256) {
        if (field >= capacity) return (capacity, 0);
        uint256 units = elapsed * rate + remainder;
        uint256 produced = units / FRACTION_SCALE;
        uint256 nextField = field + produced;
        if (nextField >= capacity) return (capacity, 0);
        return (nextField, units % FRACTION_SCALE);
    }

    function _loot(address attackerAccount, Player storage attacker, Player storage defender, uint256 transportCapacity) private returns (Resources memory stolen) {
        uint256 capacity = _capacity(attacker.buildings.warehouse);
        uint256 remaining = transportCapacity;
        uint256 woodRoom = capacity > attacker.stored.wood ? capacity - attacker.stored.wood : 0;
        uint256 clayRoom = capacity > attacker.stored.clay ? capacity - attacker.stored.clay : 0;
        uint256 stoneRoom = capacity > attacker.stored.stone ? capacity - attacker.stored.stone : 0;
        stolen.wood = _min(defender.field.wood, _min(remaining, woodRoom)); remaining -= stolen.wood; defender.field.wood -= stolen.wood; attacker.stored.wood += stolen.wood;
        stolen.clay = _min(defender.field.clay, _min(remaining, clayRoom)); remaining -= stolen.clay; defender.field.clay -= stolen.clay; attacker.stored.clay += stolen.clay;
        stolen.stone = _min(defender.field.stone, _min(remaining, stoneRoom)); remaining -= stolen.stone; defender.field.stone -= stolen.stone; attacker.stored.stone += stolen.stone;
        (stolen.gold,) = _take(defender.field.gold, remaining); defender.field.gold -= stolen.gold;
        if (stolen.gold != 0) _mintGold(attackerAccount, stolen.gold * GOLD_UNIT);
    }

    function _buildingCost(Buildings storage b, Building building) private view returns (Resources memory price) {
        uint256 level = _buildingLevel(b, building);
        uint256 factor; Resources memory base;
        if (building == Building.Townhall) { base = Resources(280,260,240,0); factor = 160; }
        else if (building == Building.Timber) { base = Resources(35,20,15,0); factor = 146; }
        else if (building == Building.Claypit) { base = Resources(25,40,20,0); factor = 147; }
        else if (building == Building.Quarry) { base = Resources(30,25,45,0); factor = 148; }
        else if (building == Building.Warehouse) { base = Resources(45,45,35,0); factor = 152; }
        else if (building == Building.Workshop) { base = Resources(90,110,105,15); factor = 160; }
        else if (building == Building.Goldmine) { base = Resources(130,120,150,0); factor = 166; }
        else { base = Resources(125,145,105,25); factor = 162; }
        for (uint256 i; i < level; ++i) { base.wood = _ceilMul(base.wood, factor); base.clay = _ceilMul(base.clay, factor); base.stone = _ceilMul(base.stone, factor); base.gold = _ceilMul(base.gold, factor); }
        return base;
    }

    function _troopCost(Troop troop, uint256 amount) private pure returns (Resources memory) {
        if (troop == Troop.Spear) return Resources(22 * amount, 16 * amount, 8 * amount, amount);
        if (troop == Troop.Archer) return Resources(30 * amount, 22 * amount, 12 * amount, 2 * amount);
        return Resources(45 * amount, 35 * amount, 24 * amount, 4 * amount);
    }

    function _requireBuildingRequirements(Buildings storage b, Building building) private view {
        uint256 next = _buildingLevel(b, building) + 1;
        if (building == Building.Townhall && (b.timber < next || b.claypit < next || b.quarry < next || (next >= 3 && b.warehouse < next - 1) || (next >= 5 && b.workshop < next - 3))) revert MissingBuildingRequirement();
        if (building == Building.Warehouse && b.townhall < 1) revert MissingBuildingRequirement();
        if (building == Building.Workshop && (b.townhall < 2 || b.timber < 2 || b.claypit < 2 || b.quarry < 2)) revert MissingBuildingRequirement();
        if (building == Building.Goldmine && (b.townhall < 4 || b.workshop < 2)) revert MissingBuildingRequirement();
        if (building == Building.Barracks && (b.townhall < 3 || b.workshop < 1)) revert MissingBuildingRequirement();
    }

    function _requireTroopRequirements(Buildings storage b, Troop troop) private view {
        if (b.barracks < 1 || (troop == Troop.Archer && b.barracks < 2) || (troop == Troop.Rider && (b.barracks < 3 || b.workshop < 2))) revert MissingBuildingRequirement();
    }
    function _claimAvailableAt(Player storage player) private view returns (uint64) {
        return player.lastClaimedAt == 0 ? 0 : uint64(uint256(player.lastClaimedAt) + CLAIM_COOLDOWN);
    }
    function _validateRevenueSplitter(address splitter, address expectedToken, address expectedTimelock) private view {
        if (splitter.code.length == 0) revert InvalidRevenueSplitter(splitter);
        try ICivilizationRevenueSplitter(splitter).token() returns (IERC20 token_) {
            if (address(token_) != expectedToken) revert InvalidRevenueSplitter(splitter);
        } catch { revert InvalidRevenueSplitter(splitter); }
        try ICivilizationRevenueSplitter(splitter).timelock() returns (address timelock_) {
            if (timelock_ != expectedTimelock) revert InvalidRevenueSplitter(splitter);
        } catch { revert InvalidRevenueSplitter(splitter); }
    }
    /// @dev Revenue distribution can never block a registered player action.
    function _tryMonthlyPayout() private {
        address splitter = _game().revenueSplitter;
        (bool success, bytes memory reason) = splitter.call{gas: MONTHLY_PAYOUT_CALL_GAS}(
            abi.encodeCall(ICivilizationRevenueSplitter.processMonthlyPayout, ())
        );
        if (!success) emit MonthlyPayoutDeferred(splitter, keccak256(reason));
    }
    function _productionMultiplier(uint256 prestigeCount) private pure returns (uint256) { return BASIS_POINTS + prestigeCount * PRESTIGE_BONUS_BPS; }
    function _spend(Player storage player, address account, Resources memory price) private {
        if (player.stored.wood < price.wood || player.stored.clay < price.clay || player.stored.stone < price.stone) revert InsufficientResources();
        uint256 goldCost = price.gold * GOLD_UNIT;
        if (_game().balanceOf[account] < goldCost) revert InsufficientGoldBalance();
        player.stored.wood -= price.wood;
        player.stored.clay -= price.clay;
        player.stored.stone -= price.stone;
        if (goldCost != 0) _burnGold(account, goldCost);
    }
    function _mintGold(address account, uint256 value) private { _game().totalSupply += value; _game().balanceOf[account] += value; emit Transfer(address(0), account, value); }
    function _burnGold(address account, uint256 value) private { if (_game().balanceOf[account] < value) revert InsufficientGoldBalance(); _game().balanceOf[account] -= value; _game().totalSupply -= value; emit Transfer(account, address(0), value); }
    function _transferGold(address from, address to, uint256 value) private { if (to == address(0)) revert ZeroAddress(); if (_game().balanceOf[from] < value) revert InsufficientGoldBalance(); _game().balanceOf[from] -= value; _game().balanceOf[to] += value; emit Transfer(from, to, value); }
    function _defense(Player storage p) private view returns (uint256) { uint256 troopPower = p.troops.spear * 10 + p.troops.archer * 17 + p.troops.rider * 31; return _max(1, (troopPower * 65) / 100 + p.buildings.townhall * 20); }
    function _casualties(uint256 spear, uint256 archer, uint256 rider, uint256 rate) private pure returns (uint256, uint256, uint256) { return (_ceilPercent(spear, rate), _ceilPercent(archer, rate), _ceilPercent(rider, rate)); }
    function _capacity(uint256 warehouse) private pure returns (uint256 result) { result = 500; for (uint256 i = 1; i < warehouse; ++i) result = (result * 17 + 5) / 10; }
    function _claimOne(uint256 stored, uint256 field, uint256 capacity) private pure returns (uint256 claimed, uint256 nextStored, uint256 nextField) { claimed = _min(field, capacity > stored ? capacity - stored : 0); return (claimed, stored + claimed, field - claimed); }
    function _take(uint256 available, uint256 wanted) private pure returns (uint256 amount, uint256 remaining) { amount = _min(available, wanted); return (amount, wanted - amount); }
    function _incrementBuilding(Buildings storage b, Building building) private returns (uint256) { if (building == Building.Townhall) return ++b.townhall; if (building == Building.Timber) return ++b.timber; if (building == Building.Claypit) return ++b.claypit; if (building == Building.Quarry) return ++b.quarry; if (building == Building.Warehouse) return ++b.warehouse; if (building == Building.Workshop) return ++b.workshop; if (building == Building.Goldmine) return ++b.goldmine; return ++b.barracks; }
    function _buildingLevel(Buildings storage b, Building building) private view returns (uint256) { if (building == Building.Townhall) return b.townhall; if (building == Building.Timber) return b.timber; if (building == Building.Claypit) return b.claypit; if (building == Building.Quarry) return b.quarry; if (building == Building.Warehouse) return b.warehouse; if (building == Building.Workshop) return b.workshop; if (building == Building.Goldmine) return b.goldmine; return b.barracks; }
    /// @dev Matches World ID's ByteHasher: Keccak output reduced to the SNARK field.
    function _hashToField(bytes memory value) private pure returns (uint256) { return uint256(keccak256(value)) >> 8; }
    function _ceilMul(uint256 value, uint256 factor) private pure returns (uint256) { return (value * factor + 99) / 100; }
    function _ceilPercent(uint256 value, uint256 percent) private pure returns (uint256) { return value == 0 ? 0 : (value * percent + 99) / 100; }
    function _min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }
    function _max(uint256 a, uint256 b) private pure returns (uint256) { return a > b ? a : b; }
}
