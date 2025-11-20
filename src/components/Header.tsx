'use client';

import { FC, useMemo, useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useTradingStore } from '@/store/tradingStore';

interface HeaderProps {
  onManageBalance?: () => void;
  onWithdrawClick?: () => void;
  isDemoMode?: boolean;
  userBalance?: number;
  userWallet?: string;
  isSystemReady?: boolean; // NEW: Show if Drift is ready
}

const Header: FC<HeaderProps> = ({ onManageBalance, onWithdrawClick, isDemoMode = false, userBalance, userWallet, isSystemReady = false }) => {
  const { stats, balance } = useTradingStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="absolute top-0 left-0 right-0 z-[150] p-4 bg-gradient-to-b from-black/90 to-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-[0.25em] text-white uppercase">Tap Trading</h1>
          {!isSystemReady && (
            <div className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold animate-pulse">
              ⚠️ SYSTEM LOADING...
            </div>
          )}
          {isSystemReady && (
            <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-bold">
              ✅ READY
            </div>
          )}
          {isDemoMode && (
            <div className="px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 text-xs font-bold animate-pulse">
              🎮 DEMO MODE
            </div>
          )}
          {userWallet && userBalance !== undefined && (
            <button
              onClick={onManageBalance}
              className="group px-4 py-2 rounded-lg border border-green-500/40 bg-green-500/10 hover:bg-green-500/20 transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="text-green-400/70 text-xs font-medium">My Balance</span>
                <span className="text-green-300 text-base font-bold">${userBalance.toFixed(2)}</span>
                <span className="text-green-400/50 text-xs group-hover:text-green-300 transition-colors">+</span>
              </div>
            </button>
          )}
          <div className="flex gap-3 text-xs text-white/70">
            <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5">
              Wins {stats.totalWins}
            </div>
            <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5">
              Losses {stats.totalLosses}
            </div>
            <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5">
              P&L {stats.realizedPnL >= 0 ? '+' : ''}${stats.realizedPnL.toFixed(2)}
            </div>
            {stats.totalWins + stats.totalLosses > 0 && (
              <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5">
                Win Rate {stats.winRate.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onManageBalance && (
            <button
              onClick={onManageBalance}
              className="border border-white/20 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Balance ${balance.toFixed(2)}
            </button>
          )}
          {onWithdrawClick && userWallet && (
            <button
              onClick={onWithdrawClick}
              className="border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Withdraw
            </button>
          )}
          {mounted && <WalletMultiButton />}
        </div>
      </div>
    </div>
  );
};

export default Header;
