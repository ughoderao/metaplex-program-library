import { AccountLayout as TokenAccountLayout, MintLayout } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createMint, createTokenAccount } from '../common/helpers';
import { createInitVaultInstruction, InitVaultInstructionAccounts, Vault } from '../generated';
import { VAULT_PREFIX, VAULT_PROGRAM_ID } from '../mpl-token-vault';
import { InstructionsWithAccounts } from '../types';

export async function createVault(
  connection: Connection,
  args: { authority: PublicKey; priceMint: PublicKey; externalPriceAccount: PublicKey },
): Promise<
  InstructionsWithAccounts<{
    vault: PublicKey;
    fractionMint: PublicKey;
    redeemTreasury: PublicKey;
    fractionTreasury: PublicKey;
    vaultAuthority: PublicKey;
  }>
> {
  const { authority, priceMint, externalPriceAccount } = args;

  // -----------------
  // Rent Exempts
  // -----------------
  const tokenAccountRentExempt = await connection.getMinimumBalanceForRentExemption(
    TokenAccountLayout.span,
  );

  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
  const MAX_VAULT_SIZE = Vault.byteSize;
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
  const [fractionMintIxs, fractionMintSigners, { mintAccount: fractionMint }] = createMint(
    authority,
    mintRentExempt,
    0,
    vaultAuthority,
    vaultAuthority,
  );

  const [redeemTreasuryIxs, redeemTreasurySigners, { tokenAccount: redeemTreasury }] =
    createTokenAccount(authority, tokenAccountRentExempt, priceMint, vaultAuthority);

  const [fractionTreasuryIxs, fractionTreasurySigners, { tokenAccount: fractionTreasury }] =
    createTokenAccount(authority, tokenAccountRentExempt, fractionMint, vaultAuthority);

  const uninitializedVaultIx = SystemProgram.createAccount({
    fromPubkey: authority,
    newAccountPubkey: vault.publicKey,
    lamports: vaultRentExempt,
    space: MAX_VAULT_SIZE,
    programId: vaultProgramPublicKey,
  });

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

  return [
    [
      ...fractionMintIxs,
      ...redeemTreasuryIxs,
      ...fractionTreasuryIxs,
      uninitializedVaultIx,
      initVaultIx,
    ],
    [...fractionMintSigners, ...redeemTreasurySigners, ...fractionTreasurySigners, vault],
    {
      vault: vault.publicKey,
      fractionMint,
      redeemTreasury,
      fractionTreasury,
      vaultAuthority,
    },
  ];
}
