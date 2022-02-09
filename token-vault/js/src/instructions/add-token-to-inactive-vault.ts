import { bignum } from '@metaplex-foundation/beet';
import { AccountLayout as TokenAccountLayout } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { VAULT_PREFIX, VAULT_PROGRAM_PUBLIC_KEY } from '../common/consts';
import {
  mintTokens,
  createTokenAccount,
  createMint,
  getMintRentExempt,
  createAssociatedTokenAccount,
  approveTokenTransfer,
} from '../common/helpers';
import {
  AddTokenToInactiveVaultInstructionAccounts,
  AmountArgs,
  createAddTokenToInactiveVaultInstruction,
} from '../generated';
import { InstructionsWithAccounts } from '../types';

export class AddTokenToInactiveVault {
  constructor(
    readonly connection: Connection,
    readonly vault: PublicKey,
    readonly vaultAuthority: PublicKey,
    readonly tokenMint: PublicKey,
  ) {}

  // metaplex/js/packages/cli/src/commands/mint-nft.ts 120-138
  static async createTokenMint(
    connection: Connection,
    owner: PublicKey,
  ): Promise<[TransactionInstruction[], Signer[], { mintAccount: PublicKey }]> {
    const mintRentExempt = await getMintRentExempt(connection);
    return createMint(owner, mintRentExempt, 0, owner, owner);
  }

  // metaplex/js/packages/cli/src/commands/mint-nft.ts 139-150
  async createTokenAccount(
    payer: PublicKey,
    amount: bignum,
  ): Promise<InstructionsWithAccounts<{ tokenAccount: PublicKey }>> {
    const [createAtaIx, tokenAccount] = await createAssociatedTokenAccount({
      payer,
      tokenOwner: payer,
      tokenMint: this.tokenMint,
    });
    const addTokensIx = mintTokens(this.tokenMint, tokenAccount, payer, amount);
    return [[createAtaIx, addTokensIx], [], { tokenAccount }];
  }

  async createStoreAccount(
    payer: PublicKey,
  ): Promise<InstructionsWithAccounts<{ storeAccount: PublicKey }>> {
    const tokenAccountRentExempt = await this.connection.getMinimumBalanceForRentExemption(
      TokenAccountLayout.span,
    );
    const [instructions, signers, { tokenAccount: storeAccount }] = createTokenAccount(
      payer,
      tokenAccountRentExempt,
      this.tokenMint,
      this.vaultAuthority,
    );
    return [instructions, signers, { storeAccount }];
  }

  static async approveTransferAuthority(
    owner: PublicKey,
    tokenAccount: PublicKey,
    amount: number,
  ): Promise<
    InstructionsWithAccounts<{ transferAuthority: PublicKey; transferAuthorityPair: Keypair }>
  > {
    const [approveTransferIx, transferAuthorityPair] = approveTokenTransfer({
      owner,
      tokenAccount,
      amount,
    });

    return [
      [approveTransferIx],
      [],
      { transferAuthority: transferAuthorityPair.publicKey, transferAuthorityPair },
    ];
  }

  async getSafetyDepositAccount(): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [Buffer.from(VAULT_PREFIX), this.vault.toBuffer(), this.tokenMint.toBuffer()],
      VAULT_PROGRAM_PUBLIC_KEY,
    );
    return pda;
  }

  async addTokenToInactiveVault(
    amountArgs: AmountArgs,
    accounts: Omit<AddTokenToInactiveVaultInstructionAccounts, 'systemAccount'>,
  ) {
    const instructionAccounts: AddTokenToInactiveVaultInstructionAccounts = {
      ...accounts,
      systemAccount: SystemProgram.programId,
    };

    return createAddTokenToInactiveVaultInstruction(instructionAccounts, { amountArgs });
  }
}
