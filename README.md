# Tap Trading - Gamified Perpetuals Frontend

A mobile-first, gamified trading application for Solana perpetuals that abstracts complex derivatives trading into a simple tap-to-play interface.

![Tap Trading Preview](./preview.png)

## 🎯 What is Tap Trading?

Tap Trading transforms complex perpetuals trading into a simple game-like experience:

- **Tap Above**: Bet that price will go UP (opens a LONG position)
- **Tap Below**: Bet that price will go DOWN (opens a SHORT position)
- **Win or Lose**: Fixed $10 bets with instant outcomes

Behind the scenes, the app executes sophisticated trading strategies on Drift Protocol using high leverage, take-profit orders, and stop-losses.

## 🏗️ Architecture

### Not a Protocol - An Integrator

We **don't** build a new derivatives protocol. Instead, we integrate with [Drift Protocol](https://www.drift.trade/), a battle-tested perpetuals DEX on Solana with deep liquidity.

### How It Works

When a user taps a grid square:

1. **Open Position**: Opens a highly-leveraged perpetual position (50x leverage)
2. **Set Take-Profit**: Automatically places a trigger order at the tapped price (WIN condition)
3. **Set Stop-Loss**: Places a stop-loss order near entry price (LOSE condition)

All three orders are executed **atomically** in a single transaction bundle.

## 🛠️ Technical Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Blockchain**: Solana Web3.js
- **Trading Protocol**: Drift Protocol SDK (`@drift-labs/sdk`)
- **Price Feeds**: Pyth Network (`@pythnetwork/client`)
- **Wallet**: Solana Wallet Adapter

## 📦 Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your RPC URL (recommended: use QuickNode or Helius)
```

## 🚀 Development

```bash
# Run development server
npm run dev

# Open http://localhost:3000
```

## 🔑 Key Files

### Core Services

- **`src/services/driftService.ts`**: Drift Protocol integration
  - Opens positions with leverage
  - Sets take-profit and stop-loss orders atomically
  - Manages positions and orders

- **`src/services/pythService.ts`**: Real-time price feeds via Pyth Network

### Components

- **`src/components/TradingGrid.tsx`**: Tap-able grid squares
- **`src/components/PriceChart.tsx`**: Real-time price chart
- **`src/components/PositionsList.tsx`**: Active positions tracker
- **`src/components/Header.tsx`**: Wallet connection & stats

### State Management

- **`src/store/tradingStore.ts`**: Global trading state (Zustand)

### Configuration

- **`src/config/constants.ts`**: Trading parameters (leverage, grid size, markets)

## ⚙️ Configuration

Edit `src/config/constants.ts` to customize:

```typescript
export const TRADING_CONFIG = {
  DEFAULT_BET_AMOUNT: 10,      // Bet size in USD
  MAX_LEVERAGE: 50,             // Leverage multiplier
  GRID_INCREMENT: 5,            // Price increment per grid square
  GRID_SIZE: 8,                 // Number of squares above/below price
  STOP_LOSS_PERCENTAGE: 0.02,  // 2% stop-loss
};
```

## 🎮 How to Use

1. **Connect Wallet**: Click "Select Wallet" (Phantom, Solflare, or Backpack)
2. **Tap a Square**: 
   - Tap **above** current price to bet it goes UP
   - Tap **below** current price to bet it goes DOWN
3. **Wait for Outcome**: Your position automatically closes when price hits your target (WIN) or stop-loss (LOSE)

## 🔐 Security Considerations

- Users maintain full custody of their funds via self-custodial wallets
- No protocol risk - we integrate with audited Drift Protocol
- Stop-losses prevent liquidation risk
- Always test on devnet first

## 📡 RPC Requirements

For production, use a dedicated RPC provider:

- **[QuickNode](https://www.quicknode.com/)**: Reliable, paid plans
- **[Helius](https://www.helius.dev/)**: Excellent for NFT/DeFi apps
- **[Triton](https://triton.one/)**: High-performance RPC

The free public RPC (`https://api.mainnet-beta.solana.com`) has rate limits and may cause issues.

## 🧪 Testing

### Devnet Testing

1. Change `.env.local`:
   ```
   NEXT_PUBLIC_SOLANA_ENV=devnet
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   ```

2. Get devnet SOL: https://faucet.solana.com/

3. Update `src/config/constants.ts` to use Drift's devnet program ID

## 🚢 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```

### Other Platforms

Works on any platform supporting Next.js:
- Netlify
- Railway
- AWS Amplify
- Self-hosted

## 🔮 Future Improvements

### Immediate
- [ ] Real-time position monitoring via websocket
- [ ] Portfolio balance fetching from wallet
- [ ] Transaction history
- [ ] Multiple market support (BTC, ETH, etc.)

### Advanced
- [ ] Social features (leaderboard, sharing)
- [ ] Custom bet amounts
- [ ] Advanced order types (limit, trailing stop)
- [ ] Multi-position management
- [ ] Push notifications for position outcomes

## 📚 Resources

- [Drift Protocol Docs](https://docs.drift.trade/)
- [Drift SDK GitHub](https://github.com/drift-labs/protocol-v2)
- [Pyth Network](https://pyth.network/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)

## 🎯 Key Questions Answered

### Why Drift Protocol?

Drift offers:
- Deep liquidity (essential for instant execution)
- Mature SDK with trigger order support
- Audited contracts
- Active mainnet deployment

### Why Not Build Our Own Protocol?

Building a derivatives protocol requires:
- Liquidity (millions in TVL)
- Complex risk management
- Security audits ($$$$)
- Market making infrastructure

We achieve the same UX by integrating with Drift.

### Could This Use Futures Instead of Perpetuals?

**Yes!** Futures would actually be better for this use case:
- Fixed expiry = natural "game over" event
- No funding rates to worry about
- Cleaner P&L calculation

To switch to futures, modify `driftService.ts` to use Drift's futures markets instead of perpetuals.

## ⚠️ Disclaimer

This is experimental software. Use at your own risk. Trading derivatives involves substantial risk of loss. This application is for demonstration purposes and is not financial advice.

## 📄 License

MIT License - see LICENSE file for details

---

**Built for the Solana ecosystem** 🚀

Questions? Open an issue or reach out on Twitter.
