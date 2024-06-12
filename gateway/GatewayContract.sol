// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.25;

import "../lib/TFHE.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "../lib/KmsVerifier.sol";

enum CiphertextType {
    EBOOL,
    EUINT4,
    EUINT8,
    EUINT16,
    EUINT32,
    EUINT64,
    EUINT128,
    EADDRESS
}

struct Ciphertext {
    uint256 ctHandle;
    CiphertextType ctType;
}

contract GatewayContract is Ownable2Step {
    KmsVerifier immutable kmsVerifier;

    uint256 public constant MAX_DELAY = 1 days;

    struct DecryptionRequest {
        Ciphertext[] cts;
        address contractCaller;
        bytes4 callbackSelector;
        uint256 msgValue;
        uint256 maxTimestamp;
    }

    uint256 public counter; // tracks the number of decryption requests

    mapping(address => bool) public isRelayer;
    mapping(uint256 => DecryptionRequest) internal decryptionRequests;
    mapping(uint256 => bool) internal isFulfilled;

    constructor(address _gatewayOwner, address _kmsVerifier) Ownable(_gatewayOwner) {
        kmsVerifier = KmsVerifier(_kmsVerifier);
    }

    event EventDecryption(
        uint256 indexed requestID,
        Ciphertext[] cts,
        address contractCaller,
        bytes4 callbackSelector,
        uint256 msgValue,
        uint256 maxTimestamp
    );

    event AddedRelayer(address indexed realyer);

    event RemovedRelayer(address indexed realyer);

    event ResultCallback(uint256 indexed requestID, bool success, bytes result);

    function addRelayer(address relayerAddress) external onlyOwner {
        require(!isRelayer[relayerAddress], "Address is already relayer");
        isRelayer[relayerAddress] = true;
        emit AddedRelayer(relayerAddress);
    }

    function removeRelayer(address relayerAddress) external onlyOwner {
        require(isRelayer[relayerAddress], "Address is not a relayer");
        isRelayer[relayerAddress] = false;
        emit RemovedRelayer(relayerAddress);
    }

    function isExpiredOrFulfilled(uint256 requestID) external view returns (bool) {
        uint256 timeNow = block.timestamp;
        return
            isFulfilled[requestID] ||
            (timeNow > decryptionRequests[requestID].maxTimestamp && decryptionRequests[requestID].maxTimestamp != 0);
    }

    // Requests the decryption of n ciphertexts `ctsHandles` with the result returned in a callback.
    // `ctsHandles` is an array of handles. `ctsTypes` is an array of CiphertextTypes. `ctsHandles[i]`'s type MUST be `ctsTypes[i]`.
    // During callback, msg.sender is called with [callbackSelector,requestID,decrypt(ctsHandles[0]),decrypt(ctsHandles[1]),...,decrypt(ctsHandles[n-1])] as calldata via `fulfillRequest`.
    function requestDecryption(
        Ciphertext[] calldata cts,
        bytes4 callbackSelector,
        uint256 msgValue, // msg.value of callback tx, if callback is payable
        uint256 maxTimestamp
    ) external returns (uint256 initialCounter) {
        require(maxTimestamp > block.timestamp, "maxTimestamp must be a future date");
        require(maxTimestamp <= block.timestamp + MAX_DELAY, "maxTimestamp exceeded MAX_DELAY");
        initialCounter = counter;
        DecryptionRequest storage decryptionReq = decryptionRequests[initialCounter];

        uint256 len = cts.length;
        for (uint256 i = 0; i < len; i++) {
            decryptionReq.cts.push(cts[i]);
        }

        decryptionReq.contractCaller = msg.sender;
        decryptionReq.callbackSelector = callbackSelector;
        decryptionReq.msgValue = msgValue;
        decryptionReq.maxTimestamp = maxTimestamp;
        emit EventDecryption(initialCounter, cts, msg.sender, callbackSelector, msgValue, maxTimestamp);
        counter++;
    }

    // Called by the relayer to pass the decryption results from the KMS to the callback function
    // `decryptedCts` is a bytes array containing the abi-encoded concatenation of decryption results.
    function fulfillRequest(
        uint256 requestID,
        bytes memory decryptedCts,
        bytes[] memory signatures
    ) external payable onlyRelayer {
        require(
            kmsVerifier.verifySignatures(keccak256(abi.encode(decryptedCts)), signatures),
            "KMS signature verification failed"
        );
        require(!isFulfilled[requestID], "Request is already fulfilled");
        DecryptionRequest memory decryptionReq = decryptionRequests[requestID];
        require(block.timestamp <= decryptionReq.maxTimestamp, "Too late");
        bytes memory callbackCalldata = abi.encodeWithSelector(decryptionReq.callbackSelector, requestID);
        callbackCalldata = abi.encodePacked(callbackCalldata, decryptedCts); // decryptedCts MUST be correctly abi-encoded by the relayer, according to the requested `ctsTypes`
        (bool success, bytes memory result) = (decryptionReq.contractCaller).call{value: decryptionReq.msgValue}(
            callbackCalldata
        );
        emit ResultCallback(requestID, success, result);
        isFulfilled[requestID] = true;
    }

    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "Not relayer");
        _;
    }
}
