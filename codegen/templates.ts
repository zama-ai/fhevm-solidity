import { assert } from 'console';

import { Operator, OperatorArguments, ReturnType } from './common';
import { ArgumentType, OverloadSignature } from './testgen';
import { getUint } from './utils';

export function commonSolLib(): string {
  return `
type ebool is uint256;
type euint4 is uint256;
type euint8 is uint256;
type euint16 is uint256;
type euint32 is uint256;
type euint64 is uint256;
type euint128 is uint256;
type euint256 is uint256;
type eaddress is uint256;
type ebytes64 is uint256;
type ebytes128 is uint256;
type ebytes256 is uint256;
type einput is bytes32;

library Common {
    // Values used to communicate types to the runtime.
    uint8 internal constant ebool_t = 0;
    uint8 internal constant euint4_t = 1;
    uint8 internal constant euint8_t = 2;
    uint8 internal constant euint16_t = 3;
    uint8 internal constant euint32_t = 4;
    uint8 internal constant euint64_t = 5;
    uint8 internal constant euint128_t = 6;
    uint8 internal constant euint160_t = 7;
    uint8 internal constant euint256_t = 8;
    uint8 internal constant ebytes64_t = 9;
    uint8 internal constant ebytes128_t = 10;
    uint8 internal constant ebytes256_t = 11;
}
`;
}

function binaryOperatorImpl(op: Operator): string {
  const fname = operatorFheLibFunction(op);
  const scalarArg = op.hasScalar && op.hasEncrypted ? ', bool scalar' : '';
  const scalarByte = op.hasScalar ? '0x01' : '0x00';
  const scalarSection =
    op.hasScalar && op.hasEncrypted
      ? `bytes1 scalarByte;
        if (scalar) {
            scalarByte = 0x01;
        } else {
            scalarByte = 0x00;
        }`
      : `bytes1 scalarByte = ${scalarByte};`;
  return (
    `
    function ${op.name}(uint256 lhs, uint256 rhs${scalarArg}) internal returns (uint256 result) {
        ${scalarSection}
        FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).${fname}(lhs, rhs, scalarByte);
    }` + '\n'
  );
}

export function implSol(operators: Operator[]): string {
  const res: string[] = [];

  const coprocessorInterface = generateImplCoprocessorInterface(operators);
  const aclInterface = generateACLInterface();

  res.push(`
// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import "./TFHE.sol";
import "./FHEVMConfig.sol";

${coprocessorInterface}

${aclInterface}

library Impl {
  // keccak256(abi.encode(uint256(keccak256("fhevm.storage.FHEVMConfig")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant FHEVMConfigLocation = 0xed8d60e34876f751cc8b014c560745351147d9de11b9347c854e881b128ea600;

  function getFHEVMConfig() internal pure returns (FHEVMConfig.FHEVMConfigStruct storage $) {
      assembly {
          $.slot := FHEVMConfigLocation
      }
  }

  function setFHEVM(FHEVMConfig.FHEVMConfigStruct memory fhevmConfig) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      $.ACLAddress = fhevmConfig.ACLAddress;
      $.TFHEExecutorAddress = fhevmConfig.TFHEExecutorAddress;
      $.FHEPaymentAddress = fhevmConfig.FHEPaymentAddress;
      $.KMSVerifierAddress = fhevmConfig.KMSVerifierAddress;
  }
`);

  operators.forEach((op) => {
    switch (op.arguments) {
      case OperatorArguments.Binary:
        res.push(binaryOperatorImpl(op));
        break;
      case OperatorArguments.Unary:
        res.push(unaryOperatorImpl(op));
        break;
    }
  });

  res.push(implCustomMethods());

  res.push('}\n');

  return res.join('');
}

export function fhevmLibSol(operators: Operator[]): string {
  const res: string[] = [];

  const fheLibInterface = generateImplFhevmLibInterface(operators);

  res.push(`
// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

${fheLibInterface}

`);

  return res.join('');
}

function operatorFheLibFunction(op: Operator): string {
  if (op.fheLibName) {
    return op.fheLibName;
  }
  return `fhe${capitalizeFirstLetter(op.name)}`;
}

function capitalizeFirstLetter(input: string): string {
  const firstLetter = input.toUpperCase().charAt(0);
  const theRest = input.substring(1);
  return `${firstLetter}${theRest}`;
}

function generateImplFhevmLibInterface(operators: Operator[]): string {
  const res: string[] = [];

  res.push('interface FhevmLib {');
  res.push(fheLibCustomInterfaceFunctions());
  res.push('}');

  return res.join('\n');
}

function generateImplCoprocessorInterface(operators: Operator[]): string {
  const res: string[] = [];

  res.push('interface ITFHEExecutor {');
  operators.forEach((op) => {
    let functionName = operatorFheLibFunction(op);
    const tail = 'external returns (uint256 result);';
    let functionArguments: string;
    switch (op.arguments) {
      case OperatorArguments.Binary:
        functionArguments = '(uint256 lhs, uint256 rhs, bytes1 scalarByte)';
        res.push(`  function ${functionName}${functionArguments} ${tail}`);
        break;
      case OperatorArguments.Unary:
        functionArguments = '(uint256 ct)';
        res.push(`  function ${functionName}${functionArguments} ${tail}`);
        break;
    }
  });

  res.push(coprocessorInterfaceCustomFunctions());

  res.push('}');

  return res.join('');
}

function fheLibCustomInterfaceFunctions(): string {
  return `
    function verifyCiphertext(bytes32 inputHandle, address callerAddress, address contractAddress, bytes memory inputProof, bytes1 inputType) external pure returns (uint256 result);
  `;
}

