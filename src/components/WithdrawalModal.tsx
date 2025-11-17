// Withdrawal Modal - User interface for requesting withdrawals
'use client';

import React, { useState } from 'react';
import UserBalanceService from '@/services/userBalanceService';

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  userWallet: string;
  currentBalance: number;
  onWithdrawalRequest: (amount: number) => void;
}

export default function WithdrawalModal({
  isOpen,
  onClose,
  userWallet,
  currentBalance,
  onWithdrawalRequest,
}: WithdrawalModalProps) {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const withdrawAmount = parseFloat(amount);

    // Validation
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > currentBalance) {
      setError('Insufficient balance');
      return;
    }

    if (withdrawAmount < 1) {
      setError('Minimum withdrawal is $1');
      return;
    }

    setIsProcessing(true);

    try {
      // Call parent handler which will use WithdrawalService
      await onWithdrawalRequest(withdrawAmount);
      
      // Close modal on success
      setAmount('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Withdrawal failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    setAmount(currentBalance.toFixed(2));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 max-w-md w-full border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Withdraw Funds</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Balance */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Available Balance</p>
            <p className="text-2xl font-bold text-green-400">
              ${currentBalance.toFixed(2)}
            </p>
          </div>

          {/* Withdrawal Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Withdrawal Amount (USD)
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="1"
                  max={currentBalance}
                  className="w-full pl-8 pr-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  required
                  disabled={isProcessing}
                />
              </div>
              <button
                type="button"
                onClick={handleMaxClick}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                disabled={isProcessing}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Destination Wallet */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Destination Wallet
            </label>
            <div className="bg-gray-900 border border-gray-600 rounded-lg p-3">
              <p className="text-sm text-gray-300 font-mono break-all">
                {userWallet}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              USDC will be sent to this wallet address
            </p>
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              ⓘ Withdrawals are processed instantly. USDC will be sent to your wallet&apos;s token account.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing || !amount || parseFloat(amount) <= 0}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
              isProcessing || !amount || parseFloat(amount) <= 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-green-500/50'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              'Withdraw'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
