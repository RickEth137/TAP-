'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTradingStore } from '@/store/tradingStore';
import { MARKETS, DRIFT_CONFIG, TRADING_CONFIG } from '@/config/constants';
import DriftService from '@/services/driftService';
import PythWebSocketService from '@/services/pythWebSocketService';
import PriceChart from '@/components/PriceChart';
import Header from '@/components/Header';
import BettingPanel from '@/components/BettingPanel';
import DepositModal from '@/components/DepositModal';
import WithdrawalModal from '@/components/WithdrawalModal';
import AdminDashboard from '@/components/AdminDashboard';
import { getUserBalance, placeBet, requestWithdrawal, verifyDeposit, resolveBet } from '@/app/actions';

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
  const [betAmount, setBetAmount] = useState(10); // User-selected bet amount
  const [userBalance, setUserBalance] = useState(0); // User's app balance (tracked by wallet address)
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [isSettling, setIsSettling] = useState(false); // Mutex for settlement

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

  // Load user balance when wallet connects
  useEffect(() => {
    if (wallet.publicKey) {
      const walletAddress = wallet.publicKey.toBase58();
      getUserBalance(walletAddress).then((data) => {
        setUserBalance(data.balance);
        console.log(`💰 User balance loaded: ${walletAddress} = $${data.balance}`);
        
        // Show deposit modal if balance is 0
        if (data.balance === 0) {
          setShowDepositModal(true);
        }
      });
    } else {
      setUserBalance(0);
    }
  }, [wallet.publicKey]);

  // Update user balance when positions change (win/loss)
  useEffect(() => {
    if (!wallet.publicKey) return;
    const walletAddress = wallet.publicKey.toBase58();
    getUserBalance(walletAddress).then((data) => {
      setUserBalance(data.balance);
    });
  }, [positions, wallet.publicKey]);

  // CRITICAL: Settle positions on blockchain when they resolve
  useEffect(() => {
    if (!isDriftAccountReady || !driftServiceRef.current) return;

    const settlePositions = async () => {
      // Mutex: prevent concurrent settlements
      if (isSettling) {
        console.log('⏳ Settlement already in progress, skipping...');
        return;
      }

      const needsSettlement = positions.filter(
        (pos) => 
          (pos.status === 'won' || pos.status === 'lost') && 
          !pos.settledOnChain &&
          pos.txSignature && // Only settle if real trade was placed
          (pos.settlementAttempts || 0) < 5 // Max 5 retry attempts (increased)
      );

      if (needsSettlement.length === 0) return;

      setIsSettling(true); // Acquire mutex

      console.log(`🔄 Settling ${needsSettlement.length} positions on blockchain...`);

      // Process sequentially to avoid race conditions
      for (const pos of needsSettlement) {
        try {
          console.log(`📤 Resolving bet ${pos.id} on server...`);
          
          if (!pos.userId) {
             throw new Error('Position missing userId');
          }

          const result = await resolveBet(
            pos.userId,
            pos.id,
            pos.realizedPnL || 0,
            pos.status === 'won'
          );

          if (!result.success) {
             throw new Error(result.error || 'Settlement failed');
          }
          
          // For resolveBet, we don't get a txSignature back necessarily (unless we want to track the close tx)
          // But let's assume success means it's done.
          // We can use a placeholder or the original txSig if we want to keep the field populated.
          const settleTxSig = 'server-resolved'; 

          updatePosition(pos.id, {
            settledOnChain: true,
            settlementTxSignature: settleTxSig,
          });

          console.log(`✅ Position ${pos.id} resolved. Balance updated.`);
          addNotification('success', `Payout processed: ${pos.status === 'won' ? 'WIN' : 'LOSS'}`);
        } catch (error: any) {
          console.error(`❌ Failed to settle position ${pos.id}:`, error);
          
          // Increment retry counter
          updatePosition(pos.id, {
            settlementAttempts: (pos.settlementAttempts || 0) + 1,
          });

          // Only notify on final failure
          if ((pos.settlementAttempts || 0) >= 2) {
            addNotification('error', `Settlement failed for ${pos.id}`);
          }
        }

        // Small delay between settlements to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setIsSettling(false); // Release mutex
    };

    settlePositions().catch((error) => {
      console.error('❌ Settlement process failed:', error);
      setIsSettling(false); // Release mutex on error
    });
  }, [positions, isDriftAccountReady, updatePosition, addNotification, isSettling]);

  // Initialize Drift with universal account (no wallet needed)
  useEffect(() => {
    const initDrift = async () => {
      console.log('🚀 ========== DRIFT INITIALIZATION START ==========');
      console.log('📋 Environment Check:');
      console.log('   RPC_URL:', DRIFT_CONFIG.RPC_URL ? '✅ Set' : '❌ Missing');
      console.log('   RPC_URL value:', DRIFT_CONFIG.RPC_URL);
      console.log('   UNIVERSAL_WALLET_ADDRESS:', process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS ? '✅ Set' : '❌ Missing');
      console.log('   UNIVERSAL_WALLET_PRIVATE_KEY:', process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_PRIVATE_KEY ? '✅ Set' : '❌ Missing');
      console.log('   DRIFT_ACCOUNT_PRIVATE_KEY:', process.env.DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY ? '✅ Set' : '❌ Missing');
      console.log('   DRIFT_ACCOUNT_PRIVATE_KEY length:', process.env.DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY?.length);
      
      try {
        console.log('1️⃣ Creating DriftService instance...');
        driftServiceRef.current = new DriftService(DRIFT_CONFIG.RPC_URL);
        console.log('✅ DriftService created');
        
        // Initialize with universal account (no wallet parameter needed)
        console.log('4️⃣ Calling driftService.initializeClient()...');
        console.log('   This will connect to Drift Protocol and set up the universal account');
        await driftServiceRef.current.initializeClient();
        console.log('✅ Universal Drift account initialized');
        
        // Universal account is always ready
        console.log('5️⃣ Setting isDriftAccountReady to true...');
        setIsDriftAccountReady(true);
        addNotification('success', '✅ Trading system ready! You can now place bets.');
        console.log('✅ System ready - you can now click the grid to place bets');
        console.log('🎯 ========== DRIFT INITIALIZATION COMPLETE ==========');
        
        // Fetch account balance
        try {
          const accountInfo = await driftServiceRef.current.getUserAccount();
          setBalance(accountInfo.totalCollateral);
          setFreeCollateral(accountInfo.freeCollateral);
          console.log('Universal account balance:', accountInfo.totalCollateral);
          
        } catch (error) {
          console.warn('Could not fetch account info:', error);
          setBalance(0);
          setFreeCollateral(0);
        }
      } catch (error: any) {
        console.error('❌❌❌ DRIFT INITIALIZATION FAILED ❌❌❌');
        console.error('🔴 Full error:', error);
        console.error('🔴 Error message:', error?.message);
        console.error('🔴 Error stack:', error?.stack);
        
        // Detailed diagnostics
        console.log('');
        console.log('🔍 DIAGNOSTICS:');
        console.log('   isDriftAccountReady before error:', isDriftAccountReady);
        console.log('   driftServiceRef.current:', !!driftServiceRef.current);
        
        // Check if it's the missing config error
        if (error?.message?.includes('not configured')) {
          console.error('');
          console.error('💡 PROBLEM IDENTIFIED: Universal account not configured');
          console.error('   Missing environment variables in .env.local:');
          console.error('   - NEXT_PUBLIC_UNIVERSAL_WALLET_PRIVATE_KEY');
          console.error('   - DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY');
          console.error('');
          console.error('📝 TO FIX:');
          console.error('   1. Check .env.local file exists');
          console.error('   2. Verify both keys are set');
          console.error('   3. Restart dev server: npm run dev');
          addNotification('error', '❌ Wallet not configured. Check console (F12).');
          setIsDriftAccountReady(false);
        } else if (error?.message?.includes('Invalid') || error?.message?.includes('format')) {
          console.error('');
          console.error('💡 PROBLEM IDENTIFIED: Invalid private key format');
          console.error('   Your private key must be a JSON array: [1,2,3,...]');
          console.error('');
          console.error('📝 TO FIX:');
          console.error('   1. Run: solana-keygen show /path/to/keypair.json --output json-compact');
          console.error('   2. Copy the array and paste into .env.local');
          console.error('   3. Restart dev server');
          addNotification('error', '❌ Invalid key format. Check console (F12).');
          setIsDriftAccountReady(false);
        } else if (error?.message?.includes('account does not exist') || error?.message?.includes('Account not found')) {
          console.error('');
          console.error('💡 PROBLEM IDENTIFIED: Drift account not initialized');
          console.error('   Your universal wallet needs a Drift account');
          console.error('');
          console.error('📝 TO FIX:');
          console.error('   1. Visit https://app.drift.trade/');
          console.error('   2. Import your universal wallet');
          console.error('   3. Click "Initialize Account" (~0.035 SOL)');
          console.error('   4. Refresh this page');
          addNotification('error', '❌ Drift account not initialized. Check console (F12).');
          setIsDriftAccountReady(false);
        } else {
          console.error('');
          console.error('💡 PROBLEM IDENTIFIED: Unknown error');
          console.error('   Possible causes:');
          console.error('   - RPC endpoint down or invalid');
          console.error('   - Network connection issues');
          console.error('   - Universal wallet has no SOL for gas');
          console.error('');
          console.error('📝 TO FIX:');
          console.error('   1. Check RPC endpoint is working');
          console.error('   2. Verify universal wallet has SOL (~0.5 SOL)');
          console.error('   3. Check browser console for network errors');
          addNotification('error', '❌ System initialization failed. Check console (F12).');
          setIsDriftAccountReady(false);
        }
        
        console.log('');
        console.log('🚨 RESULT: Trading is DISABLED until this is fixed');
        console.log('   isDriftAccountReady is now FALSE');
        console.log('   Grid clicks will be blocked');
        console.log('');
        
        // No demo balance - real money only
        setBalance(0);
        setFreeCollateral(0);
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
      console.log('🎯 ========== GRID CLICK HANDLER START ==========');
      console.log('📍 handleGridTap called:', { targetPrice, leverage, timeSlotSeconds });
      
      // Check if wallet is connected
      if (!wallet.publicKey) {
        console.error('❌ BLOCKED: Wallet not connected');
        addNotification('error', '🔴 WALLET NOT CONNECTED! Click "CONNECT" button in top right corner first!');
        return;
      }
      console.log('✅ Wallet connected:', wallet.publicKey.toBase58());

      const walletAddress = wallet.publicKey.toBase58();
      
      // Check user balance
      const userBalanceData = await getUserBalance(walletAddress);
      
      if (userBalanceData.balance < betAmount) {
        console.error('❌ BLOCKED: Insufficient balance');
        addNotification('error', `Insufficient balance! You have $${userBalanceData.balance.toFixed(2)}`);
        setShowDepositModal(true);
        return;
      }
      console.log('✅ Balance check passed');
      
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
      
      // Zone should match the VISUAL grid cell height (0.2% per row, 10 rows = 2% total range)
      const gridCellPercent = 0.002; // 0.2% per grid cell
      const zoneHalfWidth = targetPrice * (gridCellPercent / 2); // Half cell height
      const zoneLowerBound = targetPrice - zoneHalfWidth;
      const zoneUpperBound = targetPrice + zoneHalfWidth;
      
      // Calculate position size from leverage using user-selected bet amount
      const positionSize = betAmount * leverage;
      const priceChangePercent = Math.abs(targetPrice - currentPrice) / currentPrice;
      const expectedProfit = positionSize * priceChangePercent;

      setExecutingTrade(true);

      try {
        console.log('🔥 Executing REAL trade via Server Action...');
        
        const result = await placeBet(
            walletAddress,
            betAmount,
            targetPrice,
            leverage,
            direction
        );

        if (!result.success || !result.txSignature || !result.betId) {
            throw new Error(result.error || 'Trade failed');
        }

        addNotification('success', `Bet placed! $${betAmount} @ ${leverage}x`);
        
        // Update local balance
        setUserBalance(prev => prev - betAmount);

        // Add active bet to positions
        addPosition({
          id: result.betId,
          userId: walletAddress,
          marketIndex: MARKETS.SOL.marketIndex,
          direction: direction.toUpperCase() as 'LONG' | 'SHORT',
          entryPrice: currentPrice,
          targetPrice,
          zoneLowerBound,
          zoneUpperBound,
          expiryTime,
          stopLossPrice: currentPrice * 0.95,
          size: positionSize,
          betAmount,
          multiplier: leverage,
          timeOffsetSeconds: timeSlotSeconds,
          timestamp: Date.now(),
          status: 'active',
          txSignature: result.txSignature,
          gridColumn,
          gridRow,
        });

        console.log(`✅ Bet placed successfully: ${result.txSignature}`);
      } catch (error: any) {
        console.error('Bet placement failed:', error);
        addNotification('error', `Failed to place bet: ${error.message || 'Unknown error'}`);
      } finally {
        setExecutingTrade(false);
      }
    },
    [addPosition, setExecutingTrade, addNotification, betAmount, wallet.publicKey]
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/70 to-black" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.04),transparent_45%)]" aria-hidden="true" />
      
      {/* MASSIVE WARNING OVERLAY - WALLET NOT CONNECTED */}
      {!wallet.publicKey && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto cursor-not-allowed">
          <div className="text-center space-y-4 animate-pulse pointer-events-none">
            <div className="text-8xl mb-8">⚠️</div>
            <h1 className="text-6xl font-bold text-red-500">WALLET NOT CONNECTED!</h1>
            <p className="text-3xl text-white">Click the &quot;CONNECT&quot; button in the top right corner</p>
            <div className="text-2xl text-gray-400 mt-8">👆 Look for the purple button that says &quot;CONNECT&quot;</div>
            <div className="text-xl text-yellow-400 mt-12 animate-bounce">
              ⬆️ THE BUTTON IS ABOVE THIS MESSAGE ⬆️
            </div>
          </div>
        </div>
      )}
      
      {/* Header with wallet & stats */}
      <Header 
        onManageBalance={() => setShowDepositModal(true)} 
        onWithdrawClick={() => setShowWithdrawalModal(true)}
        isDemoMode={false}
        userBalance={userBalance}
        userWallet={wallet.publicKey?.toBase58()}
        isSystemReady={isDriftAccountReady}
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

      {/* Admin Dashboard Button (top-right corner) */}
      <button
        onClick={() => setShowAdminDashboard(true)}
        className="absolute top-4 right-4 z-50 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 rounded-lg text-purple-300 text-sm font-semibold transition-all pointer-events-auto"
        title="Admin Dashboard"
      >
        📊 Admin
      </button>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        userWallet={wallet.publicKey?.toBase58()}
        onDepositRecorded={(amount) => {
          setUserBalance(prev => prev + amount);
          addNotification('success', `Deposit recorded: $${amount}`);
        }}
      />

      <WithdrawalModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        userWallet={wallet.publicKey?.toBase58() || ''}
        currentBalance={userBalance}
        onWithdrawalRequest={async (amount: number) => {
          if (!wallet.publicKey) {
            throw new Error('Wallet not connected');
          }
          
          const result = await requestWithdrawal(
            wallet.publicKey.toBase58(),
            amount
          );
          
          if (result.success) {
            const updatedBalance = await getUserBalance(wallet.publicKey.toBase58());
            setUserBalance(updatedBalance.balance);
            addNotification('success', `Withdrawal successful! TX: ${result.txSignature?.substring(0, 8)}...`);
          } else {
            throw new Error(result.error || 'Withdrawal failed');
          }
        }}
      />

      {/* Note: Users don't need individual Drift accounts - the universal account handles all trades */}

      {/* Admin Dashboard */}
      <AdminDashboard
        isOpen={showAdminDashboard}
        onClose={() => setShowAdminDashboard(false)}
        driftBalance={balance}
        driftFreeCollateral={freeCollateral}
      />
    </main>
  );
}