function coprocessorInterfaceCustomFunctions(): string {
  return `
    function verifyCiphertext(bytes32 inputHandle, address callerAddress, bytes memory inputProof, bytes1 inputType) external returns (uint256 result);
    function cast(uint256 ct, bytes1 toType) external returns (uint256 result);
    function trivialEncrypt(uint256 ct, bytes1 toType) external returns (uint256 result);
    function trivialEncrypt(bytes memory ct, bytes1 toType) external returns (uint256 result);
    function fheEq(uint256 lhs, bytes memory  rhs, bytes1 scalarByte) external returns (uint256 result);
    function fheNe(uint256 lhs, bytes memory  rhs, bytes1 scalarByte) external returns (uint256 result);
    function fheIfThenElse(uint256 control, uint256 ifTrue, uint256 ifFalse) external returns (uint256 result);
    function fheRand(bytes1 randType) external returns (uint256 result);
    function fheRandBounded(uint256 upperBound, bytes1 randType) external returns (uint256 result);
  `;
}

function generateACLInterface(): string {
  return `
  interface IACL {
    function allowTransient(uint256 ciphertext, address account) external;
    function allow(uint256 handle, address account) external;
    function cleanTransientStorage() external;
    function isAllowed(uint256 handle, address account) external view returns(bool);
    function allowForDecryption(uint256[] memory handlesList) external;
  }
  `;
}

export function tfheSol(
  operators: Operator[],
  supportedBits: number[],
  mocked: boolean,
): [string, OverloadSignature[]] {
  const signatures: OverloadSignature[] = [];
  const res: string[] = [];

  res.push(`// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import "./Impl.sol";
import "./FHEVMConfig.sol";


${commonSolLib()}



library TFHE {
  function setFHEVM(FHEVMConfig.FHEVMConfigStruct memory fhevmConfig) internal {
      Impl.setFHEVM(fhevmConfig);
  }
`);

  if (mocked) {
    res.push(`
    // Return true if the enrypted bool is initialized and false otherwise.
    function isInitialized(ebool /*v*/) internal pure returns (bool) {
        return true;
    }
  `);
    supportedBits.forEach((b) => {
      res.push(`
      // Return true if the enrypted integer is initialized and false otherwise.
      function isInitialized(euint${b} /*v*/) internal pure returns (bool) {
          return true;
      }
    `);
    });
  } else {
    res.push(`
    // Return true if the enrypted bool is initialized and false otherwise.
    function isInitialized(ebool v) internal pure returns (bool) {
        return ebool.unwrap(v) != 0;
    }
  `);
    supportedBits.forEach((b) => {
      res.push(`
      // Return true if the enrypted integer is initialized and false otherwise.
      function isInitialized(euint${b} v) internal pure returns (bool) {
          return euint${b}.unwrap(v) != 0;
      }
    `);
    });
  }

  supportedBits.forEach((lhsBits) => {
    supportedBits.forEach((rhsBits) => {
      operators.forEach((operator) => {
        if (!operator.shiftOperator && !operator.rotateOperator)
          res.push(tfheEncryptedOperator(lhsBits, rhsBits, operator, signatures));
      });
    });
    operators.forEach((operator) => {
      if (!operator.shiftOperator && !operator.rotateOperator)
        res.push(tfheScalarOperator(lhsBits, lhsBits, operator, signatures));
    });
  });

  supportedBits.forEach((bits) => {
    operators.forEach((operator) => {
      if (operator.shiftOperator || operator.rotateOperator)
        res.push(tfheShiftOperators(bits, operator, signatures, !!operator.rotateOperator, mocked));
    });
  });

  // TODO: Decide whether we want to have mixed-inputs for CMUX/Select
  supportedBits.forEach((bits) => res.push(tfheSelect(bits)));
  supportedBits.forEach((outputBits) => {
    supportedBits.forEach((inputBits) => {
      res.push(tfheAsEboolCustomCast(inputBits, outputBits));
    });
    res.push(tfheAsEboolUnaryCast(outputBits));
  });
  supportedBits.forEach((bits) => res.push(tfheUnaryOperators(bits, operators, signatures)));
  supportedBits.forEach((bits) => res.push(tfheCustomUnaryOperators(bits, signatures, mocked)));

  res.push(tfheCustomMethods());

  res.push(tfheAclMethods(supportedBits));

  res.push('}\n');

  return [res.join(''), signatures];
}

function tfheEncryptedOperator(
  lhsBits: number,
  rhsBits: number,
  operator: Operator,
  signatures: OverloadSignature[],
): string {
  if (!operator.hasEncrypted || operator.arguments != OperatorArguments.Binary) {
    return '';
  }

  const res: string[] = [];

  const outputBits = Math.max(lhsBits, rhsBits);
  const castLeftToRight = lhsBits < rhsBits;
  const castRightToLeft = lhsBits > rhsBits;
  const returnType =
    operator.returnType == ReturnType.Uint
      ? `euint${outputBits}`
      : operator.returnType == ReturnType.Ebool
        ? `ebool`
        : assert(false, 'Unknown return type');
  const returnTypeOverload: ArgumentType =
    operator.returnType == ReturnType.Uint ? ArgumentType.EUint : ArgumentType.Ebool;
  const scalarFlag = operator.hasEncrypted && operator.hasScalar ? ', false' : '';

  const leftExpr = castLeftToRight ? `asEuint${outputBits}(a)` : 'a';
  const rightExpr = castRightToLeft ? `asEuint${outputBits}(b)` : 'b';
  let implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(${leftExpr}), euint${outputBits}.unwrap(${rightExpr})${scalarFlag})`;
  signatures.push({
    name: operator.name,
    arguments: [
      { type: ArgumentType.EUint, bits: lhsBits },
      { type: ArgumentType.EUint, bits: rhsBits },
    ],
    returnType: { type: returnTypeOverload, bits: outputBits },
  });
  res.push(`
    // Evaluate ${operator.name}(a, b) and return the result.
    function ${operator.name}(euint${lhsBits} a, euint${rhsBits} b) internal returns (${returnType}) {
        if (!isInitialized(a)) {
            a = asEuint${lhsBits}(0);
        }
        if (!isInitialized(b)) {
            b = asEuint${rhsBits}(0);
        }
        return ${returnType}.wrap(${implExpression});
    }
