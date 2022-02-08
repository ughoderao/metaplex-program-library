import test from 'tape';

import { addressLabels, killStuckProcess, spokSameBignum, spokSamePubkey } from './utils';
import {
  airdrop,
  assertConfirmedTransaction,
  assertError,
  assertTransactionSummary,
  PayerTransactionHandler,
} from '@metaplex-foundation/amman';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { LOCALHOST } from '@metaplex-foundation/amman';
import { createExternalPriceAccount } from '../src/instructions/create-external-price-account';
import { Key, QUOTE_MINT, Vault, VaultState } from '../src/mpl-token-vault';
import spok from 'spok';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { InitVault } from '../src/instructions/init-vault';

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

async function initInitVaultAccounts(
  t: test.Test,
  connection: Connection,
  transactionHandler: PayerTransactionHandler,
  authority: PublicKey,
) {
  // -----------------
  // Create External Account
  // -----------------
  const [createExternalAccountIxs, createExternalAccountSigners, { externalPriceAccount }] =
    await createExternalPriceAccount(connection, authority);

  const priceMint = QUOTE_MINT;

  addressLabels.addLabels({ externalPriceAccount, priceMint });

  // -----------------
  // Setup Init Vault Accounts
  // -----------------
  const [setupAccountsIxs, setupAccountsSigners, initVaultAccounts] =
    await InitVault.setupInitVaultAccounts(connection, {
      authority,
      priceMint,
      externalPriceAccount,
    });

  addressLabels.addLabels(initVaultAccounts);

  const createAndSetupAccountsTx = new Transaction()
    .add(...createExternalAccountIxs)
    .add(...setupAccountsIxs);

  const createAndSetupAccountsRes = await transactionHandler.sendAndConfirmTransaction(
    createAndSetupAccountsTx,
    [...createExternalAccountSigners, ...setupAccountsSigners],
  );

  assertConfirmedTransaction(t, createAndSetupAccountsRes.txConfirmed);
  assertTransactionSummary(t, createAndSetupAccountsRes.txSummary, {
    msgRx: [/Update External Price Account/i, /InitializeMint/i, /InitializeAccount/i, /success/],
  });

  return initVaultAccounts;
}

test('init-vault: init vault allowing further share creation', async (t) => {
  const { transactionHandler, connection, authority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    authority,
  );

  const initVaultIx = await InitVault.initVault(initVaultAccounts, {
    allowFurtherShareCreation: true,
  });

  const initVaulTx = new Transaction().add(initVaultIx);
  const initVaultRes = await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);

  assertConfirmedTransaction(t, initVaultRes.txConfirmed);
  assertTransactionSummary(t, initVaultRes.txSummary, {
    msgRx: [/Init Vault/, /success/],
  });

  const { fractionMint, redeemTreasury, fractionTreasury, vault, pricingLookupAddress } =
    initVaultAccounts;

  const vaultAccountInfo = await connection.getAccountInfo(vault);
  const [vaultAccount] = Vault.fromAccountInfo(vaultAccountInfo);

  spok(t, vaultAccount, {
    $topic: 'vaultAccount',
    key: Key.VaultV1,
    tokenProgram: spokSamePubkey(TOKEN_PROGRAM_ID),
    fractionMint: spokSamePubkey(fractionMint),
    redeemTreasury: spokSamePubkey(redeemTreasury),
    fractionTreasury: spokSamePubkey(fractionTreasury),
    pricingLookupAddress: spokSamePubkey(pricingLookupAddress),
    authority: spokSamePubkey(authority),
    allowFurtherShareCreation: true,
    tokenTypeCount: 0,
    state: VaultState.Inactive,
    lockedPricePerShare: spokSameBignum(0),
  });
});

test('init-vault: init vault not allowing further share creation', async (t) => {
  const { transactionHandler, connection, authority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    authority,
  );

  const initVaultIx = await InitVault.initVault(initVaultAccounts, {
    allowFurtherShareCreation: false,
  });

  const initVaulTx = new Transaction().add(initVaultIx);
  const initVaultRes = await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);

  assertConfirmedTransaction(t, initVaultRes.txConfirmed);
  assertTransactionSummary(t, initVaultRes.txSummary, {
    msgRx: [/Init Vault/, /success/],
  });

  const { fractionMint, redeemTreasury, fractionTreasury, vault, pricingLookupAddress } =
    initVaultAccounts;

  const vaultAccountInfo = await connection.getAccountInfo(vault);
  const [vaultAccount] = Vault.fromAccountInfo(vaultAccountInfo);

  spok(t, vaultAccount, {
    $topic: 'vaultAccount',
    key: Key.VaultV1,
    tokenProgram: spokSamePubkey(TOKEN_PROGRAM_ID),
    fractionMint: spokSamePubkey(fractionMint),
    redeemTreasury: spokSamePubkey(redeemTreasury),
    fractionTreasury: spokSamePubkey(fractionTreasury),
    pricingLookupAddress: spokSamePubkey(pricingLookupAddress),
    authority: spokSamePubkey(authority),
    allowFurtherShareCreation: false,
    tokenTypeCount: 0,
    state: VaultState.Inactive,
    lockedPricePerShare: spokSameBignum(0),
  });
});

test('init-vault: init vault twice for same account', async (t) => {
  const { transactionHandler, connection, authority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    authority,
  );

  {
    const initVaultIx = await InitVault.initVault(initVaultAccounts, {
      allowFurtherShareCreation: true,
    });

    const initVaulTx = new Transaction().add(initVaultIx);
    await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);
  }
  {
    const initVaultIx = await InitVault.initVault(initVaultAccounts, {
      allowFurtherShareCreation: true,
    });

    const initVaulTx = new Transaction().add(initVaultIx);
    try {
      await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);
    } catch (err: any) {
      assertError(t, err, [/Init Vault/i, /Already initialized/i]);
    }
  }
});
