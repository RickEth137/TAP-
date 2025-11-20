import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { 
  DriftClient,
  Wallet,
  User,
  BulkAccountLoader,
  PositionDirection,
  OrderType,
  OrderTriggerCondition,
  convertToNumber,
  PRICE_PRECISION,
  BASE_PRECISION,
  BN,
  getMarketOrderParams,
  getTriggerMarketOrderParams,
} from '@drift-labs/sdk';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { DRIFT_CONFIG, TRADING_CONFIG, MarketConfig } from '@/config/constants';

/**
 * Universal Wallet Implementation
 * This wallet is used by ALL users - no individual user wallets needed
 */
class UniversalWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction(tx: any): Promise<any> {
    tx.partialSign(this.payer);
    return tx;
  }

  async signAllTransactions(txs: any[]): Promise<any[]> {
    return txs.map((tx) => {
      tx.partialSign(this.payer);
      return tx;
    });
  }

  async signVersionedTransaction(tx: any): Promise<any> {
    tx.sign([this.payer]);
    return tx;
  }

  async signAllVersionedTransactions(txs: any[]): Promise<any[]> {
    return txs.map((tx) => {
      tx.sign([this.payer]);
      return tx;
    });
  }
}

export class DriftService {
  private connection: Connection;
  private driftClient: DriftClient | null = null;
  private user: User | null = null;
  private bulkAccountLoader: BulkAccountLoader | null = null;
  private universalWallet: UniversalWallet | null = null;

  constructor(rpcUrl: string = DRIFT_CONFIG.RPC_URL) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Initialize Drift Client with UNIVERSAL account (not user wallet!)
   * This single account handles ALL user trades
   */
  async initializeClient(): Promise<void> {
    console.log('🔧 [DriftService] Starting initialization...');
    
    try {
      let wallet: Wallet;

      // Load universal account from environment
      if (DRIFT_CONFIG.UNIVERSAL_ACCOUNT_PRIVATE_KEY) {
        console.log('✅ Private key found - Full Access Mode');
        // Parse the private key (supports JSON array format)
        try {
          const privateKeyArray = JSON.parse(DRIFT_CONFIG.UNIVERSAL_ACCOUNT_PRIVATE_KEY);
          const keypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
          wallet = new UniversalWallet(keypair);
        } catch (error) {
          console.error('❌ Invalid DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY format');
          throw new Error('Invalid DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY format');
        }
      } else {
        console.log('⚠️ No private key found - Read-Only Mode');
        const pubKeyStr = process.env.NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS;
        if (!pubKeyStr) {
             throw new Error('Read-only mode requires NEXT_PUBLIC_UNIVERSAL_WALLET_ADDRESS');
        }
        const publicKey = new PublicKey(pubKeyStr);
        
        // Create a dummy wallet that throws on sign
        wallet = {
            publicKey,
            signTransaction: async () => { throw new Error('Read-only mode'); },
            signAllTransactions: async () => { throw new Error('Read-only mode'); },
            signVersionedTransaction: async () => { throw new Error('Read-only mode'); },
            signAllVersionedTransactions: async () => { throw new Error('Read-only mode'); },
            payer: undefined as any
        };
      }

      console.log('🌐 Creating connection to RPC:', this.connection.rpcEndpoint);
      
      this.universalWallet = wallet as any;
      console.log('✅ Universal wallet created');

      console.log('📦 Creating BulkAccountLoader...');
      this.bulkAccountLoader = new BulkAccountLoader(
        this.connection,
        'confirmed',
        1000
      );

      console.log('🎯 Creating DriftClient...');
      this.driftClient = new DriftClient({
        connection: this.connection,
        wallet: this.universalWallet!,
        programID: new PublicKey(DRIFT_CONFIG.DRIFT_PROGRAM_ID),
        accountSubscription: {
          type: 'polling',
          accountLoader: this.bulkAccountLoader,
        },
      });
      console.log('✅ DriftClient instance created');

      console.log('📡 Subscribing to Drift Protocol...');
      await this.driftClient.subscribe();
      console.log('✅ Successfully subscribed to Drift Protocol');
      
      console.log('✅ Universal Drift Account initialized');
      console.log('📍 Public Key:', this.universalWallet!.publicKey.toBase58());
      
    } catch (error: any) {
      console.error('❌ Failed to initialize Universal Drift Account');
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Full error:', error);
      
      if (error?.message?.includes('Account does not exist') || error?.message?.includes('account not found')) {
        console.error('');
        console.error('🚨 DRIFT ACCOUNT NOT INITIALIZED 🚨');
        console.error('Your wallet needs to be initialized on Drift Protocol first!');
        console.error('');
        console.error('📝 FIX:');
        console.error('1. Visit: https://app.drift.trade/');
        console.error('2. Import your universal wallet private key');
        console.error('3. Click "Initialize Account" (~0.035 SOL)');
        console.error('4. Wait for confirmation');
        console.error('5. Refresh this page');
        console.error('');
      }
      
      throw error;
    }
  }