`);

  return res.join('');
}

function tfheScalarOperator(
  lhsBits: number,
  rhsBits: number,
  operator: Operator,
  signatures: OverloadSignature[],
): string {
  if (operator.arguments != OperatorArguments.Binary) {
    return '';
  }

  if (!operator.hasScalar || lhsBits != rhsBits) {
    return '';
  }

  const res: string[] = [];

  const outputBits = Math.max(lhsBits, rhsBits);
  const returnType =
    operator.returnType == ReturnType.Uint
      ? `euint${outputBits}`
      : operator.returnType == ReturnType.Ebool
        ? `ebool`
        : assert(false, 'Unknown return type');
  const returnTypeOverload = operator.returnType == ReturnType.Uint ? ArgumentType.EUint : ArgumentType.Ebool;
  var scalarFlag = operator.hasEncrypted && operator.hasScalar ? ', true' : '';
  const leftOpName = operator.leftScalarInvertOp ?? operator.name;
  var implExpressionA = `Impl.${operator.name}(euint${outputBits}.unwrap(a), uint256(b)${scalarFlag})`;
  var implExpressionB = `Impl.${leftOpName}(euint${outputBits}.unwrap(b), uint256(a)${scalarFlag})`;
  var maybeEncryptLeft = '';
  if (operator.leftScalarEncrypt) {
    // workaround until tfhe-rs left scalar support:
    // do the trivial encryption and preserve order of operations
    scalarFlag = ', false';
    maybeEncryptLeft = `euint${outputBits} aEnc = asEuint${outputBits}(a);`;
    implExpressionB = `Impl.${leftOpName}(euint${outputBits}.unwrap(aEnc), euint${outputBits}.unwrap(b)${scalarFlag})`;
  }
  signatures.push({
    name: operator.name,
    arguments: [
      { type: ArgumentType.EUint, bits: lhsBits },
      { type: ArgumentType.Uint, bits: rhsBits },
    ],
    returnType: { type: returnTypeOverload, bits: outputBits },
  });

  // rhs scalar
  res.push(`
    // Evaluate ${operator.name}(a, b) and return the result.
    function ${operator.name}(euint${lhsBits} a, ${getUint(rhsBits)} b) internal returns (${returnType}) {
        if (!isInitialized(a)) {
            a = asEuint${lhsBits}(0);
        }
        return ${returnType}.wrap(${implExpressionA});
    }
`);

  // lhs scalar
  if (!operator.leftScalarDisable) {
    signatures.push({
      name: operator.name,
      arguments: [
        { type: ArgumentType.Uint, bits: rhsBits },
        { type: ArgumentType.EUint, bits: lhsBits },
      ],
      returnType: { type: returnTypeOverload, bits: outputBits },
    });

    res.push(`

    // Evaluate ${operator.name}(a, b) and return the result.
    function ${operator.name}(${getUint(lhsBits)} a, euint${rhsBits} b) internal returns (${returnType}) {
        ${maybeEncryptLeft}
        if (!isInitialized(b)) {
            b = asEuint${rhsBits}(0);
        }
        return ${returnType}.wrap(${implExpressionB});
    }
        `);
  }

  return res.join('');
}

function tfheShiftOperators(
  inputBits: number,
  operator: Operator,
  signatures: OverloadSignature[],
  rotate: boolean,
  mocked: boolean,
): string {
  const res: string[] = [];

  // Code and test for shift(euint{inputBits},euint8}
  const outputBits = inputBits;
  const lhsBits = inputBits;
  const rhsBits = 8;
  const castRightToLeft = lhsBits > rhsBits;

  const returnType = `euint${outputBits}`;

  const returnTypeOverload: ArgumentType = ArgumentType.EUint;
  let scalarFlag = ', false';

  const leftExpr = 'a';
  const rightExpr = castRightToLeft ? `asEuint${outputBits}(b)` : 'b';
  let implExpression: string;
  if (mocked) {
    if (rotate) {
      implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(${leftExpr}), euint${outputBits}.unwrap(${rightExpr}) % ${lhsBits}, ${lhsBits}${scalarFlag})`;
    } else {
      implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(${leftExpr}), euint${outputBits}.unwrap(${rightExpr}) % ${lhsBits}${scalarFlag})`;
    }
  } else {
    implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(${leftExpr}), euint${outputBits}.unwrap(${rightExpr})${scalarFlag})`;
  }

  if (inputBits >= 8) {
    signatures.push({
      name: operator.name,
      arguments: [
        { type: ArgumentType.EUint, bits: lhsBits },
        { type: ArgumentType.EUint, bits: rhsBits },
      ],
      returnType: { type: returnTypeOverload, bits: outputBits },
    });

    res.push(`
    // Evaluate ${operator.name}(a, b) and return the result.
    function ${operator.name}(euint${lhsBits} a, euint${rhsBits} b) internal returns (${returnType}) {
        if (!isInitialized(a)) {
            a = asEuint${lhsBits}(0);
        }
        if (!isInitialized(b)) {
            b = asEuint${rhsBits}(0);
        }
        return ${returnType}.wrap(${implExpression});
    }
`);
  }

  // Code and test for shift(euint{inputBits},uint8}
  scalarFlag = ', true';
  implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(a), uint256(b)${scalarFlag})`;
  if (mocked) {
    if (rotate) {
      implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(a), uint256(b) % ${lhsBits}, ${lhsBits}${scalarFlag})`;
    } else {
      implExpression = `Impl.${operator.name}(euint${outputBits}.unwrap(a), uint256(b) % ${lhsBits}${scalarFlag})`;
    }
  }
  signatures.push({
    name: operator.name,
    arguments: [
      { type: ArgumentType.EUint, bits: lhsBits },
      { type: ArgumentType.Uint, bits: rhsBits },
    ],
    returnType: { type: returnTypeOverload, bits: outputBits },
  });
  res.push(`
    // Evaluate ${operator.name}(a, b) and return the result.
    function ${operator.name}(euint${lhsBits} a, ${getUint(rhsBits)} b) internal returns (${returnType}) {
        if (!isInitialized(a)) {
            a = asEuint${lhsBits}(0);
        }
        return ${returnType}.wrap(${implExpression});
    }
  `);
  return res.join('');
}

