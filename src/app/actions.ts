'use server';

import { Database } from '@/lib/server/db';
import { DriftServer } from '@/lib/server/driftServer';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DRIFT_CONFIG, MARKETS } from '@/config/constants';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// --- Balance Actions ---

export async function getUserBalance(walletAddress: string) {
  const user = Database.getUser(walletAddress);
  return {
    balance: user.balance,
    deposits: user.deposits,
    withdrawals: user.withdrawals,
    bets: user.bets
  };
}

// --- Deposit Actions ---

export async function verifyDeposit(walletAddress: string, txSignature: string, expectedAmount: number) {
  const connection = new Connection(DRIFT_CONFIG.RPC_URL, 'confirmed');
  const universalWalletAddress = new PublicKey(process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS!);

  try {
    // Check if already verified
    const user = Database.getUser(walletAddress);
    if (user.deposits.some(d => d.txSignature === txSignature)) {
      return { success: false, error: 'Deposit already credited' };
    }

    // Verify on-chain
    const tx = await connection.getParsedTransaction(txSignature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta || tx.meta.err) {
      return { success: false, error: 'Transaction failed or not found' };
    }

    // Find USDC transfer to universal wallet
    let actualAmount = 0;
    let found = false;
    const universalTokenAccount = await getAssociatedTokenAddress(USDC_MINT, universalWalletAddress);

    for (const ix of tx.transaction.message.instructions) {
      if ('parsed' in ix && ix.program === 'spl-token') {
        const parsed = ix.parsed;
        if ((parsed.type === 'transfer' || parsed.type === 'transferChecked') && parsed.info) {
          const info = parsed.info;
          // Check destination
          if (info.destination === universalTokenAccount.toBase58()) {
             // Check mint if transferChecked
             if (parsed.type === 'transferChecked' && info.mint !== USDC_MINT.toBase58()) continue;
             
             const amountStr = info.amount || info.tokenAmount?.amount;
             if (amountStr) {
               actualAmount = parseInt(amountStr) / 1e6;
               found = true;
               break;
             }
          }
        }
      }
    }

    if (!found) return { success: false, error: 'No USDC transfer to universal wallet found' };
    
    if (Math.abs(actualAmount - expectedAmount) > expectedAmount * 0.01) {
      return { success: false, error: `Amount mismatch: expected ${expectedAmount}, got ${actualAmount}` };
    }

    // Update DB
    const updatedUser = Database.updateUser(walletAddress, {
      balance: user.balance + actualAmount,
      totalDeposits: user.totalDeposits + actualAmount,
      deposits: [...user.deposits, {
        txSignature,
        amount: actualAmount,
        timestamp: Date.now(),
        verified: true,
        verifiedAt: Date.now()
      }]
    });

    return { success: true, balance: updatedUser.balance };

  } catch (error: any) {
    console.error('Deposit verification error:', error);
    return { success: false, error: error.message };
  }
}

// --- Settlement Actions ---

export async function settlePosition(marketIndex: number, direction: 'long' | 'short') {
  try {
    const driftServer = DriftServer.getInstance();
    const txSig = await driftServer.closePosition(marketIndex, direction);
    
    if (!txSig) {
        return { success: false, error: 'No position found to close or mismatch' };
    }
    
    return { success: true, txSignature: txSig };
  } catch (error: any) {
    console.error('Settlement error:', error);
    return { success: false, error: error.message };
  }
}

