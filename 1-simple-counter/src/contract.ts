import {
  deployContract,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  ContractAddress,
  sampleSigningKey,
} from '@midnight-ntwrk/onchain-runtime';
import Contract from '../gen/contract/index.cjs';

export type PrivateState = {};
export type Witnesses = {};

export type State = Contract.Ledger;
export type Providers = MidnightProviders<keyof Contract.ImpureCircuits<never>>;

const signingKey = sampleSigningKey();
const privateStateKey = '1-simple-counter';

export const deploy = async (
  providers: Providers,
): Promise<{ address: ContractAddress; initialState: State }> => {
  const deployed = await deployContract(providers, {
    contract: new Contract.Contract({}),
    initialPrivateState: {},
    privateStateKey: privateStateKey,
    signingKey,
  });
  const publicData = deployed.deployTxData.public;

  return {
    address: publicData.contractAddress,
    initialState: Contract.ledger(publicData.initialContractState.data),
  };
};

export const increaseCounter = async (
  address: ContractAddress,
  value: bigint,
  providers: Providers,
): Promise<State | null> => {
  const contract = await findDeployedContract(providers, {
    contract: new Contract.Contract({}),
    contractAddress: address,
    privateStateKey: privateStateKey,
    initialPrivateState: {},
    signingKey,
  });
  await contract.callTx.increaseCounter(value);
  return await fetchState(address, providers);
};

export const fetchState = async (
  address: ContractAddress,
  providers: Providers,
): Promise<State | null> => {
  try {
    const contractState =
      await providers.publicDataProvider.queryContractState(address);
    return contractState ? Contract.ledger(contractState.data) : null;
  } catch (error) {
    console.warn(
      `Error when fetching contract state from address ${address}`,
      error,
    );
    return null;
  }
};