function tfheSelect(inputBits: number): string {
  return `
    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, euint${inputBits} a, euint${inputBits} b) internal returns (euint${inputBits}) {
        return euint${inputBits}.wrap(Impl.select(ebool.unwrap(control), euint${inputBits}.unwrap(a), euint${inputBits}.unwrap(b)));
    }`;
}

function tfheAsEboolCustomCast(inputBits: number, outputBits: number): string {
  if (inputBits == outputBits) {
    return '';
  }

  return `
    // Cast an encrypted integer from euint${inputBits} to euint${outputBits}.
    function asEuint${outputBits}(euint${inputBits} value) internal returns (euint${outputBits}) {
        return euint${outputBits}.wrap(Impl.cast(euint${inputBits}.unwrap(value), Common.euint${outputBits}_t));
    }
    `;
}

function tfheAsEboolUnaryCast(bits: number): string {
  const res: string[] = [];
  res.push(`
    // Cast an encrypted integer from euint${bits} to ebool.
    function asEbool(euint${bits} value) internal returns (ebool) {
        return ne(value, 0);
    }
    `);

  if (bits == 8) {
    res.push(`
    // Convert an inputHandle with corresponding inputProof to an encrypted boolean.
    function asEbool(einput inputHandle, bytes memory inputProof) internal returns (ebool) {
        return ebool.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.ebool_t));
    }

    // Convert a plaintext value to an encrypted boolean.
    function asEbool(uint256 value) internal returns (ebool) {
        return ebool.wrap(Impl.trivialEncrypt(value, Common.ebool_t));
    }

    // Convert a plaintext boolean to an encrypted boolean.
    function asEbool(bool value) internal returns (ebool) {
        if (value) {
            return asEbool(1);
        } else {
            return asEbool(0);
        }
    }

    // Converts an 'ebool' to an 'euint8'.
    function asEuint8(ebool value) internal returns (euint8) {
      return euint8.wrap(Impl.cast(ebool.unwrap(value), Common.euint8_t));
    }

    // Evaluate and(a, b) and return the result.
    function and(ebool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.and(ebool.unwrap(a), ebool.unwrap(b), false));
    }

    // Evaluate and(a, b) and return the result.
    function and(ebool a, bool b) internal returns (ebool) {
        return ebool.wrap(Impl.and(ebool.unwrap(a), b?1:0, true));
    }

    // Evaluate and(a, b) and return the result.
    function and(bool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.and(ebool.unwrap(b), a?1:0, true));
    }

    // Evaluate or(a, b) and return the result.
    function or(ebool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.or(ebool.unwrap(a), ebool.unwrap(b), false));
    }

    // Evaluate or(a, b) and return the result.
    function or(ebool a, bool b) internal returns (ebool) {
        return ebool.wrap(Impl.or(ebool.unwrap(a), b?1:0, true));
    }

    // Evaluate or(a, b) and return the result.
    function or(bool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.or(ebool.unwrap(b), a?1:0, true));
    }

    // Evaluate xor(a, b) and return the result.
    function xor(ebool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.xor(ebool.unwrap(a), ebool.unwrap(b), false));
    }

    // Evaluate xor(a, b) and return the result.
    function xor(ebool a, bool b) internal returns (ebool) {
        return ebool.wrap(Impl.xor(ebool.unwrap(a), b?1:0, true));
    }

    // Evaluate xor(a, b) and return the result.
    function xor(bool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.xor(ebool.unwrap(b), a?1:0, true));
    }

    function not(ebool a) internal returns (ebool) {
        return ebool.wrap(Impl.not(ebool.unwrap(a)));
    }
    `);
  } else {
    res.push(`
    // Converts an 'ebool' to an 'euint${bits}'.
    function asEuint${bits}(ebool b) internal returns (euint${bits}) {
        return euint${bits}.wrap(Impl.cast(ebool.unwrap(b), Common.euint${bits}_t));
    }
    `);
  }

  return res.join('');
}

function tfheUnaryOperators(bits: number, operators: Operator[], signatures: OverloadSignature[]): string {
  const res: string[] = [];

  operators.forEach((op) => {
    if (op.arguments == OperatorArguments.Unary) {
      signatures.push({
        name: op.name,
        arguments: [{ type: ArgumentType.EUint, bits }],
        returnType: { type: ArgumentType.EUint, bits },
      });

      res.push(`
        function ${op.name}(euint${bits} value) internal returns (euint${bits}) {
            return euint${bits}.wrap(Impl.${op.name}(euint${bits}.unwrap(value)));
        }
      `);
    }
  });

  return res.join('\n');
}

