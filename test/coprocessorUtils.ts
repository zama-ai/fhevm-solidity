import dotenv from 'dotenv';
import { log2 } from 'extra-bigint';
import * as fs from 'fs';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import { Database } from 'sqlite3';

import operatorsPrices from '../codegen/operatorsPrices.json';

const parsedEnvCoprocessor = dotenv.parse(fs.readFileSync('node_modules/fhevm-core-contracts/addresses/.env.exec'));
const coprocAddress = parsedEnvCoprocessor.TFHE_EXECUTOR_CONTRACT_ADDRESS;

let firstBlockListening = 0;
let lastBlockSnapshot = 0;
let lastCounterRand = 0;
let counterRand = 0;
let chainId: number;

//const db = new Database('./sql.db'); // on-disk db for debugging
const db = new Database(':memory:');

export function insertSQL(handle: string, clearText: BigInt, replace: boolean = false) {
  if (replace) {
    // this is useful if using snapshots while sampling different random numbers on each revert
    db.run('INSERT OR REPLACE INTO ciphertexts (handle, clearText) VALUES (?, ?)', [handle, clearText.toString()]);
  } else {
    db.run('INSERT OR IGNORE INTO ciphertexts (handle, clearText) VALUES (?, ?)', [handle, clearText.toString()]);
  }
}

// Decrypt any handle, bypassing ACL
// WARNING : only for testing or internal use
export const getClearText = async (handle: BigInt): Promise<string> => {
  const handleStr = '0x' + handle.toString(16).padStart(64, '0');

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxRetries = 100;

    function executeQuery() {
      db.get('SELECT clearText FROM ciphertexts WHERE handle = ?', [handleStr], (err, row) => {
        if (err) {
          reject(new Error(`Error querying database: ${err.message}`));
        } else if (row) {
          resolve(row.clearText);
        } else if (attempts < maxRetries) {
          attempts++;
          executeQuery();
        } else {
          reject(new Error('No record found after maximum retries'));
        }
      });
    }

    executeQuery();
  });
};

db.serialize(() => db.run('CREATE TABLE IF NOT EXISTS ciphertexts (handle BINARY PRIMARY KEY,clearText TEXT)'));

interface FHEVMEvent {
  eventName: string;
  args: object;
}

const NumBits = {
  0: 1n, //ebool
  1: 4n, //euint4
  2: 8n, //euint8
  3: 16n, //euint16
  4: 32n, //euint32
  5: 64n, //euint64
  6: 128n, //euint128
  7: 160n, //eaddress
  8: 256n, //euint256
  9: 512n, //ebytes64
  10: 1024n, //ebytes128
  11: 2048n, //ebytes256
};

export function numberToEvenHexString(num: number) {
  if (typeof num !== 'number' || num < 0) {
    throw new Error('Input should be a non-negative number.');
  }
  let hexString = num.toString(16);
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }
  return hexString;
}

function getRandomBigInt(numBits: number): bigint {
  if (numBits <= 0) {
    throw new Error('Number of bits must be greater than 0');
  }
  const numBytes = Math.ceil(numBits / 8);
  const randomBytes = new Uint8Array(numBytes);
  crypto.getRandomValues(randomBytes);
  let randomBigInt = BigInt(0);
  for (let i = 0; i < numBytes; i++) {
    randomBigInt = (randomBigInt << BigInt(8)) | BigInt(randomBytes[i]);
  }
  const mask = (BigInt(1) << BigInt(numBits)) - BigInt(1);
  randomBigInt = randomBigInt & mask;
  return randomBigInt;
}

function bitwiseNotUintBits(value: BigInt, numBits: number) {
  if (typeof value !== 'bigint') {
    throw new TypeError('The input value must be a BigInt.');
  }
  if (typeof numBits !== 'number' || numBits <= 0) {
    throw new TypeError('The numBits parameter must be a positive integer.');
  }
  // Create the mask with numBits bits set to 1
  const BIT_MASK = (BigInt(1) << BigInt(numBits)) - BigInt(1);
  return ~value & BIT_MASK;
}

export const awaitCoprocessor = async (): Promise<void> => {
  chainId = (await ethers.provider.getNetwork()).chainId;
  await processAllPastTFHEExecutorEvents();
};

