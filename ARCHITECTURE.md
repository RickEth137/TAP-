# 🏗️ Technical Architecture - Tap Trading

## System Overview

Tap Trading is a **frontend integrator** that transforms complex options trading into a simple game-like experience. We don't operate a protocol—we integrate with Drift Protocol, a production-grade options DEX on Solana.

**KEY ARCHITECTURE CHANGE:** We use a **UNIVERSAL DRIFT ACCOUNT** for all users. Individual users do NOT need their own Drift accounts or wallets to play. We track positions separately in application state.

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   User      │ ───▶ │  Tap Trading │ ───▶ │ Universal   │
│  (No Wallet │      │   Frontend   │      │    Drift    │
│   Needed!)  │      │              │      │   Account   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │     Pyth     │
                     │  Price Feed  │
                     └──────────────┘
```

## Universal Account Model

### How It Works

1. **ONE Drift Account**: The application owns ONE Drift account that places all trades
2. **User Tracking**: Each position is tagged with a `userId` in our application state
3. **Position Separation**: We carefully track which positions belong to which user
4. **No User Wallets Required**: Users can play without connecting any wallet
5. **Optional Wallets**: Users can optionally connect wallets for deposits/withdrawals

### Security & Isolation

```typescript
// Position structure with user tracking
interface Position {
  id: string;
  userId?: string;  // ← Critical: tracks ownership
  marketIndex: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  betAmount: number;
  // ... other fields
}
```

**Isolation Strategy:**
- Positions filtered by `userId` in application state
- Each user only sees their own positions
- P&L calculated separately per user
- User balances tracked independently in app state

## Core Components

### 1. Drift Protocol Integration (`driftService.ts`)

**Purpose:** Execute atomic trading operations on Drift Protocol using the UNIVERSAL account.

**Key Change:** The service no longer accepts user wallets. It initializes with a server-side keypair.

```typescript
class DriftService {
  async initializeClient(): Promise<void> {
    // Load universal account from environment
    const keypair = Keypair.fromSecretKey(
      JSON.parse(DRIFT_CONFIG.UNIVERSAL_ACCOUNT_PRIVATE_KEY)
    );
    this.universalWallet = new UniversalWallet(keypair);
    
    // Initialize Drift client with universal account
    this.driftClient = new DriftClient({
      wallet: this.universalWallet,
      // ...
    });
  }
}
```

**Key Function: `executeTapTrade()`**

```typescript
async executeTapTrade(
  direction: 'long' | 'short',
  targetPrice: number,
  betAmount: number,
  leverage: number,
  marketConfig: MarketConfig,
  userId?: string  // ← NEW: Track user ownership
): Promise<string>
```

**What It Does:**

1. **Calculate Position Size**
   ```typescript
   const notionalSize = betAmount * MAX_LEVERAGE  // $10 * 50x = $500
   const baseAmount = notionalSize / currentPrice // 500 / 100 = 5 SOL
   ```

2. **Create Market Order** (Entry)
   ```typescript
   const openPositionIx = await driftClient.getPlacePerpOrderIx({
     orderType: OrderType.MARKET,
     direction: LONG or SHORT,
     baseAssetAmount: baseAmountBN,
   });
   ```

3. **Create Take-Profit Trigger Order** (Win Condition)
   ```typescript
   const takeProfitIx = await driftClient.getPlacePerpOrderIx({
     orderType: OrderType.TRIGGER_MARKET,
     direction: opposite of entry,  // Close position
     triggerPrice: targetPrice,      // User's tapped price
     triggerCondition: ABOVE (for long) or BELOW (for short),
     reduceOnly: true,               // Can only close, not open
   });
   ```

4. **Create Stop-Loss Trigger Order** (Lose Condition)
   ```typescript
   const stopLossIx = await driftClient.getPlacePerpOrderIx({
     orderType: OrderType.TRIGGER_MARKET,
     direction: opposite of entry,
     triggerPrice: stopLossPrice,    // Near entry price
     triggerCondition: BELOW (for long) or ABOVE (for short),
     reduceOnly: true,
   });
   ```

5. **Bundle & Send Atomically**
   ```typescript
   const tx = await driftClient.txSender.getTransaction([
     openPositionIx,
     takeProfitIx,
     stopLossIx,
   ]);
   
   const txSig = await driftClient.txSender.sendTransaction(tx);
   ```

**Why Atomic?**
- If any instruction fails, all fail
- User never has an unprotected position
- No race conditions

### 2. Price Feed Integration (`pythService.ts`)

**Purpose:** Stream real-time prices from Pyth Network.

**Architecture:**

```typescript
class PythService {
  // Get current price (HTTP)
  async getPrice(priceId: string): Promise<PriceData>
  