function tfheCustomUnaryOperators(bits: number, signatures: OverloadSignature[], mocked: boolean): string {
  let result = `
    // Convert an inputHandle with corresponding inputProof to an encrypted euint${bits} integer.
    function asEuint${bits}(einput inputHandle, bytes memory inputProof) internal returns (euint${bits}) {
        return euint${bits}.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.euint${bits}_t));
    }

    // Convert a plaintext value to an encrypted euint${bits} integer.
    function asEuint${bits}(uint256 value) internal returns (euint${bits}) {
        return euint${bits}.wrap(Impl.trivialEncrypt(value, Common.euint${bits}_t));
    }

    `;
  return result;
}

function unaryOperatorImpl(op: Operator): string {
  let fname = operatorFheLibFunction(op);
  return `
    function ${op.name}(uint256 ct) internal returns (uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      result = ITFHEExecutor($.TFHEExecutorAddress).${fname}(ct);
    }
  `;
}

function tfheAclMethods(supportedBits: number[]): string {
  const res: string[] = [];

  res.push(
    `
    // cleans the transient storage of ACL containing all the allowedTransient accounts
    // to be used for integration with Account Abstraction or when bundling UserOps calling the FHEVMCoprocessor
    function cleanTransientStorage() internal {
      return Impl.cleanTransientStorage();
    }

    function isAllowed(ebool value, address account) internal view returns (bool) {
      return Impl.isAllowed(ebool.unwrap(value), account);
    }
  `,
  );

  supportedBits.forEach((bits) =>
    res.push(`function isAllowed(euint${bits} value, address account) internal view returns (bool) {
      return Impl.isAllowed(euint${bits}.unwrap(value), account);
    }`),
  );

  res.push(
    `
    function isAllowed(eaddress value, address account) internal view returns(bool) {
      return Impl.isAllowed(eaddress.unwrap(value), account);
    }

    function isAllowed(ebytes256 value, address account) internal view returns (bool) {
      return Impl.isAllowed(ebytes256.unwrap(value), account);
    }

    function isSenderAllowed(ebool value) internal view returns (bool) {
      return Impl.isAllowed(ebool.unwrap(value), msg.sender);
    }
    `,
  );

  supportedBits.forEach((bits) =>
    res.push(
      `
      function isSenderAllowed(euint${bits} value) internal view returns (bool) {
        return Impl.isAllowed(euint${bits}.unwrap(value), msg.sender);
      }
      `,
    ),
  );

  res.push(
    `
    function isSenderAllowed(eaddress value) internal view returns(bool) {
      return Impl.isAllowed(eaddress.unwrap(value), msg.sender);
    }

    function isSenderAllowed(ebytes256 value) internal view returns(bool) {
      return Impl.isAllowed(ebytes256.unwrap(value), msg.sender);
    }
    `,
  );

  res.push(
    `
    function allow(ebool value, address account) internal {
      Impl.allow(ebool.unwrap(value), account);
    }

    function allowThis(ebool value) internal {
      Impl.allow(ebool.unwrap(value), address(this));
    }
    `,
  );

  supportedBits.forEach((bits) =>
    res.push(
      `
    function allow(euint${bits} value, address account) internal {
      Impl.allow(euint${bits}.unwrap(value), account);
    }

    function allowThis(euint${bits} value) internal {
      Impl.allow(euint${bits}.unwrap(value), address(this));
    }
    \n`,
    ),
  );

  res.push(
    `
    function allow(eaddress value, address account) internal {
      Impl.allow(eaddress.unwrap(value), account);
    }

    function allowThis(eaddress value) internal {
      Impl.allow(eaddress.unwrap(value), address(this));
    }

    function allow(ebytes64 value, address account) internal {
      Impl.allow(ebytes64.unwrap(value), account);
    }

    function allowThis(ebytes64 value) internal {
      Impl.allow(ebytes64.unwrap(value), address(this));
    }

    function allow(ebytes128 value, address account) internal {
      Impl.allow(ebytes128.unwrap(value), account);
    }

    function allowThis(ebytes128 value) internal {
      Impl.allow(ebytes128.unwrap(value), address(this));
    }

    function allow(ebytes256 value, address account) internal {
      Impl.allow(ebytes256.unwrap(value), account);
    }

    function allowThis(ebytes256 value) internal {
      Impl.allow(ebytes256.unwrap(value), address(this));
    }
    `,
  );

  res.push(
    `
    function allowTransient(ebool value, address account) internal {
      Impl.allowTransient(ebool.unwrap(value), account);
    }
    `,
  );

  supportedBits.forEach((bits) =>
    res.push(
      `
    function allowTransient(euint${bits} value, address account) internal {
      Impl.allowTransient(euint${bits}.unwrap(value), account);
    }
    \n`,
    ),
  );

  res.push(
    `
    function allowTransient(eaddress value, address account) internal {
      Impl.allowTransient(eaddress.unwrap(value), account);
    }

    function allowTransient(ebytes256 value, address account) internal {
      Impl.allowTransient(ebytes256.unwrap(value), account);
    }
    `,
  );

  return res.join('');
}

