'use client';

import { FC, useState } from 'react';
import { verifyDeposit } from '@/app/actions';

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

  const universalWallet = process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS || '';

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

    try {
      setIsVerifying(true);
      
      console.log('🔍 Verifying deposit on-chain...');
      const result = await verifyDeposit(
        userWallet,
        txSignature.trim(),
        amount
      );
      
      if (!result.success) {
        setVerificationError(result.error || 'Verification failed');
        setIsVerifying(false);
        return;
      }
      
      console.log(`✅ Deposit verified and credited: $${amount}`);
      onDepositRecorded(amount);
      
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
          <h2 className="text-2xl font-bold text-white">💳 Add Funds</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          {/* Deposit Amount */}
          <div>
            <label className="text-white text-sm font-semibold block mb-2">
              How much do you want to add?
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 text-lg">$</span>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/20 rounded-lg pl-8 pr-4 py-4 text-white text-xl font-semibold placeholder:text-white/30 focus:border-green-500/50 focus:outline-none transition-colors"
              />
            </div>
            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[10, 25, 50, 100].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setDepositAmount(amount.toString())}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white text-sm font-medium transition-all"
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div className="flex-1">
                <p className="text-yellow-200 font-semibold text-sm mb-2">How to add funds:</p>
                <ol className="text-yellow-100/80 text-xs space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-300 font-bold">1.</span>
                    <span>Send <strong>USDC</strong> from your wallet to:</span>
                  </li>
                </ol>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={universalWallet}
                    readOnly
                    className="flex-1 bg-black/40 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-200 text-xs font-mono"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-xs font-bold transition-all shrink-0"
                  >
                    {copied ? '✓' : 'Copy'}
                  </button>
                </div>
                <ol className="text-yellow-100/80 text-xs space-y-1.5 mt-2">
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-300 font-bold">2.</span>
                    <span>Paste the <strong>Transaction Signature</strong> below:</span>
                  </li>
                </ol>
                <input
                    type="text"
                    value={txSignature}
                    onChange={(e) => setTxSignature(e.target.value)}
                    placeholder="Transaction Signature (e.g. 5Kj...)"
                    className="w-full mt-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:border-yellow-500/50 focus:outline-none"
                  />
              </div>
            </div>
          </div>

          {verificationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm">⚠️ {verificationError}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleRecordDeposit}
              disabled={isVerifying || !depositAmount || !userWallet || !txSignature}
              className="flex-1 px-4 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg text-white font-bold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? 'Verifying...' : 'Verify Deposit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;
