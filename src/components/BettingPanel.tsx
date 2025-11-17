'use client';

import { FC, useMemo, useEffect, useState } from 'react';
import { useTradingStore, Position } from '@/store/tradingStore';

interface BettingPanelProps {
  onBetAmountChange: (amount: number) => void;
  currentBetAmount: number;
}

type TabType = 'all' | 'won' | 'lost';

const statusPriority: Record<Position['status'], number> = {
  active: 0,
  won: 1,
  lost: 2,
};

const presetAmounts = [5, 10, 25, 50, 100];

const BettingPanel: FC<BettingPanelProps> = ({ onBetAmountChange, currentBetAmount }) => {
  const { positions, currentPrice } = useTradingStore();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  // Filter based on active tab first, then sort
  const filteredBets = useMemo(() => {
    let filtered = positions;
    
    if (activeTab === 'won') {
      filtered = positions.filter((bet) => bet.status === 'won');
    } else if (activeTab === 'lost') {
      filtered = positions.filter((bet) => bet.status === 'lost');
    }
    
    // For "All" tab: sort by time only (newest first)
    // For "Won" and "Lost" tabs: also sort by time
    return [...filtered].sort((a, b) => b.timestamp - a.timestamp);
  }, [positions, activeTab]);

  const activeBets = useMemo(() => positions.filter((bet) => bet.status === 'active'), [positions]);
  const totalRisk = activeBets.reduce((sum, bet) => sum + bet.betAmount, 0);
  const averageLeverage = activeBets.length
    ? Math.round(activeBets.reduce((sum, bet) => sum + bet.size / bet.betAmount, 0) / activeBets.length)
    : 0;

  useEffect(() => {
    if (!filteredBets.length) return;

    console.groupCollapsed('[TapTrading] BettingPanel snapshot');
    filteredBets.slice(0, 10).forEach((bet) => {
      const secondsLeft = Math.max(0, (bet.expiryTime - Date.now()) / 1000);
      console.log(
        bet.id,
        {
          status: bet.status,
          betAmount: bet.betAmount,
          target: bet.targetPrice,
          expiresAt: new Date(bet.expiryTime).toISOString(),
          secondsLeft: Number(secondsLeft.toFixed(2)),
        }
      );
    });
    console.groupEnd();
  }, [filteredBets]);

  return (
    <aside className="h-full w-full bg-black/70 backdrop-blur-xl border-l border-white/15 shadow-2xl shadow-black/70 flex flex-col">
      <div className="p-5 border-b border-white/10">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/60 mb-4">Bet Size</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {presetAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => onBetAmountChange(amount)}
              className={`py-2 px-3 rounded-lg font-semibold text-sm transition-all ${
                currentBetAmount === amount
                  ? 'bg-white text-black shadow-lg shadow-black/40'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              ${amount}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          step={1}
          value={currentBetAmount}
          onChange={(e) => {
            const nextValue = Number(e.target.value);
            onBetAmountChange(Math.max(1, isNaN(nextValue) ? 1 : nextValue));
          }}
          className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
        />
        <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between mt-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">Each tap</p>
            <p className="text-2xl font-black text-white">${currentBetAmount}</p>
          </div>
          <p className="text-right text-white/60 text-xs max-w-[150px]">
            Set the amount before you tap a square.
          </p>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-white/50">
          Real Drift bets need a 5s+ timer. Faster rounds stay in practice mode.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-black/40">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'all'
                ? 'text-white bg-white/10 border-b-2 border-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('won')}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'won'
                ? 'text-white bg-white/10 border-b-2 border-green-500'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Won
          </button>
          <button
            onClick={() => setActiveTab('lost')}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'lost'
                ? 'text-white bg-white/10 border-b-2 border-red-500'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Lost
          </button>
        </div>

        {/* Bet List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">
              {activeTab === 'all' && `Bet Log (${positions.length})`}
              {activeTab === 'won' && `Won (${positions.filter(p => p.status === 'won').length})`}
              {activeTab === 'lost' && `Lost (${positions.filter(p => p.status === 'lost').length})`}
            </h3>
            <span className="text-[11px] text-white/60">Live {activeBets.length}</span>
          </div>

          {filteredBets.length === 0 ? (
            <div className="text-center text-white/60 text-sm mt-10">
              {activeTab === 'all' ? 'No bets yet' : activeTab === 'won' ? 'No wins yet' : 'No losses yet'}
              <div className="mt-2 text-xs text-white/40">
                {activeTab === 'all' ? 'Tap a square to fire one' : 'Keep playing!'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBets.map((bet) => {
              const isActive = bet.status === 'active';
              const leverage = Math.max(1, Math.round(bet.size / bet.betAmount));
              const priceDelta = currentPrice
                ? ((currentPrice - bet.entryPrice) / bet.entryPrice) * 100
                : 0;
              const timeRemaining = isActive ? Math.max(0, (bet.expiryTime - Date.now()) / 1000) : 0;
              const progress = bet.timeOffsetSeconds
                ? Math.max(0, Math.min(100, (timeRemaining / bet.timeOffsetSeconds) * 100))
                : 0;

              let resolvedValue: string | null = null;
              if (bet.status === 'won') {
                const pnl = bet.realizedPnL ?? bet.betAmount * (leverage - 1);
                resolvedValue = `+$${pnl.toFixed(2)}`;
              } else if (bet.status === 'lost') {
                const loss = bet.realizedPnL ?? -bet.betAmount;
                resolvedValue = `-$${Math.abs(loss).toFixed(2)}`;
              }

              const cardBase = isActive
                ? 'bg-white/5 border-white/10 hover:border-white/30'
                : bet.status === 'won'
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20';

              const badgeStyles = isActive
                ? 'text-black bg-white border border-white'
                : bet.status === 'won'
                ? 'text-white bg-white/15 border border-white/30'
                : 'text-white/70 bg-black/60 border border-white/20';

              return (
                <div key={bet.id} className={`${cardBase} rounded-xl p-4 transition-colors shadow-lg shadow-black/30`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-white font-semibold">${bet.betAmount}</p>
                      <p className="text-white/60 text-xs">{leverage}x leverage</p>
                    </div>
                    <div className="text-right space-y-1">
                      {bet.status === 'won' && (
                        <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/40 rounded text-green-400 font-bold text-[10px]">
                          WON
                        </span>
                      )}
                      {bet.status === 'lost' && (
                        <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded text-red-400 font-bold text-[10px]">
                          LOST
                        </span>
                      )}
                      {bet.status === 'active' && (
                        <span className={`px-2 py-0.5 text-[11px] rounded-full uppercase tracking-widest ${badgeStyles}`}>
                          Live
                        </span>
                      )}
                      <p className="text-xs text-white/60">
                        {isActive
                          ? `${Math.ceil(timeRemaining)}s left`
                          : `Settled ${new Date(bet.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-white/70">
                    <div>
                      <p>Target</p>
                      <p className="text-white font-semibold">${bet.targetPrice.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p>Entry</p>
                      <p className="text-white font-semibold">${bet.entryPrice.toFixed(2)}</p>
                    </div>
                  </div>

                  {isActive ? (
                    <>
                      <div className="mt-3 flex justify-between text-xs text-white/60">
                        <span className={priceDelta >= 0 ? 'text-white' : 'text-white/40'}>
                          {priceDelta >= 0 ? '+' : ''}{priceDelta.toFixed(2)}%
                        </span>
                        <span>
                          Exp {new Date(bet.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/80 transition-all duration-700"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 flex justify-between text-xs">
                      <span className={`font-semibold ${bet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                        {resolvedValue}
                      </span>
                      <span className="text-white/70">
                        Result @{new Date(bet.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <div className="p-4 border-t border-white/10 bg-black/60">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-white/60 text-xs">On the line</p>
            <p className="text-white font-bold">${totalRisk.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-white/60 text-xs">Avg boost</p>
            <p className="text-white font-bold">{averageLeverage}x</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default BettingPanel;
