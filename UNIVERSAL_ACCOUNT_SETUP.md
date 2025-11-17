# Universal Drift Account Setup Guide

## Overview

The TAP Trading game uses a **UNIVERSAL DRIFT ACCOUNT** model where:
- ONE Drift account handles ALL user trades
- Users don't need individual Drift accounts or wallets
- Positions are tracked separately in application state by `userId`
- This simplifies onboarding and reduces gas costs

## ⚠️ Security Considerations

**CRITICAL:** The universal account private key must be kept **EXTREMELY SECURE**:
- ✅ Store in environment variables (never commit to git)
- ✅ Use a dedicated server/backend for production
- ✅ Limit access to the private key
- ✅ Monitor the account for unusual activity
- ✅ Keep sufficient USDC balance for trades
- ❌ NEVER expose the private key to the frontend
- ❌ NEVER commit `.env` file with real keys

## Setup Steps

### 1. Generate a New Solana Keypair

**Option A: Using Solana CLI**
```bash
# Install Solana CLI if needed
# https://docs.solana.com/cli/install-solana-cli-tools

# Generate new keypair
solana-keygen new --outfile universal-drift-account.json

# This creates a JSON file like:
# [123,45,67,89,...]  (64 bytes)
```

**Option B: Using Node.js**
```javascript
const { Keypair } = require('@solana/web3.js');

// Generate keypair
const keypair = Keypair.generate();

// Get secret key as array
console.log(JSON.stringify(Array.from(keypair.secretKey)));
// Output: [123,45,67,89,...]

// Get public key
console.log(keypair.publicKey.toBase58());
// Output: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

### 2. Fund the Account

The universal account needs:

1. **SOL for gas fees**
   ```bash
   # Send ~0.5 SOL to cover transaction fees
   solana transfer <UNIVERSAL_ACCOUNT_PUBKEY> 0.5
   ```

2. **USDC for trading**
   ```bash
   # You'll need USDC to deposit into the Drift account
   # Amount depends on expected trading volume
   # Example: Start with $10,000 USDC for testing
   ```

### 3. Initialize Drift Account

The universal account needs a Drift account initialized. You can do this:

**Option A: Using Drift UI**
1. Import the universal keypair into a wallet (Phantom/Solflare)
2. Go to https://app.drift.trade/
3. Connect the wallet
4. Click "Initialize Account"
5. Deposit USDC collateral

**Option B: Using Code** (Advanced)
```typescript
import DriftService from './src/services/driftService';

const driftService = new DriftService();
await driftService.initializeClient();

// Check if account exists
const hasAccount = await driftService.checkUserAccount(
  driftService.universalWallet.publicKey
);

if (!hasAccount) {
  // Initialize with initial deposit (e.g., 10,000 USDC)
  const depositAmount = new BN(10_000 * 1e6); // USDC has 6 decimals
  await driftService.initializeUserAccount(depositAmount);
}
```

### 4. Configure Environment Variables

Create a `.env.local` file in your project root:

```bash
# .env.local (DO NOT COMMIT THIS FILE!)

# Solana RPC (get free key from Alchemy or Helius)
NEXT_PUBLIC_SOLANA_ENV=mainnet-beta
NEXT_PUBLIC_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY_HERE

# Universal Drift Account Private Key
# Format: JSON array [1,2,3,...]
DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY=[123,45,67,89,...]
```

**Add to `.gitignore`:**
```bash
# Environment files
.env
.env.local
.env.production.local
universal-drift-account.json
```

### 5. Verify Setup

Create a test script to verify everything works:

```typescript
// scripts/verify-universal-account.ts
import DriftService from '../src/services/driftService';

async function verify() {
  const driftService = new DriftService();
  
  try {
    // Initialize
    await driftService.initializeClient();
    console.log('✅ Universal account initialized');
    
    // Get account info
    const account = await driftService.getUserAccount();
    console.log('💰 Total Collateral:', account.totalCollateral);
    console.log('💰 Free Collateral:', account.freeCollateral);
    
    // Get current positions
    const positions = await driftService.getUserPositions();
    console.log('📊 Open Positions:', positions.length);
    
    console.log('\n✅ Setup verified successfully!');
  } catch (error) {
    console.error('❌ Setup verification failed:', error);
  }
}

verify();
```

Run it:
```bash
npx ts-node scripts/verify-universal-account.ts
```

## Production Deployment

### Backend Requirements

For production, the universal account should ONLY be accessible from your backend:

```
┌──────────┐     ┌──────────┐     ┌─────────────┐
│ Frontend │────▶│ Backend  │────▶│   Drift     │
│ (Public) │     │ (Private)│     │  Protocol   │
└──────────┘     └──────────┘     └─────────────┘
                      │
                  Private Key
                  Stored Here
