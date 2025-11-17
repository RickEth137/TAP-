// Quick script to check your universal wallet status
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const WALLET_ADDRESS = 'AwKkSwLykXo1e8H4sA3ZZhHXWGH5w1Jkt5eVTt7rresB';
const RPC_URL = 'https://chaotic-flashy-water.solana-mainnet.quiknode.pro/8fe0c6468d84a3e38720de679888ef2980eb2f22';

async function checkWallet() {
  console.log('\n🔍 Checking Universal Wallet Status...\n');
  console.log('Wallet:', WALLET_ADDRESS);
  console.log('RPC:', RPC_URL);
  console.log('─'.repeat(60));
  
  const connection = new Connection(RPC_URL, 'confirmed');
  const publicKey = new PublicKey(WALLET_ADDRESS);
  
  try {
    // Check SOL balance
    const solBalance = await connection.getBalance(publicKey);
    console.log(`\n💰 SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
    
    if (solBalance === 0) {
      console.log('   ⚠️  WARNING: No SOL for transaction fees!');
      console.log('   📝 Send at least 0.1 SOL to this wallet');
    } else if (solBalance < 0.05e9) {
      console.log('   ⚠️  Low SOL balance - may run out of transaction fees');
    } else {
      console.log('   ✅ Sufficient SOL for transaction fees');
    }
    
    // Check USDC balance (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v is USDC mint)
    const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    
    const usdcTokenAccount = await getAssociatedTokenAddress(USDC_MINT, publicKey);
    
    try {
      const tokenAccountInfo = await connection.getTokenAccountBalance(usdcTokenAccount);
      const usdcBalance = parseFloat(tokenAccountInfo.value.uiAmount || 0);
      console.log(`\n💵 USDC Balance: $${usdcBalance.toFixed(2)}`);
      
      if (usdcBalance === 0) {
        console.log('   ⚠️  WARNING: No USDC to trade with!');
        console.log('   📝 Send USDC to this wallet to start trading');
      } else if (usdcBalance < 100) {
        console.log('   ⚠️  Low USDC balance');
      } else {
        console.log('   ✅ Ready to trade!');
      }
    } catch (error) {
      console.log('\n💵 USDC Balance: $0.00');
      console.log('   ⚠️  No USDC token account found');
      console.log('   📝 Send USDC to this wallet (it will auto-create the account)');
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('1. Send SOL to wallet for transaction fees (min 0.1 SOL)');
    console.log('   Address:', WALLET_ADDRESS);
    console.log('2. Send USDC to wallet for trading (recommend $500+)');
    console.log('   Same address:', WALLET_ADDRESS);
    console.log('3. Go to https://app.drift.trade and deposit USDC into Drift');
    console.log('4. Connect your personal wallet to http://localhost:3000');
    console.log('5. Record your deposit in the app');
    console.log('6. Start trading!\n');
    
  } catch (error) {
    console.error('\n❌ Error checking wallet:', error.message);
  }
}

checkWallet();
