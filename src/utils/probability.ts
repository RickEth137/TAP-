/**
 * Calculate recent price volatility for dynamic leverage adjustment
 */
export function computeRecentVolatility(prices: number[]): number {
  if (prices.length < 3) return 0.0035;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev <= 0) continue;
    returns.push((prices[i] - prev) / prev);
  }

  if (!returns.length) return 0.0035;

  const avgAbs = returns.reduce((sum, r) => sum + Math.abs(r), 0) / returns.length;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const lastMove = Math.abs(returns[returns.length - 1]);

  const blended = avgAbs * 4 + stdDev * 2 + lastMove * 3;
  return Math.max(Math.min(blended, 0.06), 0.002);
}

/**
 * Calculate leverage based on price distance and time
 * This matches real Drift Protocol options mechanics
 * 
 * How it works:
 * - Close bets (small % move) = LOW leverage (safer, smaller position)
 * - Far bets (large % move) = HIGH leverage (riskier, bigger position)
 * - Time factor adjusts for how long price has to move
 * 
 * @param currentPrice - Current market price
 * @param targetPrice - Target price user is betting on
 * @param secondsInFuture - How many seconds until expiry
 * @param recentVolatility - Recent price volatility (optional)
 * @returns Leverage multiplier (1x to 50x)
 */
export function calculateLeverage(
  currentPrice: number,
  targetPrice: number,
  secondsInFuture: number,
  recentVolatility: number = 0.0035
): number {
  if (currentPrice <= 0 || targetPrice <= 0) {
    return 5; // Minimum leverage
  }

  // Calculate % distance from current price
  const priceDistance = Math.abs(targetPrice - currentPrice) / currentPrice;
  
  // Time adjustment - longer time = slightly lower leverage (less risky)
  const timeFactor = Math.max(0.5, Math.min(1.2, 30 / secondsInFuture));
  
  // Volatility adjustment - higher volatility = lower leverage (risk management)
  const volatilityFactor = Math.max(0.7, Math.min(1.3, 0.005 / recentVolatility));
  
  // Base leverage calculation: further = higher leverage
  // Distance tiers optimized for ±1% visual range (0.002 to 0.01)
  let baseLeverage: number;
  
  if (priceDistance < 0.002) {
    // <0.2% away: 5-10x leverage (1 grid cell)
    baseLeverage = 5 + (priceDistance / 0.002) * 5;
  } else if (priceDistance < 0.005) {
    // 0.2-0.5%: 10-20x leverage (2-3 cells)
    baseLeverage = 10 + ((priceDistance - 0.002) / 0.003) * 10;
  } else if (priceDistance < 0.008) {
    // 0.5-0.8%: 20-35x leverage (3-4 cells)
    baseLeverage = 20 + ((priceDistance - 0.005) / 0.003) * 15;
  } else {
    // >0.8%: 35-50x leverage (4+ cells)
    baseLeverage = 35 + Math.min(15, (priceDistance - 0.008) * 300);
  }
  
  // Apply time and volatility adjustments
  const adjustedLeverage = baseLeverage * timeFactor * volatilityFactor;
  
  // Clamp to realistic Drift limits (5x minimum, 50x maximum)
  return Math.max(5, Math.min(50, Math.round(adjustedLeverage)));
}

/**
 * Calculate expected profit for a leveraged position
 * This is REAL options P&L math, not casino multipliers
 * 
 * @param betAmount - Collateral amount (e.g. $10)
 * @param leverage - Leverage multiplier (e.g. 50x)
 * @param priceChangePercent - How much price moved (e.g. 0.02 = 2%)
 * @returns Profit/loss in USD (can be negative)
 */
export function calculateOptionsProfit(
  betAmount: number,
  leverage: number,
  priceChangePercent: number
): number {
  // Position size = collateral × leverage
  const positionSize = betAmount * leverage;
  
  // Profit = position size × price change %
  // Example: $10 bet, 50x leverage, +2% move
  // = $500 position × 0.02 = $10 profit
  const profit = positionSize * priceChangePercent;
  
  return profit;
}

/**
 * Calculate expected profit if price reaches target
 * Used for displaying potential payout on grid
 */
export function calculateExpectedProfit(
  currentPrice: number,
  targetPrice: number,
  betAmount: number,
  leverage: number
): number {
  const priceChangePercent = (targetPrice - currentPrice) / currentPrice;
  return calculateOptionsProfit(betAmount, leverage, Math.abs(priceChangePercent));
}
