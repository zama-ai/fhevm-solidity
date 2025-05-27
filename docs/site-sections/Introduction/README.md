---
description: >-
  fhevm is a technology that enables confidential smart contracts on the EVM
  using Fully Homomorphic Encryption (FHE).
icon: book-open
layout: landing
---

# Welcome to fhevm

## Why fhevm?

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody><tr><td><strong>Guard Privacy</strong></td><td>Keep user data encrypted onchain.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Build Fast</strong></td><td>Use Solidity, SDKs, templates, etc.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Deploy Anywhere</strong></td><td>Compatible with all EVM chains.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr></tbody></table>

## Start Here

[#path-to-build](./#path-to-build "mention")   [#path-to-learn](./#path-to-learn "mention")

## Path to Build&#x20;

{% stepper %}
{% step %}
### **Set Up Your Development Environment**

Use the official Hardhat template from Zama that includes all necessary configurations and dependencies to start developing confidential smart contracts.

<a href="https://github.com/zama-ai/fhevm-hardhat-template" class="button primary">Clone the template</a>
{% endstep %}

{% step %}
### **Install Dependencies**

Navigate into your project directory and run:

```solidity
npm install
```

Also, install the fhEVM Solidity library:

```solidity
npm install fhevm-contracts
```
{% endstep %}

{% step %}
### Write Your First Confidnetial Smart Contract

Use the provided contract examples, like `ConfidentialERC20`, to begin. A basic confidential token contract might look like this:

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { SepoliaZamaFHEVMConfig } from "fhevm/config/ZamaFHEVMConfig.sol";
import { ConfidentialERC20 } from "fhevm-contracts/contracts/token/ERC20/ConfidentialERC20.sol";

contract MyERC20 is SepoliaZamaFHEVMConfig, ConfidentialERC20 {
    constructor() ConfidentialERC20("MyToken", "MYTOKEN") {
        _unsafeMint(1000000, msg.sender);
    }
}
```
{% endstep %}

{% step %}
### To Continue

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody><tr><td><strong>Solidity Guides</strong></td><td>Learn about encrypted types, branching, and ACL.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>SKD Guides</strong></td><td>Build UIs with encrypted inputs and user-side decryption.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Examples</strong></td><td>Find contract templates and code examples of real-world dApps.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr></tbody></table>
{% endstep %}
{% endstepper %}

## Path to Learn&#x20;

{% stepper %}
{% step %}
### **What is FHE on Blockchain**

Learn how Fully Homomorphic Encryption enables encrypted computation on-chain — and why it matters for smart contracts.&#x20;

<a href="../../smart_contracts/architecture_overview/fhe-on-blockchain.md" class="button primary">Read the doc</a>
{% endstep %}

{% step %}
### Understand fhevm Components

Explore the core parts of fheVM: encrypted types, precompiles, operator nodes, frontend SDK, and user keys.

<a href="../../smart_contracts/architecture_overview/fhevm-components.md" class="button primary">Read the doc</a>
{% endstep %}

{% step %}
### Encryption, Decryption, Computation

Understand how encrypted data flows through a contract.

<a href="../../smart_contracts/d_re_ecrypt_compute.md" class="button primary">Read the doc</a>
{% endstep %}

{% step %}
### Go further

<table data-card-size="large" data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody><tr><td><strong>Dapps Demos</strong></td><td>See real-world dApps using fhevm.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>White paper</strong></td><td>Explore the full design behind FHEVM.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr></tbody></table>
{% endstep %}
{% endstepper %}

### Help Center&#x20;

Ask technical questions and discuss with the community.

<table data-view="cards"><thead><tr><th></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody><tr><td><strong>Discord</strong></td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Community Forum</strong></td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Telegram</strong></td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr></tbody></table>
