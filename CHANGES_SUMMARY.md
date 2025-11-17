# TAP Trading - Major Architecture Update Summary

**Date:** November 16, 2025

## Overview

Two critical architectural changes have been implemented:

1. **Terminology Change:** "Futures/Perpetuals" → "Options Trading"
2. **Account Model Change:** "Individual User Accounts" → "Universal Account"

---

## 1. Options vs Futures Terminology

### What Changed
All references to "futures", "perp", "perpetual" have been updated to "options".

### Files Modified
- ✅ `src/config/constants.ts` - Market names updated to `SOL-OPTIONS`, `BTC-OPTIONS`
- ✅ `src/utils/probability.ts` - Function renamed: `calculateFuturesProfit` → `calculateOptionsProfit`
- ✅ `src/app/layout.tsx` - Meta tags updated
- ✅ `src/app/page.tsx` - Comments updated
- ✅ `SYSTEM_OVERVIEW.md` - All documentation updated
- ✅ `ARCHITECTURE.md` - Core architecture docs updated

### Why This Matters
The product is about **options trading**, not futures/perpetuals. The terminology now correctly reflects the trading mechanism.

---

## 2. Universal Account Model

### What Changed

**BEFORE:**
- Each user needed their own Drift account
- Each user connected their own wallet
- Users signed transactions with their own keys
- Complex onboarding (wallet + Drift account setup)

**AFTER:**
- ONE universal Drift account for ALL users
- Users don't need Drift accounts or wallets to play
- Positions tracked separately by `userId` in app state
- Simplified onboarding (no wallet required)

### Architecture Diagram

```
OLD MODEL:
User 1 Wallet → User 1 Drift Account → Trade
User 2 Wallet → User 2 Drift Account → Trade
User 3 Wallet → User 3 Drift Account → Trade

NEW MODEL:
User 1 (no wallet) ─┐
User 2 (no wallet) ─┼→ Universal Drift Account → All Trades
User 3 (no wallet) ─┘
```

### Files Modified

#### Core Service Layer
- ✅ **`src/services/driftService.ts`**
  - Removed `wallet` parameter from `initializeClient()`
  - Added `UniversalWallet` class implementation
  - Updated `executeTapTrade()` to accept `userId` parameter
  - Deprecated user-specific account functions
  - Added warnings about shared account usage

#### Configuration
- ✅ **`src/config/constants.ts`**
  - Added `UNIVERSAL_ACCOUNT_PRIVATE_KEY` to `DRIFT_CONFIG`
  
- ✅ **`.env.example`** (NEW)
  - Environment variable template for universal account key

#### State Management
- ✅ **`src/store/tradingStore.ts`**
  - Added `userId?: string` field to `Position` interface
  - Added `currentUserId?: string` to state
  - Added `setCurrentUserId()` function
  - Added `getPositionsForUser()` helper function
  - Updated reset to include currentUserId

#### UI Components
- ✅ **`src/components/WalletContextProvider.tsx`**
  - Changed `autoConnect` from `true` to `false`
  - Added extensive comments explaining optional wallet usage
  - Wallets now only for deposits/withdrawals, not trading

#### Documentation
- ✅ **`SYSTEM_OVERVIEW.md`**
  - Updated setup instructions (no wallet needed)
  - Updated backend description
  - Updated all futures → options references

- ✅ **`ARCHITECTURE.md`**
  - Added "Universal Account Model" section
  - Updated system diagrams
  - Explained isolation strategy

- ✅ **`UNIVERSAL_ACCOUNT_SETUP.md`** (NEW)
  - Complete guide for setting up universal account
  - Security considerations
  - Monitoring strategies
  - Production deployment guide

---

## Key Implementation Details

### Position Tracking

Each position now includes a `userId` field to prevent mixing users' bets:

```typescript
interface Position {
  id: string;
  userId?: string;  // ← NEW: Critical for user separation
  marketIndex: number;
  direction: 'LONG' | 'SHORT';
  // ... other fields
}
```

### User Isolation

```typescript
// Filter positions for specific user
const userPositions = useTradingStore.getState()
  .getPositionsForUser(userId);

// In components
const myPositions = positions.filter(p => p.userId === currentUserId);
```

### Security Model

**CRITICAL SECURITY REQUIREMENTS:**

1. **Private Key Storage**
   ```bash
   # .env.local (NEVER commit!)
   DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY=[1,2,3,...]
   ```

2. **Backend-Only Access**
   - Universal account key should NEVER be exposed to frontend
   - Implement API routes for trade execution
   - Add authentication and rate limiting

3. **User Balance Tracking**
   - Track each user's balance separately in database
   - Verify user has sufficient balance before placing trades
   - Reconcile balances when positions close

### Example Trade Flow