const abi = [
  'event FheAdd(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheSub(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheMul(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheDiv(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheRem(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheBitAnd(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheBitOr(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheBitXor(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheShl(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheShr(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheRotl(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheRotr(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheEq(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheEqBytes(address indexed caller, uint256 lhs, bytes rhs, bytes1 scalarByte, uint256 result)',
  'event FheNe(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheNeBytes(address indexed caller, uint256 lhs, bytes rhs, bytes1 scalarByte, uint256 result)',
  'event FheGe(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheGt(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheLe(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheLt(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheMin(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheMax(address indexed caller, uint256 lhs, uint256 rhs, bytes1 scalarByte, uint256 result)',
  'event FheNeg(address indexed caller, uint256 ct, uint256 result)',
  'event FheNot(address indexed caller, uint256 ct, uint256 result)',
  'event VerifyCiphertext(address indexed caller, bytes32 inputHandle,address userAddress,bytes inputProof,bytes1 inputType,uint256 result)',
  'event Cast(address indexed caller, uint256 ct, bytes1 toType, uint256 result)',
  'event TrivialEncrypt(address indexed caller, uint256 pt, bytes1 toType, uint256 result)',
  'event TrivialEncryptBytes(address indexed caller, bytes pt, bytes1 toType, uint256 result)',
  'event FheIfThenElse(address indexed caller, uint256 control, uint256 ifTrue, uint256 ifFalse, uint256 result)',
  'event FheRand(address indexed caller, bytes1 randType, bytes16 seed, uint256 result)',
  'event FheRandBounded(address indexed caller, uint256 upperBound, bytes1 randType, bytes16 seed, uint256 result)',
];

async function processAllPastTFHEExecutorEvents() {
  const provider = ethers.provider;
  const latestBlockNumber = await provider.getBlockNumber();

  if (hre.__SOLIDITY_COVERAGE_RUNNING !== true) {
    // evm_snapshot is not supported in coverage mode
    [lastBlockSnapshot, lastCounterRand] = await provider.send('get_lastBlockSnapshot');
    if (lastBlockSnapshot < firstBlockListening) {
      firstBlockListening = lastBlockSnapshot + 1;
      counterRand = Number(lastCounterRand);
    }
  }

  const contract = new ethers.Contract(coprocAddress, abi, provider);

  // Fetch all events emitted by the contract
  const filter = {
    address: coprocAddress,
    fromBlock: firstBlockListening,
    toBlock: latestBlockNumber,
  };

  const logs = await provider.getLogs(filter);

  const events = logs
    .map((log) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return {
          eventName: parsedLog.name,
          args: parsedLog.args,
        };
      } catch (e) {
        // If the log cannot be parsed, skip it
        return null;
      }
    })
    .filter((event) => event !== null);

  firstBlockListening = latestBlockNumber + 1;
  if (hre.__SOLIDITY_COVERAGE_RUNNING !== true) {
    // evm_snapshot is not supported in coverage mode
    await provider.send('set_lastBlockSnapshot', [firstBlockListening]);
  }
  events.map(async (event) => await insertHandleFromEvent(event));
}

