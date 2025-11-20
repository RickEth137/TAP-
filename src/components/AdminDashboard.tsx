// Admin Dashboard - Monitor system health and liquidity
'use client';

import { useState, useEffect } from 'react';
// import UserBalanceService from '@/services/userBalanceService';

interface SystemMetrics {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalUserBalances: number;
  totalBetsPlaced: number;
  totalWinnings: number;
  housePnL: number;
}

export default function AdminDashboard({ 
  isOpen, 
  onClose,
  driftBalance,
  driftFreeCollateral,
}: { 
  isOpen: boolean; 
  onClose: () => void;
  driftBalance: number;
  driftFreeCollateral: number;
}) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    if (isOpen) {
      calculateMetrics();
    }
  }, [isOpen]);

  const calculateMetrics = () => {
    // const allUsers = UserBalanceService.getAllUsers();
    
    // const totalUsers = allUsers.length;
    // const totalDeposits = allUsers.reduce((sum, u) => sum + u.totalDeposits, 0);
    // const totalWithdrawals = allUsers.reduce((sum, u) => sum + u.totalWithdrawals, 0);
    // const totalUserBalances = allUsers.reduce((sum, u) => sum + u.balance, 0);
    // const totalBetsPlaced = allUsers.reduce((sum, u) => sum + u.totalBets, 0);
    // const totalWinnings = allUsers.reduce((sum, u) => sum + u.totalWinnings, 0);
    
    // // House P&L = (Deposits - Withdrawals) - Current User Balances
    // const housePnL = (totalDeposits - totalWithdrawals) - totalUserBalances;
    
    setMetrics({
      totalUsers: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalUserBalances: 0,
      totalBetsPlaced: 0,
      totalWinnings: 0,
      housePnL: 0,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 max-w-4xl w-full border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">📊 Admin Dashboard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-3xl"
          >
            ×
          </button>
        </div>

        {metrics && (
          <div className="space-y-6">
            {/* House P&L - Most Important */}
            <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/30">
              <h3 className="text-xl font-bold text-purple-200 mb-4">💰 House Performance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">House P&L</p>
                  <p className={`text-3xl font-bold ${metrics.housePnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metrics.housePnL >= 0 ? '+' : ''}${metrics.housePnL.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">House Edge</p>
                  <p className="text-3xl font-bold text-blue-400">
                    {metrics.totalBetsPlaced > 0 
                      ? ((metrics.housePnL / metrics.totalBetsPlaced) * 100).toFixed(2)
                      : '0.00'}%
                  </p>
                </div>
              </div>
            </div>

            {/* Liquidity Status */}
            <div className="bg-gradient-to-r from-emerald-900/50 to-teal-900/50 rounded-lg p-6 border border-emerald-500/30">
              <h3 className="text-xl font-bold text-emerald-200 mb-4">💧 Liquidity Status</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Drift Account Balance</p>
                  <p className="text-2xl font-bold text-white">${driftBalance.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">Free: ${driftFreeCollateral.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">User Balances (Liabilities)</p>
                  <p className="text-2xl font-bold text-white">${metrics.totalUserBalances.toFixed(2)}</p>
                  <p className={`text-sm ${
                    driftBalance >= metrics.totalUserBalances ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {driftBalance >= metrics.totalUserBalances ? '✅ Fully backed' : '⚠️ Undercollateralized'}
                  </p>
                </div>
              </div>
            </div>

            {/* User Metrics */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">👥 User Metrics</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Total Users</p>
                  <p className="text-2xl font-bold text-white">{metrics.totalUsers}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Total Deposits</p>
                  <p className="text-2xl font-bold text-green-400">${metrics.totalDeposits.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Total Withdrawals</p>
                  <p className="text-2xl font-bold text-red-400">${metrics.totalWithdrawals.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Trading Activity */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">🎲 Trading Activity</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Total Bets Placed</p>
                  <p className="text-2xl font-bold text-white">${metrics.totalBetsPlaced.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Total Winnings Paid</p>
                  <p className="text-2xl font-bold text-yellow-400">${metrics.totalWinnings.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">User Win Rate</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {metrics.totalBetsPlaced > 0 
                      ? ((metrics.totalWinnings / metrics.totalBetsPlaced) * 100).toFixed(1)
                      : '0.0'}%
                  </p>
                </div>
              </div>
            </div>

            {/* Health Indicators */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">🏥 System Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Liquidity Coverage</span>
                  <span className={`font-bold ${
                    driftBalance >= metrics.totalUserBalances ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {metrics.totalUserBalances > 0 
                      ? ((driftBalance / metrics.totalUserBalances) * 100).toFixed(0)
                      : '100'}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Net Cash Flow</span>
                  <span className={`font-bold ${
                    (metrics.totalDeposits - metrics.totalWithdrawals) > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${(metrics.totalDeposits - metrics.totalWithdrawals).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Profitability</span>
                  <span className={`font-bold ${
                    metrics.housePnL > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {metrics.housePnL > 0 ? 'PROFITABLE ✅' : 'LOSING MONEY ❌'}
                  </span>
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={calculateMetrics}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
            >
              🔄 Refresh Metrics
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
