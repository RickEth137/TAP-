# 🚀 Quick Start Guide - Tap Trading

## Prerequisites

- Node.js 18+ installed
- A Solana wallet (Phantom, Solflare, or Backpack)
- Some SOL for gas fees (0.01 SOL is enough for testing)

## Step 1: Installation

```powershell
# Navigate to project directory
cd "C:\Users\PC\OneDrive\Desktop\TAP"

# Install dependencies
npm install
```

## Step 2: Configure Environment

```powershell
# Copy the example environment file
Copy-Item .env.local.example .env.local

# Edit .env.local with your preferred RPC
# For production, use a dedicated RPC provider (QuickNode, Helius, etc.)
```

**Recommended RPC Providers:**

| Provider | Free Tier | Best For |
|----------|-----------|----------|
| [QuickNode](https://www.quicknode.com/) | Yes | General use |
| [Helius](https://www.helius.dev/) | Yes | DeFi apps |
| [Triton](https://triton.one/) | Paid | High performance |

## Step 3: Run Development Server

```powershell
npm run dev
```

Open http://localhost:3000 in your browser.

## Step 4: Connect Wallet & Test

1. Click "Select Wallet" in the top right
2. Choose your wallet (Phantom recommended)
3. Approve the connection
4. Wait for price data to load
5. Tap a green square (above price) or red square (below price)
6. Confirm the transaction in your wallet

## 🧪 Testing on Devnet (Recommended First)

### Why Devnet?
- Free test SOL (no real money)
- Same functionality as mainnet
- Perfect for learning

### Setup Devnet

1. **Update `.env.local`:**
```env
NEXT_PUBLIC_SOLANA_ENV=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

2. **Update Drift Program ID** in `src/config/constants.ts`:
```typescript
// Change this line:
DRIFT_PROGRAM_ID: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',

// To devnet program ID (check Drift docs for current devnet address)
```

3. **Get Devnet SOL:**
   - Visit https://faucet.solana.com/
   - Paste your wallet address
   - Request 2 SOL

4. **Restart dev server:**
```powershell
npm run dev
```

## 📱 Mobile Testing

The app is mobile-first. To test on your phone:

1. **Find your local IP:**
```powershell
ipconfig
# Look for IPv4 Address (e.g., 192.168.1.100)
```

2. **Run dev server with host:**
```powershell
npm run dev -- -H 0.0.0.0
```

3. **Access on phone:**
   - Open browser on your phone
   - Go to `http://YOUR_IP:3000` (e.g., http://192.168.1.100:3000)
   - Ensure phone and PC are on same WiFi network

## 🔧 Configuration Options

### Trading Parameters

Edit `src/config/constants.ts`:

```typescript
export const TRADING_CONFIG = {
  DEFAULT_BET_AMOUNT: 10,      // Change bet size (USD)
  MAX_LEVERAGE: 50,             // Adjust leverage (be careful!)
  GRID_INCREMENT: 5,            // Price step per square (USD)
  GRID_SIZE: 8,                 // Number of squares
  STOP_LOSS_PERCENTAGE: 0.02,  // 2% stop-loss
};
```

### Add More Markets

In `src/config/constants.ts`, add to `MARKETS`:

```typescript
export const MARKETS = {
  SOL: { /* ... */ },
  BTC: {
    name: 'BTC-PERP',
    marketIndex: 1, // Get from Drift docs
    symbol: 'BTC',
    decimals: 9,
    pythPriceId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  // Add more...
};
```

## ⚠️ Common Issues

### Issue: "Cannot connect to wallet"
**Solution:** 
- Make sure wallet extension is installed
- Refresh the page
- Check if wallet is set to correct network (mainnet/devnet)

### Issue: "Transaction failed"
**Solution:**
- Ensure you have SOL for gas fees
- Check RPC is responding (try another RPC)
- Verify you're on correct network (mainnet vs devnet)

### Issue: "Price not loading"
**Solution:**
- Check RPC URL in `.env.local`
- Verify Pyth Network is accessible
- Check browser console for errors

### Issue: TypeScript errors
**Solution:**
```powershell
# Dependencies might not be installed yet - just run:
npm install
```

## 🎯 Understanding the Code

### When User Taps a Square

1. **`src/app/page.tsx`** - `handleGridTap()` is called
2. **`src/services/driftService.ts`** - `executeTapTrade()` runs:
   - Opens leveraged position
   - Sets take-profit trigger order
   - Sets stop-loss trigger order
   - Bundles all into single transaction
3. **`src/store/tradingStore.ts`** - Updates UI state
4. **`src/components/PositionsList.tsx`** - Shows active position

### Real-time Price Updates

1. **`src/services/pythService.ts`** - Polls Pyth every 1 second
2. **`src/store/tradingStore.ts`** - Updates `currentPrice` and `priceHistory`
3. **`src/components/PriceChart.tsx`** - Redraws canvas chart
4. **`src/components/TradingGrid.tsx`** - Recalculates grid squares

## 🚢 Deploying to Production

### Vercel (Easiest)

```powershell
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, then add environment variables in dashboard
```

### Environment Variables for Production

In your hosting dashboard, add:
```
NEXT_PUBLIC_SOLANA_ENV=mainnet-beta
NEXT_PUBLIC_RPC_URL=https://your-premium-rpc-url.com
```

## 📊 Monitoring

Once deployed, monitor:
- Transaction success rate
- RPC response times
- User wallet connections
- Failed trades (check browser console)

## 🆘 Need Help?

1. Check [Drift Protocol Docs](https://docs.drift.trade/)
2. Review [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
3. Open an issue in this repo

## 🎉 You're Ready!

Start tapping and trading! Remember:
- Start on devnet for testing
- Use small amounts initially
- Trading derivatives is risky

Happy trading! 🚀
