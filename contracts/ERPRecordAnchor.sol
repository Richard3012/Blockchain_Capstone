// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ERPRecordAnchor is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    struct AnchorRecord {
        string entityType;
        string entityId;
        bytes32 recordHash;
        string ipfsCid;
        uint256 anchoredAt;
        address actor;
        bool exists;
        bool revoked;
    }

    mapping(bytes32 => AnchorRecord) private anchors;

    event RecordAnchored(
        bytes32 indexed anchorKey,
        string entityType,
        string entityId,
        bytes32 recordHash,
        string ipfsCid,
        address indexed actor
    );

    event RecordRevoked(bytes32 indexed anchorKey, string entityType, string entityId, address indexed actor);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHOR_ROLE, admin);
    }

    function anchorRecord(
        string calldata entityType,
        string calldata entityId,
        bytes32 recordHash,
        string calldata ipfsCid,
        address actor
    ) external onlyRole(ANCHOR_ROLE) returns (bytes32 anchorKey) {
        anchorKey = _anchorKey(entityType, entityId);
        anchors[anchorKey] = AnchorRecord({
            entityType: entityType,
            entityId: entityId,
            recordHash: recordHash,
            ipfsCid: ipfsCid,
            anchoredAt: block.timestamp,
            actor: actor,
            exists: true,
            revoked: false
        });

        emit RecordAnchored(anchorKey, entityType, entityId, recordHash, ipfsCid, actor);
    }

    function revokeRecord(string calldata entityType, string calldata entityId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 anchorKey = _anchorKey(entityType, entityId);
        require(anchors[anchorKey].exists, "Anchor not found");

        anchors[anchorKey].revoked = true;
        emit RecordRevoked(anchorKey, entityType, entityId, msg.sender);
    }

    function verifyRecord(
        string calldata entityType,
        string calldata entityId,
        bytes32 recordHash
    ) external view returns (bool) {
        bytes32 anchorKey = _anchorKey(entityType, entityId);
        AnchorRecord memory record = anchors[anchorKey];

        return record.exists && !record.revoked && record.recordHash == recordHash;
    }

    function getRecord(string calldata entityType, string calldata entityId) external view returns (AnchorRecord memory) {
        return anchors[_anchorKey(entityType, entityId)];
    }

    function _anchorKey(string memory entityType, string memory entityId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(entityType, "::", entityId));
    }
}