  // Subscribe to updates (Polling - replace with WebSocket in production)
  subscribeToPriceUpdates(
    priceId: string,
    callback: (priceData: PriceData) => void
  ): () => void
}
```

**Current Implementation:**
- Polls Pyth every 1 second
- Updates global state via Zustand

**Production Improvement:**
- Use Pyth WebSocket API for sub-second updates
- Implement exponential backoff on errors
- Add price staleness checks

### 3. State Management (`tradingStore.ts`)

**Pattern:** Zustand (Redux-like but simpler)

**State Shape:**
```typescript
{
  currentPrice: number,
  priceHistory: PriceData[],      // For chart
  positions: Position[],          // Active positions
  trades: Trade[],                // Trade history
  isExecutingTrade: boolean,      // UI loading state
}
```

**Why Zustand?**
- Minimal boilerplate
- TypeScript friendly
- No providers needed
- Works with server components

### 4. UI Components

#### TradingGrid (`TradingGrid.tsx`)

**Generates Grid Dynamically:**
```typescript
const gridSquares = useMemo(() => {
  const squares = [];
  for (let i = 1; i <= GRID_SIZE; i++) {
    // Above price (LONG)
    squares.push({
      price: currentPrice + GRID_INCREMENT * i,
      direction: 'long',
    });
    
    // Below price (SHORT)
    squares.push({
      price: currentPrice - GRID_INCREMENT * i,
      direction: 'short',
    });
  }
  return squares.sort((a, b) => b.price - a.price);
}, [currentPrice]);
```

#### PriceChart (`PriceChart.tsx`)

**Canvas-based for Performance:**
- HTML5 Canvas > SVG for real-time data
- Renders 200 data points
- Auto-scales Y-axis
- Shows current price line

**Drawing Logic:**
```typescript
priceHistory.forEach((data, index) => {
  const x = (index / totalPoints) * width;
  const y = normalizePrice(data.price, minPrice, maxPrice, height);
  ctx.lineTo(x, y);
});
```

## Data Flow

### User Taps Grid Square

```
┌──────────────────────────────────────────────────────┐
│ 1. User taps square at $105 (current price = $100)  │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ 2. handleGridTap() called with:                       │
│    - targetPrice: 105                                  │
│    - direction: 'long'                                 │
│    - betAmount: 10                                     │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ 3. driftService.executeTapTrade()                     │
│    - Opens 50x leveraged LONG position                │
│    - Sets take-profit at $105                         │
│    - Sets stop-loss at $98 (2% below entry)           │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ 4. Transaction sent to Solana                         │
│    - User signs with wallet                            │
│    - 3 instructions bundled atomically                 │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ 5. Position added to UI                               │
│    - Shows as "ACTIVE"                                 │
│    - Displays entry → target                           │
└────────────────────────────────────────────────────────┘
```

### Position Resolution (Automatic)

Drift Protocol monitors trigger orders automatically:

```
Price reaches $105 (target)
        │
        ▼
Drift executes take-profit order
        │
        ▼
Position closed
        │
        ▼
User wins $10 (simplified math)
```

**OR**

```
Price drops to $98 (stop-loss)
        │
        ▼
Drift executes stop-loss order
        │
        ▼
Position closed
        │
        ▼
