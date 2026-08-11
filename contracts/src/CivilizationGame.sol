// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CivilizationGame
/// @notice Source-only World Chain game-state draft. The backend may attest a
/// World ID registration, but has no method that can change a village.
/// @dev All resource amounts are integral game units; this contract deliberately
/// has no ERC-20, native-token, payment, withdrawal, or custody functionality.
contract CivilizationGame {
    uint256 public constant MAX_OFFLINE_SECONDS = 8 hours;
    uint256 public constant CLAIM_COOLDOWN = 1 minutes;
    uint256 public constant RAID_MARCH_DURATION = 1 minutes;
    uint256 public constant MAX_ATTESTATION_TTL = 15 minutes;

    uint256 private constant FRACTION_SCALE = 100;
    uint256 private constant SECP256K1N_HALF =
        57896044618658097711785492504343953926418782139537452191302581570759080747168;
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256("WorldIdAttestation(address player,bytes32 nullifierHash,bytes32 nonce,uint64 expiresAt)");
    bytes32 private constant NAME_HASH = keccak256("CivilizationGame");
    bytes32 private constant VERSION_HASH = keccak256("1");

    enum Building { Townhall, Timber, Claypit, Quarry, Warehouse, Workshop, Goldmine, Barracks }
    enum Troop { Spear, Archer, Rider }
    enum Resource { Wood, Clay, Stone, Gold }

    struct Resources { uint256 wood; uint256 clay; uint256 stone; uint256 gold; }
    struct Buildings { uint256 townhall; uint256 timber; uint256 claypit; uint256 quarry; uint256 warehouse; uint256 workshop; uint256 goldmine; uint256 barracks; }
    struct Troops { uint256 spear; uint256 archer; uint256 rider; }
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
    }

    address public immutable backendAttestationSigner;
    mapping(address => Player) private players;
    mapping(bytes32 => address) public nullifierOwner;
    mapping(bytes32 => bool) public usedAttestationNonce;

    event WorldIdRegistered(address indexed player, bytes32 indexed nullifierHash, bytes32 indexed nonce, uint64 expiresAt);
    event ResourcesClaimed(address indexed player, uint256 wood, uint256 clay, uint256 stone, uint256 gold);
    event BuildingUpgraded(address indexed player, Building indexed building, uint256 newLevel);
    event TroopsTrained(address indexed player, Troop indexed troop, uint256 amount);
    event RaidStarted(address indexed attacker, address indexed defender, uint64 arrivesAt, uint256 spear, uint256 archer, uint256 rider);
    event RaidResolved(address indexed attacker, address indexed defender, bool attackerWon, uint256 attack, uint256 defense, uint256 wood, uint256 clay, uint256 stone, uint256 gold);

    error ZeroAddress();
    error AlreadyRegistered();
    error NullifierAlreadyUsed();
    error AttestationNonceAlreadyUsed();
    error AttestationExpired();
    error AttestationTooFarInFuture();
    error InvalidAttestation();
    error Unregistered();
    error ClaimOnCooldown(uint64 availableAt);
    error MissingBuildingRequirement();
    error InsufficientResources();
    error InvalidAmount();
    error SelfRaid();
    error RaidAlreadyPending();
    error NoRaidPending();
    error RaidNotArrived(uint64 arrivesAt);
    error InsufficientTroops();

    constructor(address signer) {
        if (signer == address(0)) revert ZeroAddress();
        backendAttestationSigner = signer;
    }

    /// @notice Registers msg.sender once from an EIP-712 backend attestation.
    /// @dev `nullifierHash` must be a canonical one-way hash produced only after
    /// backend World ID verification; raw World ID nullifiers never enter storage.
    function registerWorldId(bytes32 nullifierHash, bytes32 nonce, uint64 expiresAt, bytes calldata signature) external {
        if (players[msg.sender].registered) revert AlreadyRegistered();
        if (nullifierOwner[nullifierHash] != address(0)) revert NullifierAlreadyUsed();
        if (usedAttestationNonce[nonce]) revert AttestationNonceAlreadyUsed();
        if (expiresAt <= block.timestamp) revert AttestationExpired();
        if (uint256(expiresAt) - block.timestamp > MAX_ATTESTATION_TTL) revert AttestationTooFarInFuture();
        bytes32 structHash = keccak256(abi.encode(ATTESTATION_TYPEHASH, msg.sender, nullifierHash, nonce, expiresAt));
        if (_recover(_hashTypedData(structHash), signature) != backendAttestationSigner) revert InvalidAttestation();

        usedAttestationNonce[nonce] = true;
        nullifierOwner[nullifierHash] = msg.sender;
        Player storage player = players[msg.sender];
        player.registered = true;
        player.lastAccruedAt = uint64(block.timestamp);
        player.buildings = Buildings(1, 1, 1, 1, 1, 0, 0, 0);
        player.stored = Resources(240, 220, 210, 45);
        emit WorldIdRegistered(msg.sender, nullifierHash, nonce, expiresAt);
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
        (claimed.gold, player.stored.gold, player.field.gold) = _claimOne(player.stored.gold, player.field.gold, capacity);
        player.claimAvailableAt = uint64(block.timestamp + CLAIM_COOLDOWN);
        emit ResourcesClaimed(msg.sender, claimed.wood, claimed.clay, claimed.stone, claimed.gold);
    }

    function upgrade(Building building) external onlyRegistered {
        Player storage player = players[msg.sender];
        _accrue(player);
        _requireBuildingRequirements(player.buildings, building);
        Resources memory price = _buildingCost(player.buildings, building);
        _spend(player.stored, price);
        uint256 newLevel = _incrementBuilding(player.buildings, building);
        emit BuildingUpgraded(msg.sender, building, newLevel);
    }

    function train(Troop troop, uint256 amount) external onlyRegistered {
        if (amount == 0) revert InvalidAmount();
        Player storage player = players[msg.sender];
        _accrue(player);
        _requireTroopRequirements(player.buildings, troop);
        Resources memory price = _troopCost(troop, amount);
        _spend(player.stored, price);
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
        Resources memory stolen = won ? _loot(attacker, defender, (raid.spear + raid.archer + raid.rider) * 18) : Resources(0, 0, 0, 0);
        emit RaidResolved(msg.sender, raid.defender, won, attack, defense, stolen.wood, stolen.clay, stolen.stone, stolen.gold);
    }

    function playerState(address account) external view returns (bool registered, uint64 lastAccruedAt, uint64 claimAvailableAt, Resources memory stored, Resources memory field, Buildings memory buildings, Troops memory troops, Raid memory pendingRaid) {
        Player storage player = players[account];
        return (player.registered, player.lastAccruedAt, player.claimAvailableAt, player.stored, player.field, player.buildings, player.troops, player.pendingRaid);
    }

    modifier onlyRegistered() { if (!players[msg.sender].registered) revert Unregistered(); _; }

    function _accrue(Player storage player) private {
        uint256 elapsed = block.timestamp - player.lastAccruedAt;
        if (elapsed > MAX_OFFLINE_SECONDS) elapsed = MAX_OFFLINE_SECONDS;
        if (elapsed == 0) return;
        uint256 capacity = _capacity(player.buildings.warehouse);
        (player.field.wood, player.accrualRemainder.wood) = _accrueOne(player.field.wood, player.accrualRemainder.wood, elapsed, 55 * player.buildings.timber, capacity);
        (player.field.clay, player.accrualRemainder.clay) = _accrueOne(player.field.clay, player.accrualRemainder.clay, elapsed, 50 * player.buildings.claypit, capacity);
        (player.field.stone, player.accrualRemainder.stone) = _accrueOne(player.field.stone, player.accrualRemainder.stone, elapsed, 46 * player.buildings.quarry, capacity);
        (player.field.gold, player.accrualRemainder.gold) = _accrueOne(player.field.gold, player.accrualRemainder.gold, elapsed, 13 * player.buildings.goldmine, capacity);
        player.lastAccruedAt = uint64(block.timestamp);
    }

    function _accrueOne(uint256 field, uint256 remainder, uint256 elapsed, uint256 rate, uint256 capacity) private pure returns (uint256, uint256) {
        if (field >= capacity) return (capacity, 0);
        uint256 units = elapsed * rate + remainder;
        uint256 produced = units / FRACTION_SCALE;
        uint256 nextField = field + produced;
        if (nextField >= capacity) return (capacity, 0);
        return (nextField, units % FRACTION_SCALE);
    }

    function _loot(Player storage attacker, Player storage defender, uint256 transportCapacity) private returns (Resources memory stolen) {
        uint256 storedTotal = attacker.stored.wood + attacker.stored.clay + attacker.stored.stone + attacker.stored.gold;
        uint256 freeCapacity = _capacity(attacker.buildings.warehouse) * 4;
        if (storedTotal >= freeCapacity) return stolen;
        uint256 remaining = _min(transportCapacity, freeCapacity - storedTotal);
        (stolen.wood, remaining) = _take(defender.field.wood, remaining); defender.field.wood -= stolen.wood; attacker.stored.wood += stolen.wood;
        (stolen.clay, remaining) = _take(defender.field.clay, remaining); defender.field.clay -= stolen.clay; attacker.stored.clay += stolen.clay;
        (stolen.stone, remaining) = _take(defender.field.stone, remaining); defender.field.stone -= stolen.stone; attacker.stored.stone += stolen.stone;
        (stolen.gold,) = _take(defender.field.gold, remaining); defender.field.gold -= stolen.gold; attacker.stored.gold += stolen.gold;
    }

    function _buildingCost(Buildings storage b, Building building) private view returns (Resources memory price) {
        uint256 level = _buildingLevel(b, building);
        uint256 factor; Resources memory base;
        if (building == Building.Townhall) { base = Resources(55,65,75,0); factor = 158; }
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
    function _spend(Resources storage have, Resources memory price) private { if (have.wood < price.wood || have.clay < price.clay || have.stone < price.stone || have.gold < price.gold) revert InsufficientResources(); have.wood -= price.wood; have.clay -= price.clay; have.stone -= price.stone; have.gold -= price.gold; }
    function _defense(Player storage p) private view returns (uint256) { uint256 troopPower = p.troops.spear * 10 + p.troops.archer * 17 + p.troops.rider * 31; return _max(1, (troopPower * 65) / 100 + p.buildings.townhall * 20); }
    function _casualties(uint256 spear, uint256 archer, uint256 rider, uint256 rate) private pure returns (uint256, uint256, uint256) { return (_ceilPercent(spear, rate), _ceilPercent(archer, rate), _ceilPercent(rider, rate)); }
    function _capacity(uint256 warehouse) private pure returns (uint256 result) { result = 500; for (uint256 i = 1; i < warehouse; ++i) result = (result * 17 + 5) / 10; }
    function _claimOne(uint256 stored, uint256 field, uint256 capacity) private pure returns (uint256 claimed, uint256 nextStored, uint256 nextField) { claimed = _min(field, capacity > stored ? capacity - stored : 0); return (claimed, stored + claimed, field - claimed); }
    function _take(uint256 available, uint256 wanted) private pure returns (uint256 amount, uint256 remaining) { amount = _min(available, wanted); return (amount, wanted - amount); }
    function _incrementBuilding(Buildings storage b, Building building) private returns (uint256) { if (building == Building.Townhall) return ++b.townhall; if (building == Building.Timber) return ++b.timber; if (building == Building.Claypit) return ++b.claypit; if (building == Building.Quarry) return ++b.quarry; if (building == Building.Warehouse) return ++b.warehouse; if (building == Building.Workshop) return ++b.workshop; if (building == Building.Goldmine) return ++b.goldmine; return ++b.barracks; }
    function _buildingLevel(Buildings storage b, Building building) private view returns (uint256) { if (building == Building.Townhall) return b.townhall; if (building == Building.Timber) return b.timber; if (building == Building.Claypit) return b.claypit; if (building == Building.Quarry) return b.quarry; if (building == Building.Warehouse) return b.warehouse; if (building == Building.Workshop) return b.workshop; if (building == Building.Goldmine) return b.goldmine; return b.barracks; }
    function _hashTypedData(bytes32 structHash) private view returns (bytes32) { return keccak256(abi.encodePacked("\x19\x01", keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))), structHash)); }
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) { if (signature.length != 65) return address(0); bytes32 r; bytes32 s; uint8 v; assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) } if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) return address(0); return ecrecover(digest, v, r, s); }
    function _ceilMul(uint256 value, uint256 factor) private pure returns (uint256) { return (value * factor + 99) / 100; }
    function _ceilPercent(uint256 value, uint256 percent) private pure returns (uint256) { return value == 0 ? 0 : (value * percent + 99) / 100; }
    function _min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }
    function _max(uint256 a, uint256 b) private pure returns (uint256) { return a > b ? a : b; }
}
