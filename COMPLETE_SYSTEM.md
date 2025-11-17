# TAP Trading - Complete Production System

## 🎯 Overview

TAP Trading is a real-money prediction market built on Solana with Drift Protocol integration. Users bet on SOL/USD price movements with leverage, using a hybrid custodial model for optimal UX and security.

## 🏗️ Architecture

### Hybrid Custodial Model
- **User Identity**: Users connect their Solana wallet (for ID only)
- **Deposits**: Users send USDC to universal wallet
- **Balance Tracking**: App tracks balances in localStorage by wallet address
- **Trading**: All trades executed from single universal Drift account
- **Withdrawals**: USDC sent back to user's personal wallet

### Key Components

```
┌─────────────────┐
│  User Wallets   │ (Connect for ID, receive withdrawals)
└────────┬────────┘
         │
         ├─── Deposit USDC ──────┐
         │                        ▼
         │              ┌──────────────────┐
         │              │ Universal Wallet │ (Holds all user funds)
         │              └────────┬─────────┘
         │                       │
         │                       ├─── Funds ───┐
         │                       │              ▼
         │                       │    ┌─────────────────┐
         │                       │    │  Drift Account  │ (Single account for all trades)
         │                       │    └─────────────────┘
         │                       │
         │                       └─── Withdrawals ───┐
         │                                            ▼
         └─── Receive Withdrawals ───────────────────┘
                      
┌────────────────────────────────┐
│  localStorage Balance Tracking │ (By wallet address)
└────────────────────────────────┘
```

## 💰 Fund Flow

### Deposits
1. User connects wallet (e.g., `ABC...123`)
2. User sends USDC to universal wallet address
3. User submits transaction signature in app
4. **On-chain verification**: App verifies:
   - Transaction exists on Solana
   - Recipient is universal wallet
   - Amount matches
   - Token is USDC
5. Balance credited to user's localStorage record
6. Deposit marked as `verified: true`

### Betting
1. User selects bet amount (e.g., $10)
2. App checks user's balance in localStorage
3. If sufficient, balance deducted immediately
4. Position opened on universal Drift account
5. Position tagged with `userId` (wallet address)
6. On win/loss resolution:
   - **WIN**: Credits `betAmount + profit` to user balance
   - **LOSS**: Balance already deducted, no refund

### Withdrawals
1. User clicks "Withdraw" in header
2. Enters amount (validated against balance)
3. App transfers USDC from universal wallet to user's wallet
4. Balance deducted from localStorage
5. Withdrawal recorded with transaction signature

## 🔒 Critical Systems

### 1. Position Settlement
**Problem Solved**: Ghost positions accumulating on Drift account

**Solution**: Automatic settlement via `useEffect` in `page.tsx`
```typescript
// Watches positions array
// Filters: status='won'|'lost' AND !settledOnChain AND attempts<3
// Sequentially calls driftService.closePosition()
// Updates position with settlementTxSignature
// 500ms delays between settlements
// Max 3 retry attempts per position
```

**Why Critical**: Without settlement, positions accumulate funding fees and liquidation risk

### 2. Deposit Verification
**Service**: `depositVerificationService.ts`

**What it verifies**:
- Transaction exists on blockchain
- Recipient matches universal wallet
- Token is USDC (mint address check)
- Amount matches user's claim (±1% tolerance for fees)

**Flow**:
```typescript
User submits TX sig
  └─> App queries Solana RPC
      └─> Parses SPL token transfer
          └─> Validates all fields
              └─> Credits balance if valid
                  └─> Marks deposit.verified = true
```

### 3. Position Reconciliation
**Service**: `positionReconciliationService.ts`

**Runs on app startup**, checks:
- Drift positions vs app positions
- Identifies orphaned positions (on Drift but not tracked)
- Auto-closes orphaned positions
- Reports unsettled app positions

**Output**:
```
📊 Drift positions: 2
📱 App positions: 5
⚠️ Orphaned Drift positions: 1
📝 Unsettled app positions: 0
🔧 Closing 1 orphaned position...
✅ Cleaned up 1 orphaned positions
```

## 📁 File Structure

```
src/
├── services/
│   ├── driftService.ts                    # Drift Protocol integration
│   ├── pythWebSocketService.ts            # Real-time SOL/USD prices
│   ├── userBalanceService.ts              # localStorage balance tracking
│   ├── withdrawalService.ts               # USDC withdrawal execution
│   ├── depositVerificationService.ts      # On-chain deposit verification
│   └── positionReconciliationService.ts   # Position sync & cleanup
├── components/
│   ├── Header.tsx                         # Balance display + withdraw button
│   ├── DepositModal.tsx                   # Deposit UI with verification
│   ├── WithdrawalModal.tsx                # Withdrawal UI
│   ├── PriceChart.tsx                     # Canvas grid + betting interface
│   └── BettingPanel.tsx                   # Bet amount selector
├── store/
│   └── tradingStore.ts                    # Zustand state (positions, balance)
└── app/
    └── page.tsx                           # Main orchestration (settlement logic)
```

## 🔑 Environment Variables

```bash
# .env.local
NEXT_PUBLIC_RPC_URL=https://chaotic-flashy-water.solana-mainnet.quiknode.pro/...
NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS=AwKkSwLykXo1e8H4sA3ZZhHXWGH5w1Jkt5eVTt7rresB
NEXT_PUBLIC_UNIVERSAL_WALLET_PRIVATE_KEY=[157,154,8,48,...] # Byte array format
```

