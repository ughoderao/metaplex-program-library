import test from 'tape';
import { AddressLabels } from '@metaplex-foundation/amman';

import debug from 'debug';
import { VAULT_PROGRAM_ID } from '../../src/mpl-token-vault';
import { Connection } from '@solana/web3.js';
import { airdrop, PayerTransactionHandler, LOCALHOST } from '@metaplex-foundation/amman';

export * from './asserts';

export const logError = debug('vault:test:error');
export const logInfo = debug('vault:test:info');
export const logDebug = debug('vault:test:debug');
export const logTrace = debug('vault:test:trace');

const persistLabelsPath = process.env.ADDRESS_LABEL_PATH;
const knownLabels = {
  [VAULT_PROGRAM_ID]: 'TokenVault',
};

export const addressLabels = new AddressLabels(knownLabels, logDebug, persistLabelsPath);

export function killStuckProcess() {
  test.onFinish(() => process.exit(0));
}

export async function init() {
  const [authority, authorityPair] = addressLabels.genKeypair('authority');

  const connection = new Connection(LOCALHOST, 'confirmed');
  await airdrop(connection, authority, 2);

  const transactionHandler = new PayerTransactionHandler(connection, authorityPair);
  return {
    transactionHandler,
    connection,
    authority,
    authorityPair,
  };
}