function tfheCustomMethods(): string {
  let result = `
    // Generates a random encrypted boolean.
    function randEbool() internal returns (ebool) {
      return ebool.wrap(Impl.rand(Common.ebool_t));
    }

    // Generates a random encrypted 4-bit unsigned integer.
    function randEuint4() internal returns (euint4) {
      return euint4.wrap(Impl.rand(Common.euint4_t));
    }

    // Generates a random encrypted 4-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint4(uint8 upperBound) internal returns (euint4) {
      return euint4.wrap(Impl.randBounded(upperBound, Common.euint4_t));
    }

    // Generates a random encrypted 8-bit unsigned integer.
    function randEuint8() internal returns (euint8) {
      return euint8.wrap(Impl.rand(Common.euint8_t));
    }

    // Generates a random encrypted 8-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint8(uint8 upperBound) internal returns (euint8) {
      return euint8.wrap(Impl.randBounded(upperBound, Common.euint8_t));
    }

    // Generates a random encrypted 16-bit unsigned integer.
    function randEuint16() internal returns (euint16) {
      return euint16.wrap(Impl.rand(Common.euint16_t));
    }

    // Generates a random encrypted 16-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint16(uint16 upperBound) internal returns (euint16) {
      return euint16.wrap(Impl.randBounded(upperBound, Common.euint16_t));
    }

    // Generates a random encrypted 32-bit unsigned integer.
    function randEuint32() internal returns (euint32) {
      return euint32.wrap(Impl.rand(Common.euint32_t));
    }

    // Generates a random encrypted 32-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint32(uint32 upperBound) internal returns (euint32) {
      return euint32.wrap(Impl.randBounded(upperBound, Common.euint32_t));
    }

    // Generates a random encrypted 64-bit unsigned integer.
    function randEuint64() internal returns (euint64) {
      return euint64.wrap(Impl.rand(Common.euint64_t));
    }

    // Generates a random encrypted 64-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint64(uint64 upperBound) internal returns (euint64) {
      return euint64.wrap(Impl.randBounded(upperBound, Common.euint64_t));
    }

    // Generates a random encrypted 128-bit unsigned integer.
    function randEuint128() internal returns (euint128) {
      return euint128.wrap(Impl.rand(Common.euint128_t));
    }

    // Generates a random encrypted 128-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint128(uint128 upperBound) internal returns (euint128) {
      return euint128.wrap(Impl.randBounded(upperBound, Common.euint128_t));
    }

    // Generates a random encrypted 256-bit unsigned integer.
    function randEuint256() internal returns (euint256) {
      return euint256.wrap(Impl.rand(Common.euint256_t));
    }

    // Generates a random encrypted 256-bit unsigned integer in the [0, upperBound) range.
    // The upperBound must be a power of 2.
    function randEuint256(uint256 upperBound) internal returns (euint256) {
      return euint256.wrap(Impl.randBounded(upperBound, Common.euint256_t));
    }

    // Generates a random encrypted 512-bit unsigned integer.
    function randEbytes64() internal returns (ebytes64) {
      return ebytes64.wrap(Impl.rand(Common.ebytes64_t));
    }

    // Generates a random encrypted 1024-bit unsigned integer.
    function randEbytes128() internal returns (ebytes128) {
      return ebytes128.wrap(Impl.rand(Common.ebytes128_t));
    }

    // Generates a random encrypted 2048-bit unsigned integer.
    function randEbytes256() internal returns (ebytes256) {
      return ebytes256.wrap(Impl.rand(Common.ebytes256_t));
    }

    // Convert an inputHandle with corresponding inputProof to an encrypted eaddress.
    function asEaddress(einput inputHandle, bytes memory inputProof) internal returns (eaddress) {
      return eaddress.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.euint160_t));
    }

    // Convert a plaintext value to an encrypted address.
    function asEaddress(address value) internal returns (eaddress) {
        return eaddress.wrap(Impl.trivialEncrypt(uint160(value), Common.euint160_t));
    }

    
    // Convert the given inputHandle and inputProof to an encrypted ebytes64 value.
    function asEbytes64(einput inputHandle, bytes memory inputProof) internal returns (ebytes64) {
      return ebytes64.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.ebytes64_t));
    }

    // Left-pad a bytes array with zeros such that it becomes of length 64.
    function padToBytes64(bytes memory input) internal pure returns (bytes memory) {
      require(input.length <= 64, "Input exceeds 64 bytes");
      bytes memory result = new bytes(64);
      uint256 paddingLength = 64 - input.length;
      for (uint256 i = 0; i < paddingLength; i++) {
          result[i] = 0;
      }
      for (uint256 i = 0; i < input.length; i++) {
          result[paddingLength + i] = input[i];
      }
      return result;
    }

    // Convert a plaintext value - must be a bytes array of size 64 - to an encrypted Bytes64.
    function asEbytes64(bytes memory value) internal returns (ebytes64) {
        return ebytes64.wrap(Impl.trivialEncrypt(value, Common.ebytes64_t));
    }

    // Convert the given inputHandle and inputProof to an encrypted ebytes128 value.
    function asEbytes128(einput inputHandle, bytes memory inputProof) internal returns (ebytes128) {
      return ebytes128.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.ebytes128_t));
    }

    // Left-pad a bytes array with zeros such that it becomes of length 128.
    function padToBytes128(bytes memory input) internal pure returns (bytes memory) {
      require(input.length <= 128, "Input exceeds 128 bytes");
      bytes memory result = new bytes(128);
      uint256 paddingLength = 128 - input.length;
      for (uint256 i = 0; i < paddingLength; i++) {
          result[i] = 0;
      }
      for (uint256 i = 0; i < input.length; i++) {
          result[paddingLength + i] = input[i];
      }
      return result;
    }

    // Convert a plaintext value - must be a bytes array of size 128 - to an encrypted Bytes128.
    function asEbytes128(bytes memory value) internal returns (ebytes128) {
        return ebytes128.wrap(Impl.trivialEncrypt(value, Common.ebytes128_t));
    }
    
    // Convert the given inputHandle and inputProof to an encrypted ebytes256 value.
    function asEbytes256(einput inputHandle, bytes memory inputProof) internal returns (ebytes256) {
      return ebytes256.wrap(Impl.verify(einput.unwrap(inputHandle), inputProof, Common.ebytes256_t));
    }

    // Left-pad a bytes array with zeros such that it becomes of length 256.
    function padToBytes256(bytes memory input) internal pure returns (bytes memory) {
      require(input.length <= 256, "Input exceeds 256 bytes");
      bytes memory result = new bytes(256);
      uint256 paddingLength = 256 - input.length;
      for (uint256 i = 0; i < paddingLength; i++) {
          result[i] = 0;
      }
      for (uint256 i = 0; i < input.length; i++) {
          result[paddingLength + i] = input[i];
      }
      return result;
    }

    // Convert a plaintext value - must be a bytes array of size 256 - to an encrypted Bytes256.
    function asEbytes256(bytes memory value) internal returns (ebytes256) {
        return ebytes256.wrap(Impl.trivialEncrypt(value, Common.ebytes256_t));
    }

    // Return true if the enrypted address is initialized and false otherwise.
    function isInitialized(eaddress v) internal pure returns (bool) {
        return eaddress.unwrap(v) != 0;
    }

    // Return true if the enrypted value is initialized and false otherwise.
    function isInitialized(ebytes64 v) internal pure returns (bool) {
        return ebytes64.unwrap(v) != 0;
    }

    // Return true if the enrypted value is initialized and false otherwise.
    function isInitialized(ebytes128 v) internal pure returns (bool) {
        return ebytes128.unwrap(v) != 0;
    }
    
    // Return true if the enrypted value is initialized and false otherwise.
    function isInitialized(ebytes256 v) internal pure returns (bool) {
        return ebytes256.unwrap(v) != 0;
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebool a, ebool b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        if (!isInitialized(b)) {
            b = asEbool(false);
        }
        return ebool.wrap(Impl.eq(ebool.unwrap(a), ebool.unwrap(b), false));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebool a, ebool b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        if (!isInitialized(b)) {
            b = asEbool(false);
        }
        return ebool.wrap(Impl.ne(ebool.unwrap(a), ebool.unwrap(b), false));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebool a, bool b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        uint256 bProc = b?1:0;
        return ebool.wrap(Impl.eq(ebool.unwrap(a), bProc, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(bool b, ebool a) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        uint256 bProc = b?1:0;
        return ebool.wrap(Impl.eq(ebool.unwrap(a), bProc, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebool a, bool b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        uint256 bProc = b?1:0;
        return ebool.wrap(Impl.ne(ebool.unwrap(a), bProc, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(bool b, ebool a) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbool(false);
        }
        uint256 bProc = b?1:0;
        return ebool.wrap(Impl.ne(ebool.unwrap(a), bProc, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(eaddress a, eaddress b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        if (!isInitialized(b)) {
            b = asEaddress(address(0));
        }
        return ebool.wrap(Impl.eq(eaddress.unwrap(a), eaddress.unwrap(b), false));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(eaddress a, eaddress b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        if (!isInitialized(b)) {
            b = asEaddress(address(0));
        }
        return ebool.wrap(Impl.ne(eaddress.unwrap(a), eaddress.unwrap(b), false));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(eaddress a, address b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        uint256 bProc = uint256(uint160(b));
        return ebool.wrap(Impl.eq(eaddress.unwrap(a), bProc, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(address b, eaddress a) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        uint256 bProc = uint256(uint160(b));
        return ebool.wrap(Impl.eq(eaddress.unwrap(a), bProc, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(eaddress a, address b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        uint256 bProc = uint256(uint160(b));
        return ebool.wrap(Impl.ne(eaddress.unwrap(a), bProc, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(address b, eaddress a) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEaddress(address(0));
        }
        uint256 bProc = uint256(uint160(b));
        return ebool.wrap(Impl.ne(eaddress.unwrap(a), bProc, true));
    }

    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, ebool a, ebool b) internal returns (ebool) {
        return ebool.wrap(Impl.select(ebool.unwrap(control), ebool.unwrap(a), ebool.unwrap(b)));
    }

    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, eaddress a, eaddress b) internal returns (eaddress) {
        return eaddress.wrap(Impl.select(ebool.unwrap(control), eaddress.unwrap(a), eaddress.unwrap(b)));
    }

    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, ebytes64 a, ebytes64 b) internal returns (ebytes64) {
        return ebytes64.wrap(Impl.select(ebool.unwrap(control), ebytes64.unwrap(a), ebytes64.unwrap(b)));
    }

    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, ebytes128 a, ebytes128 b) internal returns (ebytes128) {
        return ebytes128.wrap(Impl.select(ebool.unwrap(control), ebytes128.unwrap(a), ebytes128.unwrap(b)));
    }

    // If 'control''s value is 'true', the result has the same value as 'a'.
    // If 'control''s value is 'false', the result has the same value as 'b'.
    function select(ebool control, ebytes256 a, ebytes256 b) internal returns (ebytes256) {
        return ebytes256.wrap(Impl.select(ebool.unwrap(control), ebytes256.unwrap(a), ebytes256.unwrap(b)));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes64 a, ebytes64 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes64(padToBytes64(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes64.unwrap(a), ebytes64.unwrap(b), false));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes64 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes64.unwrap(a), b, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(bytes memory a, ebytes64 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes64.unwrap(b), a, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes64 a, ebytes64 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes64(padToBytes64(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes64.unwrap(a), ebytes64.unwrap(b), false));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes64 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes64.unwrap(a), b, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(bytes memory a, ebytes64 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes64(padToBytes64(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes64.unwrap(b), a, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes128 a, ebytes128 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes128(padToBytes128(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes128.unwrap(a), ebytes128.unwrap(b), false));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes128 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes128.unwrap(a), b, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(bytes memory a, ebytes128 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes128.unwrap(b), a, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes128 a, ebytes128 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes128(padToBytes128(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes128.unwrap(a), ebytes128.unwrap(b), false));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes128 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes128.unwrap(a), b, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(bytes memory a, ebytes128 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes128(padToBytes128(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes128.unwrap(b), a, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes256 a, ebytes256 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes256(padToBytes256(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes256.unwrap(a), ebytes256.unwrap(b), false));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(ebytes256 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes256.unwrap(a), b, true));
    }

    // Evaluate eq(a, b) and return the result.
    function eq(bytes memory a, ebytes256 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.eq(ebytes256.unwrap(b), a, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes256 a, ebytes256 b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes256(padToBytes256(hex''));
        }
        if (!isInitialized(b)) {
            b = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes256.unwrap(a), ebytes256.unwrap(b), false));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(ebytes256 a, bytes memory b) internal returns (ebool) {
        if (!isInitialized(a)) {
            a = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes256.unwrap(a), b, true));
    }

    // Evaluate ne(a, b) and return the result.
    function ne(bytes memory a, ebytes256 b) internal returns (ebool) {
        if (!isInitialized(b)) {
            b = asEbytes256(padToBytes256(hex''));
        }
        return ebool.wrap(Impl.ne(ebytes256.unwrap(b), a, true));
    }
`;
  return result;
}

