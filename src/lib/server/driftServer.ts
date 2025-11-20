import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, BN, BASE_PRECISION, PositionDirection, getMarketOrderParams } from '@drift-labs/sdk';
import { DRIFT_CONFIG, MARKETS, TRADING_CONFIG } from '@/config/constants';

// Server-side only wallet
class UniversalWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction(tx: any) { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs: any[]) { return txs.map(tx => { tx.partialSign(this.payer); return tx; }); }
  async signVersionedTransaction(tx: any) { tx.sign([this.payer]); return tx; }
  async signAllVersionedTransactions(txs: any[]) { return txs.map(tx => { tx.sign([this.payer]); return tx; }); }
}

export class DriftServer {
  private static instance: DriftServer;
  private driftClient: DriftClient | null = null;
  private connection: Connection;

  private constructor() {
    this.connection = new Connection(DRIFT_CONFIG.RPC_URL, 'confirmed');
  }

  static getInstance(): DriftServer {
    if (!DriftServer.instance) {
      DriftServer.instance = new DriftServer();
    }
    return DriftServer.instance;
  }

  async initialize() {
    if (this.driftClient) return;

    const privateKeyStr = process.env.DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY;
    if (!privateKeyStr) throw new Error('Server: DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY not set');

    const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKeyStr)));
    const wallet = new UniversalWallet(keypair);

    this.driftClient = new DriftClient({
      connection: this.connection,
      wallet: wallet,
      programID: new PublicKey(DRIFT_CONFIG.DRIFT_PROGRAM_ID),
      env: DRIFT_CONFIG.ENV as 'mainnet-beta' | 'devnet',
    });

    await this.driftClient.subscribe();
    console.log('✅ Server: DriftClient initialized');
  }

  async executeTrade(
    direction: 'long' | 'short',
    betAmount: number,
    leverage: number,
    marketIndex: number
  ) {
    await this.initialize();
    if (!this.driftClient) throw new Error('DriftClient failed to initialize');

    const currentPrice = this.driftClient.getOracleDataForPerpMarket(marketIndex).price.toNumber() / 1e6;
    const notionalSize = betAmount * leverage;
    const baseAmount = notionalSize / currentPrice;
    const baseAmountBN = new BN(baseAmount * BASE_PRECISION.toNumber());

    const positionDirection = direction === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

    const marketOrderParams = getMarketOrderParams({
      marketIndex,
      direction: positionDirection,
      baseAssetAmount: baseAmountBN,
    });

    const txSig = await this.driftClient.placePerpOrder(marketOrderParams);
    return { txSig, entryPrice: currentPrice };
  }

  async closePosition(marketIndex: number, direction: 'long' | 'short', amount?: number) {
    await this.initialize();
    if (!this.driftClient) throw new Error('DriftClient failed to initialize');

    const user = this.driftClient.getUser();
    const position = user.getPerpPosition(marketIndex);
    
    if (!position || position.baseAssetAmount.eq(new BN(0))) {
        return null; // No position
    }

    // Check direction match
    const currentDirection = position.baseAssetAmount.gt(new BN(0)) ? 'long' : 'short';
    if (currentDirection !== direction) return null; // Mismatch

    const closeDirection = direction === 'long' ? PositionDirection.SHORT : PositionDirection.LONG;
    
    // Calculate amount to close
    let baseAssetAmount = position.baseAssetAmount.abs();
    if (amount) {
        // Convert amount to BN with precision
        const amountBN = new BN(amount * BASE_PRECISION.toNumber());
        // Ensure we don't close more than we have
        if (amountBN.lt(baseAssetAmount)) {
            baseAssetAmount = amountBN;
        }
    }

    const ops = getMarketOrderParams({
        marketIndex,
        direction: closeDirection,
        baseAssetAmount: baseAssetAmount,
        reduceOnly: true
    });

    return await this.driftClient.placePerpOrder(ops);
  }
  
  async closePositionByNotional(marketIndex: number, direction: 'long' | 'short', notionalAmount: number) {
    await this.initialize();
    if (!this.driftClient) throw new Error('DriftClient failed to initialize');
    
    const price = this.driftClient.getOracleDataForPerpMarket(marketIndex).price.toNumber() / 1e6;
    const baseAmount = notionalAmount / price;
    
    return this.closePosition(marketIndex, direction, baseAmount);
  }
  
  async getBalance() {
      await this.initialize();
      if (!this.driftClient) throw new Error('DriftClient failed to initialize');
      return this.driftClient.getUser().getTotalCollateral().toNumber() / 1e6;
  }
}