User loses $10
```

## Transaction Structure

### Typical Transaction Breakdown

```solana
Transaction {
  signatures: [
    user_signature,
  ],
  instructions: [
    // Instruction 1: Open Position
    {
      program: Drift_Program,
      accounts: [user_account, market_account, ...],
      data: [OPEN_POSITION, LONG, 5_SOL, ...]
    },
    
    // Instruction 2: Place Take-Profit
    {
      program: Drift_Program,
      accounts: [user_account, market_account, ...],
      data: [PLACE_ORDER, TRIGGER, 105_USD, ...]
    },
    
    // Instruction 3: Place Stop-Loss
    {
      program: Drift_Program,
      accounts: [user_account, market_account, ...],
      data: [PLACE_ORDER, TRIGGER, 98_USD, ...]
    }
  ]
}
```

**Gas Cost:** ~0.00015 SOL (~$0.02 at $130/SOL)

## Security Model

### User Security
- **Self-Custodial**: User controls private keys
- **No Deposits**: Margin comes from user's wallet balance
- **Transparent**: All transactions visible on-chain

### Protocol Security
- **Drift is Audited**: Multiple security audits
- **No Smart Contract Risk for Us**: We don't deploy contracts
- **Stop-Losses Prevent Liquidation**: 2% buffer protects user

### Risk Vectors

| Risk | Mitigation |
|------|------------|
| Price slippage | Use market orders, deep liquidity |
| Failed transactions | Atomic bundling, retry logic |
| RPC downtime | Multiple RPC fallbacks |
| Wallet compromise | User responsibility, hardware wallet support |

## Performance Optimizations

### 1. Price Feed Caching
```typescript
// Cache last 200 price points
priceHistory: [...state.priceHistory.slice(-200), newData]
```

### 2. Canvas Rendering
- Debounce chart redraws
- Use `requestAnimationFrame`
- Pre-calculate constants

### 3. State Updates
```typescript
// Batch state updates
set((state) => ({
  currentPrice: price,
  priceHistory: [...state.priceHistory, data],
}));
```

### 4. Transaction Batching
- All 3 orders in single transaction
- Reduces gas cost by ~60%

## Scalability Considerations

### Current Limitations
- Single market (SOL-PERP)
- One position at a time
- Polling for prices (not WebSocket)

### Production Scaling

**Phase 1: Multi-Market**
```typescript
const markets = ['SOL', 'BTC', 'ETH'];
markets.forEach(market => {
  pythService.subscribeToPriceUpdates(market, updatePrice);
});
```

**Phase 2: Position Monitoring**
```typescript
// WebSocket to Drift for position updates
driftClient.eventEmitter.on('orderFill', (event) => {
  updatePosition(event.orderId, 'filled');
});
```

**Phase 3: Horizontal Scaling**
- Separate price feed service
- Redis for shared state
- WebSocket server for real-time updates

## Testing Strategy

### Unit Tests
- `driftService.ts` - Mock Drift SDK
- `pythService.ts` - Mock price responses
- State management - Test reducers

### Integration Tests
- Devnet end-to-end flows
- Wallet connection
- Transaction signing

### Manual Testing Checklist
- [ ] Connect wallet (Phantom, Solflare, Backpack)
- [ ] Load price data
- [ ] Execute long trade
- [ ] Execute short trade
- [ ] Check position in Drift UI
- [ ] Verify trigger orders created
- [ ] Test on mobile

## Monitoring & Observability

### Key Metrics
1. **Transaction Success Rate**: % of trades executed successfully
2. **Price Feed Latency**: Time between Pyth update and UI update
3. **Wallet Connection Rate**: % of successful wallet connections
4. **Average Trade Size**: Monitor for abuse

### Logging
```typescript
console.log('📊 Trade Parameters:', {
  direction,
  currentPrice,
  targetPrice,
  leverage,
});

console.log('✅ Trade executed:', txSig);
console.error('❌ Trade failed:', error);
```

**Production:** Replace with proper logging service (Sentry, LogRocket)

## Future Architecture Improvements

### 1. Backend Service (Optional)
- Store trade history
- Calculate P&L
- Leaderboard data

### 2. WebSocket Price Feeds
```typescript
const ws = new WebSocket('wss://pyth.network/...');
ws.onmessage = (msg) => {
  const price = parsePriceUpdate(msg.data);
  updatePrice(price);
};
```

### 3. Position Monitoring Service
- Track open positions
- Send notifications when closed
- Calculate realized P&L

### 4. Multi-Position Support
```typescript
// Allow multiple concurrent positions
const maxPositions = 5;
if (activePositions.length < maxPositions) {
  executeTrade(...);
}
```

## Conclusion

Tap Trading demonstrates how to build a sophisticated trading UX by integrating with existing DeFi protocols. The key insight: **don't build a protocol, build an interface to a protocol**.

**Core Principles:**
1. Atomic operations (all or nothing)
2. User custody (non-custodial)
3. Protocol integration (don't reinvent)
4. Simple UX (hide complexity)

This architecture is production-ready for devnet and can scale to mainnet with proper RPC infrastructure and monitoring.

---

**Questions?** Review the code in `src/services/driftService.ts` for implementation details.
