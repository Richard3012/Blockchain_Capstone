// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IBlockERP.sol";

/**
 * @title BlockERPCore
 * @author BlockERP Team
 * @notice Main contract for BlockERP system - handles access control and registry
 * @dev Implements role-based access control and serves as the central registry
 */
contract BlockERPCore is IAccessControl {
    // ============ State Variables ============

    /// @notice Contract owner address
    address public owner;

    /// @notice Contract deployment timestamp
    uint256 public deployedAt;

    /// @notice System pause state
    bool public paused;

    /// @notice Mapping of addresses to roles
    mapping(address => Role) private _roles;

    /// @notice Mapping of registered modules
    mapping(string => address) public modules;

    /// @notice Array of all users with roles
    address[] public users;

    /// @notice Mapping to check if address is registered
    mapping(address => bool) public isRegistered;

    /// @notice Company information
    struct CompanyInfo {
        string name;
        string registrationNumber;
        string country;
        string website;
        bool isVerified;
    }

    CompanyInfo public company;

    // ============ Events ============

    event ModuleRegistered(string indexed moduleName, address moduleAddress);
    event ModuleUpdated(
        string indexed moduleName,
        address oldAddress,
        address newAddress
    );
    event SystemPaused(address indexed by);
    event SystemUnpaused(address indexed by);
    event CompanyInfoUpdated(string name, address indexed updatedBy);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "BlockERPCore: caller is not the owner");
        _;
    }

    modifier onlyAdmin() {
        require(
            _roles[msg.sender] == Role.ADMIN || msg.sender == owner,
            "BlockERPCore: caller is not admin"
        );
        _;
    }

    modifier onlyManagerOrAbove() {
        require(
            _roles[msg.sender] >= Role.MANAGER || msg.sender == owner,
            "BlockERPCore: insufficient permissions"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "BlockERPCore: system is paused");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "BlockERPCore: invalid address");
        _;
    }

    // ============ Constructor ============

    constructor(
        string memory _companyName,
        string memory _registrationNumber,
        string memory _country
    ) {
        owner = msg.sender;
        deployedAt = block.timestamp;
        _roles[msg.sender] = Role.ADMIN;
        users.push(msg.sender);
        isRegistered[msg.sender] = true;

        company = CompanyInfo({
            name: _companyName,
            registrationNumber: _registrationNumber,
            country: _country,
            website: "",
            isVerified: false
        });

        emit RoleGranted(msg.sender, Role.ADMIN, msg.sender);
    }

    // ============ Access Control Functions ============

    /**
     * @notice Grant a role to an account
     * @param account The address to grant the role to
     * @param role The role to grant
     */
    function grantRole(
        address account,
        Role role
    ) external override onlyAdmin validAddress(account) whenNotPaused {
        require(role != Role.NONE, "BlockERPCore: cannot grant NONE role");

        if (!isRegistered[account]) {
            users.push(account);
            isRegistered[account] = true;
        }

        _roles[account] = role;
        emit RoleGranted(account, role, msg.sender);
    }

    /**
     * @notice Revoke role from an account
     * @param account The address to revoke the role from
     */
    function revokeRole(
        address account
    ) external override onlyAdmin validAddress(account) {
        require(account != owner, "BlockERPCore: cannot revoke owner role");
        require(
            _roles[account] != Role.NONE,
            "BlockERPCore: account has no role"
        );

        Role previousRole = _roles[account];
        _roles[account] = Role.NONE;
        emit RoleRevoked(account, previousRole, msg.sender);
    }

    /**
     * @notice Check if account has a specific role or higher
     * @param account The address to check
     * @param role The minimum role required
     * @return bool True if account has the role or higher
     */
    function hasRole(
        address account,
        Role role
    ) external view override returns (bool) {
        if (account == owner) return true;
        return _roles[account] >= role;
    }

    /**
     * @notice Get the role of an account
     * @param account The address to query
     * @return Role The role of the account
     */
    function getRole(address account) external view override returns (Role) {
        if (account == owner) return Role.ADMIN;
        return _roles[account];
    }

    /**
     * @notice Get all registered users
     * @return address[] Array of user addresses
     */
    function getAllUsers() external view returns (address[] memory) {
        return users;
    }

    /**
     * @notice Get total number of users
     * @return uint256 Number of registered users
     */
    function getUserCount() external view returns (uint256) {
        return users.length;
    }

    // ============ Module Registry Functions ============

    /**
     * @notice Register a new module
     * @param moduleName The name identifier for the module
     * @param moduleAddress The contract address of the module
     */
    function registerModule(
        string memory moduleName,
        address moduleAddress
    ) external onlyOwner validAddress(moduleAddress) {
        require(
            modules[moduleName] == address(0),
            "BlockERPCore: module already registered"
        );
        modules[moduleName] = moduleAddress;
        emit ModuleRegistered(moduleName, moduleAddress);
    }

    /**
     * @notice Update an existing module address
     * @param moduleName The name identifier for the module
     * @param newAddress The new contract address
     */
    function updateModule(
        string memory moduleName,
        address newAddress
    ) external onlyOwner validAddress(newAddress) {
        require(
            modules[moduleName] != address(0),
            "BlockERPCore: module not registered"
        );
        address oldAddress = modules[moduleName];
        modules[moduleName] = newAddress;
        emit ModuleUpdated(moduleName, oldAddress, newAddress);
    }

    /**
     * @notice Get module address by name
     * @param moduleName The name identifier for the module
     * @return address The module contract address
     */
    function getModule(
        string memory moduleName
    ) external view returns (address) {
        return modules[moduleName];
    }

    // ============ System Control Functions ============

    /**
     * @notice Pause the entire system
     */
    function pause() external onlyAdmin {
        paused = true;
        emit SystemPaused(msg.sender);
    }

    /**
     * @notice Unpause the system
     */
    function unpause() external onlyAdmin {
        paused = false;
        emit SystemUnpaused(msg.sender);
    }

    /**
     * @notice Update company information
     * @param _name Company name
     * @param _website Company website
     */
    function updateCompanyInfo(
        string memory _name,
        string memory _website
    ) external onlyAdmin {
        company.name = _name;
        company.website = _website;
        emit CompanyInfoUpdated(_name, msg.sender);
    }

    /**
     * @notice Verify company (owner only)
     */
    function verifyCompany() external onlyOwner {
        company.isVerified = true;
    }

    /**
     * @notice Transfer ownership of the contract
     * @param newOwner Address of the new owner
     */
    function transferOwnership(
        address newOwner
    ) external onlyOwner validAddress(newOwner) {
        require(newOwner != owner, "BlockERPCore: new owner is current owner");

        address previousOwner = owner;
        owner = newOwner;
        _roles[newOwner] = Role.ADMIN;

        if (!isRegistered[newOwner]) {
            users.push(newOwner);
            isRegistered[newOwner] = true;
        }

        emit OwnershipTransferred(previousOwner, newOwner);
        emit RoleGranted(newOwner, Role.ADMIN, previousOwner);
    }

    // ============ View Functions ============

    /**
     * @notice Get complete company information
     * @return CompanyInfo struct
     */
    function getCompanyInfo() external view returns (CompanyInfo memory) {
        return company;
    }

    /**
     * @notice Get system status
     * @return isPaused Whether the system is paused
     * @return _deployedAt Deployment timestamp
     * @return userCount Number of users
     * @return _owner Contract owner address
     */
    function getSystemStatus()
        external
        view
        returns (
            bool isPaused,
            uint256 _deployedAt,
            uint256 userCount,
            address _owner
        )
    {
        return (paused, deployedAt, users.length, owner);
    }

    /**
     * @notice Check if caller has minimum required role
     * @param minRole Minimum role required
     * @return bool True if caller meets requirement
     */
    function checkAccess(Role minRole) external view returns (bool) {
        if (msg.sender == owner) return true;
        return _roles[msg.sender] >= minRole;
    }
}
