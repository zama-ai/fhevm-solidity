import type { FhevmInstance } from 'fhevmjs';

import { BlindAuction, Comp, DecentralizedId, DidERC20, EncryptedERC20, GovernorZama, Rand } from '../types';
import type { Signers } from './signers';

declare module 'mocha' {
  export interface Context {
    signers: Signers;
    contractAddress: string;
    instances: FhevmInstances;
    erc20: EncryptedERC20;
    blindAuction: BlindAuction;
    rand: Rand;
    did: DecentralizedId;
    didErc20: DidERC20;
    comp: Comp;
    governor: GovernorZama;
  }
}

export interface FhevmInstances {
  alice: FhevmInstance;
  bob: FhevmInstance;
  carol: FhevmInstance;
  dave: FhevmInstance;
}
