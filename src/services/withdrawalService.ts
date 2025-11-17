// Withdrawal Service - Handles actual USDC transfers from universal wallet to user wallets
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import UserBalanceService from './userBalanceService';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export interface WithdrawalRequest {
  userWallet: string;
  amount: number;
  timestamp: number;
}

export class WithdrawalService {
  private connection: Connection;
  private universalKeypair: Keypair | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Initialize withdrawal service with universal account private key
   */
  initialize(privateKeyArray: number[]) {
    this.universalKeypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
    console.log('✅ Withdrawal service initialized');
  }

  /**
   * Process a withdrawal - send USDC from universal wallet to user wallet
   */
  async processWithdrawal(
    userWalletAddress: string,
    amount: number
  ): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    if (!this.universalKeypair) {
      return { success: false, error: 'Withdrawal service not initialized' };
    }

    try {
      // Check user balance
      const userBalance = UserBalanceService.getUserBalance(userWalletAddress);
      if (userBalance.balance < amount) {
        return { success: false, error: 'Insufficient balance' };
      }

      const userPublicKey = new PublicKey(userWalletAddress);
      const universalPublicKey = this.universalKeypair.publicKey;

      // Get token accounts
      const universalTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        universalPublicKey
      );

      const userTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        userPublicKey
      );

      // Check if user has USDC token account
      let userAccountExists = true;
      try {
        await getAccount(this.connection, userTokenAccount);
      } catch (error) {
        userAccountExists = false;
      }

      // Create transaction
      const transaction = new Transaction();

      // Create user's token account if it doesn't exist
      if (!userAccountExists) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          universalPublicKey, // payer
          userTokenAccount,   // ata
          userPublicKey,      // owner
          USDC_MINT          // mint
        );
        transaction.add(createAtaIx);
        console.log('📝 Creating user USDC token account...');
      }

      // Add transfer instruction
      const amountInSmallestUnit = amount * 1e6; // USDC has 6 decimals
      const transferIx = createTransferInstruction(
        universalTokenAccount,  // source
        userTokenAccount,       // destination
        universalPublicKey,     // owner
        amountInSmallestUnit,   // amount
        [],                     // signers (empty for single signer)
        TOKEN_PROGRAM_ID
      );
      transaction.add(transferIx);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = universalPublicKey;

      // Sign transaction
      transaction.sign(this.universalKeypair);

      // Send transaction
      console.log(`💸 Sending ${amount} USDC to ${userWalletAddress}...`);
      const txSignature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      });

      // Update user balance - deduct the amount
      UserBalanceService.requestWithdrawal(userWalletAddress, amount);

      console.log(`✅ Withdrawal successful: ${txSignature}`);

      return {
        success: true,
        txSignature,
      };
    } catch (error: any) {
      console.error('❌ Withdrawal failed:', error);
      return {
        success: false,
        error: error.message || 'Withdrawal failed',
      };
    }
  }

  /**
   * Get withdrawal fee estimate
   */
  async estimateFee(): Promise<number> {
    try {
      // Base transaction fee on Solana (~0.000005 SOL)
      const feeInLamports = 5000;
      return feeInLamports / 1e9; // Convert to SOL
    } catch {
      return 0.000005; // Fallback estimate
    }
  }

  /**
   * Check if withdrawal service is ready
   */
  isReady(): boolean {
    return this.universalKeypair !== null;
  }

  /**
   * Get universal wallet public key
   */
  getUniversalWalletAddress(): string | null {
    return this.universalKeypair?.publicKey.toBase58() || null;
  }
}

export default WithdrawalService;
