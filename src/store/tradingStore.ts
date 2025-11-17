import { create } from 'zustand';
import { PriceData } from '@/services/pythService';
import { MarketConfig } from '@/config/constants';

export type PositionStatus = 'active' | 'won' | 'lost';

export interface Position {
  id: string;
  userId?: string; // Track which user this position belongs to (for universal account model)
  marketIndex: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  zoneLowerBound: number;
  zoneUpperBound: number;
  expiryTime: number;
  stopLossPrice?: number;
  size: number;
  betAmount: number;
  multiplier: number;
  timeOffsetSeconds: number;
  timestamp: number;
  status: PositionStatus;
  txSignature?: string;
  entryOrderId?: number;
  takeProfitOrderId?: number;
  stopLossOrderId?: number;
  realizedPnL?: number;
  resolvedAt?: number;
  resolvedPrice?: number;
  gridColumn?: number; // Store the grid column index where bet was placed
  gridRow?: number; // Store the grid row index where bet was placed (locks to cell)
}

export interface Trade {
  id: string;
  marketIndex: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  timestamp: number;
  status: 'open' | 'closed';
}

export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}

export interface PerformanceStats {
  totalWins: number;
  totalLosses: number;
  realizedPnL: number;
  winRate: number;
  totalVolume: number;
}

interface TradingState {
  currentPrice: number;
  priceHistory: PriceData[];
  selectedMarket: MarketConfig | null;
  positions: Position[];
  trades: Trade[];
  isExecutingTrade: boolean;
  balance: number;
  freeCollateral: number;
  stats: PerformanceStats;
  notifications: Notification[];
  currentUserId?: string; // Track current user (optional - for multi-user support)
  setCurrentPrice: (price: number) => void;
  addPriceData: (data: PriceData) => void;
  setSelectedMarket: (market: MarketConfig) => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, updates: Partial<Trade>) => void;
  addPosition: (position: Position) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  setExecutingTrade: (isExecuting: boolean) => void;
  setBalance: (balance: number) => void;
  setFreeCollateral: (freeCollateral: number) => void;
  addNotification: (type: NotificationType, message: string) => void;
  removeNotification: (id: string) => void;
  checkWins: (currentPrice: number) => void;
  setCurrentUserId: (userId: string) => void;
  getPositionsForUser: (userId?: string) => Position[]; // Filter positions by user
  reset: () => void;
}

const createEmptyStats = (): PerformanceStats => ({
  totalWins: 0,
  totalLosses: 0,
  realizedPnL: 0,
  winRate: 0,
  totalVolume: 0,
});

const recalcWinRate = (stats: PerformanceStats) => {
  const attempts = stats.totalWins + stats.totalLosses;
  stats.winRate = attempts > 0 ? (stats.totalWins / attempts) * 100 : 0;
};

// Notification ID counter to prevent duplicates
let notificationCounter = 0;

