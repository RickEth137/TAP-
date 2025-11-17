'use client';

import { FC, useEffect, useRef } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { calculateLeverage, computeRecentVolatility } from '@/utils/probability';

interface TradingGridProps {
  onGridTap: (targetPrice: number, expiryTime: number, multiplier: number, timeSlotSeconds: number) => void;
}

const TradingGrid: FC<TradingGridProps> = ({ onGridTap }) => {
  const { currentPrice, priceHistory } = useTradingStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle clicks on the future grid area
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !currentPrice || priceHistory.length < 2) return;

    const handleClick = (e: MouseEvent) => {
      const rect = overlay.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Future zone starts at 25% from left
      const presentX = rect.width * 0.25;
      const futureWidth = rect.width - presentX;
      if (x < presentX) return; // Click was in past zone

      // Calculate which cell was clicked
      const timeSlots = [10, 20, 30, 40, 50, 60];
      const cellWidth = futureWidth / timeSlots.length;
      const cellHeight = rect.height / 10;

      const colIndex = Math.floor((x - presentX) / cellWidth);
      const rowIndex = Math.floor(y / cellHeight);

      if (colIndex < 0 || colIndex >= timeSlots.length || rowIndex < 0 || rowIndex >= 10) return;

      // Calculate price and time for this cell (relative scale ±0.5%)
      const percentRange = 0.005;
      const percentStep = (percentRange * 2) / 10;
      const percentOffset = percentRange - (rowIndex * percentStep) - (percentStep / 2);
      const targetPrice = currentPrice * (1 + percentOffset);

      const seconds = timeSlots[colIndex];
      const expiryTime = Date.now() + seconds * 1000;

      // Calculate multiplier
      const recentPrices = priceHistory.slice(-60).map(d => d.price);
      const recentVolatility = computeRecentVolatility(recentPrices);
      const leverage = calculateLeverage(currentPrice, targetPrice, seconds, recentVolatility);

      console.log(`Clicked cell: $${targetPrice.toFixed(2)} @ +${seconds}s (${leverage}x)`);
      onGridTap(targetPrice, expiryTime, leverage, seconds);
    };

    overlay.addEventListener('click', handleClick);
    return () => overlay.removeEventListener('click', handleClick);
  }, [currentPrice, priceHistory, onGridTap]);

  return (
    <div 
      ref={overlayRef}
      className="absolute inset-0 z-10 cursor-crosshair"
    />
  );
};

export default TradingGrid;
