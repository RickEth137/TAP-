# Production Deployment Checklist

## ✅ Pre-Deployment

### Environment Configuration
- [x] RPC endpoint configured (QuickNode)
- [x] Universal wallet private key in `.env.local`
- [x] Universal wallet address set
- [ ] Verify universal wallet has sufficient SOL for fees (min 0.1 SOL)
- [ ] Fund universal wallet with USDC buffer (recommended $1,000)

### Code Verification
- [x] No TypeScript errors
- [x] Settlement system implemented
- [x] Deposit verification active
- [x] Withdrawal execution working
- [x] Position reconciliation on startup

### Testing Required
- [ ] Test deposit flow (small amount)
- [ ] Verify on-chain deposit verification works
- [ ] Place test bet and verify settlement
- [ ] Test withdrawal to personal wallet
- [ ] Confirm position reconciliation detects orphaned positions
- [ ] Test multiple users simultaneously

## 🚀 Deployment Steps

1. **Build Production Bundle**
```bash
npm run build
```

2. **Set Environment Variables** (on hosting platform)
```
NEXT_PUBLIC_RPC_URL=https://chaotic-flashy-water.solana-mainnet.quiknode.pro/...
NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS=AwKkSwLykXo1e8H4sA3ZZhHXWGH5w1Jkt5eVTt7rresB
NEXT_PUBLIC_UNIVERSAL_WALLET_PRIVATE_KEY=[157,154,8,48,...]
```

3. **Deploy to Vercel/Netlify**
```bash
vercel deploy --prod
# or
netlify deploy --prod
```

4. **Post-Deployment Verification**
- [ ] Visit live URL
- [ ] Connect wallet
- [ ] Check console logs for "Drift account ready"
- [ ] Verify reconciliation runs on load
- [ ] Test small deposit ($1)
- [ ] Place test bet ($1)
- [ ] Wait for settlement
- [ ] Test withdrawal ($1)

## 🔍 Monitoring Setup

### Daily Checks
- Universal wallet balance (should match sum of user balances)
- Settlement success rate (check browser console logs)
- Number of active positions on Drift
- Orphaned position count from reconciliation

### Alerts to Set Up
1. **Low SOL Balance**: Universal wallet < 0.05 SOL
2. **Settlement Failures**: > 5% positions failing to settle
3. **Orphaned Positions**: > 3 orphaned positions detected
4. **Large Withdrawals**: Withdrawals > $1,000
5. **Drift Account Health**: Free collateral < 20%

## 🐛 Known Issues to Watch

### High Priority
- **localStorage limitations**: Users can manipulate balances locally
  - Mitigation: Add server-side validation in Phase 2
  
- **No rate limiting**: Users can spam bets/withdrawals
  - Mitigation: Add cooldowns or move to backend

- **Settlement delays**: Under high load, RPC might rate limit
  - Mitigation: Increase delays between settlements (currently 500ms)

### Medium Priority
- **No admin dashboard**: Manual reconciliation needed
  - TODO: Build admin UI for approvals

- **No transaction fee recovery**: App pays all Solana fees
  - TODO: Add 0.01 SOL fee per withdrawal

## 📊 Performance Benchmarks

### Expected Performance
- Deposit verification: 2-5 seconds
- Bet placement: 1-3 seconds
- Position settlement: 1-2 seconds after expiry
- Withdrawal: 3-5 seconds

### RPC Rate Limits
- QuickNode: ~10 requests/second
- Settlement batch processing: Max 2 positions/second (500ms delay)

## 🔐 Security Notes

### What's Protected
✅ Deposits verified on-chain (can't fake)
✅ Withdrawals require actual USDC transfer
✅ Position settlement tracked per user
✅ Balance tied to wallet address

### What's NOT Protected
⚠️ localStorage can be edited (client-side only)
⚠️ No server-side balance checks
⚠️ No KYC/AML compliance
⚠️ Universal wallet private key in environment

### Phase 2 Security TODO
- [ ] Move to database (Supabase/PostgreSQL)
- [ ] Add server-side API for balance checks
- [ ] Implement KYC for withdrawals > $500
- [ ] Use hardware wallet for universal account
- [ ] Add multi-sig for large withdrawals
- [ ] Implement IP-based rate limiting

## 🆘 Emergency Procedures

### If Universal Wallet Compromised
1. Immediately rotate private key
2. Close all Drift positions
3. Update environment variables
4. Notify users of balance snapshot
5. Migrate to new wallet

### If Settlement System Fails
1. Check RPC endpoint status
2. Manually close positions via Drift UI
3. Update settlement logic if needed
4. Restart application

### If Orphaned Positions Accumulate
1. Run reconciliation service manually
2. Close positions via Drift UI if auto-close fails
3. Check settlement retry logic
4. Review error logs for patterns

## 📞 Support Contacts

- **RPC Issues**: QuickNode support
- **Drift Protocol**: Discord/Telegram
- **Solana Network**: Status page
- **Code Issues**: Check GitHub issues

## 🎯 Success Metrics

### Launch Day
- [ ] 0 critical errors
- [ ] 100% settlement success rate
- [ ] < 3 second average deposit verification
- [ ] 0 orphaned positions after reconciliation

### Week 1
- [ ] > 10 unique users
- [ ] > $100 total volume
- [ ] 0 withdrawal failures
- [ ] < 1% unsettled positions

### Month 1
- [ ] > 100 unique users
- [ ] > $10,000 total volume
- [ ] 99%+ settlement success rate
- [ ] < 0.5% orphaned positions

---

**Last Updated**: Deploy this checklist to production when all items are checked off.
