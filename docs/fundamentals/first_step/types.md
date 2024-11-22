# **Using Encrypted Types**

This document introduces the encrypted integer types provided by the `TFHE` library in fhEVM and explains their usage, including casting, state variable declarations, and type-specific considerations.

## **Introduction**

The `TFHE` library offers a robust type system with encrypted integer types, enabling secure computations on confidential data in smart contracts. These encrypted types are validated both at compile time and runtime to ensure correctness and security.

### **Key Features of Encrypted Types**
- Encrypted integers function similarly to Solidity’s native integer types, but they operate on **Fully Homomorphic Encryption (FHE)** ciphertexts. 
- Arithmetic operations on `e(u)int` types are **unchecked**, meaning they wrap around on overflow. This design choice ensures confidentiality by avoiding the leakage of information through error detection.
- Future versions of the `TFHE` library will support encrypted integers with overflow checking, but with the trade-off of exposing limited information about the operands.

> **Info**  
> Encrypted integers with overflow checking will soon be available in the `TFHE` library. These will allow reversible arithmetic operations but may reveal some information about the input values.

Encrypted integers in fhEVM are represented as FHE ciphertexts, abstracted using ciphertext handles. These types, prefixed with `e` (e.g., `euint64`), act as secure wrappers over the ciphertext handles.

---

## **List of Encrypted Types**

The `TFHE` library currently supports the following encrypted types:

| **Type**        | **Supported**       |
|------------------|---------------------|
| `ebool`         | Yes                 |
| `euint4`        | Yes                 |
| `euint8`        | Yes                 |
| `euint16`       | Yes                 |
| `euint32`       | Yes                 |
| `euint64`       | Yes                 |
| `euint128`      | Yes                 |
| `euint256`      | Yes                 |
| `eaddress`      | Yes                 |
| `ebytes64`      | Yes                 |
| `ebytes128`     | Yes                 |
| `ebytes256`     | Yes                 |
| `eint8`         | No, coming soon     |
| `eint16`        | No, coming soon     |
| `eint32`        | No, coming soon     |
| `eint64`        | No, coming soon     |
| `eint128`       | No, coming soon     |
| `eint256`       | No, coming soon     |

> **Note**  
> Higher-precision integer types are available in the `TFHE-rs` library and can be added to `fhEVM` as needed.

---

## **Casting Encrypted Types**

The `TFHE` library provides functions to cast between encrypted and unencrypted types, as well as between encrypted types of different precisions. Casting is handled using the `TFHE.asEuintXX()` or `TFHE.asEbool()` methods.

### **Example: Casting**
```solidity
euint64 value64 = TFHE.asEuint64(7262); // Cast unencrypted uint64 to encrypted euint64
euint32 value32 = TFHE.asEuint32(value64); // Cast encrypted euint64 to euint32
ebool valueBool = TFHE.asEbool(value32); // Cast encrypted euint32 to ebool
```

### **Supported Casting Functions**
The table below summarizes the available casting functions:

| **From Type**   | **To Type**       | **Function**           |
|------------------|-------------------|------------------------|
| `uintX`         | `euintX`          | `TFHE.asEuintXX`       |
| `euintX`        | Higher precision  | `TFHE.asEuintXX`       |
| `euintX`        | `ebool`           | `TFHE.asEbool`         |
| `address`       | `eaddress`        | `TFHE.asEaddress`      |
| `bytesXX`       | `ebytesXX`        | `TFHE.asEbytesXX`      |

> **Tip**  
> Casting between encrypted types is efficient and often necessary when handling data with differing precision requirements.

---

## **Declaring Encrypted State Variables**

When using encrypted types as state variables in smart contracts, avoid declaring them with the `immutable` or `constant` keywords. This is because the `TFHE.asEuintXX()` method relies on a precompiled contract, making the value resolution at compile time infeasible.

### **Best Practices for Declaration**
Instead of using `immutable` or `constant`, declare and initialize encrypted state variables like this:

#### **Inline Initialization**
```solidity
euint64 private totalSupply = TFHE.asEuint64(0);
```

#### **Initialization in Constructor**
```solidity
euint64 private totalSupply;

constructor() {
  totalSupply = TFHE.asEuint64(0);
}
```

> **Why?**  
> The `TFHE.asEuintXX()` function is executed at runtime, making `immutable` or `constant` declarations incompatible.

---

## **Summary**

The encrypted types in the `TFHE` library are designed to offer security and flexibility when working with confidential data in smart contracts. Key points to remember include:
- Encrypted integers operate as wrappers over FHE ciphertexts.
- Arithmetic operations are unchecked to preserve confidentiality.
- Type casting is straightforward, with extensive support for converting between encrypted types and unencrypted inputs.
- Encrypted state variables must be initialized at runtime rather than using `immutable` or `constant`.

By following these guidelines and leveraging the flexibility of the `TFHE` library, developers can seamlessly integrate encrypted types into their smart contract workflows.