export async function findRecentDeposit(walletAddress: string) {
  const connection = new Connection(DRIFT_CONFIG.RPC_URL, 'confirmed');
  const universalWalletAddress = new PublicKey(process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS!);
  const universalTokenAccount = await getAssociatedTokenAddress(USDC_MINT, universalWalletAddress);

  try {
    const signatures = await connection.getSignaturesForAddress(universalTokenAccount, { limit: 20 });
    
    for (const sig of signatures) {
      const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.meta || tx.meta.err) continue;

      for (const ix of tx.transaction.message.instructions) {
        if ('parsed' in ix && ix.program === 'spl-token') {
          const parsed = ix.parsed;
          if ((parsed.type === 'transfer' || parsed.type === 'transferChecked') && parsed.info) {
             const info = parsed.info;
             // Check authority/source matches user wallet (simplified check)
             // In reality, source is user's ATA. We should check if source's owner is user wallet.
             // But for now, let's just return the tx and let verifyDeposit handle the strict check.
             // Actually, verifyDeposit checks if destination is universal wallet.
             
             // We need to filter by sender.
             // Getting the owner of the source account is an extra RPC call.
             // Let's just return the most recent valid deposit to universal wallet and let user confirm?
             // No, that's confusing.
             
             // Let's skip this for now and rely on manual TX entry or just return the last few deposits.
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Find deposit error:', error);
    return null;
  }
}

// --- Trade Actions ---

export async function placeBet(
  walletAddress: string, 
  betAmount: number, 
  targetPrice: number, 
  leverage: number,
  direction: 'long' | 'short'
) {
  const user = Database.getUser(walletAddress);
  
  if (user.balance < betAmount) {
    return { success: false, error: 'Insufficient balance' };
  }

  try {
    // 1. Deduct balance immediately (optimistic locking)
    const betId = `bet-${Date.now()}`;
    Database.updateUser(walletAddress, {
      balance: user.balance - betAmount,
      totalBets: user.totalBets + betAmount,
      bets: [...user.bets, {
        betId,
        amount: betAmount,
        timestamp: Date.now(),
        leverage,
        direction,
        marketIndex: MARKETS.SOL.marketIndex
      } as any] // Cast to any to avoid strict type checking against old interface
    });

    // 2. Execute trade on Drift (Server-Side)
    const driftServer = DriftServer.getInstance();
    const result = await driftServer.executeTrade(
      direction,
      betAmount,
      leverage,
      MARKETS.SOL.marketIndex
    );

    // 3. Update bet with tx signature
    const updatedUser = Database.getUser(walletAddress); // Refresh
    const updatedBets = updatedUser.bets.map(b => 
      b.betId === betId ? { ...b, txSignature: result.txSig } : b
    );
    Database.updateUser(walletAddress, { bets: updatedBets });

    return { success: true, txSignature: result.txSig, betId };

  } catch (error: any) {
    console.error('Bet placement error:', error);
    // Refund on failure
    const currentUser = Database.getUser(walletAddress);
    Database.updateUser(walletAddress, {
      balance: currentUser.balance + betAmount, // Refund
      totalBets: currentUser.totalBets - betAmount
    });
    return { success: false, error: error.message };
  }
}

// --- Withdrawal Actions ---

export async function requestWithdrawal(walletAddress: string, amount: number) {
  const user = Database.getUser(walletAddress);
  
  if (user.balance < amount) {
    return { success: false, error: 'Insufficient balance' };
  }

  try {
    // 1. Deduct balance
    const txId = `withdrawal-${Date.now()}`;
    Database.updateUser(walletAddress, {
      balance: user.balance - amount,
      totalWithdrawals: user.totalWithdrawals + amount,
      withdrawals: [...user.withdrawals, {
        txSignature: txId, // Temporary ID
        amount,
        timestamp: Date.now(),
        status: 'pending'
      }]
    });

    // 2. Execute Transfer
    const connection = new Connection(DRIFT_CONFIG.RPC_URL, 'confirmed');
    const privateKeyStr = process.env.UNIVERSAL_WALLET_PRIVATE_KEY; // Note: No NEXT_PUBLIC_
    if (!privateKeyStr) throw new Error('Server: UNIVERSAL_WALLET_PRIVATE_KEY not set');
    
    const universalKeypair = import('@solana/web3.js').then(m => m.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKeyStr))));
    const payer = await universalKeypair;

    const userPublicKey = new PublicKey(walletAddress);
    const universalPublicKey = payer.publicKey;

    const universalTokenAccount = await getAssociatedTokenAddress(USDC_MINT, universalPublicKey);
    const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, userPublicKey);

    const transaction = new Transaction();

    // Check if user ATA exists
    try {
      await getAccount(connection, userTokenAccount);
    } catch {
      transaction.add(createAssociatedTokenAccountInstruction(
        universalPublicKey,
        userTokenAccount,
        userPublicKey,
        USDC_MINT
      ));
    }

    transaction.add(createTransferInstruction(
      universalTokenAccount,
      userTokenAccount,
      universalPublicKey,
      amount * 1e6,
      [],
      TOKEN_PROGRAM_ID
    ));

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = universalPublicKey;
    transaction.sign(payer);

    const txSig = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(txSig);

    // 3. Update Withdrawal Status
    const currentUser = Database.getUser(walletAddress);
    const updatedWithdrawals = currentUser.withdrawals.map(w => 
      w.txSignature === txId ? { ...w, txSignature: txSig, status: 'completed' as const } : w
    );
    Database.updateUser(walletAddress, { withdrawals: updatedWithdrawals });

    return { success: true, txSignature: txSig };

  } catch (error: any) {
    console.error('Withdrawal error:', error);
    // Refund
    const currentUser = Database.getUser(walletAddress);
    Database.updateUser(walletAddress, {
      balance: currentUser.balance + amount,
      totalWithdrawals: currentUser.totalWithdrawals - amount
    });
    return { success: false, error: error.message };
  }
}

export async function resolveBet(
  walletAddress: string,
  betId: string,
  pnl: number,
  isWin: boolean
) {
  try {
    const user = Database.getUser(walletAddress);
    const betIndex = user.bets.findIndex(b => b.betId === betId);
    
    if (betIndex === -1) {
        return { success: false, error: 'Bet not found' };
    }
    
    const bet = user.bets[betIndex] as any;
    if (bet.result) {
        return { success: false, error: 'Bet already resolved' };
    }

    // 1. Update User Balance
    let newBalance = user.balance;
    let newTotalWinnings = user.totalWinnings;
    
    if (isWin && pnl > 0) {
        const principal = bet.amount;
        const totalPayout = principal + pnl;
        newBalance += totalPayout;
        newTotalWinnings += pnl;
    }

    // 2. Update DB
    const updatedBets = [...user.bets];
    updatedBets[betIndex] = {
        ...bet,
        result: isWin ? 'win' : 'loss',
        pnl: isWin ? pnl : -bet.amount,
        resolvedAt: Date.now()
    };
    
    Database.updateUser(walletAddress, {
        balance: newBalance,
        totalWinnings: newTotalWinnings,
        bets: updatedBets
    });

    // 3. Close Drift Hedge
    if (bet.leverage && bet.direction) {
        const driftServer = DriftServer.getInstance();
        const notional = bet.amount * bet.leverage;
        // We close the position we opened. 
        // If we opened LONG, we now want to close it (sell).
        // closePositionByNotional handles the logic of "closing" (taking opposite side).
        await driftServer.closePositionByNotional(
            MARKETS.SOL.marketIndex, 
            bet.direction, 
            notional
        );
    }

    return { success: true, newBalance };

  } catch (error: any) {
    console.error('Resolve bet error:', error);
    return { success: false, error: error.message };
  }
}
