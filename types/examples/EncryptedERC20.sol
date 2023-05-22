// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity >=0.8.13 <0.9.0;

import "../lib/Ciphertext.sol";
import "../lib/Common.sol";
import "../lib/FHEOps.sol";

contract EncryptedERC20 {
    euint32 public totalSupply;
    string public constant name = "Naraggara"; // City of Zama's battle
    string public constant symbol = "NARA";
    uint8 public constant decimals = 18;

    // used for output authorization
    bytes32 public domainHash;

    // A mapping from address to an encrypted balance.
    mapping(address => euint32) internal balances;

    // A mapping of the form mapping(owner => mapping(spender => allowance)).
    mapping(address => mapping(address => euint32)) internal allowances;

    // The owner of the contract.
    address internal contractOwner;

    constructor() {
        contractOwner = msg.sender;

        uint chainId;
        assembly {
            chainId := chainid()
        }

        domainHash = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    // Sets the balance of the owner to the given encrypted balance.
    function mint(bytes calldata encryptedAmount) public onlyContractOwner {
        euint32 amount = Ciphertext.asEuint32(encryptedAmount);
        balances[contractOwner] = amount;
        totalSupply = FHEOps.add(totalSupply, amount);
    }

    // Transfers an encrypted amount from the message sender address to the `to` address.
    function transfer(address to, bytes calldata encryptedAmount) public {
        transfer(to, Ciphertext.asEuint32(encryptedAmount));
    }

    // Transfers an amount from the message sender address to the `to` address.
    function transfer(address to, euint32 amount) internal {
        _transfer(msg.sender, to, amount);
    }

    function getTotalSupply() public view returns (bytes memory) {
        return Ciphertext.reencrypt(totalSupply); // Should be decrypt later
    }

    // Returns the balance of the caller under their public FHE key.
    // The FHE public key is automatically determined based on the origin of the call.
    function balanceOf(
        string calldata publicKey,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view returns (bytes memory) {
        bytes32 reencryptHash = keccak256(
            abi.encode("Reencrypt(string publicKey)", publicKey)
        );

        bytes32 signedMessage = keccak256(
            abi.encodePacked("\x19\x01", domainHash, reencryptHash)
        );

        address signer = ecrecover(signedMessage, v, r, s);
        require(signer != address(0), "Invalid EIP712 signature");
        require(
            signer == msg.sender,
            "EIP712 signer and transaction signer do not match"
        ); // safety measure

        return Ciphertext.reencrypt(balances[signer]);
    }

    // Sets the `encryptedAmount` as the allowance of `spender` over the caller's tokens.
    function approve(address spender, bytes calldata encryptedAmount) public {
        address owner = msg.sender;
        _approve(owner, spender, Ciphertext.asEuint32(encryptedAmount));
    }

    // Returns the remaining number of tokens that `spender` is allowed to spend
    // on behalf of the caller. The returned ciphertext is under the caller public FHE key.
    function allowance(address spender) public view returns (bytes memory) {
        address owner = msg.sender;
        return Ciphertext.reencrypt(_allowance(owner, spender));
    }

    // Transfers `encryptedAmount` tokens using the caller's allowance.
    function transferFrom(
        address from,
        address to,
        bytes calldata encryptedAmount
    ) public {
        transferFrom(from, to, Ciphertext.asEuint32(encryptedAmount));
    }

    // Transfers `amount` tokens using the caller's allowance.
    function transferFrom(address from, address to, euint32 amount) public {
        address spender = msg.sender;
        _updateAllowance(from, spender, amount);
        _transfer(from, to, amount);
    }

    function _approve(address owner, address spender, euint32 amount) internal {
        allowances[owner][spender] = amount;
    }

    function _allowance(
        address owner,
        address spender
    ) internal view returns (euint32) {
        return allowances[owner][spender];
    }

    function _updateAllowance(
        address owner,
        address spender,
        euint32 amount
    ) internal {
        euint32 currentAllowance = _allowance(owner, spender);
        Ciphertext.requireCt(FHEOps.lte(amount, currentAllowance));
        _approve(owner, spender, FHEOps.sub(currentAllowance, amount));
    }

    // Transfers an encrypted amount.
    function _transfer(address from, address to, euint32 amount) internal {
        // Make sure the sender has enough tokens.
        Ciphertext.requireCt(FHEOps.lte(amount, balances[from]));

        // Add to the balance of `to` and subract from the balance of `from`.
        balances[to] = FHEOps.add(balances[to], amount);
        balances[from] = FHEOps.sub(balances[from], amount);
    }

    modifier onlyContractOwner() {
        require(msg.sender == contractOwner);
        _;
    }
}
