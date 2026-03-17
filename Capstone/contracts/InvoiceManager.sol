// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";
import "./BlockERPCore.sol";

/**
 * @title InvoiceManager
 * @author BlockERP Team
 * @notice Manages invoices with full lifecycle, payments, and blockchain verification
 * @dev Integrates with BlockERPCore for access control
 */
contract InvoiceManager is IInvoiceTypes {
    // ============ State Variables ============

    /// @notice Reference to core contract
    BlockERPCore public immutable core;

    /// @notice Invoice counter for unique IDs
    uint256 private _invoiceIdCounter;

    /// @notice Mapping of invoice ID to Invoice data
    mapping(uint256 => Invoice) private _invoices;

    /// @notice Mapping of invoice ID to items
    mapping(uint256 => InvoiceItem[]) private _invoiceItems;

    /// @notice Mapping of customer ID to their invoice IDs
    mapping(uint256 => uint256[]) private _customerInvoices;

    /// @notice Mapping of order ID to invoice ID
    mapping(uint256 => uint256) private _orderToInvoice;

    /// @notice Array of all invoice IDs
    uint256[] private _allInvoiceIds;

    /// @notice Payment records
    struct PaymentRecord {
        uint256 invoiceId;
        uint256 amount;
        string paymentMethod;
        string transactionRef;
        uint256 timestamp;
        address recordedBy;
    }

    /// @notice Mapping of invoice ID to payment records
    mapping(uint256 => PaymentRecord[]) private _paymentHistory;

    /// @notice Invoice statistics
    struct InvoiceStats {
        uint256 totalInvoices;
        uint256 draftInvoices;
        uint256 sentInvoices;
        uint256 paidInvoices;
        uint256 overdueInvoices;
        uint256 cancelledInvoices;
        uint256 totalValue;
        uint256 paidValue;
        uint256 overdueValue;
        uint256 pendingValue;
    }

    InvoiceStats public stats;

    // ============ Events ============

    event InvoiceCreated(
        uint256 indexed invoiceId,
        uint256 indexed customerId,
        uint256 indexed orderId,
        uint256 totalAmount,
        string blockchainHash
    );

    event InvoiceStatusUpdated(
        uint256 indexed invoiceId,
        InvoiceStatus previousStatus,
        InvoiceStatus newStatus,
        address indexed updatedBy
    );

    event InvoicePaid(
        uint256 indexed invoiceId,
        uint256 amount,
        string paymentMethod,
        address indexed recordedBy
    );

    event InvoiceSent(
        uint256 indexed invoiceId,
        address indexed sentBy,
        uint256 timestamp
    );

    event InvoiceOverdue(uint256 indexed invoiceId, uint256 daysOverdue);

    event PaymentRecorded(
        uint256 indexed invoiceId,
        uint256 amount,
        string transactionRef
    );

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.ADMIN),
            "InvoiceManager: caller is not admin"
        );
        _;
    }

    modifier onlyManagerOrAbove() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER),
            "InvoiceManager: insufficient permissions"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!core.paused(), "InvoiceManager: system is paused");
        _;
    }

    modifier invoiceExists(uint256 invoiceId) {
        require(
            _invoices[invoiceId].id != 0,
            "InvoiceManager: invoice does not exist"
        );
        _;
    }

    // ============ Constructor ============

    constructor(address _coreAddress) {
        require(
            _coreAddress != address(0),
            "InvoiceManager: invalid core address"
        );
        core = BlockERPCore(_coreAddress);
        _invoiceIdCounter = 5000; // Start from 5000 for readability
    }

    // ============ Invoice Management Functions ============

    /**
     * @notice Create a new invoice
     * @param orderId Associated order ID (0 if standalone)
     * @param customerId Customer identifier
     * @param customerName Customer name
     * @param items Invoice line items
     * @param taxRate Tax rate in basis points (e.g., 850 = 8.5%)
     * @param discountRate Discount rate in basis points
     * @param dueDate Due date timestamp
     * @return invoiceId The created invoice ID
     */
    function createInvoice(
        uint256 orderId,
        uint256 customerId,
        string memory customerName,
        InvoiceItem[] memory items,
        uint256 taxRate,
        uint256 discountRate,
        uint256 dueDate
    ) external onlyManagerOrAbove whenNotPaused returns (uint256) {
        require(items.length > 0, "InvoiceManager: invoice must have items");
        require(
            dueDate > block.timestamp,
            "InvoiceManager: due date must be in future"
        );
        require(
            bytes(customerName).length > 0,
            "InvoiceManager: customer name required"
        );

        if (orderId != 0) {
            require(
                _orderToInvoice[orderId] == 0,
                "InvoiceManager: order already has invoice"
            );
        }

        _invoiceIdCounter++;
        uint256 invoiceId = _invoiceIdCounter;

        // Calculate amounts
        uint256 subtotal = 0;
        for (uint256 i = 0; i < items.length; i++) {
            require(items[i].quantity > 0, "InvoiceManager: invalid quantity");
            _invoiceItems[invoiceId].push(items[i]);
            subtotal += items[i].totalPrice;
        }

        uint256 discountAmount = (subtotal * discountRate) / 10000;
        uint256 taxableAmount = subtotal - discountAmount;
        uint256 taxAmount = (taxableAmount * taxRate) / 10000;
        uint256 totalAmount = taxableAmount + taxAmount;

        // Generate blockchain hash
        bytes32 invoiceHash = keccak256(
            abi.encodePacked(
                invoiceId,
                customerId,
                totalAmount,
                block.timestamp,
                msg.sender
            )
        );

        _invoices[invoiceId] = Invoice({
            id: invoiceId,
            orderId: orderId,
            customerId: customerId,
            customerName: customerName,
            items: new InvoiceItem[](0), // Stored separately
            subtotal: subtotal,
            taxRate: taxRate,
            taxAmount: taxAmount,
            discountRate: discountRate,
            discountAmount: discountAmount,
            totalAmount: totalAmount,
            status: InvoiceStatus.DRAFT,
            issueDate: block.timestamp,
            dueDate: dueDate,
            paidDate: 0,
            blockchainHash: _bytes32ToString(invoiceHash)
        });

        if (orderId != 0) {
            _orderToInvoice[orderId] = invoiceId;
        }

        _customerInvoices[customerId].push(invoiceId);
        _allInvoiceIds.push(invoiceId);

        // Update stats
        stats.totalInvoices++;
        stats.draftInvoices++;
        stats.totalValue += totalAmount;
        stats.pendingValue += totalAmount;

        emit InvoiceCreated(
            invoiceId,
            customerId,
            orderId,
            totalAmount,
            _invoices[invoiceId].blockchainHash
        );

        return invoiceId;
    }

    /**
     * @notice Send an invoice to customer
     * @param invoiceId The invoice ID
     */
    function sendInvoice(
        uint256 invoiceId
    ) external onlyManagerOrAbove whenNotPaused invoiceExists(invoiceId) {
        Invoice storage invoice = _invoices[invoiceId];
        require(
            invoice.status == InvoiceStatus.DRAFT,
            "InvoiceManager: invoice not in draft status"
        );

        invoice.status = InvoiceStatus.SENT;
        invoice.issueDate = block.timestamp;

        stats.draftInvoices--;
        stats.sentInvoices++;

        emit InvoiceSent(invoiceId, msg.sender, block.timestamp);
        emit InvoiceStatusUpdated(
            invoiceId,
            InvoiceStatus.DRAFT,
            InvoiceStatus.SENT,
            msg.sender
        );
    }

    /**
     * @notice Record payment for an invoice
     * @param invoiceId The invoice ID
     * @param amount Payment amount
     * @param paymentMethod Payment method (e.g., "Credit Card", "Wire Transfer", "Crypto")
     * @param transactionRef External transaction reference
     */
    function recordPayment(
        uint256 invoiceId,
        uint256 amount,
        string memory paymentMethod,
        string memory transactionRef
    ) external onlyManagerOrAbove whenNotPaused invoiceExists(invoiceId) {
        Invoice storage invoice = _invoices[invoiceId];

        require(
            invoice.status == InvoiceStatus.SENT ||
                invoice.status == InvoiceStatus.OVERDUE,
            "InvoiceManager: invoice not payable"
        );
        require(amount > 0, "InvoiceManager: payment amount must be positive");
        require(
            amount <= invoice.totalAmount,
            "InvoiceManager: payment exceeds invoice amount"
        );

        // Record payment
        _paymentHistory[invoiceId].push(
            PaymentRecord({
                invoiceId: invoiceId,
                amount: amount,
                paymentMethod: paymentMethod,
                transactionRef: transactionRef,
                timestamp: block.timestamp,
                recordedBy: msg.sender
            })
        );

        // Check if fully paid
        uint256 totalPaid = 0;
        for (uint256 i = 0; i < _paymentHistory[invoiceId].length; i++) {
            totalPaid += _paymentHistory[invoiceId][i].amount;
        }

        if (totalPaid >= invoice.totalAmount) {
            InvoiceStatus previousStatus = invoice.status;
            invoice.status = InvoiceStatus.PAID;
            invoice.paidDate = block.timestamp;

            // Update stats
            if (previousStatus == InvoiceStatus.SENT) stats.sentInvoices--;
            else if (previousStatus == InvoiceStatus.OVERDUE) {
                stats.overdueInvoices--;
                stats.overdueValue -= invoice.totalAmount;
            }
            stats.paidInvoices++;
            stats.paidValue += invoice.totalAmount;
            stats.pendingValue -= invoice.totalAmount;

            emit InvoicePaid(invoiceId, totalPaid, paymentMethod, msg.sender);
            emit InvoiceStatusUpdated(
                invoiceId,
                previousStatus,
                InvoiceStatus.PAID,
                msg.sender
            );
        }

        emit PaymentRecorded(invoiceId, amount, transactionRef);
    }

    /**
     * @notice Mark an invoice as overdue
     * @param invoiceId The invoice ID
     */
    function markOverdue(
        uint256 invoiceId
    ) external onlyManagerOrAbove invoiceExists(invoiceId) {
        Invoice storage invoice = _invoices[invoiceId];
        require(
            invoice.status == InvoiceStatus.SENT,
            "InvoiceManager: invoice not in sent status"
        );
        require(
            block.timestamp > invoice.dueDate,
            "InvoiceManager: invoice not yet due"
        );

        invoice.status = InvoiceStatus.OVERDUE;

        stats.sentInvoices--;
        stats.overdueInvoices++;
        stats.overdueValue += invoice.totalAmount;

        uint256 daysOverdue = (block.timestamp - invoice.dueDate) / 1 days;

        emit InvoiceOverdue(invoiceId, daysOverdue);
        emit InvoiceStatusUpdated(
            invoiceId,
            InvoiceStatus.SENT,
            InvoiceStatus.OVERDUE,
            msg.sender
        );
    }

    /**
     * @notice Cancel an invoice
     * @param invoiceId The invoice ID
     */
    function cancelInvoice(
        uint256 invoiceId
    ) external onlyManagerOrAbove whenNotPaused invoiceExists(invoiceId) {
        Invoice storage invoice = _invoices[invoiceId];
        require(
            invoice.status == InvoiceStatus.DRAFT ||
                invoice.status == InvoiceStatus.SENT,
            "InvoiceManager: invoice cannot be cancelled"
        );

        InvoiceStatus previousStatus = invoice.status;
        invoice.status = InvoiceStatus.CANCELLED;

        // Update stats
        if (previousStatus == InvoiceStatus.DRAFT) stats.draftInvoices--;
        else if (previousStatus == InvoiceStatus.SENT) stats.sentInvoices--;
        stats.cancelledInvoices++;
        stats.pendingValue -= invoice.totalAmount;

        emit InvoiceStatusUpdated(
            invoiceId,
            previousStatus,
            InvoiceStatus.CANCELLED,
            msg.sender
        );
    }

    /**
     * @notice Batch check overdue invoices
     */
    function checkOverdueInvoices() external onlyManagerOrAbove {
        for (uint256 i = 0; i < _allInvoiceIds.length; i++) {
            uint256 invoiceId = _allInvoiceIds[i];
            Invoice storage invoice = _invoices[invoiceId];

            if (
                invoice.status == InvoiceStatus.SENT &&
                block.timestamp > invoice.dueDate
            ) {
                invoice.status = InvoiceStatus.OVERDUE;
                stats.sentInvoices--;
                stats.overdueInvoices++;
                stats.overdueValue += invoice.totalAmount;

                uint256 daysOverdue = (block.timestamp - invoice.dueDate) /
                    1 days;
                emit InvoiceOverdue(invoiceId, daysOverdue);
            }
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get invoice by ID
     * @param invoiceId The invoice ID
     * @return id Invoice ID
     * @return orderId Associated order ID
     * @return customerId Customer ID
     * @return customerName Customer name
     * @return subtotal Subtotal amount
     * @return taxAmount Tax amount
     * @return discountAmount Discount amount
     * @return totalAmount Total amount
     * @return status Invoice status
     * @return issueDate Issue date timestamp
     * @return dueDate Due date timestamp
     * @return paidDate Payment date timestamp
     * @return blockchainHash Blockchain verification hash
     */
    function getInvoice(
        uint256 invoiceId
    )
        external
        view
        invoiceExists(invoiceId)
        returns (
            uint256 id,
            uint256 orderId,
            uint256 customerId,
            string memory customerName,
            uint256 subtotal,
            uint256 taxAmount,
            uint256 discountAmount,
            uint256 totalAmount,
            InvoiceStatus status,
            uint256 issueDate,
            uint256 dueDate,
            uint256 paidDate,
            string memory blockchainHash
        )
    {
        Invoice storage invoice = _invoices[invoiceId];
        return (
            invoice.id,
            invoice.orderId,
            invoice.customerId,
            invoice.customerName,
            invoice.subtotal,
            invoice.taxAmount,
            invoice.discountAmount,
            invoice.totalAmount,
            invoice.status,
            invoice.issueDate,
            invoice.dueDate,
            invoice.paidDate,
            invoice.blockchainHash
        );
    }

    /**
     * @notice Get invoice items
     * @param invoiceId The invoice ID
     * @return InvoiceItem[] Array of items
     */
    function getInvoiceItems(
        uint256 invoiceId
    ) external view invoiceExists(invoiceId) returns (InvoiceItem[] memory) {
        return _invoiceItems[invoiceId];
    }

    /**
     * @notice Get payment history for an invoice
     * @param invoiceId The invoice ID
     * @return PaymentRecord[] Array of payment records
     */
    function getPaymentHistory(
        uint256 invoiceId
    ) external view invoiceExists(invoiceId) returns (PaymentRecord[] memory) {
        return _paymentHistory[invoiceId];
    }

    /**
     * @notice Get invoices by customer
     * @param customerId Customer ID
     * @return uint256[] Array of invoice IDs
     */
    function getCustomerInvoices(
        uint256 customerId
    ) external view returns (uint256[] memory) {
        return _customerInvoices[customerId];
    }

    /**
     * @notice Get invoice by order ID
     * @param orderId Order ID
     * @return uint256 Invoice ID
     */
    function getInvoiceByOrder(
        uint256 orderId
    ) external view returns (uint256) {
        return _orderToInvoice[orderId];
    }

    /**
     * @notice Get invoices by status
     * @param status Invoice status to filter
     * @return uint256[] Array of invoice IDs
     */
    function getInvoicesByStatus(
        InvoiceStatus status
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allInvoiceIds.length; i++) {
            if (_invoices[_allInvoiceIds[i]].status == status) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allInvoiceIds.length; i++) {
            if (_invoices[_allInvoiceIds[i]].status == status) {
                result[index] = _allInvoiceIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all invoice IDs
     * @return uint256[] Array of all invoice IDs
     */
    function getAllInvoiceIds() external view returns (uint256[] memory) {
        return _allInvoiceIds;
    }

    /**
     * @notice Get invoice count
     * @return uint256 Total number of invoices
     */
    function getInvoiceCount() external view returns (uint256) {
        return _allInvoiceIds.length;
    }

    /**
     * @notice Get invoice statistics
     * @return InvoiceStats struct
     */
    function getInvoiceStats() external view returns (InvoiceStats memory) {
        return stats;
    }

    /**
     * @notice Get overdue invoices
     * @return uint256[] Array of overdue invoice IDs
     */
    function getOverdueInvoices() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allInvoiceIds.length; i++) {
            Invoice storage invoice = _invoices[_allInvoiceIds[i]];
            if (
                invoice.status == InvoiceStatus.OVERDUE ||
                (invoice.status == InvoiceStatus.SENT &&
                    block.timestamp > invoice.dueDate)
            ) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allInvoiceIds.length; i++) {
            Invoice storage invoice = _invoices[_allInvoiceIds[i]];
            if (
                invoice.status == InvoiceStatus.OVERDUE ||
                (invoice.status == InvoiceStatus.SENT &&
                    block.timestamp > invoice.dueDate)
            ) {
                result[index] = _allInvoiceIds[i];
                index++;
            }
        }

        return result;
    }

    // ============ Internal Functions ============

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