## 🚀 Setup Instructions

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment**
- Create `.env.local` with RPC URL and wallet credentials
- Ensure universal wallet has SOL for transaction fees

3. **Fund Universal Wallet**
- Send USDC to universal wallet address
- Minimum recommended: $1,000 for buffer

4. **Initialize Drift Account**
```bash
# Run check-wallet script
node check-wallet.js
```

5. **Start Development Server**
```bash
npm run dev
```

6. **Test Flow**
- Connect personal wallet
- Deposit $10 USDC to universal wallet
- Submit transaction signature
- Wait for verification
- Place bet on grid
- Watch automatic settlement

## 🎮 User Flow

### First Time User
1. Visit app → Connect wallet
2. See $0.00 balance → Deposit modal opens
3. Copy universal wallet address
4. Send USDC from Phantom/Solflare
5. Paste transaction signature
6. Wait 2-5s for on-chain verification ✅
7. Balance credited → Start betting!

### Returning User
1. Connect wallet → Balance loads from localStorage
2. Click grid cell to bet
3. Position opens on Drift
4. Win/loss auto-settles
5. Balance updates automatically
6. Click "Withdraw" when ready
7. USDC sent to personal wallet

## 📊 Data Models

### UserBalance (localStorage)
```typescript
{
  walletAddress: string;
  balance: number;
  deposits: [
    {
      txSignature: string;
      amount: number;
      timestamp: number;
      verified: boolean;      // ✅ On-chain verified
      verifiedAt?: number;
    }
  ];
  bets: [
    {
      positionId: string;
      amount: number;
      timestamp: number;
    }
  ];
  withdrawals: [
    {
      txSignature: string;
      amount: number;
      timestamp: number;
      status: 'pending' | 'completed';
    }
  ];
}
```

### Position (Zustand store)
```typescript
{
  id: string;
  userId: string;                    // Wallet address
  marketIndex: number;
  direction: 'long' | 'short';
  betAmount: number;
  leverage: number;
  targetPrice: number;
  currentPrice: number;
  expiryTime: number;
  status: 'active' | 'won' | 'lost';
  settledOnChain: boolean;           // ✅ Closed on Drift
  settlementTxSignature?: string;
  settlementAttempts: number;        // Max 3 retries
  txSignature?: string;
  profit?: number;
}
```

## 🛡️ Security Considerations

### What's Secure ✅
- On-chain deposit verification (can't fake deposits)
- Position settlement prevents ghost positions
- Withdrawal verification (SPL token transfers)
- Balance tracking tied to wallet address

### What's NOT Secure ⚠️
- localStorage can be manipulated locally
- No server-side balance validation
- No rate limiting on bets/withdrawals

### Production TODO 🔒
- [ ] Move balance tracking to database (PostgreSQL/Supabase)
- [ ] Add admin dashboard for manual approvals
- [ ] Implement KYC for large withdrawals
- [ ] Add rate limiting per wallet
- [ ] Set up monitoring/alerts for large positions
- [ ] Add transaction fees to cover Solana network fees
- [ ] Implement hot/cold wallet split for security

## 🐛 Known Issues & Fixes

| Issue | Status | Solution |
|-------|--------|----------|
| Ghost positions on Drift | ✅ FIXED | Auto-settlement in `page.tsx` useEffect |
| Unverified deposits | ✅ FIXED | On-chain verification in `DepositModal` |
| Orphaned positions accumulating | ✅ FIXED | Reconciliation service on startup |
| No withdrawal execution | ✅ FIXED | `WithdrawalService` with SPL transfers |
| Balance tracking in localStorage | ⚠️ MVP | TODO: Move to database |

## 📈 Monitoring

### Health Checks
- **Drift Account Balance**: Should match sum of user balances
- **Open Positions**: Should match active + unsettled count
- **Settlement Rate**: Should be near 100% (check `settlementAttempts`)

### Console Logs
```
✅ Drift account ready for trading
💰 User balance loaded: ABC...123 = $50.00
🔍 Verifying deposit on-chain...
✅ Deposit verified and credited: $10
🏁 Position settled: bet-1234567890 (TX: ABC...123)
📊 Drift positions: 0
✅ All positions properly tracked
```

## 🔧 Maintenance

### Daily
- Check reconciliation logs for orphaned positions
- Monitor settlement success rate
- Verify deposit verifications passing

### Weekly
- Review withdrawal patterns for abuse
- Check Drift account funding rate costs
- Audit balance totals vs actual USDC holdings

### Monthly
- Reconcile all user balances with blockchain
- Review settlement retry failures
- Optimize position sizing/leverage limits

## 📞 Support

### User Issues
- **Balance not showing**: Check wallet connection
- **Deposit not credited**: Verify TX signature format (88 chars)
- **Bet rejected**: Ensure sufficient balance + 10s minimum bet time
- **Withdrawal failed**: Check USDC balance in universal wallet

### Technical Issues
- **Settlement failing**: Check RPC rate limits, increase delays
- **Orphaned positions**: Run reconciliation manually
- **Verification slow**: Check QuickNode RPC performance

## 🎓 Additional Resources

- [Drift Protocol Docs](https://docs.drift.trade/)
- [Pyth Network](https://pyth.network/)
- [Solana SPL Token](https://spl.solana.com/token)
- [QuickNode Solana RPC](https://www.quicknode.com/)

---

**Built with**: Next.js 14, Drift Protocol SDK, Pyth Network, Solana Web3.js, Zustand, Tailwind CSS
