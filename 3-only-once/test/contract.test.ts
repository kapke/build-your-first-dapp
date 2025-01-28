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
  }

  deploy(): CounterSimulator {
    return new CounterSimulator(this.privateState);
  }

  increase(simulator: CounterSimulator, increment: bigint): void {
    simulator.callContract(this.privateState, (context, contract) => {
      return contract.impureCircuits.increaseCounter(context, increment);
    });
  }
}

test('counter increases by 1', () => {
  const deployer = User.random();
  const simulator = deployer.deploy();

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
    newUser.increase(simulator, value);
  }

  const endValue = simulator.state;

  expect(endValue.counter).toEqual(sum);
});

test('deployer can increase the counter only once', () => {
  const deployer = User.random();
  const simulator = deployer.deploy();
  deployer.increase(simulator, 1n);

  expect(() => deployer.increase(simulator, 1n)).toThrow();
});

test('non-deployer can increase the counter only once', () => {
  const deployer = User.random();
  const nonDeployer = User.random();
  const simulator = deployer.deploy();
  nonDeployer.increase(simulator, 1n);

  expect(() => nonDeployer.increase(simulator, 1n)).toThrow();
});
