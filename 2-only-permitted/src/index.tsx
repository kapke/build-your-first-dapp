import {
  NetworkId,
  setNetworkId,
  stringToNetworkId,
} from '@midnight-ntwrk/midnight-js-network-id';
import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import { Counter } from './Counter';
import React from 'react';

// @ts-expect-error: In this way we can tell graphql internals about environment it's used in
globalThis.process = {
  env: {
    NODE_ENV: import.meta.env.MODE,
  },
};

// @ts-ignore
globalThis.Buffer = Buffer;

const networkId = import.meta.env['VITE_NETWORK_ID'] as string;
setNetworkId(stringToNetworkId(networkId) ?? NetworkId.TestNet);

const rootElement = document.getElementById('app')!;
const root = createRoot(rootElement);
root.render(<Counter />);