async function insertHandleFromEvent(event: FHEVMEvent) {
  let handle;
  let clearText;
  let clearLHS;
  let clearRHS;
  let resultType;
  let shift;

  switch (event.eventName) {
    case 'TrivialEncrypt':
      clearText = event.args[1];
      handle = ethers.toBeHex(event.args[3], 32);
      insertSQL(handle, clearText);
      break;

    case 'TrivialEncryptBytes':
      clearText = event.args[1];
      handle = ethers.toBeHex(event.args[3], 32);
      insertSQL(handle, clearText);
      break;

    case 'FheAdd':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) + event.args[2];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) + BigInt(clearRHS);
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(ethers.toBeHex(handle, 32), clearText);
      break;

    case 'FheSub':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) - event.args[2];
        if (clearText < 0n) clearText = clearText + 2n ** NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) - BigInt(clearRHS);
        if (clearText < 0n) clearText = clearText + 2n ** NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheMul':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) * event.args[2];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) * BigInt(clearRHS);
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheDiv':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) / event.args[2];
      } else {
        throw new Error('Non-scalar div not implemented yet');
      }
      insertSQL(handle, clearText);
      break;

    case 'FheRem':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) % event.args[2];
      } else {
        throw new Error('Non-scalar rem not implemented yet');
      }
      insertSQL(handle, clearText);
      break;

    case 'FheBitAnd':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) & event.args[2];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) & BigInt(clearRHS);
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheBitOr':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) | event.args[2];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) | BigInt(clearRHS);
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheBitXor':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) ^ event.args[2];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) ^ BigInt(clearRHS);
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheShl':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) << event.args[2] % NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) << BigInt(clearRHS) % NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheShr':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) >> event.args[2] % NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) >> BigInt(clearRHS) % NumBits[resultType];
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheRotl':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        shift = event.args[2] % NumBits[resultType];
        clearText = (BigInt(clearLHS) << shift) | (BigInt(clearLHS) >> (NumBits[resultType] - shift));
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        shift = BigInt(clearRHS) % NumBits[resultType];
        clearText = (BigInt(clearLHS) << shift) | (BigInt(clearLHS) >> (NumBits[resultType] - shift));
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheRotr':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        shift = event.args[2] % NumBits[resultType];
        clearText = (BigInt(clearLHS) >> shift) | (BigInt(clearLHS) << (NumBits[resultType] - shift));
        clearText = clearText % 2n ** NumBits[resultType];
      } else {
        clearRHS = await getClearText(event.args[2]);
        shift = BigInt(clearRHS) % NumBits[resultType];
        clearText = (BigInt(clearLHS) >> shift) | (BigInt(clearLHS) << (NumBits[resultType] - shift));
        clearText = clearText % 2n ** NumBits[resultType];
      }
      insertSQL(handle, clearText);
      break;

    case 'FheEq':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) === event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) === BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheEqBytes':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) === BigInt(event.args[2]) ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) === BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheNe':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) !== event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) !== BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheNeBytes':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) !== BigInt(event.args[2]) ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) !== BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheGe':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) >= event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) >= BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheGt':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) > event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) > BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheLe':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) <= event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) <= BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheLt':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) < event.args[2] ? 1n : 0n;
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) < BigInt(clearRHS) ? 1n : 0n;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheMax':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) > event.args[2] ? clearLHS : event.args[2];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) > BigInt(clearRHS) ? clearLHS : clearRHS;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheMin':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearLHS = await getClearText(event.args[1]);
      if (event.args[3] === '0x01') {
        clearText = BigInt(clearLHS) < event.args[2] ? clearLHS : event.args[2];
      } else {
        clearRHS = await getClearText(event.args[2]);
        clearText = BigInt(clearLHS) < BigInt(clearRHS) ? clearLHS : clearRHS;
      }
      insertSQL(handle, clearText);
      break;

    case 'Cast':
      resultType = parseInt(event.args[2]);
      handle = ethers.toBeHex(event.args[3], 32);
      clearText = BigInt(await getClearText(event.args[1])) % 2n ** NumBits[resultType];
      insertSQL(handle, clearText);
      break;

    case 'FheNot':
      handle = ethers.toBeHex(event.args[2], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearText = BigInt(await getClearText(event.args[1]));
      clearText = bitwiseNotUintBits(clearText, Number(NumBits[resultType]));
      insertSQL(handle, clearText);
      break;

    case 'FheNeg':
      handle = ethers.toBeHex(event.args[2], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      clearText = BigInt(await getClearText(event.args[1]));
      clearText = bitwiseNotUintBits(clearText, Number(NumBits[resultType]));
      clearText = (clearText + 1n) % 2n ** NumBits[resultType];
      insertSQL(handle, clearText);
      break;

    case 'VerifyCiphertext':
      handle = event.args[1];
      try {
        await getClearText(BigInt(handle));
      } catch {
        throw Error('User input was not found in DB');
      }
      break;

    case 'FheIfThenElse':
      handle = ethers.toBeHex(event.args[4], 32);
      resultType = parseInt(handle.slice(-4, -2), 16);
      handle = ethers.toBeHex(event.args[4], 32);
      const clearControl = BigInt(await getClearText(event.args[1]));
      const clearIfTrue = BigInt(await getClearText(event.args[2]));
      const clearIfFalse = BigInt(await getClearText(event.args[3]));
      if (clearControl === 1n) {
        clearText = clearIfTrue;
      } else {
        clearText = clearIfFalse;
      }
      insertSQL(handle, clearText);
      break;

    case 'FheRand':
      resultType = parseInt(event.args[1], 16);
      handle = ethers.toBeHex(event.args[3], 32);
      clearText = getRandomBigInt(Number(NumBits[resultType]));
      insertSQL(handle, clearText, true);
      counterRand++;
      break;

    case 'FheRandBounded':
      resultType = parseInt(event.args[2], 16);
      handle = ethers.toBeHex(event.args[4], 32);
      clearText = getRandomBigInt(Number(log2(BigInt(event.args[1]))));
      insertSQL(handle, clearText, true);
      counterRand++;
      break;
  }
}

