'use client';

import { FC, useState } from 'react';
import UserBalanceService from '@/services/userBalanceService';
import DepositVerificationService from '@/services/depositVerificationService';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  userWallet?: string;
  onDepositRecorded: (amount: number) => void;
}

const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, userWallet, onDepositRecorded }) => {
  const [depositAmount, setDepositAmount] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  if (!isOpen) return null;

  const universalWallet = UserBalanceService.getUniversalWalletAddress();

  const handleCopy = () => {
    navigator.clipboard.writeText(universalWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRecordDeposit = async () => {
    setVerificationError('');
    
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setVerificationError('Please enter a valid amount');
      return;
    }
    if (!txSignature.trim()) {
      setVerificationError('Please enter the transaction signature');
      return;
    }
    if (!userWallet) {
      setVerificationError('Please connect your wallet first');
      return;
    }

    // Validate signature format
    if (!DepositVerificationService.isValidSignature(txSignature.trim())) {
      setVerificationError('Invalid transaction signature format');
      return;
    }

    try {
      setIsVerifying(true);
      
      // Initialize verification service
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || '';
      const verificationService = new DepositVerificationService(rpcUrl, universalWallet);
      
      // Verify deposit on-chain
      console.log('🔍 Verifying deposit on-chain...');
      const result = await verificationService.verifyDeposit(
        txSignature.trim(),
        amount,
        userWallet
      );
      
      if (!result.isValid) {
        setVerificationError(result.error || 'Verification failed');
        setIsVerifying(false);
        return;
      }
      
      // Record verified deposit
      UserBalanceService.recordDeposit(userWallet, result.amount || amount, txSignature.trim());
      
      console.log(`✅ Deposit verified and credited: $${result.amount}`);
      onDepositRecorded(result.amount || amount);
      
      setDepositAmount('');
      setTxSignature('');
      setVerificationError('');
      onClose();
    } catch (error: any) {
      console.error('Deposit verification error:', error);
      setVerificationError(error.message || 'Failed to verify deposit');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">💰 Deposit USDC</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <p className="text-yellow-200 text-sm font-medium mb-2">📝 How to Deposit:</p>
            <ol className="text-yellow-100/80 text-sm space-y-1 list-decimal list-inside">
              <li>Copy the address below</li>
              <li>Send USDC from your wallet (Phantom, Solflare, etc.)</li>
              <li>Enter the amount and transaction signature</li>
              <li>Click &quot;Record Deposit&quot;</li>
            </ol>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-2">Universal Wallet Address:</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={universalWallet}
                readOnly
                className="flex-1 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-sm font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-blue-300 font-medium transition-all"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-2">Amount (USDC):</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="100.00"
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-2">Transaction Signature:</label>
            <input
              type="text"
              value={txSignature}
              onChange={(e) => setTxSignature(e.target.value)}
              placeholder="Paste transaction hash here"
              disabled={isVerifying}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white font-mono text-sm disabled:opacity-50"
            />
          </div>

          {verificationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm">❌ {verificationError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleRecordDeposit}
              disabled={isVerifying}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-lg text-white font-bold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? 'Verifying...' : 'Record Deposit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;
