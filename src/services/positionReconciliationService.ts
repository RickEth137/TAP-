// Position Reconciliation Service - Ensures Drift account matches app state
import DriftService from './driftService';
import { useTradingStore } from '@/store/tradingStore';

export interface ReconciliationResult {
  driftPositions: Array<{
    marketIndex: number;
    direction: 'long' | 'short';
    baseAssetAmount: string;
    quoteAssetAmount: string;
  }>;
  appPositions: Array<{
    id: string;
    marketIndex: number;
    direction: string;
    status: string;
    settledOnChain?: boolean;
  }>;
  orphanedDriftPositions: number;
  unsettledAppPositions: number;
  recommendations: string[];
}

export class PositionReconciliationService {
  /**
   * Reconcile Drift positions with app state
   * Identifies orphaned positions that need to be closed
   */
  static async reconcile(driftService: DriftService): Promise<ReconciliationResult> {
    console.log('🔍 Starting position reconciliation...');

    try {
      // Get Drift account positions
      const driftAccount = await driftService.getUserAccount();
      const driftPositions = driftAccount.perpPositions
        .filter((pos) => pos.baseAssetAmount.toString() !== '0')
        .map((pos) => ({
          marketIndex: pos.marketIndex,
          direction: pos.baseAssetAmount.gt(0) ? 'long' as const : 'short' as const,
          baseAssetAmount: pos.baseAssetAmount.toString(),
          quoteAssetAmount: pos.quoteAssetAmount.toString(),
        }));

      console.log(`📊 Drift positions: ${driftPositions.length}`);

      // Get app positions
      const appState = useTradingStore.getState();
      const appPositions = appState.positions.map((pos) => ({
        id: pos.id,
        marketIndex: pos.marketIndex,
        direction: pos.direction.toLowerCase(),
        status: pos.status,
        settledOnChain: pos.settledOnChain,
      }));

      console.log(`📱 App positions: ${appPositions.length}`);

      // Find orphaned Drift positions (exist on Drift but not tracked in app)
      const trackedMarkets = new Set(
        appPositions
          .filter((pos) => pos.status === 'active' || !pos.settledOnChain)
          .map((pos) => `${pos.marketIndex}-${pos.direction}`)
      );

      const orphanedDriftPositions = driftPositions.filter((driftPos) => {
        const key = `${driftPos.marketIndex}-${driftPos.direction}`;
        return !trackedMarkets.has(key);
      });

      console.log(`⚠️ Orphaned Drift positions: ${orphanedDriftPositions.length}`);

      // Find unsettled app positions (app says settled but might not be on Drift)
      const unsettledAppPositions = appPositions.filter(
        (pos) => (pos.status === 'won' || pos.status === 'lost') && !pos.settledOnChain
      );

      console.log(`📝 Unsettled app positions: ${unsettledAppPositions.length}`);

      // Generate recommendations
      const recommendations: string[] = [];

      if (orphanedDriftPositions.length > 0) {
        recommendations.push(
          `Close ${orphanedDriftPositions.length} orphaned positions on Drift account`
        );
        orphanedDriftPositions.forEach((pos) => {
          recommendations.push(
            `  - Market ${pos.marketIndex} ${pos.direction.toUpperCase()}: ${pos.baseAssetAmount}`
          );
        });
      }

      if (unsettledAppPositions.length > 0) {
        recommendations.push(
          `Retry settlement for ${unsettledAppPositions.length} app positions`
        );
      }

      if (recommendations.length === 0) {
        recommendations.push('✅ All positions are properly tracked and settled');
      }

      const result: ReconciliationResult = {
        driftPositions,
        appPositions,
        orphanedDriftPositions: orphanedDriftPositions.length,
        unsettledAppPositions: unsettledAppPositions.length,
        recommendations,
      };

      console.log('📋 Reconciliation complete:', result);

      return result;
    } catch (error) {
      console.error('❌ Reconciliation failed:', error);
      throw error;
    }
  }

  /**
   * Auto-close orphaned positions
   */
  static async closeOrphanedPositions(
    driftService: DriftService,
    orphanedPositions: ReconciliationResult['driftPositions']
  ): Promise<{ closed: number; failed: number; errors: string[] }> {
    let closed = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`🔧 Closing ${orphanedPositions.length} orphaned positions...`);

    for (const pos of orphanedPositions) {
      try {
        await driftService.closePosition(pos.marketIndex, pos.direction);
        closed++;
        console.log(`✅ Closed orphaned position: Market ${pos.marketIndex} ${pos.direction}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        failed++;
        const errorMsg = `Failed to close Market ${pos.marketIndex} ${pos.direction}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log(`🏁 Cleanup complete: ${closed} closed, ${failed} failed`);

    return { closed, failed, errors };
  }

  /**
   * Get recommended actions as user-friendly string
   */
  static formatRecommendations(result: ReconciliationResult): string {
    return result.recommendations.join('\n');
  }
}

export default PositionReconciliationService;
