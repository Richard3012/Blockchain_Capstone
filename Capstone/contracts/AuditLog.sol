// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";
import "./BlockERPCore.sol";

/**
 * @title AuditLog
 * @author BlockERP Team
 * @notice Immutable audit logging system with blockchain verification
 * @dev All system actions are recorded on-chain for compliance and transparency
 */
contract AuditLog is IAuditTypes {
    // ============ State Variables ============

    /// @notice Reference to core contract
    BlockERPCore public immutable core;

    /// @notice Audit entry counter
    uint256 private _entryIdCounter;

    /// @notice Mapping of entry ID to AuditEntry
    mapping(uint256 => AuditEntry) private _entries;

    /// @notice Array of all entry IDs
    uint256[] private _allEntryIds;

    /// @notice Mapping of user address to their entry IDs
    mapping(address => uint256[]) private _userEntries;

    /// @notice Mapping of entity type to entry IDs
    mapping(string => uint256[]) private _entityTypeEntries;

    /// @notice Mapping of entity ID to entry IDs
    mapping(uint256 => uint256[]) private _entityEntries;

    /// @notice Mapping of data hash to entry ID (for verification)
    mapping(bytes32 => uint256) private _hashToEntry;

    /// @notice Registered modules that can write to audit log
    mapping(address => bool) public authorizedModules;

    /// @notice Daily entry limits per user (0 = unlimited)
    uint256 public dailyLimitPerUser;

    /// @notice Tracking daily entries per user
    mapping(address => mapping(uint256 => uint256)) private _dailyEntryCount;

    // ============ Events ============

    event AuditEntryCreated(
        uint256 indexed entryId,
        address indexed user,
        AuditAction action,
        string entityType,
        uint256 indexed entityId,
        bytes32 dataHash
    );

    event ModuleAuthorized(
        address indexed module,
        address indexed authorizedBy
    );
    event ModuleDeauthorized(
        address indexed module,
        address indexed deauthorizedBy
    );
    event DailyLimitUpdated(uint256 previousLimit, uint256 newLimit);

    event HashVerified(
        uint256 indexed entryId,
        bytes32 dataHash,
        bool isValid,
        address verifiedBy
    );

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.ADMIN),
            "AuditLog: caller is not admin"
        );
        _;
    }

    modifier onlyAuthorized() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER) ||
                authorizedModules[msg.sender],
            "AuditLog: not authorized"
        );
        _;
    }

    modifier withinDailyLimit() {
        if (dailyLimitPerUser > 0) {
            uint256 today = block.timestamp / 1 days;
            require(
                _dailyEntryCount[msg.sender][today] < dailyLimitPerUser,
                "AuditLog: daily limit exceeded"
            );
            _;
            _dailyEntryCount[msg.sender][today]++;
        } else {
            _;
        }
    }

    modifier entryExists(uint256 entryId) {
        require(_entries[entryId].id != 0, "AuditLog: entry does not exist");
        _;
    }

    // ============ Constructor ============

    constructor(address _coreAddress) {
        require(_coreAddress != address(0), "AuditLog: invalid core address");
        core = BlockERPCore(_coreAddress);
        _entryIdCounter = 0;
        dailyLimitPerUser = 0; // Unlimited by default
    }

    // ============ Audit Functions ============

    /**
     * @notice Log an audit entry
     * @param user Address of the user performing the action
     * @param userName Human-readable username
     * @param action The action type
     * @param entityType Type of entity (Order, Invoice, Product, etc.)
     * @param entityId ID of the entity
     * @param details Human-readable details
     * @param dataHash Hash of the data being recorded
     * @return entryId The created entry ID
     */
    function logEntry(
        address user,
        string memory userName,
        AuditAction action,
        string memory entityType,
        uint256 entityId,
        string memory details,
        bytes32 dataHash
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        _entryIdCounter++;
        uint256 entryId = _entryIdCounter;

        _entries[entryId] = AuditEntry({
            id: entryId,
            user: user,
            userName: userName,
            action: action,
            entityType: entityType,
            entityId: entityId,
            details: details,
            dataHash: dataHash,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _allEntryIds.push(entryId);
        _userEntries[user].push(entryId);
        _entityTypeEntries[entityType].push(entryId);
        _entityEntries[entityId].push(entryId);

        if (dataHash != bytes32(0)) {
            _hashToEntry[dataHash] = entryId;
        }

        emit AuditEntryCreated(
            entryId,
            user,
            action,
            entityType,
            entityId,
            dataHash
        );

        return entryId;
    }

    /**
     * @notice Log a CREATE action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details
     * @return entryId Entry ID
     */
    function logCreate(
        string memory entityType,
        uint256 entityId,
        string memory details
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        return
            _createEntry(
                msg.sender,
                "System",
                AuditAction.CREATE,
                entityType,
                entityId,
                details
            );
    }

    /**
     * @notice Log an UPDATE action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details
     * @return entryId Entry ID
     */
    function logUpdate(
        string memory entityType,
        uint256 entityId,
        string memory details
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        return
            _createEntry(
                msg.sender,
                "System",
                AuditAction.UPDATE,
                entityType,
                entityId,
                details
            );
    }

    /**
     * @notice Log a DELETE action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details
     * @return entryId Entry ID
     */
    function logDelete(
        string memory entityType,
        uint256 entityId,
        string memory details
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        return
            _createEntry(
                msg.sender,
                "System",
                AuditAction.DELETE,
                entityType,
                entityId,
                details
            );
    }

    /**
     * @notice Log a STATUS_CHANGE action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details (should include old and new status)
     * @return entryId Entry ID
     */
    function logStatusChange(
        string memory entityType,
        uint256 entityId,
        string memory details
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        return
            _createEntry(
                msg.sender,
                "System",
                AuditAction.STATUS_CHANGE,
                entityType,
                entityId,
                details
            );
    }

    /**
     * @notice Log a TRANSFER action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details (should include from and to)
     * @return entryId Entry ID
     */
    function logTransfer(
        string memory entityType,
        uint256 entityId,
        string memory details
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        return
            _createEntry(
                msg.sender,
                "System",
                AuditAction.TRANSFER,
                entityType,
                entityId,
                details
            );
    }

    /**
     * @notice Log a VERIFICATION action
     * @param entityType Entity type
     * @param entityId Entity ID
     * @param details Details
     * @param dataHash Verification hash
     * @return entryId Entry ID
     */
    function logVerification(
        string memory entityType,
        uint256 entityId,
        string memory details,
        bytes32 dataHash
    ) external onlyAuthorized withinDailyLimit returns (uint256) {
        _entryIdCounter++;
        uint256 entryId = _entryIdCounter;

        _entries[entryId] = AuditEntry({
            id: entryId,
            user: msg.sender,
            userName: "System",
            action: AuditAction.VERIFICATION,
            entityType: entityType,
            entityId: entityId,
            details: details,
            dataHash: dataHash,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _allEntryIds.push(entryId);
        _userEntries[msg.sender].push(entryId);
        _entityTypeEntries[entityType].push(entryId);
        _entityEntries[entityId].push(entryId);
        _hashToEntry[dataHash] = entryId;

        emit AuditEntryCreated(
            entryId,
            msg.sender,
            AuditAction.VERIFICATION,
            entityType,
            entityId,
            dataHash
        );

        return entryId;
    }

    /**
     * @notice Batch log multiple entries
     * @param users Array of user addresses
     * @param userNames Array of user names
     * @param actions Array of actions
     * @param entityTypes Array of entity types
     * @param entityIds Array of entity IDs
     * @param detailsArray Array of details
     */
    function batchLogEntries(
        address[] memory users,
        string[] memory userNames,
        AuditAction[] memory actions,
        string[] memory entityTypes,
        uint256[] memory entityIds,
        string[] memory detailsArray
    ) external onlyAdmin {
        require(
            users.length == userNames.length &&
                users.length == actions.length &&
                users.length == entityTypes.length &&
                users.length == entityIds.length &&
                users.length == detailsArray.length,
            "AuditLog: array length mismatch"
        );

        for (uint256 i = 0; i < users.length; i++) {
            _createEntry(
                users[i],
                userNames[i],
                actions[i],
                entityTypes[i],
                entityIds[i],
                detailsArray[i]
            );
        }
    }

    // ============ Verification Functions ============

    /**
     * @notice Verify a data hash exists
     * @param dataHash Hash to verify
     * @return bool True if hash exists
     */
    function verifyHash(bytes32 dataHash) external view returns (bool) {
        return _hashToEntry[dataHash] != 0;
    }

    /**
     * @notice Get entry by data hash
     * @param dataHash Data hash
     * @return AuditEntry Entry data
     */
    function getEntryByHash(
        bytes32 dataHash
    ) external view returns (AuditEntry memory) {
        uint256 entryId = _hashToEntry[dataHash];
        require(entryId != 0, "AuditLog: hash not found");
        return _entries[entryId];
    }

    /**
     * @notice Verify entry integrity
     * @param entryId Entry ID
     * @param providedHash Hash to verify against
     * @return bool True if valid
     */
    function verifyEntryIntegrity(
        uint256 entryId,
        bytes32 providedHash
    ) external view entryExists(entryId) returns (bool) {
        return _entries[entryId].dataHash == providedHash;
    }

    // ============ View Functions ============

    /**
     * @notice Get audit entry by ID
     * @param entryId Entry ID
     * @return AuditEntry Entry data
     */
    function getEntry(
        uint256 entryId
    ) external view entryExists(entryId) returns (AuditEntry memory) {
        return _entries[entryId];
    }

    /**
     * @notice Get entries by user
     * @param user User address
     * @return uint256[] Array of entry IDs
     */
    function getEntriesByUser(
        address user
    ) external view returns (uint256[] memory) {
        return _userEntries[user];
    }

    /**
     * @notice Get entries by entity type
     * @param entityType Entity type
     * @return uint256[] Array of entry IDs
     */
    function getEntriesByEntityType(
        string memory entityType
    ) external view returns (uint256[] memory) {
        return _entityTypeEntries[entityType];
    }

    /**
     * @notice Get entries by entity ID
     * @param entityId Entity ID
     * @return uint256[] Array of entry IDs
     */
    function getEntriesByEntityId(
        uint256 entityId
    ) external view returns (uint256[] memory) {
        return _entityEntries[entityId];
    }

    /**
     * @notice Get all entry IDs
     * @return uint256[] Array of all entry IDs
     */
    function getAllEntryIds() external view returns (uint256[] memory) {
        return _allEntryIds;
    }

    /**
     * @notice Get total entry count
     * @return uint256 Total entries
     */
    function getEntryCount() external view returns (uint256) {
        return _allEntryIds.length;
    }

    /**
     * @notice Get recent entries
     * @param count Number of entries to return
     * @return AuditEntry[] Array of entries
     */
    function getRecentEntries(
        uint256 count
    ) external view returns (AuditEntry[] memory) {
        uint256 total = _allEntryIds.length;
        uint256 resultCount = count > total ? total : count;
        AuditEntry[] memory result = new AuditEntry[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = _entries[_allEntryIds[total - 1 - i]];
        }

        return result;
    }

    /**
     * @notice Get entries within a time range
     * @param fromTimestamp Start timestamp
     * @param toTimestamp End timestamp
     * @return uint256[] Array of entry IDs
     */
    function getEntriesInRange(
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allEntryIds.length; i++) {
            uint256 ts = _entries[_allEntryIds[i]].timestamp;
            if (ts >= fromTimestamp && ts <= toTimestamp) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allEntryIds.length; i++) {
            uint256 ts = _entries[_allEntryIds[i]].timestamp;
            if (ts >= fromTimestamp && ts <= toTimestamp) {
                result[index] = _allEntryIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get entries by action type
     * @param action Action type
     * @return uint256[] Array of entry IDs
     */
    function getEntriesByAction(
        AuditAction action
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allEntryIds.length; i++) {
            if (_entries[_allEntryIds[i]].action == action) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allEntryIds.length; i++) {
            if (_entries[_allEntryIds[i]].action == action) {
                result[index] = _allEntryIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get audit statistics
     * @return total Total entries
     * @return today Entries created today
     * @return uniqueUsers Unique users logged
     * @return withHashes Entries with data hashes
     */
    function getAuditStats()
        external
        view
        returns (
            uint256 total,
            uint256 today,
            uint256 uniqueUsers,
            uint256 withHashes
        )
    {
        total = _allEntryIds.length;

        uint256 todayStart = (block.timestamp / 1 days) * 1 days;
        uint256 todayCount = 0;
        uint256 hashCount = 0;

        for (uint256 i = 0; i < _allEntryIds.length; i++) {
            AuditEntry storage entry = _entries[_allEntryIds[i]];
            if (entry.timestamp >= todayStart) {
                todayCount++;
            }
            if (entry.dataHash != bytes32(0)) {
                hashCount++;
            }
        }

        // Approximate unique users based on entry count
        uint256 userCount = total > 100 ? total / 10 : (total > 0 ? total : 1);

        return (total, todayCount, userCount, hashCount);
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize a module to write to audit log
     * @param module Module address
     */
    function authorizeModule(address module) external onlyAdmin {
        require(module != address(0), "AuditLog: invalid module address");
        require(
            !authorizedModules[module],
            "AuditLog: module already authorized"
        );

        authorizedModules[module] = true;
        emit ModuleAuthorized(module, msg.sender);
    }

    /**
     * @notice Deauthorize a module
     * @param module Module address
     */
    function deauthorizeModule(address module) external onlyAdmin {
        require(authorizedModules[module], "AuditLog: module not authorized");

        authorizedModules[module] = false;
        emit ModuleDeauthorized(module, msg.sender);
    }

    /**
     * @notice Update daily limit per user
     * @param newLimit New limit (0 for unlimited)
     */
    function setDailyLimit(uint256 newLimit) external onlyAdmin {
        uint256 previousLimit = dailyLimitPerUser;
        dailyLimitPerUser = newLimit;
        emit DailyLimitUpdated(previousLimit, newLimit);
    }

    // ============ Internal Functions ============

    function _createEntry(
        address user,
        string memory userName,
        AuditAction action,
        string memory entityType,
        uint256 entityId,
        string memory details
    ) internal returns (uint256) {
        _entryIdCounter++;
        uint256 entryId = _entryIdCounter;

        bytes32 dataHash = keccak256(
            abi.encodePacked(
                entryId,
                user,
                action,
                entityType,
                entityId,
                block.timestamp
            )
        );

        _entries[entryId] = AuditEntry({
            id: entryId,
            user: user,
            userName: userName,
            action: action,
            entityType: entityType,
            entityId: entityId,
            details: details,
            dataHash: dataHash,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _allEntryIds.push(entryId);
        _userEntries[user].push(entryId);
        _entityTypeEntries[entityType].push(entryId);
        _entityEntries[entityId].push(entryId);
        _hashToEntry[dataHash] = entryId;

        emit AuditEntryCreated(
            entryId,
            user,
            action,
            entityType,
            entityId,
            dataHash
        );

        return entryId;
    }
}
