// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IBlockERP Interface
 * @notice Core interfaces for the BlockERP system
 * @dev All modules must implement relevant interfaces for interoperability
 */

/// @notice Role-based access control interface
interface IAccessControl {
    enum Role {
        NONE,
        VIEWER,
        MANAGER,
        ADMIN
    }

    event RoleGranted(
        address indexed account,
        Role role,
        address indexed grantor
    );
    event RoleRevoked(
        address indexed account,
        Role role,
        address indexed revoker
    );

    function grantRole(address account, Role role) external;

    function revokeRole(address account) external;

    function hasRole(address account, Role role) external view returns (bool);

    function getRole(address account) external view returns (Role);
}

/// @notice Order status enumeration
interface IOrderTypes {
    enum OrderStatus {
        PENDING,
        PROCESSING,
        SHIPPED,
        DELIVERED,
        CANCELLED,
        REFUNDED
    }

    struct OrderItem {
        uint256 productId;
        string productName;
        string sku;
        uint256 quantity;
        uint256 unitPrice;
        uint256 totalPrice;
    }

    struct Order {
        uint256 id;
        uint256 customerId;
        string customerName;
        OrderItem[] items;
        uint256 totalAmount;
        OrderStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        string blockchainHash;
        bool verified;
    }
}

/// @notice Invoice status enumeration
interface IInvoiceTypes {
    enum InvoiceStatus {
        DRAFT,
        SENT,
        PAID,
        OVERDUE,
        CANCELLED,
        REFUNDED
    }

    struct InvoiceItem {
        uint256 productId;
        string description;
        uint256 quantity;
        uint256 unitPrice;
        uint256 totalPrice;
    }

    struct Invoice {
        uint256 id;
        uint256 orderId;
        uint256 customerId;
        string customerName;
        InvoiceItem[] items;
        uint256 subtotal;
        uint256 taxRate;
        uint256 taxAmount;
        uint256 discountRate;
        uint256 discountAmount;
        uint256 totalAmount;
        InvoiceStatus status;
        uint256 issueDate;
        uint256 dueDate;
        uint256 paidDate;
        string blockchainHash;
    }
}

/// @notice Product/Inventory types
interface IInventoryTypes {
    enum ProductStatus {
        IN_STOCK,
        LOW_STOCK,
        OUT_OF_STOCK,
        DISCONTINUED
    }

    struct Product {
        uint256 id;
        string name;
        string sku;
        string category;
        uint256 price;
        uint256 stock;
        uint256 reorderLevel;
        ProductStatus status;
        string batchNumber;
        uint256 manufactureDate;
        uint256 expiryDate;
        string qrCodeHash;
        bool isActive;
    }

    struct StockMovement {
        uint256 productId;
        int256 quantityChange;
        string movementType; // "IN", "OUT", "ADJUSTMENT"
        string reason;
        uint256 timestamp;
        address initiator;
    }
}

/// @notice Customer types
interface ICustomerTypes {
    enum CustomerStatus {
        LEAD,
        PROSPECT,
        ACTIVE,
        INACTIVE,
        CHURNED
    }

    enum CustomerSegment {
        INDIVIDUAL,
        STARTUP,
        BUSINESS,
        ENTERPRISE
    }

    struct Customer {
        uint256 id;
        string name;
        string email;
        string company;
        CustomerStatus status;
        CustomerSegment segment;
        uint256 lifetimeValue;
        uint256 createdAt;
        uint256 lastOrderAt;
        bool isActive;
    }
}

/// @notice Audit log types
interface IAuditTypes {
    enum AuditAction {
        CREATE,
        UPDATE,
        DELETE,
        STATUS_CHANGE,
        TRANSFER,
        VERIFICATION
    }

    struct AuditEntry {
        uint256 id;
        address user;
        string userName;
        AuditAction action;
        string entityType;
        uint256 entityId;
        string details;
        bytes32 dataHash;
        uint256 timestamp;
        uint256 blockNumber;
    }
}

/// @notice Supply chain tracking types
interface ISupplyChainTypes {
    enum TrackingStatus {
        MANUFACTURED,
        IN_TRANSIT,
        AT_WAREHOUSE,
        QUALITY_CHECK,
        READY_FOR_DISPATCH,
        DISPATCHED,
        IN_DELIVERY,
        DELIVERED,
        RETURNED
    }

    struct TrackingEvent {
        uint256 productId;
        TrackingStatus status;
        string location;
        string handler;
        string notes;
        uint256 timestamp;
        bytes32 previousHash;
        bytes32 currentHash;
    }

    struct SupplyChainRecord {
        uint256 productId;
        string origin;
        string destination;
        TrackingEvent[] events;
        uint256 createdAt;
        bool isComplete;
    }
}
