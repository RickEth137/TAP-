'use client';

import { FC, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useTradingStore } from '@/store/tradingStore';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  driftService: any;
  isDriftAccountReady: boolean;
  isCheckingAccount: boolean;
  onCreateAccount: () => void;
  freeCollateral: number;
}

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Mainnet USDC

const WalletModal: FC<WalletModalProps> = ({
  isOpen,
  onClose,
  driftService,
  isDriftAccountReady,
  isCheckingAccount,
  onCreateAccount,
  freeCollateral,
}) => {
  const wallet = useWallet();
  const { balance, setBalance, addNotification, setFreeCollateral } = useTradingStore();
  const [amount, setAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  if (!isOpen) return null;

  const handleDeposit = async () => {
    if (!wallet.publicKey || !driftService || !amount) return;
    if (!isDriftAccountReady) {
      addNotification('error', 'Create your Drift account before depositing.');
      return;
    }

    try {
      setIsDepositing(true);
      const depositAmount = parseFloat(amount);

      // Get user's USDC token account
      const usdcTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey
      );

      const txSig = await driftService.deposit(depositAmount, usdcTokenAccount);
      
      // Update balance
      const accountInfo = await driftService.getUserAccount();
      setBalance(accountInfo.totalCollateral);
      setFreeCollateral(accountInfo.freeCollateral);
      
      addNotification('success', `Deposited $${depositAmount.toFixed(2)} USDC`);
      setAmount('');
      console.log('✅ Deposit successful:', txSig);
    } catch (error: any) {
      console.error('Deposit failed:', error);
      addNotification('error', `Deposit failed: ${error.message}`);
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!wallet.publicKey || !driftService || !amount) return;
    if (!isDriftAccountReady) {
      addNotification('error', 'Create your Drift account before withdrawing.');
      return;
    }

    try {
      setIsWithdrawing(true);
      const withdrawAmount = parseFloat(amount);

      if (withdrawAmount > balance) {
        addNotification('error', 'Insufficient balance');
        return;
      }

      const txSig = await driftService.withdraw(withdrawAmount);
      
      // Update balance
      const accountInfo = await driftService.getUserAccount();
      setBalance(accountInfo.totalCollateral);
      setFreeCollateral(accountInfo.freeCollateral);
      
      addNotification('success', `Withdrew $${withdrawAmount.toFixed(2)} USDC`);
      setAmount('');
      console.log('✅ Withdrawal successful:', txSig);
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      addNotification('error', `Withdrawal failed: ${error.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
      <div className="bg-black/90 backdrop-blur-xl rounded-2xl p-8 border border-white/10 max-w-md w-full shadow-2xl shadow-black">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Manage Balance</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-2xl"
          >
            ×
          </button>
        </div>

        {/* Account Status */}
        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/50 mb-1">Total Collateral</div>
              <div className="text-3xl font-bold text-white">${balance.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/50 mb-1">Free Collateral</div>
              <div className="text-xl font-semibold text-white">${freeCollateral.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-white/50">Account Status</span>
            <span
              className={`px-3 py-1 rounded-full font-semibold ${
                isDriftAccountReady ? 'bg-white text-black' : 'bg-black text-white border border-white/30'
              }`}
            >
              {isDriftAccountReady ? 'Ready' : 'Setup Required'}
            </span>
          </div>
        </div>

        {!isDriftAccountReady && (
          <div className="mb-6 bg-white/5 border border-white/15 rounded-xl p-4 text-sm text-white/70">
            <p className="mb-3">Your wallet is connected, but this address doesn’t have a Drift account yet.</p>
            <button
              onClick={onCreateAccount}
              disabled={isCheckingAccount}
              className="w-full bg-white text-black hover:bg-white/80 disabled:bg-white/20 disabled:text-white/50 font-semibold py-3 rounded-lg transition-colors"
            >
              {isCheckingAccount ? 'Creating account...' : 'Create Drift Account'}
            </button>
            <p className="mt-2 text-xs text-white/50">One-time setup (~0.02 SOL for fees).</p>
          </div>
        )}

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm text-white/70 mb-2">Amount (USDC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-black/60 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:border-white/50 focus:outline-none"
            disabled={!isDriftAccountReady}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleDeposit}
            disabled={!isDriftAccountReady || !amount || isDepositing || isWithdrawing}
            className="flex-1 bg-white text-black hover:bg-white/80 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {isDepositing ? 'Depositing...' : 'Deposit'}
          </button>
          <button
            onClick={handleWithdraw}
            disabled={!isDriftAccountReady || !amount || isDepositing || isWithdrawing}
            className="flex-1 border border-white/30 bg-black hover:bg-black/80 disabled:bg-black/40 disabled:text-white/40 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>

        {/* Info */}
        <div className="mt-6 text-xs text-white/40 text-center space-y-1">
          <p>Deposits and withdrawals are processed on-chain.</p>
          <p>Network fees apply (~0.00015 SOL per transaction)</p>
          {!isDriftAccountReady && <p>Create your Drift account to unlock deposits.</p>}
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