export function getFHEGasFromTxReceipt(receipt: ethers.TransactionReceipt): number {
  if (receipt.status === 0) {
    throw new Error('Transaction reverted');
  }
  const contract = new ethers.Contract(coprocAddress, abi, ethers.provider);
  const relevantLogs = receipt.logs.filter((log: ethers.Log) => {
    if (log.address.toLowerCase() !== coprocAddress.toLowerCase()) {
      return false;
    }
    try {
      const parsedLog = contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      return abi.some((item) => item.startsWith(`event ${parsedLog.name}`) && parsedLog.name !== 'VerifyCiphertext');
    } catch {
      return false;
    }
  });
  const FHELogs = relevantLogs.map((log: ethers.Log) => {
    const parsedLog = contract.interface.parseLog({
      topics: log.topics,
      data: log.data,
    });
    return {
      name: parsedLog.name,
      args: parsedLog.args,
    };
  });
  let FHEGasConsumed = 0;
  for (const event of FHELogs) {
    let type;
    let handle;
    switch (event.name) {
      case 'TrivialEncrypt':
        type = parseInt(event.args[2], 16);
        FHEGasConsumed += operatorsPrices['trivialEncrypt'].types[type];
        break;

      case 'TrivialEncryptBytes':
        type = parseInt(event.args[2], 16);
        FHEGasConsumed += operatorsPrices['trivialEncrypt'].types[type];
        break;

      case 'FheAdd':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheAdd'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheAdd'].nonScalar[type];
        }
        break;

      case 'FheSub':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheSub'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheSub'].nonScalar[type];
        }
        break;

      case 'FheMul':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheMul'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheMul'].nonScalar[type];
        }
        break;

      case 'FheDiv':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheDiv'].scalar[type];
        } else {
          throw new Error('Non-scalar div not implemented yet');
        }
        break;

      case 'FheRem':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheRem'].scalar[type];
        } else {
          throw new Error('Non-scalar rem not implemented yet');
        }
        break;

      case 'FheBitAnd':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheBitAnd'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheBitAnd'].nonScalar[type];
        }
        break;

      case 'FheBitOr':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheBitOr'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheBitOr'].nonScalar[type];
        }
        break;

      case 'FheBitXor':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheBitXor'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheBitXor'].nonScalar[type];
        }
        break;

      case 'FheShl':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheBitShl'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheBitShl'].nonScalar[type];
        }
        break;

      case 'FheShr':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheBitShr'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheBitShr'].nonScalar[type];
        }
        break;

      case 'FheRotl':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheRotl'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheRotl'].nonScalar[type];
        }
        break;

      case 'FheRotr':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheRotr'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheRotr'].nonScalar[type];
        }
        break;

      case 'FheEq':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheEq'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheEq'].nonScalar[type];
        }
        break;

      case 'FheEqBytes':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheEq'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheEq'].nonScalar[type];
        }

      case 'FheNe':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheNe'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheNe'].nonScalar[type];
        }
        break;

      case 'FheNeBytes':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheNe'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheNe'].nonScalar[type];
        }
        break;

      case 'FheGe':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheGe'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheGe'].nonScalar[type];
        }
        break;

      case 'FheGt':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheGt'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheGt'].nonScalar[type];
        }
        break;

      case 'FheLe':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheLe'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheLe'].nonScalar[type];
        }
        break;

      case 'FheLt':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheLt'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheLt'].nonScalar[type];
        }
        break;

      case 'FheMax':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheMax'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheMax'].nonScalar[type];
        }
        break;

      case 'FheMin':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        if (event.args[3] === '0x01') {
          FHEGasConsumed += operatorsPrices['fheMin'].scalar[type];
        } else {
          FHEGasConsumed += operatorsPrices['fheMin'].nonScalar[type];
        }
        break;

      case 'Cast':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        FHEGasConsumed += operatorsPrices['cast'].types[type];
        break;

      case 'FheNot':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        FHEGasConsumed += operatorsPrices['fheNot'].types[type];
        break;

      case 'FheNeg':
        handle = ethers.toBeHex(event.args[1], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        FHEGasConsumed += operatorsPrices['fheNeg'].types[type];
        break;

      case 'FheIfThenElse':
        handle = ethers.toBeHex(event.args[4], 32);
        type = parseInt(handle.slice(-4, -2), 16);
        FHEGasConsumed += operatorsPrices['ifThenElse'].types[type];
        break;

      case 'FheRand':
        type = parseInt(event.args[1], 16);
        FHEGasConsumed += operatorsPrices['fheRand'].types[type];
        break;

      case 'FheRandBounded':
        type = parseInt(event.args[2], 16);
        FHEGasConsumed += operatorsPrices['fheRandBounded'].types[type];
        break;
    }
  }
  return FHEGasConsumed;
}
