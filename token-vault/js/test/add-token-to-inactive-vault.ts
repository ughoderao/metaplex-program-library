import test from 'tape';

import { addressLabels, initVault, killStuckProcess, logDebug } from './utils';
import { Transaction } from '@solana/web3.js';
import {
  AddTokenToInactiveVault,
  AddTokenToInactiveVaultInstructionAccounts,
} from '../src/mpl-token-vault';

killStuckProcess();

test('inactive vault: add token', async (t) => {
  const {
    transactionHandler,
    connection,
    accounts: { payer, vault, authority: vaultAuthority, vaultAuthorityPair },
  } = await initVault(t, { allowFurtherShareCreation: true });

  const [createMintIxs, createMintSigners, { mintAccount }] =
    await AddTokenToInactiveVault.createTokenMint(connection, payer);

  const inactiveVault = new AddTokenToInactiveVault(connection, vault, vaultAuthority, mintAccount);

  const safetyDeposit = await inactiveVault.getSafetyDepositAccount();
  const [tokenAccountIxs, tokenAccountSigners, { tokenAccount }] =
    await inactiveVault.createTokenAccount(payer, 2);
  const [storeAccountIxs, storeAccountSigners, { storeAccount: store }] =
    await inactiveVault.createStoreAccount(payer);
  const [approveTransferIxs, approveTransferSigners, { transferAuthority, transferAuthorityPair }] =
    await AddTokenToInactiveVault.approveTransferAuthority(payer, tokenAccount, 1);

  addressLabels.addLabels({ mintAccount, tokenAccount, safetyDeposit, store, transferAuthority });

  const accounts: Omit<AddTokenToInactiveVaultInstructionAccounts, 'systemAccount'> = {
    safetyDepositAccount: safetyDeposit,
    tokenAccount,
    store,
    vault,
    vaultAuthority,
    payer,
    transferAuthority,
  };

  const addTokenIx = await inactiveVault.addTokenToInactiveVault({ amount: 2 }, accounts);

  const tx = new Transaction()
    .add(...createMintIxs)
    .add(...tokenAccountIxs)
    .add(...storeAccountIxs)
    .add(...approveTransferIxs)
    .add(addTokenIx);
  const signers = [
    ...createMintSigners,
    ...tokenAccountSigners,
    ...storeAccountSigners,
    ...approveTransferSigners,
    transferAuthorityPair,
    vaultAuthorityPair,
  ];

  logDebug({ signers: addressLabels.resolveKeypairs(signers) });

  const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
  console.log(res);
});
