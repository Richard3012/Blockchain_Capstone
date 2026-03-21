// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";
import "./BlockERPCore.sol";

/**
 * @title SupplyChain
 * @author BlockERP Team
 * @notice Supply chain tracking with full provenance and verification
 * @dev Provides immutable supply chain records with hash-linked events
 */
contract SupplyChain is ISupplyChainTypes {
    // ============ State Variables ============

    /// @notice Reference to core contract
    BlockERPCore public immutable core;

    /// @notice Tracking record counter
    uint256 private _recordIdCounter;

    /// @notice Mapping of product ID to supply chain record
    mapping(uint256 => SupplyChainRecord) private _records;

    /// @notice Mapping of product ID to tracking events
    mapping(uint256 => TrackingEvent[]) private _trackingEvents;

    /// @notice Mapping of product ID to current status
    mapping(uint256 => TrackingStatus) private _currentStatus;

    /// @notice Mapping of hash to product ID for verification
    mapping(bytes32 => uint256) private _hashToProduct;

    /// @notice Array of all tracked product IDs
    uint256[] private _trackedProducts;

    /// @notice Registered handlers/stakeholders
    mapping(address => HandlerInfo) public handlers;
    address[] private _handlerAddresses;

    struct HandlerInfo {
        string name;
        string handlerType; // Manufacturer, Warehouse, Distributor, Retailer
        string location;
        bool isActive;
        uint256 registeredAt;
    }

    /// @notice Supply chain statistics
    struct SupplyChainStats {
        uint256 totalTrackedProducts;
        uint256 activeShipments;
        uint256 completedShipments;
        uint256 totalEvents;
        uint256 registeredHandlers;
    }

    SupplyChainStats public stats;

    // ============ Events ============

    event TrackingStarted(
        uint256 indexed productId,
        string origin,
        string destination,
        bytes32 initialHash
    );

    event TrackingEventRecorded(
        uint256 indexed productId,
        TrackingStatus status,
        string location,
        string handler,
        bytes32 eventHash
    );

    event TrackingCompleted(
        uint256 indexed productId,
        uint256 totalEvents,
        bytes32 finalHash
    );

    event HandlerRegistered(
        address indexed handlerAddress,
        string name,
        string handlerType
    );

    event HandlerDeactivated(
        address indexed handlerAddress,
        address indexed deactivatedBy
    );

    event ProvenanceVerified(
        uint256 indexed productId,
        bool isValid,
        address verifiedBy
    );

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.ADMIN),
            "SupplyChain: caller is not admin"
        );
        _;
    }

    modifier onlyManagerOrAbove() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER),
            "SupplyChain: insufficient permissions"
        );
        _;
    }

    modifier onlyActiveHandler() {
        require(
            handlers[msg.sender].isActive,
            "SupplyChain: not an active handler"
        );
        _;
    }

    modifier productTracked(uint256 productId) {
        require(
            _records[productId].productId != 0,
            "SupplyChain: product not tracked"
        );
        _;
    }

    modifier trackingActive(uint256 productId) {
        require(
            !_records[productId].isComplete,
            "SupplyChain: tracking already completed"
        );
        _;
    }

    // ============ Constructor ============

    constructor(address _coreAddress) {
        require(
            _coreAddress != address(0),
            "SupplyChain: invalid core address"
        );
        core = BlockERPCore(_coreAddress);
        _recordIdCounter = 0;
    }

    // ============ Handler Management ============

    /**
     * @notice Register a new handler/stakeholder
     * @param handlerAddress Handler's blockchain address
     * @param name Handler name
     * @param handlerType Type (Manufacturer, Warehouse, Distributor, Retailer)
     * @param location Handler location
     */
    function registerHandler(
        address handlerAddress,
        string memory name,
        string memory handlerType,
        string memory location
    ) external onlyAdmin {
        require(handlerAddress != address(0), "SupplyChain: invalid address");
        require(
            !handlers[handlerAddress].isActive,
            "SupplyChain: handler already exists"
        );
        require(bytes(name).length > 0, "SupplyChain: name required");

        handlers[handlerAddress] = HandlerInfo({
            name: name,
            handlerType: handlerType,
            location: location,
            isActive: true,
            registeredAt: block.timestamp
        });

        _handlerAddresses.push(handlerAddress);
        stats.registeredHandlers++;

        emit HandlerRegistered(handlerAddress, name, handlerType);
    }

    /**
     * @notice Deactivate a handler
     * @param handlerAddress Handler address to deactivate
     */
    function deactivateHandler(address handlerAddress) external onlyAdmin {
        require(
            handlers[handlerAddress].isActive,
            "SupplyChain: handler not active"
        );

        handlers[handlerAddress].isActive = false;
        stats.registeredHandlers--;

        emit HandlerDeactivated(handlerAddress, msg.sender);
    }

    /**
     * @notice Self-register as a handler (requires admin approval)
     * @param name Handler name
     * @param handlerType Type of handler
     * @param location Location
     */
    function selfRegisterHandler(
        string memory name,
        string memory handlerType,
        string memory location
    ) external {
        require(
            !handlers[msg.sender].isActive,
            "SupplyChain: already registered"
        );
        require(bytes(name).length > 0, "SupplyChain: name required");

        // Register but inactive until admin approves
        handlers[msg.sender] = HandlerInfo({
            name: name,
            handlerType: handlerType,
            location: location,
            isActive: false,
            registeredAt: block.timestamp
        });

        _handlerAddresses.push(msg.sender);
    }

    /**
     * @notice Approve a pending handler registration
     * @param handlerAddress Handler to approve
     */
    function approveHandler(address handlerAddress) external onlyAdmin {
        require(
            handlers[handlerAddress].registeredAt != 0,
            "SupplyChain: handler not found"
        );
        require(
            !handlers[handlerAddress].isActive,
            "SupplyChain: already active"
        );

        handlers[handlerAddress].isActive = true;
        stats.registeredHandlers++;

        emit HandlerRegistered(
            handlerAddress,
            handlers[handlerAddress].name,
            handlers[handlerAddress].handlerType
        );
    }

    // ============ Tracking Functions ============

    /**
     * @notice Start tracking a product
     * @param productId Product ID to track
     * @param origin Origin location/manufacturer
     * @param destination Final destination
     * @return success True if tracking started
     */
    function startTracking(
        uint256 productId,
        string memory origin,
        string memory destination
    ) external onlyManagerOrAbove returns (bool) {
        require(productId != 0, "SupplyChain: invalid product ID");
        require(
            _records[productId].productId == 0,
            "SupplyChain: already tracked"
        );
        require(bytes(origin).length > 0, "SupplyChain: origin required");
        require(
            bytes(destination).length > 0,
            "SupplyChain: destination required"
        );

        bytes32 initialHash = keccak256(
            abi.encodePacked(
                productId,
                origin,
                destination,
                block.timestamp,
                msg.sender
            )
        );

        _records[productId] = SupplyChainRecord({
            productId: productId,
            origin: origin,
            destination: destination,
            events: new TrackingEvent[](0), // Events stored separately
            createdAt: block.timestamp,
            isComplete: false
        });

        // Record initial event
        _trackingEvents[productId].push(
            TrackingEvent({
                productId: productId,
                status: TrackingStatus.MANUFACTURED,
                location: origin,
                handler: handlers[msg.sender].isActive
                    ? handlers[msg.sender].name
                    : "System",
                notes: "Tracking initiated",
                timestamp: block.timestamp,
                previousHash: bytes32(0),
                currentHash: initialHash
            })
        );

        _currentStatus[productId] = TrackingStatus.MANUFACTURED;
        _trackedProducts.push(productId);
        _hashToProduct[initialHash] = productId;

        stats.totalTrackedProducts++;
        stats.activeShipments++;
        stats.totalEvents++;

        emit TrackingStarted(productId, origin, destination, initialHash);
        emit TrackingEventRecorded(
            productId,
            TrackingStatus.MANUFACTURED,
            origin,
            "System",
            initialHash
        );

        return true;
    }

    /**
     * @notice Record a tracking event
     * @param productId Product ID
     * @param status New status
     * @param location Current location
     * @param notes Additional notes
     */
    function recordEvent(
        uint256 productId,
        TrackingStatus status,
        string memory location,
        string memory notes
    ) external productTracked(productId) trackingActive(productId) {
        // Must be admin/manager OR active handler
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER) ||
                handlers[msg.sender].isActive,
            "SupplyChain: not authorized"
        );

        TrackingEvent[] storage events = _trackingEvents[productId];
        bytes32 previousHash = events.length > 0
            ? events[events.length - 1].currentHash
            : bytes32(0);

        bytes32 currentHash = keccak256(
            abi.encodePacked(
                productId,
                status,
                location,
                block.timestamp,
                previousHash,
                msg.sender
            )
        );

        string memory handlerName = handlers[msg.sender].isActive
            ? handlers[msg.sender].name
            : "System";

        events.push(
            TrackingEvent({
                productId: productId,
                status: status,
                location: location,
                handler: handlerName,
                notes: notes,
                timestamp: block.timestamp,
                previousHash: previousHash,
                currentHash: currentHash
            })
        );

        _currentStatus[productId] = status;
        _hashToProduct[currentHash] = productId;
        stats.totalEvents++;

        emit TrackingEventRecorded(
            productId,
            status,
            location,
            handlerName,
            currentHash
        );

        // Auto-complete if delivered or returned
        if (
            status == TrackingStatus.DELIVERED ||
            status == TrackingStatus.RETURNED
        ) {
            _completeTracking(productId);
        }
    }

    /**
     * @notice Record transit event
     * @param productId Product ID
     * @param fromLocation Origin location
     * @param toLocation Destination location
     * @param notes Notes
     */
    function recordTransit(
        uint256 productId,
        string memory fromLocation,
        string memory toLocation,
        string memory notes
    ) external productTracked(productId) trackingActive(productId) {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER) ||
                handlers[msg.sender].isActive,
            "SupplyChain: not authorized"
        );

        string memory transitNotes = string(
            abi.encodePacked(
                "Transit from ",
                fromLocation,
                " to ",
                toLocation,
                ". ",
                notes
            )
        );

        TrackingEvent[] storage events = _trackingEvents[productId];
        bytes32 previousHash = events.length > 0
            ? events[events.length - 1].currentHash
            : bytes32(0);

        bytes32 currentHash = keccak256(
            abi.encodePacked(
                productId,
                TrackingStatus.IN_TRANSIT,
                toLocation,
                block.timestamp,
                previousHash
            )
        );

        string memory handlerName = handlers[msg.sender].isActive
            ? handlers[msg.sender].name
            : "System";

        events.push(
            TrackingEvent({
                productId: productId,
                status: TrackingStatus.IN_TRANSIT,
                location: toLocation,
                handler: handlerName,
                notes: transitNotes,
                timestamp: block.timestamp,
                previousHash: previousHash,
                currentHash: currentHash
            })
        );

        _currentStatus[productId] = TrackingStatus.IN_TRANSIT;
        _hashToProduct[currentHash] = productId;
        stats.totalEvents++;

        emit TrackingEventRecorded(
            productId,
            TrackingStatus.IN_TRANSIT,
            toLocation,
            handlerName,
            currentHash
        );
    }

    /**
     * @notice Record quality check
     * @param productId Product ID
     * @param location Check location
     * @param passed Whether quality check passed
     * @param details Check details
     */
    function recordQualityCheck(
        uint256 productId,
        string memory location,
        bool passed,
        string memory details
    )
        external
        productTracked(productId)
        trackingActive(productId)
        onlyManagerOrAbove
    {
        string memory notes = passed
            ? string(abi.encodePacked("Quality check PASSED. ", details))
            : string(abi.encodePacked("Quality check FAILED. ", details));

        TrackingEvent[] storage events = _trackingEvents[productId];
        bytes32 previousHash = events.length > 0
            ? events[events.length - 1].currentHash
            : bytes32(0);

        bytes32 currentHash = keccak256(
            abi.encodePacked(
                productId,
                TrackingStatus.QUALITY_CHECK,
                passed,
                block.timestamp,
                previousHash
            )
        );

        events.push(
            TrackingEvent({
                productId: productId,
                status: TrackingStatus.QUALITY_CHECK,
                location: location,
                handler: handlers[msg.sender].isActive
                    ? handlers[msg.sender].name
                    : "Inspector",
                notes: notes,
                timestamp: block.timestamp,
                previousHash: previousHash,
                currentHash: currentHash
            })
        );

        _currentStatus[productId] = TrackingStatus.QUALITY_CHECK;
        _hashToProduct[currentHash] = productId;
        stats.totalEvents++;

        emit TrackingEventRecorded(
            productId,
            TrackingStatus.QUALITY_CHECK,
            location,
            "Inspector",
            currentHash
        );
    }

    /**
     * @notice Complete tracking manually
     * @param productId Product ID
     */
    function completeTracking(
        uint256 productId
    )
        external
        onlyManagerOrAbove
        productTracked(productId)
        trackingActive(productId)
    {
        _completeTracking(productId);
    }

    // ============ Verification Functions ============

    /**
     * @notice Verify complete provenance chain
     * @param productId Product ID
     * @return isValid True if chain is valid
     * @return eventCount Number of events in chain
     */
    function verifyProvenance(
        uint256 productId
    )
        external
        view
        productTracked(productId)
        returns (bool isValid, uint256 eventCount)
    {
        TrackingEvent[] storage events = _trackingEvents[productId];
        eventCount = events.length;

        if (eventCount == 0) return (false, 0);

        // Verify first event has no previous hash
        if (events[0].previousHash != bytes32(0)) return (false, eventCount);

        // Verify hash chain
        for (uint256 i = 1; i < eventCount; i++) {
            if (events[i].previousHash != events[i - 1].currentHash) {
                return (false, eventCount);
            }
        }

        return (true, eventCount);
    }

    /**
     * @notice Verify a specific event hash
     * @param productId Product ID
     * @param eventIndex Event index
     * @param providedHash Hash to verify
     * @return bool True if valid
     */
    function verifyEventHash(
        uint256 productId,
        uint256 eventIndex,
        bytes32 providedHash
    ) external view productTracked(productId) returns (bool) {
        require(
            eventIndex < _trackingEvents[productId].length,
            "SupplyChain: invalid event index"
        );
        return
            _trackingEvents[productId][eventIndex].currentHash == providedHash;
    }

    /**
     * @notice Get product ID by hash
     * @param hash Event hash
     * @return productId Product ID (0 if not found)
     */
    function getProductByHash(bytes32 hash) external view returns (uint256) {
        return _hashToProduct[hash];
    }

    // ============ View Functions ============

    /**
     * @notice Get tracking record
     * @param productId Product ID
     * @return origin Origin location
     * @return destination Destination
     * @return createdAt Creation timestamp
     * @return isComplete Completion status
     * @return eventCount Number of events
     */
    function getTrackingRecord(
        uint256 productId
    )
        external
        view
        productTracked(productId)
        returns (
            string memory origin,
            string memory destination,
            uint256 createdAt,
            bool isComplete,
            uint256 eventCount
        )
    {
        SupplyChainRecord storage record = _records[productId];
        return (
            record.origin,
            record.destination,
            record.createdAt,
            record.isComplete,
            _trackingEvents[productId].length
        );
    }

    /**
     * @notice Get all tracking events for a product
     * @param productId Product ID
     * @return TrackingEvent[] Array of events
     */
    function getTrackingEvents(
        uint256 productId
    ) external view productTracked(productId) returns (TrackingEvent[] memory) {
        return _trackingEvents[productId];
    }

    /**
     * @notice Get current status of a product
     * @param productId Product ID
     * @return TrackingStatus Current status
     */
    function getCurrentStatus(
        uint256 productId
    ) external view productTracked(productId) returns (TrackingStatus) {
        return _currentStatus[productId];
    }

    /**
     * @notice Get latest tracking event
     * @param productId Product ID
     * @return TrackingEvent Latest event
     */
    function getLatestEvent(
        uint256 productId
    ) external view productTracked(productId) returns (TrackingEvent memory) {
        TrackingEvent[] storage events = _trackingEvents[productId];
        require(events.length > 0, "SupplyChain: no events");
        return events[events.length - 1];
    }

    /**
     * @notice Get all tracked product IDs
     * @return uint256[] Array of product IDs
     */
    function getAllTrackedProducts() external view returns (uint256[] memory) {
        return _trackedProducts;
    }

    /**
     * @notice Get active shipments
     * @return uint256[] Array of product IDs with active tracking
     */
    function getActiveShipments() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _trackedProducts.length; i++) {
            if (!_records[_trackedProducts[i]].isComplete) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _trackedProducts.length; i++) {
            if (!_records[_trackedProducts[i]].isComplete) {
                result[index] = _trackedProducts[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all registered handlers
     * @return address[] Array of handler addresses
     */
    function getAllHandlers() external view returns (address[] memory) {
        return _handlerAddresses;
    }

    /**
     * @notice Get handler info
     * @param handlerAddress Handler address
     * @return HandlerInfo Handler information
     */
    function getHandlerInfo(
        address handlerAddress
    ) external view returns (HandlerInfo memory) {
        return handlers[handlerAddress];
    }

    /**
     * @notice Get supply chain statistics
     * @return SupplyChainStats Statistics struct
     */
    function getSupplyChainStats()
        external
        view
        returns (SupplyChainStats memory)
    {
        return stats;
    }

    /**
     * @notice Check if product is being tracked
     * @param productId Product ID
     * @return bool True if tracked
     */
    function isTracked(uint256 productId) external view returns (bool) {
        return _records[productId].productId != 0;
    }

    // ============ Internal Functions ============

    function _completeTracking(uint256 productId) internal {
        _records[productId].isComplete = true;

        TrackingEvent[] storage events = _trackingEvents[productId];
        bytes32 finalHash = events.length > 0
            ? events[events.length - 1].currentHash
            : bytes32(0);

        stats.activeShipments--;
        stats.completedShipments++;

        emit TrackingCompleted(productId, events.length, finalHash);
    }
}
