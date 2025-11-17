'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTradingStore } from '@/store/tradingStore';
import { MARKETS, DRIFT_CONFIG, TRADING_CONFIG } from '@/config/constants';
import DriftService from '@/services/driftService';
import PythWebSocketService from '@/services/pythWebSocketService';
import PriceChart from '@/components/PriceChart';
import Header from '@/components/Header';
import WalletModal from '@/components/WalletModal';
import BettingPanel from '@/components/BettingPanel';

let sharedPriceService: PythWebSocketService | null = null;
let sharedPriceFeedUnsubscribe: (() => void) | null = null;
let sharedPriceFeedSubscribers = 0;
let sharedPriceFeedCleanupTimer: NodeJS.Timeout | null = null;

export default function Home() {
  const wallet = useWallet();
  const {
    setCurrentPrice,
    addPriceData,
    setSelectedMarket,
    addPosition,
    updatePosition,
    setExecutingTrade,
    checkWins,
    setBalance,
    balance,
    freeCollateral,
    setFreeCollateral,
    positions,
    priceHistory,
    addNotification,
    notifications,
  } = useTradingStore();
  const hasActivePositions = positions.some((pos) => pos.status === 'active');

  useEffect(() => {
    if (!positions.length) return;

    console.groupCollapsed(`[TapTrading] Positions changed (${positions.length}) @ ${new Date().toISOString()}`);
    positions.forEach((pos) => {
      const secondsLeft = Math.max(0, (pos.expiryTime - Date.now()) / 1000);
      console.log(pos.id, {
        status: pos.status,
        betAmount: pos.betAmount,
        expiresAt: new Date(pos.expiryTime).toISOString(),
        secondsRemaining: Number(secondsLeft.toFixed(2)),
        direction: pos.direction,
      });
    });
    console.groupEnd();
  }, [positions]);

  const driftServiceRef = useRef<DriftService | null>(null);
  const [isDriftAccountReady, setIsDriftAccountReady] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [betAmount, setBetAmount] = useState(10); // User-selected bet amount

  // Initialize services
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    sharedPriceFeedSubscribers += 1;

    if (sharedPriceFeedCleanupTimer) {
      clearTimeout(sharedPriceFeedCleanupTimer);
      sharedPriceFeedCleanupTimer = null;
    }

    const {
      setCurrentPrice: feedSetCurrentPrice,
      addPriceData: feedAddPriceData,
      setSelectedMarket: feedSetSelectedMarket,
      checkWins: feedCheckWins,
      addNotification: feedAddNotification,
    } = useTradingStore.getState();

    const ensurePriceFeed = () => {
      try {
        if (!sharedPriceService) {
          console.log('Initializing Pyth WebSocket service...');
          sharedPriceService = new PythWebSocketService();
          feedSetSelectedMarket(MARKETS.SOL);
        }

        if (!sharedPriceFeedUnsubscribe) {
          console.log('Subscribing to Pyth SOL/USD price feed...');
          sharedPriceFeedUnsubscribe = sharedPriceService.subscribeToPriceUpdates(
            MARKETS.SOL.pythPriceId,
            (priceData) => {
              const historyLength = useTradingStore.getState().priceHistory.length;
              console.log('Price update from Pyth oracle:', priceData.price.toFixed(2), 'History length:', historyLength);
              feedSetCurrentPrice(priceData.price);
              feedAddPriceData(priceData);
              feedCheckWins(priceData.price);
              console.log(`SOL/USD: $${priceData.price.toFixed(2)} ±$${priceData.confidence.toFixed(4)} | Store updated`);
            }
          );
          console.log('Connected to Pyth Network for real-time oracle prices');
        }
      } catch (error) {
        console.error('Failed to initialize services:', error);
        feedAddNotification('error', 'Failed to connect to price feed');
      }
    };

    ensurePriceFeed();

    return () => {
      sharedPriceFeedSubscribers = Math.max(0, sharedPriceFeedSubscribers - 1);

      if (sharedPriceFeedSubscribers === 0) {
        sharedPriceFeedCleanupTimer = setTimeout(() => {
          sharedPriceFeedUnsubscribe?.();
          sharedPriceFeedUnsubscribe = null;
          sharedPriceService?.disconnect();
          sharedPriceService = null;
          sharedPriceFeedCleanupTimer = null;
        }, 250) as any;
      }
    };
  }, []);

  // Ensure expired bets settle even if price stays flat
  useEffect(() => {
    if (!hasActivePositions) return;

    const interval = setInterval(() => {
      const state = useTradingStore.getState();
      if (!state.currentPrice || state.currentPrice <= 0) return;
      const expiredExists = state.positions.some(
        (pos) => pos.status === 'active' && Date.now() >= pos.expiryTime,
      );

      if (expiredExists) {
        const expiredIds = state.positions
          .filter((pos) => pos.status === 'active' && Date.now() >= pos.expiryTime)
          .map((pos) => pos.id);
        console.log('[TapTrading] Forcing expiry check', {
          expiredIds,
          currentPrice: state.currentPrice,
          timestamp: new Date().toISOString(),
        });
        state.checkWins(state.currentPrice);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [hasActivePositions]);

  // Initialize Drift with universal account (no wallet needed)
  useEffect(() => {
    const initDrift = async () => {
      try {
        setIsCheckingAccount(true);
        driftServiceRef.current = new DriftService(DRIFT_CONFIG.RPC_URL);
        
        // Initialize with universal account (no wallet parameter needed)
        await driftServiceRef.current.initializeClient();
        console.log('✅ Universal Drift account initialized');
        
        // Universal account is always ready
        setIsDriftAccountReady(true);
        addNotification('success', 'Ready to trade!');
        
        // Fetch account balance
        try {
          const accountInfo = await driftServiceRef.current.getUserAccount();
          setBalance(accountInfo.totalCollateral);
          setFreeCollateral(accountInfo.freeCollateral);
          console.log('Universal account balance:', accountInfo.totalCollateral);
        } catch (error) {
          console.warn('Could not fetch account info:', error);
          // Use demo balance if universal account not configured
          setBalance(1000);
          setFreeCollateral(1000);
        }
      } catch (error: any) {
        console.error('Drift initialization failed:', error);
        
        // Check if it's the missing config error
        if (error?.message?.includes('not configured')) {
          console.log('💡 To enable live trading, set up the universal account:');
          console.log('   See UNIVERSAL_ACCOUNT_SETUP.md for instructions');
          setIsDriftAccountReady(false); // Demo mode
        } else {
          console.error('Drift initialization failed - check console for details');
          setIsDriftAccountReady(false);
        }
        
        // Always provide demo balance for testing
        setBalance(1000);
        setFreeCollateral(1000);
      } finally {
        setIsCheckingAccount(false);
      }
    };

    initDrift();
    
    return () => {
      if (driftServiceRef.current) {
        driftServiceRef.current.cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Balance tracking - update every 10 seconds
  useEffect(() => {
    if (!isDriftAccountReady || !driftServiceRef.current) return;

    const updateBalance = async () => {
      try {
        const accountInfo = await driftServiceRef.current!.getUserAccount();
        setBalance(accountInfo.totalCollateral);
        setFreeCollateral(accountInfo.freeCollateral);
      } catch (error) {
        console.error('Failed to update balance:', error);
      }
    };

    const interval = setInterval(updateBalance, 10000);
    return () => clearInterval(interval);
  }, [isDriftAccountReady, setBalance, setFreeCollateral]);

  // Position monitoring - check Drift every 2 seconds
  useEffect(() => {
    if (!isDriftAccountReady || !driftServiceRef.current) return;

    const syncPositions = async () => {
      try {
        const driftPositions = await driftServiceRef.current!.getUserPositions();
        const driftOrders = await driftServiceRef.current!.getUserOrders();
        
        // Check if any of our tracked positions have filled orders
        positions.filter(p => p.status === 'active').forEach((position) => {
          // Check if take-profit filled (WIN)
          const tpFilled = position.takeProfitOrderId && 
            !driftOrders.find(o => o.orderId === position.takeProfitOrderId);
          
          // Check if stop-loss filled (LOSS)
          const slFilled = position.stopLossOrderId && 
            !driftOrders.find(o => o.orderId === position.stopLossOrderId);
          
          if (tpFilled) {
            // Calculate real options P&L
            const leverage = position.size / position.betAmount;
            const priceChangePercent = Math.abs(position.targetPrice - position.entryPrice) / position.entryPrice;
            const profit = position.betAmount * leverage * priceChangePercent;
            const totalReturn = position.betAmount + profit;
            
            updatePosition(position.id, { 
              status: 'won',
              realizedPnL: profit
            });
            addNotification('success', `Win locked in: +$${totalReturn.toFixed(2)} (${leverage}x)`);
            console.log('Take-profit filled. WIN:', position.id, 'Profit:', profit.toFixed(2));
          } else if (slFilled) {
            // Loss = full collateral
            updatePosition(position.id, { 
              status: 'lost',
              realizedPnL: -position.betAmount
            });
            addNotification('error', `Loss recorded: -$${position.betAmount.toFixed(2)}`);
            console.log('Stop-loss filled. LOSS:', position.id);
          }
        });
      } catch (error) {
        console.error('Failed to sync positions:', error);
      }
    };

    const interval = setInterval(syncPositions, 2000);
    return () => clearInterval(interval);
  }, [isDriftAccountReady, positions, updatePosition, addNotification]);

  // LocalStorage persistence for price history
  useEffect(() => {
    const cached = localStorage.getItem('priceHistory');
    if (cached) {
      try {
        const history = JSON.parse(cached);
        history.forEach((data: any) => addPriceData(data));
      } catch (error) {
        console.error('Failed to load price history:', error);
      }
    }
  }, [addPriceData]);

  useEffect(() => {
    const { priceHistory } = useTradingStore.getState();
    if (priceHistory.length > 0) {
      localStorage.setItem('priceHistory', JSON.stringify(priceHistory.slice(-200)));
    }
  });

  // Passive expiry checks now handled by hasActivePositions watcher above

  // Create Drift account handler
  const handleCreateDriftAccount = async () => {
    if (!driftServiceRef.current) return;
    
    try {
      setIsCheckingAccount(true);
      await driftServiceRef.current.initializeUserAccount();
      setIsDriftAccountReady(true);
      const accountInfo = await driftServiceRef.current.getUserAccount();
      setBalance(accountInfo.totalCollateral);
      setFreeCollateral(accountInfo.freeCollateral);
      addNotification('success', 'Drift account created successfully!');
    } catch (error: any) {
      console.error('Failed to create account:', error);
      addNotification('error', `Failed to create account: ${error.message}`);
    } finally {
      setIsCheckingAccount(false);
    }
  };

  // Handle grid tap - place bet at target price AND time
  const handleGridTap = useCallback(
    async (
      targetPrice: number,
      expiryTime: number,
      leverage: number,
      timeSlotSeconds: number,
      gridColumn: number,
      gridRow: number, // Store grid row to lock bet to cell
    ) => {
      // Allow betting in both demo and live mode
      // Demo mode works without Drift account configured
      
      const currentPrice = useTradingStore.getState().currentPrice;
      if (!currentPrice || currentPrice <= 0) {
        addNotification('error', 'Waiting for price data...');
        return;
      }

      const direction = targetPrice > currentPrice ? 'long' : 'short';
      const expirySeconds = (expiryTime - Date.now()) / 1000;
      
      // Validate minimum bet time (Drift Protocol requirement)
      if (expirySeconds < TRADING_CONFIG.MIN_BET_TIME_SECONDS) {
        addNotification('error', `Bet too close! Need ${TRADING_CONFIG.MIN_BET_TIME_SECONDS}s minimum`);
        return;
      }
      const createdAt = Date.now();
      const positionId = `bet-${createdAt}`;
      
      // Zone should match the VISUAL grid cell height (0.2% per row, 10 rows = 2% total range)
      // Each grid cell = 0.2% of price range
      const gridCellPercent = 0.002; // 0.2% per grid cell
      const zoneHalfWidth = targetPrice * (gridCellPercent / 2); // Half cell height
      const zoneLowerBound = targetPrice - zoneHalfWidth;
      const zoneUpperBound = targetPrice + zoneHalfWidth;
      
      // Calculate position size from leverage using user-selected bet amount
      const positionSize = betAmount * leverage;
      const priceChangePercent = Math.abs(targetPrice - currentPrice) / currentPrice;
      const expectedProfit = positionSize * priceChangePercent;

      console.log(`
    Placing prediction bet:
       Collateral: $${betAmount}
       Leverage: ${leverage}x
       Position Size: $${positionSize.toFixed(2)}
   
       Current Price: $${currentPrice.toFixed(2)}
      Target Price: $${targetPrice.toFixed(2)}
      Win Zone: $${zoneLowerBound.toFixed(2)} - $${zoneUpperBound.toFixed(2)} (±${(gridCellPercent * 50).toFixed(1)}%)
       Time Limit: +${expirySeconds.toFixed(0)}s
   
       Expected Profit if Correct: $${expectedProfit.toFixed(2)}
       Total if WIN: $${(betAmount + expectedProfit).toFixed(2)}
   
       WIN if: Price line crosses through bet square
       LOSS if: Timer expires before price hits square (-$${betAmount} collateral)
    `);

      setExecutingTrade(true);

      try {
        // Default to demo mode
        let txSignature = 'demo-' + Date.now();
        let entryOrderId, takeProfitOrderId, stopLossOrderId;
        let isRealTrade = false;
        
        // Only execute on Drift if account is ready
        if (driftServiceRef.current && isDriftAccountReady) {
          try {
            console.log('🔥 Executing LIVE trade on Drift Protocol...');
            const result = await driftServiceRef.current.executeTapTrade(
              direction,
              targetPrice,
              betAmount,
              leverage,
              MARKETS.SOL
            );
            txSignature = result.txSignature;
            entryOrderId = result.entryOrderId;
            takeProfitOrderId = result.takeProfitOrderId;
            stopLossOrderId = result.stopLossOrderId;
            isRealTrade = true;
            addNotification('success', `Live bet placed! $${betAmount} @ ${leverage}x`);
          } catch (error) {
            console.warn('Drift execution failed, using demo mode:', error);
          }
        } else {
          // Demo mode - silent
          console.log('🎮 Demo bet placed (no real trade)');
        }

        // Add active bet to positions
        addPosition({
          id: positionId,
          marketIndex: MARKETS.SOL.marketIndex,
          direction: direction.toUpperCase() as 'LONG' | 'SHORT',
          entryPrice: currentPrice,
          targetPrice,
          zoneLowerBound,
          zoneUpperBound,
          expiryTime,
          stopLossPrice: currentPrice * 0.95, // Not really used in this system
          size: positionSize, // Real position size from leverage
          betAmount,
          multiplier: leverage, // Store leverage in multiplier field for compatibility
          timeOffsetSeconds: timeSlotSeconds,
          timestamp: createdAt,
          status: 'active',
          txSignature,
          entryOrderId,
          takeProfitOrderId,
          stopLossOrderId,
          gridColumn, // Store grid column to fix rendering position
          gridRow, // Store grid row to lock bet to cell
        });

        console.log('[TapTrading] Position created', {
          id: positionId,
          expiresAt: new Date(expiryTime).toISOString(),
          direction,
          leverage,
          betAmount,
          size: positionSize,
          createdAt: new Date(createdAt).toISOString(),
          gridColumn: gridColumn,
          gridRow: gridRow,
          targetPrice: targetPrice.toFixed(2),
          currentPrice: currentPrice.toFixed(2),
        });
        console.log(`✅ Bet placed at gridColumn ${gridColumn}, gridRow ${gridRow}. Win if price lands in zone when timer expires at ${new Date(expiryTime).toLocaleTimeString()}`);
      } catch (error: any) {
        console.error('Bet placement failed:', error);
        alert(`Failed to place bet: ${error.message || 'Unknown error'}`);
      } finally {
        setExecutingTrade(false);
      }
    },
    [addPosition, setExecutingTrade, isDriftAccountReady, addNotification, betAmount]
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/70 to-black" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.04),transparent_45%)]" aria-hidden="true" />
      {/* Header with wallet & stats */}
      <Header 
        onManageBalance={() => setShowWalletModal(true)} 
        isDemoMode={!isDriftAccountReady}
      />

      {/* Main content strip */}
      <div className="absolute inset-x-0 top-16 bottom-0 flex gap-6 px-6 pb-6">
        <div className="flex-1 relative rounded-3xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
          <PriceChart onGridTap={handleGridTap} />
        </div>
        <div className="w-80 h-full">
          <BettingPanel 
            currentBetAmount={betAmount}
            onBetAmountChange={setBetAmount}
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="absolute top-20 left-8 z-50 w-64 space-y-2 pointer-events-none">
        {notifications.slice(-3).map((notif) => {
          const label = notif.type === 'success' ? 'OK' : notif.type === 'error' ? 'ALERT' : 'INFO';

          return (
            <div
              key={notif.id}
              className={`px-3 py-2 rounded-full text-xs font-medium backdrop-blur-md border border-white/15 bg-black/70 text-white/80 shadow-lg shadow-black/40 animate-slide-in`}
            >
              <span className="mr-2 text-white/60">{label}:</span>{notif.message}
            </div>
          );
        })}
      </div>

      {/* Wallet Management Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        driftService={driftServiceRef.current}
        isDriftAccountReady={isDriftAccountReady}
        isCheckingAccount={isCheckingAccount}
        onCreateAccount={handleCreateDriftAccount}
        freeCollateral={freeCollateral}
      />

      {/* Initialization status */}
      {isCheckingAccount && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-40">
          <div className="bg-black/80 border border-white/10 rounded-2xl p-8 text-center max-w-md shadow-2xl shadow-black">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Tap Trading
            </h2>
            <p className="text-white/70 mb-6">
              Initializing...
            </p>
            <p className="text-sm text-white/40">
              Please wait...
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
