import { expect, test } from 'vitest';
import Contract from '../gen/contract/index.cjs';
import {
  CircuitResults,
  CircuitContext,
  constructorContext,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  increaseCounter,
  PrivateState,
  Witnesses,
  witnesses,
} from '../src/contract';
import * as crypto from 'node:crypto';
import {
  CoinInfo,
  createCoinInfo,
  decodeCoinInfo,
  encodeCoinInfo,
  nativeToken,
} from '@midnight-ntwrk/ledger';

class CounterSimulator {
  readonly instance = new Contract.Contract<PrivateState, Witnesses>(witnesses);
  #circuitContext: CircuitContext<PrivateState>;

  constructor(initialPrivateState: PrivateState) {
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.instance.initialState(
      constructorContext(initialPrivateState, '0'.repeat(64)),
    );
    this.#circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  get state(): Contract.Ledger {
    return Contract.ledger(this.#circuitContext.transactionContext.state);
  }

  get address(): string {
    return this.#circuitContext.transactionContext.address;
  }

  callContract<T>(
    privateState: PrivateState,
    cb: (
      context: CircuitContext<PrivateState>,
      contract: Contract.Contract<PrivateState, Witnesses>,
    ) => CircuitResults<PrivateState, T>,
  ): T {
    const callContext = {
      ...this.#circuitContext,
      currentPrivateState: privateState,
    };
    const result = cb(callContext, this.instance);
    this.#circuitContext = {
      ...this.#circuitContext,
      currentPrivateState: result.context.currentPrivateState,
      currentZswapLocalState: result.context.currentZswapLocalState,
      originalState: result.context.originalState,
      transactionContext: new QueryContext(
        result.context.transactionContext.state,
        callContext.transactionContext.address,
      ),
    };
    return result.result;
  }
}

class User {
  #sk: Buffer;
  #dustCoins: CoinInfo[];
  #permissionCoins: CoinInfo[] = [];

  get privateState(): PrivateState {
    return {
      secretKey: this.#sk.toString('hex'),
    };
  }

  static random(): User {
    const sk = crypto.randomBytes(32);
    return new User(sk);
  }

  constructor(sk: Buffer) {
    this.#sk = sk;
    this.#dustCoins = Array(5)
      .fill('')
      .map(() => createCoinInfo(nativeToken(), 10_000_000n));
  }

  deploy(): CounterSimulator {
    return new CounterSimulator(this.privateState);
  }

  increase(simulator: CounterSimulator, increment: bigint): void {
    simulator.callContract(this.privateState, (context, contract) => {
      const permissionCoin = this.#permissionCoins.pop();

      if (permissionCoin == undefined) {
        throw new Error('No permission coins present');
      }

      return contract.impureCircuits.increaseCounter(
        context,
        encodeCoinInfo(permissionCoin),
        increment,
      );
    });
  }

  buyPermission(simulator: CounterSimulator) {
    const permissionCoin = simulator.callContract(
      this.privateState,
      (context, contract) => {
        const coinToPay = this.#dustCoins.pop()!;
        return contract.impureCircuits.buyPermission(
          context,
          encodeCoinInfo(coinToPay),
        );
      },
    );

    this.#permissionCoins.push(decodeCoinInfo(permissionCoin));
  }
}

test('counter increases by 1', () => {
  const deployer = User.random();
  const simulator = deployer.deploy();

  deployer.buyPermission(simulator);
  deployer.increase(simulator, 1n);

  expect(simulator.state).toEqual({ counter: 1n });
});

test('counter increases by arbitrary number', () => {
  const deployer = User.random();
  const simulator = deployer.deploy();

  // Order does not matter here, ideally we would want to use a form of randomized test, e.g. property-based one
  const numbers = [1n, 2n, 10n, 42n];

  const sum = numbers.reduce((a, b) => a + b, 0n);

  for (const value of numbers) {
    const newUser = User.random();
    newUser.buyPermission(simulator);
    newUser.increase(simulator, value);
  }

  const endValue = simulator.state;

  expect(endValue.counter).toEqual(sum);
});

test('deployer cannot increase the counter without buying permission token', () => {
  const deployer = User.random();
  const simulator = deployer.deploy();

  expect(() => deployer.increase(simulator, 1n)).toThrow();
});

test('non-deployer cannot increase the counter without buying permission token', () => {
  const deployer = User.random();
  const nonDeployer = User.random();
  const simulator = deployer.deploy();

  expect(() => nonDeployer.increase(simulator, 1n)).toThrow();
});

test('buying permission token allows only single increase', () => {
  const deployer = User.random();
  const nonDeployer = User.random();
  const simulator = deployer.deploy();

  nonDeployer.buyPermission(simulator);
  nonDeployer.increase(simulator, 1n);

  expect(() => nonDeployer.increase(simulator, 1n)).toThrow();
});
