import test from 'tape';

import { addressLabels, killStuckProcess, spokSameBignum, spokSamePubkey } from './utils';
import {
  airdrop,
  assertConfirmedTransaction,
  assertTransactionSummary,
  PayerTransactionHandler,
} from '@metaplex-foundation/amman';
import { Connection, Transaction } from '@solana/web3.js';
import { LOCALHOST } from '@metaplex-foundation/amman';
import { createVault } from '../src/instructions/create-vault';
import { createExternalPriceAccount } from '../src/instructions/create-external-price-account';
import { Key, QUOTE_MINT, Vault, VaultState } from '../src/mpl-token-vault';
import spok from 'spok';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

killStuckProcess();

async function init() {
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

test('init-vault: create vault', async (t) => {
  const { transactionHandler, connection, authority } = await init();
  const [createExternalAccountIxs, createExternalAccountSigners, { externalPriceAccount }] =
    await createExternalPriceAccount(connection, authority);
  addressLabels.addLabel('externalPriceAccount', externalPriceAccount);

  const priceMint = QUOTE_MINT;
  addressLabels.addLabel('priceMint', priceMint);

  const [
    createVaultIxs,
    createVaultSigners,
    { vault, fractionMint, redeemTreasury, fractionTreasury, vaultAuthority },
  ] = await createVault(connection, {
    authority,
    priceMint,
    externalPriceAccount,
  });
  addressLabels.addLabel('vault', vault);
  addressLabels.addLabel('fractionMint', fractionMint);
  addressLabels.addLabel('redeemTreasury', redeemTreasury);
  addressLabels.addLabel('fractionTreasury', fractionTreasury);
  addressLabels.addLabel('vaultAuthority', vaultAuthority);

  // Need to split those up to avoid: Transaction too large: 1239 > 1232
  const createExternalAccountTx = new Transaction().add(...createExternalAccountIxs);
  const createVaultTx = new Transaction().add(...createVaultIxs);

  // Create external account
  const createExternalAccountRes = await transactionHandler.sendAndConfirmTransaction(
    createExternalAccountTx,
    createExternalAccountSigners,
  );

  assertConfirmedTransaction(t, createExternalAccountRes.txConfirmed);
  assertTransactionSummary(t, createExternalAccountRes.txSummary, {
    msgRx: [/Update External Price Account/i, /success/],
  });

  // Create Vault
  const createVaultRes = await transactionHandler.sendAndConfirmTransaction(
    createVaultTx,
    createVaultSigners,
  );

  assertConfirmedTransaction(t, createVaultRes.txConfirmed);
  assertTransactionSummary(t, createVaultRes.txSummary, {
    msgRx: [/InitializeMint/i, /InitializeAccount/i, /Init Vault/, /success/],
  });

  const vaultAccountInfo = await connection.getAccountInfo(vault);
  const [vaultAccount] = Vault.fromAccountInfo(vaultAccountInfo);

  spok(t, vaultAccount, {
    $topic: 'vaultAccount',
    key: Key.VaultV1,
    tokenProgram: spokSamePubkey(TOKEN_PROGRAM_ID),
    fractionMint: spokSamePubkey(fractionMint),
    redeemTreasury: spokSamePubkey(redeemTreasury),
    fractionTreasury: spokSamePubkey(fractionTreasury),
    pricingLookupAddress: spokSamePubkey(externalPriceAccount),
    authority: spokSamePubkey(authority),
    allowFurtherShareCreation: true,
    tokenTypeCount: 0,
    state: VaultState.Inactive,
    lockedPricePerShare: spokSameBignum(0),
  });
});
