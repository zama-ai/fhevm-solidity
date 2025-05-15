// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import "../lib/FHE.sol";
import "./FHEVMConfig.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./EncryptedERC20Abstract.sol";
/// @notice This contract implements an encrypted ERC20-like token with confidential balances using Zama's FHE (Fully Homomorphic Encryption) library.
/// @dev It supports typical ERC20 functionality such as transferring tokens, minting, and setting allowances, but uses encrypted data types.
contract EncryptedERC20 is EncryptedERC20Abstract, Ownable2Step {
    /// @notice Emitted when new tokens are minted
    event Mint(address indexed to, uint64 amount);

    /// @notice Constructor to initialize the token's name and symbol, and set up the owner
    /// @param name_ The name of the token
    /// @param symbol_ The symbol of the token
    constructor(
        string memory name_,
        string memory symbol_
    ) Ownable(msg.sender) EncryptedERC20Abstract(name_, symbol_, 6, FHEVMConfig.defaultConfig()) {
        // nothing to do
    }

    /// @notice Mints new tokens and assigns them to the owner, increasing the total supply.
    /// @dev Only the contract owner can call this function.
    /// @param mintedAmount The amount of tokens to mint
    function mint(uint64 mintedAmount) public virtual onlyOwner {
        address owner = owner();
        EncryptedERC20Abstract._mint(owner, mintedAmount);
        emit Mint(owner, mintedAmount);
    }
}
