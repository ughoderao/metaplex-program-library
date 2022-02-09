import { bignum } from '@metaplex-foundation/beet';
import {
  AccountLayout as TokenAccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';

// -----------------
// Helpers from common/src/actions/action.ts adapted to return instructions + signers instead of mutating
// and metaplex/js/packages/cli/src/helpers/accounts.ts
// -----------------

// -----------------
// Transfers
// -----------------
export function approveTokenTransfer({
  tokenAccount,
  owner,
  amount,
}: {
  tokenAccount: PublicKey;
  owner: PublicKey;
  amount: number;
}): [TransactionInstruction, Keypair] {
  const transferAuthority = Keypair.generate();
  const createApproveIx = Token.createApproveInstruction(
    TOKEN_PROGRAM_ID,
    tokenAccount,
    transferAuthority.publicKey,
    owner,
    [],
    amount,
  );

  return [createApproveIx, transferAuthority];
}

// -----------------
// Associated Token Account
// -----------------

// See: https://spl.solana.com/associated-token-account
export async function createAssociatedTokenAccount({
  tokenMint,
  tokenOwner,
  payer,
}: {
  tokenMint: PublicKey;
  tokenOwner: PublicKey;
  payer: PublicKey;
}): Promise<[TransactionInstruction, PublicKey]> {
  const associatedTokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMint,
    tokenOwner,
  );
  const createATAInstruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMint,
    associatedTokenAccount,
    tokenOwner,
    payer,
  );

  return [createATAInstruction, associatedTokenAccount];
}

// -----------------
// Init Mint Account
// -----------------
export function createMint(
  payer: PublicKey,
  mintRentExempt: number,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey,
): [TransactionInstruction[], Signer[], { mintAccount: PublicKey }] {
  const [createMintIx, createMintSigner, mintAccount] = createUninitializedMint(
    payer,
    mintRentExempt,
  );

  const initMintIx = Token.createInitMintInstruction(
    TOKEN_PROGRAM_ID,
    mintAccount,
    decimals,
    mintAuthority,
    freezeAuthority,
  );

  return [[createMintIx, initMintIx], [createMintSigner], { mintAccount }];
}

export function getMintRentExempt(connection: Connection) {
  return connection.getMinimumBalanceForRentExemption(MintLayout.span);
}

export function createUninitializedMint(
  payer: PublicKey,
  amount: number,
): [TransactionInstruction, Signer, PublicKey] {
  const mintAccount = Keypair.generate();
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mintAccount.publicKey,
    lamports: amount,
    space: MintLayout.span,
    programId: TOKEN_PROGRAM_ID,
  });

  return [instruction, mintAccount, mintAccount.publicKey];
}

// -----------------
// Init Token Account
// -----------------
export function mintTokens(
  mint: PublicKey,
  tokenAccount: PublicKey,
  payer: PublicKey,
  amount: bignum,
): TransactionInstruction {
  return Token.createMintToInstruction(TOKEN_PROGRAM_ID, mint, tokenAccount, payer, [], amount);
}

export function getTokenRentExempt(connection: Connection) {
  return connection.getMinimumBalanceForRentExemption(TokenAccountLayout.span);
}

export function createTokenAccount(
  payer: PublicKey,
  accountRentExempt: number,
  mint: PublicKey,
  owner: PublicKey,
): [TransactionInstruction[], Signer[], { tokenAccount: PublicKey }] {
  const [createAccountIx, signer, account] = createUninitializedTokenAccount(
    payer,
    accountRentExempt,
  );
  const initAccountIx = Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mint, account, owner);

  return [[createAccountIx, initAccountIx], [signer], { tokenAccount: account }];
}

export function createUninitializedTokenAccount(
  payer: PublicKey,
  amount: number,
): [TransactionInstruction, Signer, PublicKey] {
  const tokenAccount = Keypair.generate();
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: tokenAccount.publicKey,
    lamports: amount,
    space: TokenAccountLayout.span,
    programId: TOKEN_PROGRAM_ID,
  });

  return [instruction, tokenAccount, tokenAccount.publicKey];
}
