# 🎯 User Balance & Wallet Integration System

## Architecture Overview

Your app now uses a **hybrid custodial model**:
- ✅ Users connect their Phantom/Solflare wallet (ID only)
- ✅ Users deposit USDC to YOUR universal wallet
- ✅ YOU place all trades from ONE Drift account
- ✅ User balances tracked by wallet address in localStorage

---

## How It Works

### 1. **User Connects Wallet** 
- Wallet address becomes their unique ID
- No signing transactions (just for identification)
- Balance loaded from localStorage

### 2. **User Deposits USDC**
- They send USDC to: `AwKkSwLykXo1e8H4sA3ZZhHXWGH5w1Jkt5eVTt7rresB`
- They enter amount + transaction signature
- You record it in localStorage
- Their app balance increases

### 3. **User Places Bet**
- Balance check: Do they have enough?
- Deduct from their app balance
- Place trade on YOUR Drift account
- Tag bet with their wallet address

### 4. **Bet Resolves (Win/Loss)**
- WIN: Credit balance (bet amount + profit)
- LOSS: Nothing (already deducted)
- All tracked by wallet address

---

## Code Components

### **Services**
- `userBalanceService.ts` - Tracks deposits, bets, wins/losses per wallet
- `driftService.ts` - Places trades on universal Drift account

### **Components**
- `DepositModal.tsx` - Shows deposit instructions & records deposits
- `Header.tsx` - Displays user balance (clickable to deposit)

### **Storage**
```typescript
localStorage: {
  tap_user_balances: {
    [walletAddress]: {
      balance: 100.50,
      totalDeposits: 200,
      totalBets: 99.50,
      deposits: [...],
      bets: [...]
    }
  }
}
```

---

## User Flow

1. **Connect Wallet** → Shows "$0.00" balance
2. **Click Balance** → Opens deposit modal
3. **Send USDC** → Copy universal wallet address
4. **Record Deposit** → Enter amount + tx signature
5. **Place Bets** → Tap grid squares
6. **Win/Lose** → Balance updates automatically

---

## Admin Tools

**Check all users:**
```javascript
import UserBalanceService from '@/services/userBalanceService';

// Get all users
const users = UserBalanceService.getAllUsers();
console.table(users);

// Total pooled balance
const total = UserBalanceService.getTotalPoolBalance();
console.log(`Total pool: $${total}`);
```

**Check specific user:**
```javascript
const balance = UserBalanceService.getUserBalance('WALLET_ADDRESS');
console.log(balance);
```

---

## Security Notes

⚠️ **Important Limitations:**
- All funds in ONE wallet (your universal account)
- If hacked, ALL users lose funds
- No regulatory compliance
- localStorage can be cleared/manipulated
- Users must trust YOU with their deposits

✅ **Good for:**
- Testing with YOUR money
- Small group of trusted friends
- Prototype/MVP

❌ **NOT good for:**
- Public launch
- Real business with strangers
- Large amounts of money

---

## Next Steps to Go Live

### **Required:**
1. ✅ Fund universal wallet with SOL (done: 0 SOL needed)
2. ✅ Add USDC to universal wallet
3. ✅ Deposit USDC into Drift
4. ✅ Test with small amounts first

### **Recommended for Production:**
- Move to database (replace localStorage)
- Add withdrawal system
- Implement KYC/compliance
- Add audit logging
- Consider moving to per-user wallets

---

## Testing Checklist

- [ ] Connect wallet
- [ ] Deposit modal shows up if balance = 0
- [ ] Record deposit increases balance
- [ ] Place bet deducts balance
- [ ] Win increases balance
- [ ] Loss doesn't change balance (already deducted)
- [ ] Balance persists after page refresh
- [ ] Multiple users tracked separately

---

## Quick Commands

**Check wallet status:**
```bash
node check-wallet.js
```

**Dev server:**
```bash
npm run dev
```

**View app:**
```
http://localhost:3000
```

---

## Environment Setup

Your `.env.local` is configured with:
- ✅ QuickNode RPC endpoint
- ✅ Universal wallet private key
- ✅ Mainnet configuration

**DO NOT commit `.env.local` to git!**

---

Ready to fund your wallet and start testing! 🚀