function implCustomMethods(): string {
  return `
    // If 'control's value is 'true', the result has the same value as 'ifTrue'.
    // If 'control's value is 'false', the result has the same value as 'ifFalse'.
    function select(uint256 control, uint256 ifTrue, uint256 ifFalse) internal returns (uint256 result) {
        FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).fheIfThenElse(control, ifTrue, ifFalse);
    }

    function verify(
        bytes32 inputHandle,
        bytes memory inputProof,
        uint8 toType
    ) internal returns (uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).verifyCiphertext(inputHandle, msg.sender, inputProof, bytes1(toType));
        IACL($.ACLAddress).allowTransient(result, msg.sender);
    }

    function cast(
        uint256 ciphertext,
        uint8 toType
    ) internal returns (uint256 result) {
        FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).cast(ciphertext, bytes1(toType));
    }

    function trivialEncrypt(
        uint256 value,
        uint8 toType
    ) internal returns (uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).trivialEncrypt(value, bytes1(toType));
    }

    function trivialEncrypt(
      bytes memory value,
      uint8 toType
    ) internal returns (uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
        result = ITFHEExecutor($.TFHEExecutorAddress).trivialEncrypt(value, bytes1(toType));
    }

    function eq(uint256 lhs, bytes memory rhs, bool scalar) internal returns (uint256 result) {
      bytes1 scalarByte;
      if (scalar) {
          scalarByte = 0x01;
      } else {
          scalarByte = 0x00;
      }
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      result = ITFHEExecutor($.TFHEExecutorAddress).fheEq(lhs, rhs, scalarByte);
  }

  function ne(uint256 lhs, bytes memory rhs, bool scalar) internal returns (uint256 result) {
      bytes1 scalarByte;
      if (scalar) {
          scalarByte = 0x01;
      } else {
          scalarByte = 0x00;
      }
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      result = ITFHEExecutor($.TFHEExecutorAddress).fheNe(lhs, rhs, scalarByte);
  }

    function rand(uint8 randType) internal returns(uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      result = ITFHEExecutor($.TFHEExecutorAddress).fheRand(bytes1(randType));
    }

    function randBounded(uint256 upperBound, uint8 randType) internal returns(uint256 result) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      result = ITFHEExecutor($.TFHEExecutorAddress).fheRandBounded(upperBound, bytes1(randType));
    }

    function allowTransient(uint256 handle, address account) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      IACL($.ACLAddress).allowTransient(handle, account);
    }

    function allow(uint256 handle, address account) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      IACL($.ACLAddress).allow(handle, account);
    }

    function cleanTransientStorage() internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      IACL($.ACLAddress).cleanTransientStorage();
    }

    function isAllowed(uint256 handle, address account) internal view returns (bool) {
      FHEVMConfig.FHEVMConfigStruct storage $ = getFHEVMConfig();
      return IACL($.ACLAddress).isAllowed(handle, account);
    }
    `;
}

