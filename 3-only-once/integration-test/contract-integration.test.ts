import * as ledger from '@midnight-ntwrk/ledger';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  NetworkId,
  setNetworkId,
} from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  createBalancedTx,
  UnbalancedTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import { WalletBuilder } from '@midnight-ntwrk/wallet';
import { Wallet } from '@midnight-ntwrk/wallet-api';
import * as zswap from '@midnight-ntwrk/zswap';
import * as path from 'node:path';
import * as url from 'node:url';
import * as nodeCrypto from 'node:crypto';
import * as rxjs from 'rxjs';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  beforeEach,
} from 'vitest';
import * as Contract from '../src/contract';
import { inMemoryPrivateStateProvider } from '../src/in-memory-private-state-provider';
import { DockerComposeEnvironment, Wait } from 'testcontainers';

setNetworkId(NetworkId.Undeployed);

const currentDir = path.dirname(url.fileURLToPath(import.meta.url));

type URIConfig = {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
  substrateNodeUri: string;
};

const prepareNodeTestProviders = async (
  config: URIConfig,
  wallet: Wallet,
): Promise<Contract.Providers> => {
  const walletInitialState = await rxjs.firstValueFrom(wallet.state());

  return {
    privateStateProvider: inMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
    ),
    zkConfigProvider: new NodeZkConfigProvider(
      path.resolve(currentDir, '../gen'),
    ),
    proofProvider: httpClientProofProvider(config.proverServerUri),
    midnightProvider: {
      submitTx(tx) {
        return wallet.submitTransaction(
          zswap.Transaction.deserialize(
            tx.serialize(getLedgerNetworkId()),
            getZswapNetworkId(),
          ),
        );
      },
    },
    walletProvider: {
      coinPublicKey: walletInitialState.coinPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins) {
        return wallet
          .balanceTransaction(
            zswap.Transaction.deserialize(
              tx.serialize(getLedgerNetworkId()),
              getZswapNetworkId(),
            ),
            newCoins,
          )
          .then((balanced) => wallet.proveTransaction(balanced))
          .then((zswapTx) =>
            ledger.Transaction.deserialize(
              zswapTx.serialize(getZswapNetworkId()),
              getLedgerNetworkId(),
            ),
          )
          .then(createBalancedTx);
      },
    },
  };
};

type Environment = {
  getConfig(): Promise<URIConfig>;
};
const prepareEnvironment = async (): Promise<
  [Environment, () => Promise<void>]
> => {
  const id = nodeCrypto.randomBytes(6).toString('hex');

  const names = {
    proofServer: `byfd-proof-server-${id}`,
    indexer: `byfd-indexer-${id}`,
    node: `byfd-node-${id}`,
  };

  const env = new DockerComposeEnvironment(
    path.resolve(currentDir, '../../docker'),
    'standalone.test.yml',
  )
    .withWaitStrategy(names.proofServer, Wait.forListeningPorts())
    .withWaitStrategy(names.indexer, Wait.forListeningPorts())
    .withWaitStrategy(names.node, Wait.forListeningPorts())
    .withEnvironment({ TEST_ID: id });
  const started = await env.up();

  const ports = {
    indexer: started.getContainer(names.indexer).getMappedPort(8088),
    proofServer: started.getContainer(names.proofServer).getMappedPort(6300),
    node: started.getContainer(names.node).getMappedPort(9944),
  };

  return [
    {
      getConfig: () =>
        Promise.resolve({
          indexerUri: `http://localhost:${ports.indexer}/api/v1/graphql`,
          indexerWsUri: `ws://localhost:${ports.indexer}/api/v1/graphql/ws`,
          proverServerUri: `http://localhost:${ports.proofServer}`,
          substrateNodeUri: `http://localhost:${ports.node}`,
        }),
    },
    async () => {
      await started.down({ removeVolumes: true, timeout: 10_000 });
    },
  ];
};

const prepareWallet = async (
  config: URIConfig,
): Promise<[Wallet, () => Promise<void>]> => {
  const wallet = await WalletBuilder.buildFromSeed(
    config.indexerUri,
    config.indexerWsUri,
    config.proverServerUri,
    config.substrateNodeUri,
    '0000000000000000000000000000000000000000000000000000000000000042',
    getZswapNetworkId(),
  );
  wallet.start();
  await rxjs.firstValueFrom(
    wallet
      .state()
      .pipe(rxjs.filter((state) => state.balances[zswap.nativeToken()] > 0n)),
  );

  return [wallet, () => wallet.close()];
};

describe('Counter contract', () => {
  let environment: Environment;
  let teardownEnvironment: () => Promise<void>;
  let wallet: Wallet;
  let teardownWallet: () => Promise<void>;
  let providers: Contract.Providers;

  beforeAll(async () => {
    [environment, teardownEnvironment] = await prepareEnvironment();
  });

  afterAll(() => {
    return teardownEnvironment();
  });

  beforeAll(async () => {
    [wallet, teardownWallet] = await prepareWallet(
      await environment.getConfig(),
    );
  });

  afterAll(() => {
    return teardownWallet();
  });

  beforeEach(async () => {
    providers = await prepareNodeTestProviders(
      await environment.getConfig(),
      wallet,
    );
  });

  test('it can be deployed and called', async () => {
    const privateState: Contract.PrivateState = {
      secretKey: nodeCrypto.randomBytes(32).toString('hex'),
    };
    await providers.privateStateProvider.set(
      Contract.privateStateKey,
      privateState,
    );

    const { address, initialState } = await Contract.deploy(providers);
    await Contract.increaseCounter(address, 42n, providers);
    const final = await Contract.fetchState(address, providers);

    expect(initialState.counter).toEqual(0n);
    expect(final?.counter).toEqual(42n);
  });
});
