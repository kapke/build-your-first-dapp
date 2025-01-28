import { DAppConnectorAPI } from '@midnight-ntwrk/dapp-connector-api';
import * as ledger from '@midnight-ntwrk/ledger';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { createBalancedTx, UnbalancedTransaction } from '@midnight-ntwrk/midnight-js-types';
import * as zswap from '@midnight-ntwrk/zswap';
import React, { useEffect, useState } from 'react';
import semver from 'semver';
import * as Contract from './contract';
import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';

export const prepareBrowserProviders = async (
  selectWallet: (
    wallets: [string, DAppConnectorAPI][],
  ) => Promise<DAppConnectorAPI | null>,
): Promise<Contract.Providers> => {
  const compatibleConnectorAPIVersion = '1.x';
  const selectedWwallet = await selectWallet(
    Object.entries(window.midnight ?? {}).filter(([key, api]) => {
      return semver.satisfies(api.apiVersion, compatibleConnectorAPIVersion);
    }),
  );

  if (selectedWwallet == null) {
    throw new Error('Could not initialize the dApp');
  }

  const connectedWallet = await selectedWwallet.enable();
  const config = await selectedWwallet.serviceUriConfig();
  const coinPublicKey = (await connectedWallet.state()).coinPublicKey;

  return {
    privateStateProvider: inMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
    ),
    zkConfigProvider: new FetchZkConfigProvider(
      `${window.location.origin}/gen`,
      window.fetch.bind(window),
    ),
    proofProvider: httpClientProofProvider(config.proverServerUri),
    midnightProvider: {
      submitTx(tx) {
        return connectedWallet.submitTransaction(
          zswap.Transaction.deserialize(
            tx.serialize(getLedgerNetworkId()),
            getZswapNetworkId(),
          ),
        );
      },
    },
    walletProvider: {
      coinPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins) {
        return connectedWallet
          .balanceAndProveTransaction(
            zswap.Transaction.deserialize(
              tx.serialize(getLedgerNetworkId()),
              getZswapNetworkId(),
            ),
            newCoins,
          )
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

export const Counter = () => {
  const [providers, setProviders] = useState<Contract.Providers | null>(null);

  const selectWallet = (
    wallets: [string, DAppConnectorAPI][],
  ): Promise<DAppConnectorAPI | null> => {
    if (wallets.length === 0) {
      return Promise.resolve(null);
    } else if (wallets.length === 1) {
      return Promise.resolve(wallets[0][1]);
    } else {
      const doPrompt = () => {
        const walletStrings = wallets
          .map(([key, connector], index) => `[${index + 1}] ${connector.name}`)
          .join('\n');
        // This is the quickest and dirties approach to make user select wallet
        // In the Midnight landscape it is not needed today, but will be soon
        const selected = window.prompt(
          `There are multiple Midnight wallets present, enter the number to select one to use:
                ${walletStrings}
                `,
          '1',
        );

        if (selected == null) {
          return Promise.resolve(null);
        } else {
          const parsed = Number.parseInt(selected, 10);
          if (Number.isNaN(parsed) || parsed > wallets.length || parsed == 0) {
            return doPrompt();
          } else {
            return Promise.resolve(wallets[parsed - 1][1]);
          }
        }
      };

      return doPrompt();
    }
  };

  useEffect(() => {
    prepareBrowserProviders(selectWallet).then(setProviders);
  }, []);

  return providers == null ? (
    <div>Preparing counter...</div>
  ) : (
    <CounterInitialized providers={providers} />
  );
};

const CounterInitialized = ({
  providers,
}: {
  providers: Contract.Providers;
}) => {
  const [address, setAddress] = useState<string>('');
  const [state, setState] = useState<Contract.State | null>(null);
  const [increment, setIncrement] = useState<number>(1);

  useEffect(() => {
    Contract.fetchState(address, providers).then(setState);
  }, [address]);

  const doIncrease = () => {
    Contract.increaseCounter(address, BigInt(increment), providers).then(
      setState,
    );
  };

  const doDeploy = () => {
    Contract.deploy(providers).then(({ address, initialState }) => {
      setAddress(address);
      setState(initialState);
    });
  };

  const addressChanged = (newValue: string) => {
    setIncrement(Number.parseInt(newValue, 10));
  };

  return (
    <div>
      <button onClick={doDeploy}>Deploy</button>
      <input
        type="text"
        value={address}
        onChange={(ev) => setAddress(ev.target.value)}
      />
      <div>Current state: {state?.counter}</div>
      <input
        type="number"
        value={increment}
        step={1}
        onChange={(ev) => addressChanged(ev.target.value)}
      />
      <button onClick={doIncrease}>Increase the counter</button>
    </div>
  );
};