```typescript
// Frontend calls backend API
const response = await fetch('/api/place-trade', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    direction: 'long',
    targetPrice: 142.50,
    betAmount: 10,
    leverage: 35
  })
});

// Backend executes trade using universal account
// pages/api/place-trade.ts
const driftService = new DriftService();
await driftService.initializeClient(); // Uses universal key

const result = await driftService.executeTapTrade(
  direction,
  targetPrice,
  betAmount,
  leverage,
  MARKETS.SOL,
  userId  // ← Tagged to this user
);

// Save position to database with userId
await db.positions.create({
  ...result,
  userId: 'user123',
  status: 'active'
});
```

---

## Migration Checklist

For developers implementing these changes:

### Immediate Actions
- [ ] Generate universal Drift account keypair
- [ ] Fund account with SOL (gas) and USDC (trading)
- [ ] Initialize Drift account for universal keypair
- [ ] Add `DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY` to `.env.local`
- [ ] Test initialization with `driftService.initializeClient()`

### Backend Implementation
- [ ] Create API route for placing trades
- [ ] Add authentication middleware
- [ ] Implement rate limiting (prevent abuse)
- [ ] Add user balance tracking (database)
- [ ] Implement balance deduction/credit on trades

### State Management Updates
- [ ] Add user authentication/session management
- [ ] Store `currentUserId` in trading store
- [ ] Filter positions by userId in UI components
- [ ] Update BettingPanel to show only user's positions

### Security Hardening
- [ ] Move universal account key to secure backend
- [ ] Implement user authentication
- [ ] Add audit logging for all trades
- [ ] Set up monitoring for unusual activity
- [ ] Create alerts for low balance

### Testing
- [ ] Test multiple users placing trades simultaneously
- [ ] Verify position isolation between users
- [ ] Test balance tracking and reconciliation
- [ ] Test rate limiting and abuse prevention

---

## Benefits of Universal Account Model

### For Users
✅ **No wallet required** - Can start playing immediately
✅ **No Drift account setup** - No complex onboarding
✅ **Lower gas costs** - Transactions batched efficiently
✅ **Faster onboarding** - Just sign up and play

### For Developers
✅ **Simplified architecture** - One account to manage
✅ **Better UX control** - Handle transactions server-side
✅ **Easier debugging** - All trades in one place
✅ **Cost efficiency** - Share gas costs across users

### For Business
✅ **Lower barrier to entry** - More users can join
✅ **Better conversion rates** - No wallet friction
✅ **Controlled environment** - Manage risk centrally
✅ **Analytics** - Track all trades in one account

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Private key compromise | **CRITICAL** - All funds stolen | Secure storage, monitoring, insurance |
| User balance mixing | High - Users see wrong positions | Strict userId filtering, testing |
| Insufficient collateral | Medium - Trades fail | Balance monitoring, auto-top-up |
| Rate limiting bypass | Medium - Abuse/spam | Authentication, IP limits, CAPTCHA |
| Database desync | Medium - Wrong P&L | Regular reconciliation, audit logs |

---

## Next Steps

### Phase 1: Backend API (CRITICAL)
Move universal account to backend API to prevent key exposure:

```typescript
// pages/api/trades/place.ts
export default async function handler(req, res) {
  // Authenticate user
  const userId = await authenticateUser(req);
  
  // Verify balance
  const userBalance = await getUserBalance(userId);
  if (userBalance < req.body.betAmount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  
  // Place trade using universal account
  const driftService = new DriftService();
  await driftService.initializeClient();
  
  const result = await driftService.executeTapTrade(
    req.body.direction,
    req.body.targetPrice,
    req.body.betAmount,
    req.body.leverage,
    MARKETS.SOL,
    userId
  );
  
  // Deduct from user balance
  await deductBalance(userId, req.body.betAmount);
  
  return res.json(result);
}
```

### Phase 2: Database Integration
Store user data persistently:

```sql
-- Users table
CREATE TABLE users (
  id VARCHAR PRIMARY KEY,
  balance DECIMAL,
  total_winnings DECIMAL,
  created_at TIMESTAMP
);

-- Positions table
CREATE TABLE positions (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),
  market_index INT,
  direction VARCHAR,
  entry_price DECIMAL,
  target_price DECIMAL,
  bet_amount DECIMAL,
  status VARCHAR,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP
);
```

### Phase 3: Monitoring & Alerts
Set up comprehensive monitoring:

- Real-time balance tracking
- Alert on low collateral
- Suspicious activity detection
- Daily reconciliation reports
- Gas usage tracking

---

## Questions?

- **Technical**: Review `src/services/driftService.ts`
- **Setup**: Read `UNIVERSAL_ACCOUNT_SETUP.md`
- **Architecture**: Read `ARCHITECTURE.md`
- **Security**: Contact security team

---

## Summary

✅ **All terminology updated** from futures/perp to options
✅ **Universal account model implemented** - one account for all users
✅ **Position tracking added** - userId field prevents mixing bets
✅ **Documentation updated** - complete setup guides created
✅ **Security considerations** - comprehensive warnings and best practices

**Status:** Architecture changes complete. Ready for backend API implementation and production security hardening.
