import { expect, test } from 'vitest';
import Contract from '../gen/contract/index.cjs';
import {
  CircuitResults,
  CircuitContext,
  constructorContext,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { PrivateState, Witnesses } from '../src/contract';

class CounterSimulator {
  readonly instance = new Contract.Contract<PrivateState, Witnesses>({});
  #circuitContext: CircuitContext<PrivateState>;

  constructor() {
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.instance.initialState(constructorContext({}, '0'.repeat(64)));
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
    cb: (
      context: CircuitContext<PrivateState>,
      contract: Contract.Contract<PrivateState, Witnesses>,
    ) => CircuitResults<PrivateState, T>,
  ): T {
    const callContext = {
      ...this.#circuitContext,
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

test('counter increases by 1', () => {
  const simulator = new CounterSimulator();

  simulator.callContract((context, contract) =>
    contract.impureCircuits.increaseCounter(context, 1n),
  );

  expect(simulator.state).toEqual({ counter: 1n });
});

test('counter increases by arbitrary number', () => {
  const simulator = new CounterSimulator();

  // Order does not matter here, ideally we would want to use a form of randomized test, e.g. property-based one
  const numbers = [1n, 2n, 10n, 42n];

  const sum = numbers.reduce((a, b) => a + b, 0n);

  for (const value of numbers) {
    simulator.callContract((context, contract) => {
      return contract.impureCircuits.increaseCounter(context, value);
    });
  }

  const endValue = simulator.state;

  expect(endValue.counter).toEqual(sum);
});
