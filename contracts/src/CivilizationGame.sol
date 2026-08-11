// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IWorldToken {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
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
/// @notice Source-only World Chain game-state draft with direct World ID 4.0
/// verification. The backend can provide a World RP context, but cannot attest
/// registrations or change a village.
/// @dev Wood, clay and stone are internal game units. Gold is an in-game ERC-20
/// minted only by deterministic claim and raid rules. WLD can pay only to reduce
/// construction time and is transferred directly to the immutable treasury.
/// There is no native-token, withdrawal, redemption, or contract custody.
contract CivilizationGame {
    uint256 public constant MAX_OFFLINE_SECONDS = 24 hours;
    uint256 public constant CLAIM_COOLDOWN = 2 hours;
    uint256 public constant RAID_MARCH_DURATION = 1 minutes;
    uint256 public constant MAX_BUILDING_LEVEL = 30;
    uint256 public constant GOLD_UNIT = 1e18;
    uint256 public constant WORLD_TOKEN_UNIT = 1e18;
    uint256 public constant BOOST_DURATION = 1 hours;

    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant PRESTIGE_BONUS_BPS = 1_000;
    uint256 private constant FRACTION_SCALE = 1 days * BASIS_POINTS;

    enum Building { Townhall, Timber, Claypit, Quarry, Warehouse, Workshop, Goldmine, Barracks }
    enum Troop { Spear, Archer, Rider }
    enum Resource { Wood, Clay, Stone, Gold }

    string public constant name = "Civilization Gold";
    string public constant symbol = "CGOLD";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

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
        uint64 claimAvailableAt;
        Resources stored;
        Resources field;
        Resources accrualRemainder;
        Buildings buildings;
        Troops troops;
        Raid pendingRaid;
        Construction construction;
        uint256 prestigeCount;
    }

    IWorldIDVerifier public immutable worldIdVerifier;
    uint256 public immutable worldIdAction;
    uint64 public immutable worldIdRpId;
    uint64 public immutable worldIdIssuerSchemaId;
    uint256 public immutable worldIdCredentialGenesisIssuedAtMin;
    address public immutable worldToken;
    address public immutable boostTreasury;
    mapping(address => Player) private players;
    mapping(uint256 => address) public nullifierOwner;

    event WorldIdRegistered(address indexed player, uint256 indexed nullifierHash);
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

    error ZeroAddress();
    error AlreadyRegistered();
    error NullifierAlreadyUsed();
    error InvalidWorldIdConfiguration();
    error UnexpectedWorldIdCredential();
    error Unregistered();
    error ClaimOnCooldown(uint64 availableAt);
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

    constructor(
        address worldIdVerifierAddress,
        string memory worldActionId,
        uint64 worldRpId,
        uint64 worldIssuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        address worldTokenAddress,
        address boostTreasuryAddress
    ) {
        if (worldIdVerifierAddress == address(0) || worldTokenAddress == address(0) || boostTreasuryAddress == address(0)) revert ZeroAddress();
        if (bytes(worldActionId).length == 0 || worldRpId == 0 || worldIssuerSchemaId == 0) revert InvalidWorldIdConfiguration();
        worldIdVerifier = IWorldIDVerifier(worldIdVerifierAddress);
        worldIdAction = uint256(keccak256(bytes(worldActionId)));
        worldIdRpId = worldRpId;
        worldIdIssuerSchemaId = worldIssuerSchemaId;
        worldIdCredentialGenesisIssuedAtMin = credentialGenesisIssuedAtMin;
        worldToken = worldTokenAddress;
        boostTreasury = boostTreasuryAddress;
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
        if (players[msg.sender].registered) revert AlreadyRegistered();
        if (nullifierOwner[nullifierHash] != address(0)) revert NullifierAlreadyUsed();
        if (signalHash != _hashToField(abi.encodePacked(msg.sender))) revert InvalidWorldIdConfiguration();
        if (issuerSchemaId != worldIdIssuerSchemaId) revert UnexpectedWorldIdCredential();
        worldIdVerifier.verify(
            nullifierHash,
            worldIdAction,
            worldIdRpId,
            nonce,
            signalHash,
            expiresAtMin,
            issuerSchemaId,
            worldIdCredentialGenesisIssuedAtMin,
            proof
        );
        nullifierOwner[nullifierHash] = msg.sender;
        Player storage player = players[msg.sender];
        player.registered = true;
        player.lastAccruedAt = uint64(block.timestamp);
        player.buildings = Buildings(0, 1, 1, 1, 1, 0, 0, 0);
        player.stored = Resources(80, 80, 80, 0);
        emit WorldIdRegistered(msg.sender, nullifierHash);
    }

    function claim() external onlyRegistered {
        Player storage player = players[msg.sender];
        if (block.timestamp < player.claimAvailableAt) revert ClaimOnCooldown(player.claimAvailableAt);
        _accrue(player);
        Resources memory claimed;
        uint256 capacity = _capacity(player.buildings.warehouse);
        (claimed.wood, player.stored.wood, player.field.wood) = _claimOne(player.stored.wood, player.field.wood, capacity);
        (claimed.clay, player.stored.clay, player.field.clay) = _claimOne(player.stored.clay, player.field.clay, capacity);
        (claimed.stone, player.stored.stone, player.field.stone) = _claimOne(player.stored.stone, player.field.stone, capacity);
        claimed.gold = player.field.gold;
        player.field.gold = 0;
        if (claimed.gold != 0) _mintGold(msg.sender, claimed.gold * GOLD_UNIT);
        player.claimAvailableAt = uint64(block.timestamp + CLAIM_COOLDOWN);
        emit ResourcesClaimed(msg.sender, claimed.wood, claimed.clay, claimed.stone, claimed.gold);
    }

    function upgrade(Building building) external onlyRegistered {
        Player storage player = players[msg.sender];
        if (player.construction.pending) revert ConstructionAlreadyPending(player.construction.completesAt);
        _accrue(player);
        if (_buildingLevel(player.buildings, building) >= MAX_BUILDING_LEVEL) revert BuildingMaxLevel();
        _requireBuildingRequirements(player.buildings, building);
        Resources memory price = _buildingCost(player.buildings, building);
        _spend(player, msg.sender, price);
        uint64 completesAt = uint64(block.timestamp + _buildDuration(building, _buildingLevel(player.buildings, building) + 1));
        player.construction = Construction(true, building, completesAt);
        emit UpgradeStarted(msg.sender, building, completesAt);
    }

    function completeUpgrade() external onlyRegistered {
        Player storage player = players[msg.sender];
        Construction memory construction = player.construction;
        if (!construction.pending) revert NoConstructionPending();
        if (block.timestamp < construction.completesAt) revert ConstructionNotReady(construction.completesAt);
        _accrueUntil(player, construction.completesAt);
        uint256 newLevel = _incrementBuilding(player.buildings, construction.building);
        delete player.construction;
        _accrueUntil(player, block.timestamp);
        emit BuildingUpgraded(msg.sender, construction.building, newLevel);
    }

    /// @notice Pays exactly one WLD per requested full hour to reduce pending construction time.
    /// @dev WLD is sent directly to the immutable treasury; this contract never holds it.
    function boostConstruction(uint256 hoursToBoost) external onlyRegistered {
        if (hoursToBoost == 0) revert InvalidAmount();
        Player storage player = players[msg.sender];
        Construction storage construction = player.construction;
        if (!construction.pending || block.timestamp >= construction.completesAt) revert NoBoostableConstruction();
        uint256 duration = hoursToBoost * BOOST_DURATION;
        if (duration > uint256(construction.completesAt) - block.timestamp) revert BoostExceedsRemainingTime();
        uint256 wldPaid = hoursToBoost * WORLD_TOKEN_UNIT;
        construction.completesAt = uint64(uint256(construction.completesAt) - duration);
        if (!IWorldToken(worldToken).transferFrom(msg.sender, boostTreasury, wldPaid)) revert WorldTokenTransferFailed();
        emit ConstructionBoosted(msg.sender, hoursToBoost, wldPaid, construction.completesAt);
    }

    function train(Troop troop, uint256 amount) external onlyRegistered {
        if (amount == 0) revert InvalidAmount();
        Player storage player = players[msg.sender];
        _accrue(player);
        _requireTroopRequirements(player.buildings, troop);
        Resources memory price = _troopCost(troop, amount);
        _spend(player, msg.sender, price);
        if (troop == Troop.Spear) player.troops.spear += amount;
        else if (troop == Troop.Archer) player.troops.archer += amount;
        else player.troops.rider += amount;
        emit TroopsTrained(msg.sender, troop, amount);
    }

    /// @notice Reserves troops immediately; only the attacker can resolve after the march.
    function startRaid(address defender, uint256 spear, uint256 archer, uint256 rider) external onlyRegistered {
        if (defender == msg.sender) revert SelfRaid();
        if (!players[defender].registered) revert Unregistered();
        if (spear + archer + rider == 0) revert InvalidAmount();
        Player storage attacker = players[msg.sender];
        if (attacker.pendingRaid.defender != address(0)) revert RaidAlreadyPending();
        _accrue(attacker);
        if (spear > attacker.troops.spear || archer > attacker.troops.archer || rider > attacker.troops.rider) revert InsufficientTroops();
        attacker.troops.spear -= spear;
        attacker.troops.archer -= archer;
        attacker.troops.rider -= rider;
        attacker.pendingRaid = Raid(defender, uint64(block.timestamp + RAID_MARCH_DURATION), spear, archer, rider);
        emit RaidStarted(msg.sender, defender, attacker.pendingRaid.arrivesAt, spear, archer, rider);
    }

    function resolveRaid() external onlyRegistered {
        Player storage attacker = players[msg.sender];
        Raid memory raid = attacker.pendingRaid;
        if (raid.defender == address(0)) revert NoRaidPending();
        if (block.timestamp < raid.arrivesAt) revert RaidNotArrived(raid.arrivesAt);
        Player storage defender = players[raid.defender];
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
    }

    /// @notice Resets the village after full townhall completion and adds a permanent production bonus.
    /// @dev Prestige never bypasses the World-ID registration gate and does not move an external asset.
    function prestige() external onlyRegistered {
        Player storage player = players[msg.sender];
        if (player.buildings.townhall != MAX_BUILDING_LEVEL || player.construction.pending) revert PrestigeRequirementNotMet();
        player.prestigeCount += 1;
        player.lastAccruedAt = uint64(block.timestamp);
        player.claimAvailableAt = 0;
        player.stored = Resources(80, 80, 80, 0);
        player.field = Resources(0, 0, 0, 0);
        player.accrualRemainder = Resources(0, 0, 0, 0);
        player.buildings = Buildings(0, 1, 1, 1, 1, 0, 0, 0);
        player.troops = Troops(0, 0, 0);
        delete player.pendingRaid;
        delete player.construction;
        emit Prestiged(msg.sender, player.prestigeCount, _productionMultiplier(player.prestigeCount));
    }

    function playerState(address account) external view returns (bool registered, uint64 lastAccruedAt, uint64 claimAvailableAt, Resources memory stored, Resources memory field, Buildings memory buildings, Troops memory troops, Raid memory pendingRaid, Construction memory construction, uint256 prestigeCount) {
        Player storage player = players[account];
        return (player.registered, player.lastAccruedAt, player.claimAvailableAt, player.stored, player.field, player.buildings, player.troops, player.pendingRaid, player.construction, player.prestigeCount);
    }

    /// @notice Returns the state as if production were settled at the current block.
    /// @dev Read-only UI helper; a transaction still settles and stores the same rule.
    function previewPlayerState(address account) external view returns (bool registered, uint64 lastAccruedAt, uint64 claimAvailableAt, Resources memory stored, Resources memory field, Buildings memory buildings, Troops memory troops, Raid memory pendingRaid, Construction memory construction, uint256 prestigeCount) {
        Player storage player = players[account];
        stored = player.stored;
        field = player.field;
        buildings = player.buildings;
        troops = player.troops;
        pendingRaid = player.pendingRaid;
        construction = player.construction;
        prestigeCount = player.prestigeCount;
        registered = player.registered;
        lastAccruedAt = player.lastAccruedAt;
        claimAvailableAt = player.claimAvailableAt;
        if (!registered) return (registered, lastAccruedAt, claimAvailableAt, stored, field, buildings, troops, pendingRaid, construction, prestigeCount);
        (field, ) = _accruedField(field, player.accrualRemainder, buildings, prestigeCount, lastAccruedAt, block.timestamp);
        lastAccruedAt = uint64(block.timestamp);
    }

    function productionMultiplierBps(address account) external view returns (uint256) {
        return _productionMultiplier(players[account].prestigeCount);
    }

    function prestigeMultiplierBps(uint256 prestigeCount) external pure returns (uint256) {
        return _productionMultiplier(prestigeCount);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transferGold(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted < value) revert InsufficientAllowance();
        if (permitted != type(uint256).max) {
            allowance[from][msg.sender] = permitted - value;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transferGold(from, to, value);
        return true;
    }

    modifier onlyRegistered() { if (!players[msg.sender].registered) revert Unregistered(); _; }

    function _accrue(Player storage player) private {
        _accrueUntil(player, block.timestamp);
    }

    function _accrueUntil(Player storage player, uint256 to) private {
        if (to <= player.lastAccruedAt) return;
        (player.field, player.accrualRemainder) = _accruedField(player.field, player.accrualRemainder, player.buildings, player.prestigeCount, player.lastAccruedAt, to);
        player.lastAccruedAt = uint64(to);
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
        uint256 storedTotal = attacker.stored.wood + attacker.stored.clay + attacker.stored.stone;
        uint256 freeCapacity = _capacity(attacker.buildings.warehouse) * 3;
        if (storedTotal >= freeCapacity) return stolen;
        uint256 remaining = _min(transportCapacity, freeCapacity - storedTotal);
        (stolen.wood, remaining) = _take(defender.field.wood, remaining); defender.field.wood -= stolen.wood; attacker.stored.wood += stolen.wood;
        (stolen.clay, remaining) = _take(defender.field.clay, remaining); defender.field.clay -= stolen.clay; attacker.stored.clay += stolen.clay;
        (stolen.stone, remaining) = _take(defender.field.stone, remaining); defender.field.stone -= stolen.stone; attacker.stored.stone += stolen.stone;
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
    function _buildDuration(Building building, uint256 nextLevel) private pure returns (uint256) { if (building == Building.Townhall) return nextLevel * 1 days; return _max(1 hours, nextLevel * 6 hours); }
    function _productionMultiplier(uint256 prestigeCount) private pure returns (uint256) { return BASIS_POINTS + prestigeCount * PRESTIGE_BONUS_BPS; }
    function _spend(Player storage player, address account, Resources memory price) private {
        if (player.stored.wood < price.wood || player.stored.clay < price.clay || player.stored.stone < price.stone) revert InsufficientResources();
        uint256 goldCost = price.gold * GOLD_UNIT;
        if (balanceOf[account] < goldCost) revert InsufficientGoldBalance();
        player.stored.wood -= price.wood;
        player.stored.clay -= price.clay;
        player.stored.stone -= price.stone;
        if (goldCost != 0) _burnGold(account, goldCost);
    }
    function _mintGold(address account, uint256 value) private { totalSupply += value; balanceOf[account] += value; emit Transfer(address(0), account, value); }
    function _burnGold(address account, uint256 value) private { if (balanceOf[account] < value) revert InsufficientGoldBalance(); balanceOf[account] -= value; totalSupply -= value; emit Transfer(account, address(0), value); }
    function _transferGold(address from, address to, uint256 value) private { if (to == address(0)) revert ZeroAddress(); if (balanceOf[from] < value) revert InsufficientGoldBalance(); balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); }
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
