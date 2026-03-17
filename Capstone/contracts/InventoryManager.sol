// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";
import "./BlockERPCore.sol";

/**
 * @title InventoryManager
 * @author BlockERP Team
 * @notice Manages products and inventory with stock tracking, reorder alerts, and QR codes
 * @dev Integrates with BlockERPCore for access control
 */
contract InventoryManager is IInventoryTypes {
    // ============ State Variables ============

    /// @notice Reference to core contract
    BlockERPCore public immutable core;

    /// @notice Product counter for unique IDs
    uint256 private _productIdCounter;

    /// @notice Mapping of product ID to Product data
    mapping(uint256 => Product) private _products;

    /// @notice Mapping of SKU to product ID
    mapping(string => uint256) private _skuToProduct;

    /// @notice Mapping of category to product IDs
    mapping(string => uint256[]) private _categoryProducts;

    /// @notice Array of all product IDs
    uint256[] private _allProductIds;

    /// @notice Stock movement history per product
    mapping(uint256 => StockMovement[]) private _stockHistory;

    /// @notice QR code hash to product ID mapping
    mapping(bytes32 => uint256) private _qrToProduct;

    /// @notice All categories
    string[] private _categories;
    mapping(string => bool) private _categoryExists;

    /// @notice Inventory statistics
    struct InventoryStats {
        uint256 totalProducts;
        uint256 activeProducts;
        uint256 inStockProducts;
        uint256 lowStockProducts;
        uint256 outOfStockProducts;
        uint256 discontinuedProducts;
        uint256 totalValue;
        uint256 totalUnits;
    }

    InventoryStats public stats;

    /// @notice Reorder configuration
    struct ReorderConfig {
        bool autoReorder;
        uint256 defaultReorderQuantity;
        address reorderNotificationAddress;
    }

    ReorderConfig public reorderConfig;

    // ============ Events ============

    event ProductCreated(
        uint256 indexed productId,
        string name,
        string sku,
        string category,
        string qrCodeHash
    );

    event ProductUpdated(
        uint256 indexed productId,
        string field,
        address indexed updatedBy
    );

    event StockUpdated(
        uint256 indexed productId,
        int256 quantityChange,
        string movementType,
        uint256 newStock,
        address indexed updatedBy
    );

    event StockStatusChanged(
        uint256 indexed productId,
        ProductStatus previousStatus,
        ProductStatus newStatus
    );

    event LowStockAlert(
        uint256 indexed productId,
        string sku,
        uint256 currentStock,
        uint256 reorderLevel
    );

    event ProductDiscontinued(
        uint256 indexed productId,
        string reason,
        address indexed discontinuedBy
    );

    event CategoryCreated(string category);

    event QRCodeGenerated(uint256 indexed productId, bytes32 qrHash);

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.ADMIN),
            "InventoryManager: caller is not admin"
        );
        _;
    }

    modifier onlyManagerOrAbove() {
        require(
            core.hasRole(msg.sender, IAccessControl.Role.MANAGER),
            "InventoryManager: insufficient permissions"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!core.paused(), "InventoryManager: system is paused");
        _;
    }

    modifier productExists(uint256 productId) {
        require(
            _products[productId].id != 0,
            "InventoryManager: product does not exist"
        );
        _;
    }

    modifier productActive(uint256 productId) {
        require(
            _products[productId].isActive,
            "InventoryManager: product not active"
        );
        _;
    }

    // ============ Constructor ============

    constructor(address _coreAddress) {
        require(
            _coreAddress != address(0),
            "InventoryManager: invalid core address"
        );
        core = BlockERPCore(_coreAddress);
        _productIdCounter = 100; // Start from 100 for readability

        reorderConfig = ReorderConfig({
            autoReorder: false,
            defaultReorderQuantity: 100,
            reorderNotificationAddress: address(0)
        });
    }

    // ============ Product Management Functions ============

    /**
     * @notice Create a new product
     * @param name Product name
     * @param sku Unique SKU code
     * @param category Product category
     * @param price Product price (in smallest unit)
     * @param initialStock Initial stock quantity
     * @param reorderLevel Stock level to trigger reorder alert
     * @param batchNumber Manufacturer batch number
     * @param manufactureDate Manufacturing date timestamp
     * @param expiryDate Expiry date timestamp (0 if no expiry)
     * @return productId The created product ID
     */
    function createProduct(
        string memory name,
        string memory sku,
        string memory category,
        uint256 price,
        uint256 initialStock,
        uint256 reorderLevel,
        string memory batchNumber,
        uint256 manufactureDate,
        uint256 expiryDate
    ) external onlyManagerOrAbove whenNotPaused returns (uint256) {
        require(bytes(name).length > 0, "InventoryManager: name required");
        require(bytes(sku).length > 0, "InventoryManager: SKU required");
        require(
            _skuToProduct[sku] == 0,
            "InventoryManager: SKU already exists"
        );
        require(price > 0, "InventoryManager: price must be positive");

        _productIdCounter++;
        uint256 productId = _productIdCounter;

        // Generate QR code hash
        bytes32 qrHash = keccak256(
            abi.encodePacked(productId, sku, name, block.timestamp)
        );

        // Determine initial status
        ProductStatus initialStatus;
        if (initialStock == 0) {
            initialStatus = ProductStatus.OUT_OF_STOCK;
            stats.outOfStockProducts++;
        } else if (initialStock <= reorderLevel) {
            initialStatus = ProductStatus.LOW_STOCK;
            stats.lowStockProducts++;
        } else {
            initialStatus = ProductStatus.IN_STOCK;
            stats.inStockProducts++;
        }

        _products[productId] = Product({
            id: productId,
            name: name,
            sku: sku,
            category: category,
            price: price,
            stock: initialStock,
            reorderLevel: reorderLevel,
            status: initialStatus,
            batchNumber: batchNumber,
            manufactureDate: manufactureDate,
            expiryDate: expiryDate,
            qrCodeHash: _bytes32ToString(qrHash),
            isActive: true
        });

        _skuToProduct[sku] = productId;
        _allProductIds.push(productId);
        _qrToProduct[qrHash] = productId;

        // Add to category
        if (!_categoryExists[category]) {
            _categories.push(category);
            _categoryExists[category] = true;
            emit CategoryCreated(category);
        }
        _categoryProducts[category].push(productId);

        // Record initial stock movement
        if (initialStock > 0) {
            _stockHistory[productId].push(
                StockMovement({
                    productId: productId,
                    quantityChange: int256(initialStock),
                    movementType: "IN",
                    reason: "Initial stock",
                    timestamp: block.timestamp,
                    initiator: msg.sender
                })
            );
        }

        // Update stats
        stats.totalProducts++;
        stats.activeProducts++;
        stats.totalUnits += initialStock;
        stats.totalValue += price * initialStock;

        emit ProductCreated(
            productId,
            name,
            sku,
            category,
            _products[productId].qrCodeHash
        );
        emit QRCodeGenerated(productId, qrHash);

        // Check for low stock alert
        if (initialStatus == ProductStatus.LOW_STOCK) {
            emit LowStockAlert(productId, sku, initialStock, reorderLevel);
        }

        return productId;
    }

    /**
     * @notice Update product information
     * @param productId Product ID
     * @param name New name
     * @param price New price
     * @param reorderLevel New reorder level
     */
    function updateProduct(
        uint256 productId,
        string memory name,
        uint256 price,
        uint256 reorderLevel
    )
        external
        onlyManagerOrAbove
        whenNotPaused
        productExists(productId)
        productActive(productId)
    {
        Product storage product = _products[productId];

        // Update value stat
        stats.totalValue -= product.price * product.stock;

        if (bytes(name).length > 0) {
            product.name = name;
            emit ProductUpdated(productId, "name", msg.sender);
        }
        if (price > 0) {
            product.price = price;
            emit ProductUpdated(productId, "price", msg.sender);
        }
        if (reorderLevel > 0) {
            product.reorderLevel = reorderLevel;
            emit ProductUpdated(productId, "reorderLevel", msg.sender);

            // Check if status needs update
            _updateStockStatus(productId);
        }

        // Recalculate value stat
        stats.totalValue += product.price * product.stock;
    }

    /**
     * @notice Add stock (restock)
     * @param productId Product ID
     * @param quantity Quantity to add
     * @param reason Reason for stock addition
     */
    function addStock(
        uint256 productId,
        uint256 quantity,
        string memory reason
    )
        external
        onlyManagerOrAbove
        whenNotPaused
        productExists(productId)
        productActive(productId)
    {
        require(quantity > 0, "InventoryManager: quantity must be positive");

        Product storage product = _products[productId];

        product.stock += quantity;
        stats.totalUnits += quantity;
        stats.totalValue += product.price * quantity;

        // Record stock movement
        _stockHistory[productId].push(
            StockMovement({
                productId: productId,
                quantityChange: int256(quantity),
                movementType: "IN",
                reason: reason,
                timestamp: block.timestamp,
                initiator: msg.sender
            })
        );

        _updateStockStatus(productId);

        emit StockUpdated(
            productId,
            int256(quantity),
            "IN",
            product.stock,
            msg.sender
        );
    }

    /**
     * @notice Remove stock (sale, damage, etc.)
     * @param productId Product ID
     * @param quantity Quantity to remove
     * @param reason Reason for stock removal
     */
    function removeStock(
        uint256 productId,
        uint256 quantity,
        string memory reason
    )
        external
        onlyManagerOrAbove
        whenNotPaused
        productExists(productId)
        productActive(productId)
    {
        require(quantity > 0, "InventoryManager: quantity must be positive");

        Product storage product = _products[productId];
        require(
            product.stock >= quantity,
            "InventoryManager: insufficient stock"
        );

        product.stock -= quantity;
        stats.totalUnits -= quantity;
        stats.totalValue -= product.price * quantity;

        // Record stock movement
        _stockHistory[productId].push(
            StockMovement({
                productId: productId,
                quantityChange: -int256(quantity),
                movementType: "OUT",
                reason: reason,
                timestamp: block.timestamp,
                initiator: msg.sender
            })
        );

        _updateStockStatus(productId);

        emit StockUpdated(
            productId,
            -int256(quantity),
            "OUT",
            product.stock,
            msg.sender
        );
    }

    /**
     * @notice Adjust stock (inventory correction)
     * @param productId Product ID
     * @param newStock New stock quantity (absolute)
     * @param reason Reason for adjustment
     */
    function adjustStock(
        uint256 productId,
        uint256 newStock,
        string memory reason
    ) external onlyAdmin whenNotPaused productExists(productId) {
        Product storage product = _products[productId];

        int256 difference = int256(newStock) - int256(product.stock);

        // Update stats
        if (difference > 0) {
            stats.totalUnits += uint256(difference);
            stats.totalValue += product.price * uint256(difference);
        } else if (difference < 0) {
            stats.totalUnits -= uint256(-difference);
            stats.totalValue -= product.price * uint256(-difference);
        }

        product.stock = newStock;

        // Record stock movement
        _stockHistory[productId].push(
            StockMovement({
                productId: productId,
                quantityChange: difference,
                movementType: "ADJUSTMENT",
                reason: reason,
                timestamp: block.timestamp,
                initiator: msg.sender
            })
        );

        _updateStockStatus(productId);

        emit StockUpdated(
            productId,
            difference,
            "ADJUSTMENT",
            newStock,
            msg.sender
        );
    }

    /**
     * @notice Discontinue a product
     * @param productId Product ID
     * @param reason Reason for discontinuing
     */
    function discontinueProduct(
        uint256 productId,
        string memory reason
    ) external onlyAdmin productExists(productId) {
        Product storage product = _products[productId];
        require(
            product.status != ProductStatus.DISCONTINUED,
            "InventoryManager: already discontinued"
        );

        ProductStatus previousStatus = product.status;
        product.status = ProductStatus.DISCONTINUED;
        product.isActive = false;

        // Update stats
        _decrementStatusCounter(previousStatus);
        stats.discontinuedProducts++;
        stats.activeProducts--;

        emit ProductDiscontinued(productId, reason, msg.sender);
        emit StockStatusChanged(
            productId,
            previousStatus,
            ProductStatus.DISCONTINUED
        );
    }

    /**
     * @notice Reactivate a discontinued product
     * @param productId Product ID
     */
    function reactivateProduct(
        uint256 productId
    ) external onlyAdmin productExists(productId) {
        Product storage product = _products[productId];
        require(
            product.status == ProductStatus.DISCONTINUED,
            "InventoryManager: not discontinued"
        );

        product.isActive = true;
        stats.discontinuedProducts--;
        stats.activeProducts++;

        _updateStockStatus(productId);
    }

    /**
     * @notice Generate new QR code for product
     * @param productId Product ID
     * @return qrHash New QR code hash
     */
    function regenerateQRCode(
        uint256 productId
    ) external onlyManagerOrAbove productExists(productId) returns (bytes32) {
        Product storage product = _products[productId];

        bytes32 newQrHash = keccak256(
            abi.encodePacked(
                productId,
                product.sku,
                product.name,
                block.timestamp,
                block.number
            )
        );

        product.qrCodeHash = _bytes32ToString(newQrHash);
        _qrToProduct[newQrHash] = productId;

        emit QRCodeGenerated(productId, newQrHash);

        return newQrHash;
    }

    // ============ View Functions ============

    /**
     * @notice Get product by ID
     * @param productId Product ID
     * @return Product struct data
     */
    function getProduct(
        uint256 productId
    ) external view productExists(productId) returns (Product memory) {
        return _products[productId];
    }

    /**
     * @notice Get product by SKU
     * @param sku Product SKU
     * @return Product struct data
     */
    function getProductBySKU(
        string memory sku
    ) external view returns (Product memory) {
        uint256 productId = _skuToProduct[sku];
        require(productId != 0, "InventoryManager: product not found");
        return _products[productId];
    }

    /**
     * @notice Get product by QR hash
     * @param qrHash QR code hash
     * @return Product struct data
     */
    function getProductByQR(
        bytes32 qrHash
    ) external view returns (Product memory) {
        uint256 productId = _qrToProduct[qrHash];
        require(productId != 0, "InventoryManager: product not found");
        return _products[productId];
    }

    /**
     * @notice Get stock history for a product
     * @param productId Product ID
     * @return StockMovement[] Array of movements
     */
    function getStockHistory(
        uint256 productId
    ) external view productExists(productId) returns (StockMovement[] memory) {
        return _stockHistory[productId];
    }

    /**
     * @notice Get products by category
     * @param category Category name
     * @return uint256[] Array of product IDs
     */
    function getProductsByCategory(
        string memory category
    ) external view returns (uint256[] memory) {
        return _categoryProducts[category];
    }

    /**
     * @notice Get all categories
     * @return string[] Array of category names
     */
    function getAllCategories() external view returns (string[] memory) {
        return _categories;
    }

    /**
     * @notice Get products by status
     * @param status Product status
     * @return uint256[] Array of product IDs
     */
    function getProductsByStatus(
        ProductStatus status
    ) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            if (_products[_allProductIds[i]].status == status) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            if (_products[_allProductIds[i]].status == status) {
                result[index] = _allProductIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get low stock products
     * @return uint256[] Array of product IDs
     */
    function getLowStockProducts() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            Product storage product = _products[_allProductIds[i]];
            if (product.isActive && product.stock <= product.reorderLevel) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            Product storage product = _products[_allProductIds[i]];
            if (product.isActive && product.stock <= product.reorderLevel) {
                result[index] = _allProductIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get expiring products
     * @param withinDays Number of days to check
     * @return uint256[] Array of product IDs
     */
    function getExpiringProducts(
        uint256 withinDays
    ) external view returns (uint256[] memory) {
        uint256 threshold = block.timestamp + (withinDays * 1 days);

        uint256 count = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            Product storage product = _products[_allProductIds[i]];
            if (
                product.isActive &&
                product.expiryDate != 0 &&
                product.expiryDate <= threshold
            ) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allProductIds.length; i++) {
            Product storage product = _products[_allProductIds[i]];
            if (
                product.isActive &&
                product.expiryDate != 0 &&
                product.expiryDate <= threshold
            ) {
                result[index] = _allProductIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all product IDs
     * @return uint256[] Array of all product IDs
     */
    function getAllProductIds() external view returns (uint256[] memory) {
        return _allProductIds;
    }

    /**
     * @notice Get inventory statistics
     * @return InventoryStats struct
     */
    function getInventoryStats() external view returns (InventoryStats memory) {
        return stats;
    }

    /**
     * @notice Check if SKU exists
     * @param sku SKU to check
     * @return bool True if exists
     */
    function skuExists(string memory sku) external view returns (bool) {
        return _skuToProduct[sku] != 0;
    }

    // ============ Configuration Functions ============

    /**
     * @notice Update reorder configuration
     * @param autoReorder Enable auto reorder notifications
     * @param defaultQuantity Default reorder quantity
     * @param notificationAddress Address to notify for reorders
     */
    function updateReorderConfig(
        bool autoReorder,
        uint256 defaultQuantity,
        address notificationAddress
    ) external onlyAdmin {
        reorderConfig.autoReorder = autoReorder;
        reorderConfig.defaultReorderQuantity = defaultQuantity;
        reorderConfig.reorderNotificationAddress = notificationAddress;
    }

    // ============ Internal Functions ============

    function _updateStockStatus(uint256 productId) internal {
        Product storage product = _products[productId];
        ProductStatus previousStatus = product.status;
        ProductStatus newStatus;

        if (product.stock == 0) {
            newStatus = ProductStatus.OUT_OF_STOCK;
        } else if (product.stock <= product.reorderLevel) {
            newStatus = ProductStatus.LOW_STOCK;
        } else {
            newStatus = ProductStatus.IN_STOCK;
        }

        if (previousStatus != newStatus) {
            _decrementStatusCounter(previousStatus);
            _incrementStatusCounter(newStatus);
            product.status = newStatus;

            emit StockStatusChanged(productId, previousStatus, newStatus);

            if (
                newStatus == ProductStatus.LOW_STOCK ||
                newStatus == ProductStatus.OUT_OF_STOCK
            ) {
                emit LowStockAlert(
                    productId,
                    product.sku,
                    product.stock,
                    product.reorderLevel
                );
            }
        }
    }

    function _decrementStatusCounter(ProductStatus status) internal {
        if (status == ProductStatus.IN_STOCK) stats.inStockProducts--;
        else if (status == ProductStatus.LOW_STOCK) stats.lowStockProducts--;
        else if (status == ProductStatus.OUT_OF_STOCK)
            stats.outOfStockProducts--;
    }

    function _incrementStatusCounter(ProductStatus status) internal {
        if (status == ProductStatus.IN_STOCK) stats.inStockProducts++;
        else if (status == ProductStatus.LOW_STOCK) stats.lowStockProducts++;
        else if (status == ProductStatus.OUT_OF_STOCK)
            stats.outOfStockProducts++;
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