export function paymentSol(): string {
  const res: string = `// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;
  
import "../lib/FHEVMConfig.sol";
import "../lib/Impl.sol";

interface IFHEPayment {
  function depositETH(address account) external payable;
  function withdrawETH(uint256 amount, address receiver) external;
  function getAvailableDepositsETH(address account) external view returns(uint256);
}

library Payment {
    function depositForAccount(address account, uint256 amount) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      IFHEPayment($.FHEPaymentAddress).depositETH{value: amount}(account);
    }

    function depositForThis(uint256 amount) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      IFHEPayment($.FHEPaymentAddress).depositETH{value: amount}(address(this));
    }

    function withdrawToAccount(address account, uint256 amount) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      IFHEPayment($.FHEPaymentAddress).withdrawETH(amount, account);
    }

    function withdrawToThis(uint256 amount) internal {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      IFHEPayment($.FHEPaymentAddress).withdrawETH(amount, address(this));
    }

    function getDepositedBalanceOfAccount(address account) internal view returns (uint256) {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      return IFHEPayment($.FHEPaymentAddress).getAvailableDepositsETH(account);
    }

    function getDepositedBalanceOfThis() internal view returns (uint256) {
      FHEVMConfig.FHEVMConfigStruct storage $ = Impl.getFHEVMConfig();
      return IFHEPayment($.FHEPaymentAddress).getAvailableDepositsETH(address(this));
    }
  }
  `;

  return res;
}
