'use client';

import { FC, useState } from 'react';
import { useTradingStore } from '@/store/tradingStore';

type TabType = 'all' | 'won' | 'lost';

const PositionsList: FC = () => {
  const { positions } = useTradingStore();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  if (positions.length === 0) return null;

  // Filter positions based on active tab
  const filteredPositions = positions.filter((position) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'won') return position.status === 'won';
    if (activeTab === 'lost') return position.status === 'lost';
    return true;
  });

  return (
    <div className="absolute bottom-20 left-6 right-[22rem] max-h-40 overflow-y-auto">
      <div className="bg-black/70 backdrop-blur-md rounded-lg border border-white/15 shadow-xl shadow-black/60">
        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'all'
                ? 'text-white bg-white/10'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('won')}
            className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'won'
                ? 'text-white bg-white/10'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Won
          </button>
          <button
            onClick={() => setActiveTab('lost')}
            className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'lost'
                ? 'text-white bg-white/10'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Lost
          </button>
        </div>

        {/* Bet List */}
        <div className="p-4">
          <div className="space-y-2">
            {filteredPositions.slice(0, 5).map((position) => {
              const payout = position.betAmount * position.multiplier;
              
              return (
                <div
                  key={position.id}
                  className={`flex items-center justify-between text-xs p-2 rounded border ${
                    position.status === 'won' 
                      ? 'bg-white/10 border-white/20'
                      : position.status === 'lost'
                      ? 'bg-black/40 border-white/10'
                      : 'bg-black/30 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">
                      ${position.betAmount}
                    </span>
                    <span className="text-white/40">@</span>
                    <span className="text-white font-semibold">
                      ${position.targetPrice.toFixed(2)}
                    </span>
                    <span className="text-white/60">
                      {Math.round(position.multiplier)}x
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {position.status === 'won' && (
                      <>
                        <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/40 rounded text-green-400 font-bold text-[10px]">
                          WON
                        </span>
                        <span className="text-green-400 font-bold">
                          +${payout.toFixed(2)}
                        </span>
                      </>
                    )}
                    {position.status === 'lost' && (
                      <>
                        <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded text-red-400 font-bold text-[10px]">
                          LOST
                        </span>
                        <span className="text-red-400 font-bold">
                          -${position.betAmount.toFixed(2)}
                        </span>
                      </>
                    )}
                    {position.status === 'active' && (
                      <span className="text-white/80 font-semibold animate-pulse">
                        WAITING...
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PositionsList;
