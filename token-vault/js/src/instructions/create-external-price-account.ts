import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  createUpdateExternalPriceAccountInstruction,
  ExternalPriceAccount,
  ExternalPriceAccountArgs,
  Key,
  UpdateExternalPriceAccountInstructionAccounts,
  UpdateExternalPriceAccountInstructionArgs,
} from '../generated';
import { VAULT_PROGRAM_ID } from '../mpl-token-vault';

const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const QUOTE_MINT = WRAPPED_SOL_MINT;

export async function createExternalPriceAccount(connection: Connection, payer: PublicKey) {
  // -----------------
  // Create uninitialized external price account
  // -----------------
  const externalPriceAccount = Keypair.generate();

  const MAX_EXTERNAL_ACCOUNT_SIZE = ExternalPriceAccount.byteSize; // 1 + 8 + 32 + 1;

  const epaRentExempt = await connection.getMinimumBalanceForRentExemption(
    MAX_EXTERNAL_ACCOUNT_SIZE,
  );

  const uninitializedEPAIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: externalPriceAccount.publicKey,
    lamports: epaRentExempt,
    space: MAX_EXTERNAL_ACCOUNT_SIZE,
    programId: new PublicKey(VAULT_PROGRAM_ID),
  });

  // -----------------
  // Initialize External Price Account by "updating" it
  // -----------------
  const externalPriceAccountArgs: ExternalPriceAccountArgs = {
    key: Key.ExternalAccountKeyV1,
    pricePerShare: 0,
    priceMint: QUOTE_MINT,
    allowedToCombine: true,
  };

  const args: UpdateExternalPriceAccountInstructionArgs = {
    externalPriceAccount: ExternalPriceAccount.fromArgs(externalPriceAccountArgs),
  };
  const accounts: UpdateExternalPriceAccountInstructionAccounts = {
    externalPriceAccount: externalPriceAccount.publicKey,
  };

  const createIx = createUpdateExternalPriceAccountInstruction(accounts, args);
  return { instructions: [uninitializedEPAIx, createIx], externalPriceAccount };
}