```

**Example Backend Setup:**

```typescript
// pages/api/place-trade.ts (Next.js API route)
import DriftService from '@/services/driftService';

export default async function handler(req, res) {
  // Validate request
  const { userId, direction, targetPrice, betAmount, leverage } = req.body;
  
  // IMPORTANT: Add authentication/rate limiting here
  
  // Place trade using universal account
  const driftService = new DriftService();
  await driftService.initializeClient();
  
  const result = await driftService.executeTapTrade(
    direction,
    targetPrice,
    betAmount,
    leverage,
    MARKETS.SOL,
    userId  // Track which user this belongs to
  );
  
  res.json({ success: true, txSignature: result.txSignature });
}
```

### Security Checklist

- [ ] Private key stored in secure environment variables
- [ ] Backend API has authentication
- [ ] Rate limiting implemented (prevent abuse)
- [ ] Monitoring for unusual activity
- [ ] Alerts for low balance
- [ ] Regular balance reconciliation
- [ ] Audit logs for all trades
- [ ] Firewall rules restricting backend access

## Monitoring

### Key Metrics to Track

1. **Account Balance**
   - Alert if balance drops below threshold
   - Track daily P&L

2. **Trade Volume**
   - Monitor number of trades per user
   - Flag suspicious patterns

3. **Position Counts**
   - Total open positions across all users
   - Individual user position limits

4. **Gas Usage**
   - SOL balance for fees
   - Average cost per trade

### Example Monitoring Script

```typescript
// scripts/monitor-account.ts
import DriftService from '../src/services/driftService';

setInterval(async () => {
  const driftService = new DriftService();
  await driftService.initializeClient();
  
  const account = await driftService.getUserAccount();
  const positions = await driftService.getUserPositions();
  
  // Log metrics
  console.log({
    timestamp: new Date().toISOString(),
    freeCollateral: account.freeCollateral,
    openPositions: positions.length,
  });
  
  // Alert if low balance
  if (account.freeCollateral < 1000) {
    console.error('⚠️ LOW BALANCE ALERT!');
    // Send notification (email, Slack, etc.)
  }
}, 60000); // Every minute
```

## User Balance Management

Since all trades use the same Drift account, you need to track user balances separately:

```typescript
// User balance tracking (store in database)
interface UserBalance {
  userId: string;
  balance: number;           // Available funds
  lockedInPositions: number; // Currently in active trades
  totalWinnings: number;     // Lifetime P&L
  totalDeposits: number;
  totalWithdrawals: number;
}

// Before placing trade
function canUserTrade(userId: string, betAmount: number): boolean {
  const userBalance = getUserBalance(userId);
  return userBalance.balance >= betAmount;
}

// When position closes
function settlePosition(position: Position) {
  const user = getUserBalance(position.userId);
  
  if (position.status === 'won') {
    user.balance += position.betAmount + position.realizedPnL;
  } else {
    // Lost - bet amount already deducted
  }
  
  user.lockedInPositions -= position.betAmount;
  updateUserBalance(user);
}
```

## Troubleshooting

### "Drift client not initialized"
- Verify `DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY` is set in `.env.local`
- Check the format is a JSON array `[1,2,3,...]`

### "Insufficient collateral"
- Deposit more USDC into the Drift account
- Check if positions are using up available collateral

### "Invalid keypair"
- Verify the keypair format (must be 64 bytes)
- Try regenerating the keypair

### "Transaction failed"
- Check SOL balance for gas fees
- Verify Drift account is initialized
- Check RPC endpoint is working

## FAQ

**Q: What happens if the private key is compromised?**
A: All funds in the Drift account could be stolen. Immediately:
1. Withdraw all funds to a secure address
2. Generate new keypair
3. Update environment variables
4. Investigate the breach

**Q: How much USDC should the account have?**
A: Depends on trading volume. Formula:
```
Required USDC = (Average Bet × Max Positions × Expected Users) + Buffer
Example: ($10 × 5 × 100 users) + $5000 buffer = $10,000
```

**Q: Can users withdraw winnings?**
A: Yes, but you need to implement:
1. User balance tracking in database
2. Withdrawal API endpoint
3. Transfer USDC from universal account to user's wallet

**Q: What if two users bet at the same time?**
A: Both trades are placed on the same Drift account but tracked separately by `userId`. The Drift account can handle multiple positions simultaneously.

## Next Steps

1. ✅ Generate keypair
2. ✅ Fund with SOL and USDC
3. ✅ Initialize Drift account
4. ✅ Configure `.env.local`
5. ✅ Run verification script
6. ✅ Implement backend API
7. ✅ Set up monitoring
8. ✅ Add user balance tracking
9. ✅ Deploy securely

---

For questions or issues, review the code in `src/services/driftService.ts` and `src/config/constants.ts`.
