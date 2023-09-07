import { expect } from 'chai';
import { ethers } from 'hardhat';

import { createInstances } from '../instance';
import { getSigners } from '../signers';
import { deployRandFixture } from './Rand.fixture';

describe('Rand', function () {
  before(async function () {
    this.signers = await getSigners();
  });

  beforeEach(async function () {
    const contract = await deployRandFixture();
    this.contractAddress = await contract.getAddress();
    this.rand = contract;
    this.instances = await createInstances(this.contractAddress, ethers, this.signers);
  });

  it('8 bits', async function () {
    const values: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      const txn = await this.rand.generate8();
      await txn.wait();
      const value = await this.rand.get8();
      expect(value).to.be.lessThanOrEqual(0xff);
      values.push(value);
    }
    // Expect at least two different generated values.
    const unique = new Set(values);
    expect(unique.size).to.be.greaterThanOrEqual(2);
  });

  it('16 bits', async function () {
    const values: bigint[] = [];
    let has16bit: boolean = false;
    for (let i = 0; i < 5; i++) {
      const txn = await this.rand.generate16();
      await txn.wait();
      const value = await this.rand.get16();
      expect(value).to.be.lessThanOrEqual(0xffff);
      if (value > 0xff) {
        has16bit = true;
      }
      values.push(value);
    }
    // Make sure we actually generate 16 bit integers.
    expect(has16bit).to.be.true;
    // Expect at least two different generated values.
    const unique = new Set(values);
    expect(unique.size).to.be.greaterThanOrEqual(2);
  });

  it('32 bits', async function () {
    const values: bigint[] = [];
    let has32bit: boolean = false;
    for (let i = 0; i < 5; i++) {
      const txn = await this.rand.generate32();
      await txn.wait();
      const value = await this.rand.get32();
      expect(value).to.be.lessThanOrEqual(0xffffffff);
      if (value > 0xffff) {
        has32bit = true;
      }
      values.push(value);
    }
    // Make sure we actually generate 32 bit integers.
    expect(has32bit).to.be.true;
    // Expect at least two different generated values.
    const unique = new Set(values);
    expect(unique.size).to.be.greaterThanOrEqual(2);
  });

  it('8 bits in view', async function () {
    await expect(this.rand.generate8InView()).to.be.rejected;
  });

  it('16 bits in view', async function () {
    await expect(this.rand.generate16InView()).to.be.rejected;
  });

  it('32 bits in view', async function () {
    await expect(this.rand.generate32InView()).to.be.rejected;
  });
});
