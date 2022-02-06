import { AccountLayout as TokenAccountLayout, MintLayout } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { createMint, createTokenAccount } from '../common/helpers';
import { createInitVaultInstruction, InitVaultInstructionAccounts, Vault } from '../generated';

// TODO(thlorenz): shank Parse out of Rust
const VAULT_PREFIX = 'vault';
// TODO(thlorenz): we already have that just need to expose it somewhere
const VAULT_PROGRAM_ID = 'vau1zxA2LbssAUEF7Gpw91zMM1LvXrvpzJtmZ58rPsn';

export async function createVault(
  connection: Connection,
  args: { authority: PublicKey; priceMint: PublicKey; externalPriceAccount: PublicKey },
) {
  const { authority, priceMint, externalPriceAccount } = args;

  // NOTE: these signers and instructions are pushed onto inside the respective create* calls
  const signers: Keypair[] = [];
  const instructions: TransactionInstruction[] = [];

  // -----------------
  // Rent Exempts
  // -----------------
  const tokenAccountRentExempt = await connection.getMinimumBalanceForRentExemption(
    TokenAccountLayout.span,
  );

  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
  const MAX_VAULT_SIZE = Vault.byteSize; // 1 + 32 + 32 + 32 + 32 + 1 + 32 + 1 + 32 + 1 + 1 + 8;
  const vaultRentExempt = await Vault.getMinimumBalanceForRentExemption(connection);

  const vault = Keypair.generate();

  const vaultProgramPublicKey = new PublicKey(VAULT_PROGRAM_ID);
  const [vaultAuthority] = await PublicKey.findProgramAddress(
    [Buffer.from(VAULT_PREFIX), vaultProgramPublicKey.toBuffer(), vault.publicKey.toBuffer()],
    vaultProgramPublicKey,
  );

  // -----------------
  // Account Setups
  // -----------------
  const fractionMint = createMint(
    instructions,
    authority,
    mintRentExempt,
    0,
    vaultAuthority,
    vaultAuthority,
    signers,
  );

  const redeemTreasury = createTokenAccount(
    instructions,
    authority,
    tokenAccountRentExempt,
    priceMint,
    vaultAuthority,
    signers,
  );

  const fractionTreasury = createTokenAccount(
    instructions,
    authority,
    tokenAccountRentExempt,
    fractionMint,
    vaultAuthority,
    signers,
  );

  const uninitializedVaultIx = SystemProgram.createAccount({
    fromPubkey: authority,
    newAccountPubkey: vault.publicKey,
    lamports: vaultRentExempt,
    space: MAX_VAULT_SIZE,
    programId: vaultProgramPublicKey,
  });
  signers.push(vault);

  // -----------------
  // Init Vault Instruction
  // -----------------
  const accounts: InitVaultInstructionAccounts = {
    fractionMint,
    redeemTreasury,
    fractionTreasury,
    vault: vault.publicKey,
    authority,
    pricingLookupAddress: externalPriceAccount,
  };

  const initVaultIx = createInitVaultInstruction(accounts, {
    initVaultArgs: { allowFurtherShareCreation: true },
  });

  return {
    instructions: [...instructions, uninitializedVaultIx, initVaultIx],
    signers,
    accounts: {
      vault: vault.publicKey,
      fractionMint,
      redeemTreasury,
      fractionTreasury,
    },
  };
}
