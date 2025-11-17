// Drift Protocol Configuration
export const DRIFT_CONFIG = {
  // Use mainnet-beta for production, devnet for testing
  ENV: process.env.NEXT_PUBLIC_SOLANA_ENV || 'mainnet-beta',
  // Using Alchemy free RPC - for production, get your own key from: https://www.alchemy.com/solana
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/demo',
  // Drift Program ID (mainnet)
  DRIFT_PROGRAM_ID: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
  // Universal Drift Account - ONE account for ALL users
  // SECURITY: Store this private key in environment variables in production!
  // This is the master account that places all trades for all users
  UNIVERSAL_ACCOUNT_PRIVATE_KEY: process.env.DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY || '',
};

// Trading Configuration
export const TRADING_CONFIG = {
  // Default bet amount in USD
  DEFAULT_BET_AMOUNT: 10,
  // Maximum leverage to use (e.g., 50x)
  MAX_LEVERAGE: 50,
  // Minimum price grid increment in USD
  GRID_INCREMENT: 5,
  // Number of grid squares above/below price
  GRID_SIZE: 8,
  // Stop loss percentage (how much price can move against position before loss)
  STOP_LOSS_PERCENTAGE: 0.02, // 2% move triggers stop loss
  // Minimum time for Drift options trades (Drift Protocol requirement)
  MIN_BET_TIME_SECONDS: 10, // Can't place bets <10s to expiry on Drift
};

// Markets Configuration (SOL-OPTIONS as default)
export const MARKETS = {
  SOL: {
    name: 'SOL-OPTIONS',
    marketIndex: 0,
    symbol: 'SOL',
    decimals: 9,
    pythPriceId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
  },
  // Add more markets as needed
  BTC: {
    name: 'BTC-OPTIONS',
    marketIndex: 1,
    symbol: 'BTC',
    decimals: 9,
    pythPriceId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
  },
};

export type MarketConfig = typeof MARKETS.SOL;