export const useTradingStore = create<TradingState>((set, get) => ({
  currentPrice: 0,
  priceHistory: [],
  selectedMarket: null,
  positions: [],
  trades: [],
  isExecutingTrade: false,
  balance: 1000,
  freeCollateral: 1000,
  stats: createEmptyStats(),
  notifications: [],

  setCurrentPrice: (price) => set({ currentPrice: price }),

  addPriceData: (data) =>
    set((state) => ({
      priceHistory: [...state.priceHistory.slice(-200), data],
    })),

  setSelectedMarket: (market) => set({ selectedMarket: market }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades],
    })),

  updateTrade: (id, updates) =>
    set((state) => ({
      trades: state.trades.map((trade) => (trade.id === id ? { ...trade, ...updates } : trade)),
    })),

  addPosition: (position) =>
    set((state) => ({
      positions: [position, ...state.positions],
    })),

  updatePosition: (id, updates) =>
    set((state) => ({
      positions: state.positions.map((pos) => (pos.id === id ? { ...pos, ...updates } : pos)),
    })),

  setExecutingTrade: (isExecuting) => set({ isExecutingTrade: isExecuting }),

  setBalance: (balance) => set({ balance }),

  setFreeCollateral: (freeCollateral) => set({ freeCollateral }),

  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { id: `notif-${Date.now()}-${++notificationCounter}`, type, message, timestamp: Date.now() },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((notif) => notif.id !== id),
    })),

  checkWins: (currentPrice: number) => {
    const now = Date.now();

    set((state) => {
      const hasActive = state.positions.some((pos) => pos.status === 'active');
      if (!hasActive) {
        return {};
      }

      if (!currentPrice || currentPrice <= 0) {
        console.warn('[TapTrading] checkWins called without a valid price. Skipping resolve.');
        return {};
      }

      let statsUpdate = { ...state.stats };
      let changed = false;

      const updatedPositions = state.positions.map((pos) => {
        if (pos.status !== 'active') return pos;

        // Check if bet has expired (LOSS condition if price never touched zone)
        const timeLeftMs = pos.expiryTime - now;
        const hasExpired = timeLeftMs <= 0;

        if (!pos.entryPrice || pos.entryPrice <= 0) {
          console.warn('[TapTrading] Position missing entry price, skipping resolve', pos.id);
          return pos;
        }

        const lowerBound = pos.zoneLowerBound ?? pos.targetPrice;
        const upperBound = pos.zoneUpperBound ?? pos.targetPrice;

        // WIN IMMEDIATELY if price touches the target zone (bet square)
        const priceInZone =
          currentPrice >= Math.min(lowerBound, upperBound) &&
          currentPrice <= Math.max(lowerBound, upperBound);

        // Debug: Log price vs zone bounds
        if (priceInZone) {
          console.log('[TapTrading] 🎯 Price in zone detected:', {
            id: pos.id,
            currentPrice: currentPrice.toFixed(4),
            zoneLower: lowerBound.toFixed(4),
            zoneUpper: upperBound.toFixed(4),
            distance: Math.abs(currentPrice - pos.targetPrice).toFixed(4),
          });
        }

        const leverage = pos.betAmount > 0 ? pos.size / pos.betAmount : 0;
        const priceChangePercent = Math.abs(currentPrice - pos.entryPrice) / pos.entryPrice;

        // Instant win if price hits the zone
        if (priceInZone) {
          console.log('[TapTrading] INSTANT WIN - Price touched target zone!', {
            id: pos.id,
            currentPrice,
            zoneLower: lowerBound,
            zoneUpper: upperBound,
          });

          changed = true;
          const profit = pos.betAmount * leverage * priceChangePercent;
          const totalReturn = pos.betAmount + profit;

          statsUpdate.totalWins += 1;
          statsUpdate.realizedPnL += profit;
          statsUpdate.totalVolume += pos.betAmount;
          recalcWinRate(statsUpdate);

          console.log('[TapTrading] Bet WON', {
            id: pos.id,
            leverage,
            profit,
            totalReturn,
          });

          return {
            ...pos,
            status: 'won' as const,
            realizedPnL: profit,
            resolvedAt: now,
            resolvedPrice: currentPrice,
          };
        }

        // Only check for LOSS if timer has expired
        if (!hasExpired) {
          return pos; // Still active, waiting for price to hit zone or expire
        }

        // Timer expired and price never hit zone = LOSS
        console.log('[TapTrading] Bet EXPIRED - Time ran out', {
          id: pos.id,
          expiresAt: new Date(pos.expiryTime).toISOString(),
        });

        changed = true;
        const pnl = -pos.betAmount;
        statsUpdate.totalLosses += 1;
        statsUpdate.realizedPnL += pnl;
        statsUpdate.totalVolume += pos.betAmount;
        recalcWinRate(statsUpdate);

        console.log('[TapTrading] Bet LOST', {
          id: pos.id,
          pnl,
        });

        return {
          ...pos,
          status: 'lost' as const,
          realizedPnL: pnl,
          resolvedAt: now,
          resolvedPrice: currentPrice,
        };
      });

      if (!changed) {
        return {};
      }

      return { positions: updatedPositions, stats: statsUpdate };
    });
  },

  reset: () =>
    set({
      currentPrice: 0,
      priceHistory: [],
      selectedMarket: null,
      positions: [],
      trades: [],
      isExecutingTrade: false,
      balance: 1000,
      freeCollateral: 1000,
      stats: createEmptyStats(),
      notifications: [],
      currentUserId: undefined,
    }),

  setCurrentUserId: (userId: string) => set({ currentUserId: userId }),

  getPositionsForUser: (userId?: string) => {
    const state = get();
    const targetUserId = userId || state.currentUserId;
    
    // If no userId specified, return all positions
    if (!targetUserId) {
      return state.positions;
    }
    
    // Filter positions for specific user
    return state.positions.filter((pos) => pos.userId === targetUserId);
  },
}));