  /**
   * Get current market price from Drift oracle
   */
  async getMarketPrice(marketIndex: number): Promise<number> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    const oraclePrice = this.driftClient.getOracleDataForPerpMarket(marketIndex);
    return convertToNumber(oraclePrice.price, PRICE_PRECISION);
  }

  /**
   * CORE FUNCTION: Execute a "tap trade" using the UNIVERSAL account
   * Opens a position on behalf of ANY user (tracked separately in app state)
   * 
   * IMPORTANT: The position is opened on the universal Drift account,
   * but we track which user it belongs to in our application state (userId)
   * 
   * Note: In Drift SDK v2, we place orders sequentially rather than bundling
   * The main market order opens the position, then trigger orders manage exits
   * 
   * @param direction - 'long' for above current price, 'short' for below
   * @param targetPrice - The price the user "tapped" (take-profit trigger)
   * @param betAmount - Amount in USD to risk
   * @param marketConfig - Market configuration
   * @param userId - Identifier for which user this trade belongs to (for tracking)
   * @returns Object with transaction signature and order IDs
   */
  async executeTapTrade(
    direction: 'long' | 'short',
    targetPrice: number,
    betAmount: number,
    leverage: number,
    marketConfig: MarketConfig,
    userId?: string // Optional user identifier for tracking
  ): Promise<{ txSignature: string; entryOrderId: number; takeProfitOrderId?: number; stopLossOrderId?: number }> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    try {
      // Get current market price
      const currentPrice = await this.getMarketPrice(marketConfig.marketIndex);
      
      // Calculate position size based on DYNAMIC leverage from game
      const notionalSize = betAmount * leverage;
      const baseAmount = notionalSize / currentPrice;
      const baseAmountBN = new BN(baseAmount * BASE_PRECISION.toNumber());

      // Calculate stop-loss price
      const stopLossPrice = direction === 'long'
        ? currentPrice * (1 - TRADING_CONFIG.STOP_LOSS_PERCENTAGE)
        : currentPrice * (1 + TRADING_CONFIG.STOP_LOSS_PERCENTAGE);

      console.log('📊 Trade Parameters:', {
        direction,
        currentPrice,
        targetPrice,
        stopLossPrice,
        betAmount,
        leverage: leverage,
        notionalSize: notionalSize,
        baseAmount: baseAmount.toFixed(4),
      });

      const positionDirection = direction === 'long' 
        ? PositionDirection.LONG 
        : PositionDirection.SHORT;

      // STEP 1: Open the position with a market order
      const marketOrderParams = getMarketOrderParams({
        marketIndex: marketConfig.marketIndex,
        direction: positionDirection,
        baseAssetAmount: baseAmountBN,
      });

      const txSig = await this.driftClient.placePerpOrder(marketOrderParams);
      console.log('✅ Position opened:', txSig);
      
      // Get the order ID from the user's orders
      const orders = await this.getUserOrders();
      const entryOrder = orders[orders.length - 1];
      const entryOrderId = entryOrder?.orderId || 0;

      // NO auto take-profit or stop-loss!
      // Game logic handles win/loss detection and manual settlement
      console.log('🎮 Position opened for TAP game - manual settlement only');
      console.log('   User ID:', userId || 'anonymous');
      console.log('   Leverage:', leverage + 'x');
      console.log('   Position size: $' + notionalSize.toFixed(2));
      console.log('   Target price: $' + targetPrice.toFixed(2));
      console.log('⚠️  Position on universal account - track user ownership in app state!');

      return { txSignature: txSig, entryOrderId, takeProfitOrderId: undefined, stopLossOrderId: undefined };
    } catch (error) {
      console.error('❌ Trade execution failed:', error);
      throw error;
    }
  }

  /**
   * Get all positions on the universal account
   * NOTE: This returns ALL positions for ALL users!
   * Filter by userId in your application state to separate users
   */
  async getUserPositions() {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    const user = this.driftClient.getUser();
    const positions = user.getActivePerpPositions();

    return positions.map((pos: any) => ({
      marketIndex: pos.marketIndex,
      direction: pos.baseAssetAmount.gt(new BN(0)) ? 'LONG' : 'SHORT',
      baseAssetAmount: convertToNumber(pos.baseAssetAmount, BASE_PRECISION),
      quoteAssetAmount: convertToNumber(pos.quoteAssetAmount, PRICE_PRECISION),
      entryPrice: convertToNumber(
        pos.quoteAssetAmount.abs().mul(PRICE_PRECISION).div(pos.baseAssetAmount.abs()), 
        PRICE_PRECISION
      ),
    }));
  }

  /**
   * Get all open orders on the universal account (including trigger orders)
   * NOTE: This returns ALL orders for ALL users!
   * Match orders to positions using order IDs in your application state
   */
  async getUserOrders() {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    const user = this.driftClient.getUser();
    return user.getOpenOrders();
  }

  /**
   * DEPRECATED: Not needed with universal account model
   * The universal account is initialized once in initializeClient()
   * Individual users don't need Drift accounts
   */
  async checkUserAccount(userPublicKey: PublicKey): Promise<boolean> {
    // Always return true since we use universal account
    return true;
  }

  /**
   * DEPRECATED: Not needed with universal account model
   * The universal account should be set up manually once by the admin
   * Individual users don't create their own Drift accounts
   */
  async initializeUserAccount(depositAmount: BN = new BN(0)): Promise<string> {
    throw new Error('Not supported: Use universal account instead. Individual users do not need Drift accounts.');
  }

  /**
   * Get universal account info including balance
   * NOTE: This is the TOTAL balance across ALL users
   */
  async getUserAccount() {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    try {
      // Ensure user is subscribed
      if (!this.user) {
        this.user = new User({
          driftClient: this.driftClient,
          userAccountPublicKey: await this.driftClient.getUserAccountPublicKey(),
        });
        await this.user.subscribe();
      }
      
      // Get collateral values (returns in quote precision 1e6)
      const totalCollateral = this.user.getTotalCollateral();
      const freeCollateral = this.user.getFreeCollateral();
      
      return {
        totalCollateral: totalCollateral.toNumber() / 1e6, // Convert to dollars
        freeCollateral: freeCollateral.toNumber() / 1e6,
      };
    } catch (error) {
      console.error('Failed to get user account:', error);
      return {
        totalCollateral: 0,
        freeCollateral: 0,
      };
    }
  }

  /**
   * Deposit USDC into universal Drift account
   * NOTE: This deposits into the shared account for ALL users
   * Use this to fund the universal account initially
   */
  async deposit(amount: number, tokenAccount?: PublicKey): Promise<string> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    try {
      const marketIndex = 0; // USDC
      const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
      if (!spotMarket) throw new Error('USDC market not found');
      
      const depositAmount = new BN(amount * 1e6); // Convert to USDC precision (1e6)
      
      // Get associated token account if not provided
      const userTokenAccount = tokenAccount || await getAssociatedTokenAddress(
        spotMarket.mint,
        this.driftClient.wallet.publicKey
      );
      
      const txSig = await this.driftClient.deposit(
        depositAmount,
        marketIndex,
        userTokenAccount
      );
      
      console.log('✅ Deposit successful:', txSig);
      return txSig;
    } catch (error) {
      console.error('❌ Deposit failed:', error);
      throw error;
    }
  }

  /**
   * Manually close a position (for game win/loss settlement)
   */
  async closePosition(
    marketIndex: number,
    positionDirection: 'long' | 'short'
  ): Promise<string> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    try {
      // Get current position size
      const positions = await this.getUserPositions();
      const position = positions.find(
        (p) => p.marketIndex === marketIndex && p.baseAssetAmount !== 0
      );

      if (!position) {
        throw new Error('No open position found to close');
      }

      const baseAmountBN = new BN(Math.abs(position.baseAssetAmount) * BASE_PRECISION.toNumber());

      // Close position with opposite direction
      const closeDirection = positionDirection === 'long' 
        ? PositionDirection.SHORT 
        : PositionDirection.LONG;

      const closeOrderParams = getMarketOrderParams({
        marketIndex,
        direction: closeDirection,
        baseAssetAmount: baseAmountBN,
        reduceOnly: true,
      });

      const txSig = await this.driftClient.placePerpOrder(closeOrderParams);
      console.log('✅ Position closed manually:', txSig);
      return txSig;
    } catch (error) {
      console.error('❌ Failed to close position:', error);
      throw error;
    }
  }

  /**
   * Withdraw USDC from universal Drift account
   * NOTE: Withdraws from the shared account
   * Use carefully - this affects ALL users' available funds
   */
  async withdraw(amount: number): Promise<string> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    try {
      const marketIndex = 0; // USDC
      const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
      if (!spotMarket) throw new Error('USDC market not found');
      
      const withdrawAmount = new BN(amount * 1e6); // Convert to USDC precision (1e6)
      
      // Get associated token account
      const userTokenAccount = await getAssociatedTokenAddress(
        spotMarket.mint,
        this.driftClient.wallet.publicKey
      );
      
      const txSig = await this.driftClient.withdraw(
        withdrawAmount,
        marketIndex,
        userTokenAccount
      );
      
      console.log('✅ Withdrawal successful:', txSig);
      return txSig;
    } catch (error) {
      console.error('❌ Withdrawal failed:', error);
      throw error;
    }
  }

  /**
   * Cancel an order by order ID
   */
  async cancelOrder(orderId: number): Promise<string> {
    if (!this.driftClient) throw new Error('Drift client not initialized');

    const txSig = await this.driftClient.cancelOrder(orderId);
    console.log('✅ Order cancelled:', txSig);
    return txSig;
  }

  /**
   * Cleanup and unsubscribe
   */
  async cleanup() {
    if (this.driftClient) {
      await this.driftClient.unsubscribe();
    }
  }
}

export default DriftService;
