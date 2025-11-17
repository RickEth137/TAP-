// Deposit Verification Service - Verifies deposits on-chain before crediting user balance
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import UserBalanceService from './userBalanceService';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export interface DepositVerificationResult {
  isValid: boolean;
  amount?: number;
  error?: string;
  details?: {
    sender: string;
    recipient: string;
    actualAmount: number;
    timestamp: number;
  };
}

export class DepositVerificationService {
  private connection: Connection;
  private universalWalletAddress: PublicKey;

  constructor(rpcUrl: string, universalWalletAddress: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.universalWalletAddress = new PublicKey(universalWalletAddress);
  }

  /**
   * Verify a deposit transaction on-chain
   * Checks: transaction exists, recipient matches, amount is correct, token is USDC
   */
  async verifyDeposit(
    txSignature: string,
    expectedAmount: number,
    userWalletAddress: string
  ): Promise<DepositVerificationResult> {
    try {
      console.log(`🔍 Verifying deposit: ${txSignature}`);

      // Fetch transaction details
      const tx = await this.connection.getParsedTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return {
          isValid: false,
          error: 'Transaction not found on blockchain',
        };
      }

      if (!tx.meta || tx.meta.err) {
        return {
          isValid: false,
          error: 'Transaction failed or has errors',
        };
      }

      // Find SPL token transfer instruction
      let foundTransfer = false;
      let actualAmount = 0;
      let sender = '';
      let recipient = '';

      // Parse instructions for token transfer
      const instructions = tx.transaction.message.instructions;
      for (const instruction of instructions) {
        if ('parsed' in instruction && instruction.program === 'spl-token') {
          const parsed = instruction.parsed;
          
          if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
            const info = parsed.info;
            
            // Check if this is a USDC transfer
            if (parsed.type === 'transferChecked' && info.mint !== USDC_MINT.toBase58()) {
              continue; // Skip non-USDC transfers
            }

            // Get amount (USDC has 6 decimals)
            const amountStr = info.amount || info.tokenAmount?.amount;
            if (!amountStr) continue;
            
            actualAmount = parseInt(amountStr) / 1e6; // Convert from smallest unit
            
            // Get source and destination
            sender = info.source || info.authority;
            recipient = info.destination;

            // Verify recipient is the universal wallet's token account
            const universalTokenAccount = await getAssociatedTokenAddress(
              USDC_MINT,
              this.universalWalletAddress
            );

            if (recipient === universalTokenAccount.toBase58()) {
              foundTransfer = true;
              break;
            }
          }
        }
      }

      if (!foundTransfer) {
        return {
          isValid: false,
          error: 'No valid USDC transfer to universal wallet found',
        };
      }

      // Verify amount matches (allow 1% tolerance for fees)
      const tolerance = expectedAmount * 0.01;
      if (Math.abs(actualAmount - expectedAmount) > tolerance) {
        return {
          isValid: false,
          error: `Amount mismatch: expected ${expectedAmount}, got ${actualAmount}`,
        };
      }

      // Get block time
      const blockTime = tx.blockTime || Math.floor(Date.now() / 1000);

      console.log(`✅ Deposit verified: ${actualAmount} USDC from ${sender}`);

      // Mark deposit as verified in user balance service
      UserBalanceService.verifyDeposit(userWalletAddress, txSignature);

      return {
        isValid: true,
        amount: actualAmount,
        details: {
          sender,
          recipient,
          actualAmount,
          timestamp: blockTime * 1000,
        },
      };
    } catch (error: any) {
      console.error('❌ Deposit verification failed:', error);
      return {
        isValid: false,
        error: error.message || 'Verification failed',
      };
    }
  }

  /**
   * Batch verify multiple deposits
   */
  async verifyMultipleDeposits(
    deposits: Array<{ txSignature: string; amount: number; userWallet: string }>
  ): Promise<Array<DepositVerificationResult & { txSignature: string }>> {
    const results = [];

    for (const deposit of deposits) {
      const result = await this.verifyDeposit(
        deposit.txSignature,
        deposit.amount,
        deposit.userWallet
      );
      
      results.push({
        ...result,
        txSignature: deposit.txSignature,
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
  }

  /**
   * Check if a transaction signature is valid format
   */
  static isValidSignature(signature: string): boolean {
    // Solana transaction signatures are base58 encoded and 88 characters long
    return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
  }
}

export default DepositVerificationService;
