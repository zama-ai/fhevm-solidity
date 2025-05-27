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

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody><tr><td><strong>Solidity Guides</strong></td><td>Write encrypted logic with Solidity tools.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>SKD Guides</strong></td><td>Build frontends with encrypted user data.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Examples</strong></td><td>Explore real dApps and code templates.</td><td><a href=".gitbook/assets/PLACE HOLDER (14).png">PLACE HOLDER (14).png</a></td></tr><tr><td><strong>Architecture</strong></td><td>Understand how the system fits together.</td><td></td></tr><tr><td><strong>Dapps Demos</strong></td><td>Try real projects built with fhevm.</td><td></td></tr><tr><td><strong>White paper</strong></td><td>Dive deep into the cryptographic design.</td><td></td></tr></tbody></table>
{% endstep %}
{% endstepper %}

## Help Center&#x20;

Ask technical questions and discuss with the community.

* [Community forum](https://community.zama.ai/c/fhevm/15)
* [Discord channel](https://discord.com/invite/fhe-org)
* [Telegram](https://t.me/+Ojt5y-I7oR42MTkx)
