// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";
import "./BlockERPCore.sol";

/**
 * @title OrderManager
 * @author BlockERP Team
 * @notice Manages orders with full lifecycle tracking and blockchain verification
 * @dev Integrates with BlockERPCore for access control
 */
contract OrderManager is IOrderTypes {
    // ============ State Variables ============

    /// @notice Reference to core contract
    BlockERPCore public immutable core;

    /// @notice Order counter for unique IDs
    uint256 private _orderIdCounter;

    /// @notice Mapping of order ID to Order data
    mapping(uint256 => Order) private _orders;

    /// @notice Mapping of order ID to items (separate storage for array)
    mapping(uint256 => OrderItem[]) private _orderItems;

    /// @notice Mapping of customer ID to their order IDs
    mapping(uint256 => uint256[]) private _customerOrders;

    /// @notice Array of all order IDs
    uint256[] private _allOrderIds;

    /// @notice Mapping of blockchain hash to order ID
    mapping(bytes32 => uint256) private _hashToOrder;

    /// @notice Order statistics
    struct OrderStats {
        uint256 totalOrders;
        uint256 pendingOrders;
        uint256 processingOrders;
        uint256 shippedOrders;
        uint256 deliveredOrders;
        uint256 cancelledOrders;
        uint256 totalRevenue;
    }

    OrderStats public stats;

    // ============ Events ============

    event OrderCreated(
        uint256 indexed orderId,
        uint256 indexed customerId,
        uint256 totalAmount,
        string blockchainHash
    );

    event OrderStatusUpdated(
        uint256 indexed orderId,
        OrderStatus previousStatus,
        OrderStatus newStatus,
        address indexed updatedBy
    );

    event OrderVerified(
        uint256 indexed orderId,
        bytes32 verificationHash,
        address indexed verifiedBy
    );

    event OrderCancelled(
        uint256 indexed orderId,
        string reason,
        address indexed cancelledBy
    );

    event OrderItemAdded(
        uint256 indexed orderId,
        uint256 indexed productId,
        uint256 quantity
    );

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.ADMIN),
            "OrderManager: caller is not admin"
        );
        _;
    }

    modifier onlyManagerOrAbove() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER),
            "OrderManager: insufficient permissions"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!core.paused(), "OrderManager: system is paused");
        _;
    }

    modifier orderExists(uint256 orderId) {
        require(_orders[orderId].id != 0, "OrderManager: order does not exist");
        _;
    }

    // ============ Constructor ============

    constructor(address _coreAddress) {
        require(
            _coreAddress != address(0),
            "OrderManager: invalid core address"
        );
        core = BlockERPCore(_coreAddress);
        _orderIdCounter = 1000; // Start from 1000 for readability
    }

    // ============ Order Management Functions ============

    /**
     * @notice Create a new order
     * @param customerId Customer identifier
     * @param customerName Customer name for display
     * @param items Array of order items
     * @return orderId The ID of the created order
     */
    function createOrder(
        uint256 customerId,
        string memory customerName,
        OrderItem[] memory items
    ) external onlyManagerOrAbove whenNotPaused returns (uint256) {
        require(items.length > 0, "OrderManager: order must have items");
        require(
            bytes(customerName).length > 0,
            "OrderManager: customer name required"
        );

        _orderIdCounter++;
        uint256 orderId = _orderIdCounter;

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < items.length; i++) {
            require(items[i].quantity > 0, "OrderManager: invalid quantity");
            _orderItems[orderId].push(items[i]);
            totalAmount += items[i].totalPrice;
            emit OrderItemAdded(orderId, items[i].productId, items[i].quantity);
        }

        // Generate blockchain hash
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                orderId,
                customerId,
                totalAmount,
                block.timestamp,
                msg.sender
            )
        );

        string memory hashString = _bytes32ToString(orderHash);

        _orders[orderId] = Order({
            id: orderId,
            customerId: customerId,
            customerName: customerName,
            items: new OrderItem[](0), // Items stored separately
            totalAmount: totalAmount,
            status: OrderStatus.PENDING,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            blockchainHash: hashString,
            verified: false
        });

        _customerOrders[customerId].push(orderId);
        _allOrderIds.push(orderId);
        _hashToOrder[orderHash] = orderId;

        // Update stats
        stats.totalOrders++;
        stats.pendingOrders++;
        stats.totalRevenue += totalAmount;

        emit OrderCreated(orderId, customerId, totalAmount, hashString);

        return orderId;
    }

    /**
     * @notice Update order status
     * @param orderId The order ID
     * @param newStatus The new status
     */
    function updateOrderStatus(
        uint256 orderId,
        OrderStatus newStatus
    ) external onlyManagerOrAbove whenNotPaused orderExists(orderId) {
        Order storage order = _orders[orderId];
        OrderStatus previousStatus = order.status;

        require(previousStatus != newStatus, "OrderManager: status unchanged");
        require(
            previousStatus != OrderStatus.CANCELLED &&
                previousStatus != OrderStatus.REFUNDED,
            "OrderManager: cannot update cancelled/refunded order"
        );

        // Validate status transitions
        _validateStatusTransition(previousStatus, newStatus);

        // Update counters
        _updateStatusCounters(previousStatus, newStatus);

        order.status = newStatus;
        order.updatedAt = block.timestamp;

        emit OrderStatusUpdated(orderId, previousStatus, newStatus, msg.sender);
    }

    /**
     * @notice Cancel an order
     * @param orderId The order ID
     * @param reason Cancellation reason
     */
    function cancelOrder(
        uint256 orderId,
        string memory reason
    ) external onlyManagerOrAbove whenNotPaused orderExists(orderId) {
        Order storage order = _orders[orderId];

        require(
            order.status == OrderStatus.PENDING ||
                order.status == OrderStatus.PROCESSING,
            "OrderManager: order cannot be cancelled"
        );

        OrderStatus previousStatus = order.status;
        _updateStatusCounters(previousStatus, OrderStatus.CANCELLED);

        order.status = OrderStatus.CANCELLED;
        order.updatedAt = block.timestamp;

        emit OrderCancelled(orderId, reason, msg.sender);
        emit OrderStatusUpdated(
            orderId,
            previousStatus,
            OrderStatus.CANCELLED,
            msg.sender
        );
    }

    /**
     * @notice Verify an order on blockchain
     * @param orderId The order ID
     */
    function verifyOrder(
        uint256 orderId
    ) external onlyAdmin orderExists(orderId) {
        Order storage order = _orders[orderId];
        require(!order.verified, "OrderManager: order already verified");

        bytes32 verificationHash = keccak256(
            abi.encodePacked(
                order.id,
                order.customerId,
                order.totalAmount,
                order.createdAt,
                block.timestamp,
                msg.sender
            )
        );

        order.verified = true;
        order.updatedAt = block.timestamp;

        emit OrderVerified(orderId, verificationHash, msg.sender);
    }

    /**
     * @notice Batch verify multiple orders
     * @param orderIds Array of order IDs to verify
     */
    function batchVerifyOrders(uint256[] memory orderIds) external onlyAdmin {
        for (uint256 i = 0; i < orderIds.length; i++) {
            if (
                _orders[orderIds[i]].id != 0 && !_orders[orderIds[i]].verified
            ) {
                _orders[orderIds[i]].verified = true;
                _orders[orderIds[i]].updatedAt = block.timestamp;

                bytes32 verificationHash = keccak256(
                    abi.encodePacked(orderIds[i], block.timestamp, msg.sender)
                );

                emit OrderVerified(orderIds[i], verificationHash, msg.sender);
            }
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get order by ID
     * @param orderId The order ID
     * @return id Order ID
     * @return customerId Customer ID
     * @return customerName Customer name
     * @return totalAmount Total order amount
     * @return status Order status
     * @return createdAt Creation timestamp
     * @return updatedAt Last update timestamp
     * @return blockchainHash Blockchain verification hash
     * @return verified Whether order is verified
     */
    function getOrder(
        uint256 orderId
    )
        external
        view
        orderExists(orderId)
        returns (
            uint256 id,
            uint256 customerId,
            string memory customerName,
            uint256 totalAmount,
            OrderStatus status,
            uint256 createdAt,
            uint256 updatedAt,
            string memory blockchainHash,
            bool verified
        )
    {
        Order storage order = _orders[orderId];
        return (
            order.id,
            order.customerId,
            order.customerName,
            order.totalAmount,
            order.status,
            order.createdAt,
            order.updatedAt,
            order.blockchainHash,
            order.verified
        );
    }

    /**
     * @notice Get order items
     * @param orderId The order ID
     * @return OrderItem[] Array of items
     */
    function getOrderItems(
        uint256 orderId
    ) external view orderExists(orderId) returns (OrderItem[] memory) {
        return _orderItems[orderId];
    }

    /**
     * @notice Get orders by customer
     * @param customerId Customer ID
     * @return uint256[] Array of order IDs
     */
    function getCustomerOrders(
        uint256 customerId
    ) external view returns (uint256[] memory) {
        return _customerOrders[customerId];
    }

    /**
     * @notice Get orders by status
     * @param status Order status to filter
     * @return uint256[] Array of order IDs
     */
    function getOrdersByStatus(
        OrderStatus status
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allOrderIds.length; i++) {
            if (_orders[_allOrderIds[i]].status == status) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allOrderIds.length; i++) {
            if (_orders[_allOrderIds[i]].status == status) {
                result[index] = _allOrderIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all order IDs
     * @return uint256[] Array of all order IDs
     */
    function getAllOrderIds() external view returns (uint256[] memory) {
        return _allOrderIds;
    }

    /**
     * @notice Get order count
     * @return uint256 Total number of orders
     */
    function getOrderCount() external view returns (uint256) {
        return _allOrderIds.length;
    }

    /**
     * @notice Get order statistics
     * @return OrderStats struct
     */
    function getOrderStats() external view returns (OrderStats memory) {
        return stats;
    }

    /**
     * @notice Verify order hash
     * @param orderId Order ID
     * @param providedHash Hash to verify
     * @return bool True if hash matches
     */
    function verifyOrderHash(
        uint256 orderId,
        bytes32 providedHash
    ) external view orderExists(orderId) returns (bool) {
        bytes32 storedHash = keccak256(
            abi.encodePacked(_orders[orderId].blockchainHash)
        );
        return storedHash == providedHash;
    }

    /**
     * @notice Get recent orders
     * @param count Number of orders to return
     * @return uint256[] Array of recent order IDs
     */
    function getRecentOrders(
        uint256 count
    ) external view returns (uint256[] memory) {
        uint256 total = _allOrderIds.length;
        uint256 resultCount = count > total ? total : count;
        uint256[] memory result = new uint256[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = _allOrderIds[total - 1 - i];
        }

        return result;
    }

    // ============ Internal Functions ============

    function _validateStatusTransition(
        OrderStatus from,
        OrderStatus to
    ) internal pure {
        if (from == OrderStatus.PENDING) {
            require(
                to == OrderStatus.PROCESSING || to == OrderStatus.CANCELLED,
                "OrderManager: invalid status transition from PENDING"
            );
        } else if (from == OrderStatus.PROCESSING) {
            require(
                to == OrderStatus.SHIPPED || to == OrderStatus.CANCELLED,
                "OrderManager: invalid status transition from PROCESSING"
            );
        } else if (from == OrderStatus.SHIPPED) {
            require(
                to == OrderStatus.DELIVERED || to == OrderStatus.REFUNDED,
                "OrderManager: invalid status transition from SHIPPED"
            );
        } else if (from == OrderStatus.DELIVERED) {
            require(
                to == OrderStatus.REFUNDED,
                "OrderManager: invalid status transition from DELIVERED"
            );
        }
    }

    function _updateStatusCounters(OrderStatus from, OrderStatus to) internal {
        // Decrement old status counter
        if (from == OrderStatus.PENDING) stats.pendingOrders--;
        else if (from == OrderStatus.PROCESSING) stats.processingOrders--;
        else if (from == OrderStatus.SHIPPED) stats.shippedOrders--;
        else if (from == OrderStatus.DELIVERED) stats.deliveredOrders--;

        // Increment new status counter
        if (to == OrderStatus.PENDING) stats.pendingOrders++;
        else if (to == OrderStatus.PROCESSING) stats.processingOrders++;
        else if (to == OrderStatus.SHIPPED) stats.shippedOrders++;
        else if (to == OrderStatus.DELIVERED) stats.deliveredOrders++;
        else if (to == OrderStatus.CANCELLED) stats.cancelledOrders++;
    }

    function _bytes32ToString(
        bytes32 _bytes32
    ) internal pure returns (string memory) {
        bytes memory bytesArray = new bytes(66);
        bytesArray[0] = "0";
        bytesArray[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            bytesArray[2 + i * 2] = _toHexChar(uint8(_bytes32[i] >> 4));
            bytesArray[3 + i * 2] = _toHexChar(uint8(_bytes32[i] & 0x0f));
        }
        return string(bytesArray);
    }

    function _toHexChar(uint8 _value) internal pure returns (bytes1) {
        if (_value < 10) {
            return bytes1(_value + 48);
        } else {
            return bytes1(_value + 87);
        }
    }
}
