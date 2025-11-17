  'use client';

import { FC, useEffect, useRef, useState } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { calculateLeverage, computeRecentVolatility } from '@/utils/probability';
import Lottie from 'lottie-react';
import coinBustAnimation from '@/../../public/coin-bust.json';

const MIN_SECONDS_AHEAD = 5; // Drift can't realistically settle sub-5s trades
const MAX_SECONDS_AHEAD = 60;

interface PriceChartProps {
  onGridTap?: (
    targetPrice: number,
    expiryTime: number,
    leverage: number,
    timeAheadSeconds: number,
    gridColumn: number,
    gridRow: number // Lock bet to specific grid cell
  ) => void;
}

const PriceChart: FC<PriceChartProps> = ({ onGridTap }) => {
  const { priceHistory, currentPrice, positions } = useTradingStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollPositionRef = useRef(0); // Horizontal scroll (time)
  const verticalScrollRef = useRef(0); // Vertical scroll (price levels)
  const lastTimeRef = useRef(Date.now());
  const baselinePriceRef = useRef(0); // STABLE baseline for Y-axis
  const lastBaselineUpdateRef = useRef(0);
  const smoothedPriceRef = useRef(0); // Interpolated price for smooth animation
  const targetPriceRef = useRef(0); // Actual target price from data
  const [wonBetAnimations, setWonBetAnimations] = useState<Array<{
    id: string;
    x: number;
    y: number;
    profit: number;
    timestamp: number;
  }>>([]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Set canvas size
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      const gridCellWidth = 80; // Width of each grid cell
      const gridCellHeight = rect.height / 10; // 10 rows
      
      // GRID TARGET RANGE: ±1% WIDE for meaningful betting distances
      // Grid squares can be above/below visible Y-axis - that's OK!
      const percentRange = 0.01; // ±1% for grid targets (NOT visual range!)
      const percentStep = (percentRange * 2) / 10; // 0.2% per grid line

      // ============== SCROLLING LOGIC ==============
      const now = Date.now();
      const deltaTime = (now - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = now;

      const presentX = rect.width * 0.25; // NOW line position
      const futureWidth = rect.width - presentX;
      const timeRange = MAX_SECONDS_AHEAD - MIN_SECONDS_AHEAD;
      const pixelsPerSecond = futureWidth / timeRange; // seconds mapped to width excluding safety buffer
      const scrollSpeed = pixelsPerSecond;

      // Update scroll position (world moves right-to-left)
      scrollPositionRef.current += scrollSpeed * deltaTime;
      const scrollPosition = scrollPositionRef.current;
      const gridOffset = scrollPosition % gridCellWidth; // For drawing grid lines

      // ============== DRAW SCROLLING GRID ==============
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      
      // Vertical lines (scrolling)
      const numVerticalLines = Math.ceil(rect.width / gridCellWidth) + 2;
      for (let i = 0; i < numVerticalLines; i++) {
        const x = i * gridCellWidth - gridOffset;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }

      // Horizontal lines (static) with ACTUAL PRICE labels on the right
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';

      if (priceHistory.length < 2 || !currentPrice) {
        // Show loading state
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Loading price data...', rect.width / 2, rect.height / 2);
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(`Connecting to Pyth Network...`, rect.width / 2, rect.height / 2 + 30);
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // ** WORLD-SPACE COORDINATE SYSTEM **
      // Grid represents FIXED price levels in world space
      // Scrolling moves the viewport, NOT the grid
      
      // Initialize reference price (anchor point for world space)
      if (baselinePriceRef.current === 0 && currentPrice > 0) {
        baselinePriceRef.current = currentPrice;
      }
      
      // World space: each row represents a fixed percentage step
      // Baseline is the reference point (what price is at scroll position 0)
      const baseline = baselinePriceRef.current;
      const verticalScroll = verticalScrollRef.current;
      
      // Calculate price range for visible viewport
      // Each gridCellHeight pixels = percentStep price change
      const pricePerPixel = (baseline * percentStep) / gridCellHeight;
      
      // Center of viewport represents this price
      const viewportCenterPrice = baseline - (verticalScroll * pricePerPixel);
      
      // Visible range is ±5 rows from center (10 total rows)
      const visiblePriceRange = baseline * percentRange * 2; // ±1% = 2% total per 10 rows
      const minVisiblePrice = viewportCenterPrice - visiblePriceRange / 2;
      const maxVisiblePrice = viewportCenterPrice + visiblePriceRange / 2;
      
      // Convert price to screen Y coordinate
      const priceToY = (price: number) => {
        // How far is this price from viewport center?
        const priceOffset = price - viewportCenterPrice;
        // Convert to pixels (negative because Y increases downward)
        const pixelOffset = -(priceOffset / pricePerPixel);
        // Center of screen + offset
        return rect.height / 2 + pixelOffset;
      };
      
      // Draw price line at its absolute position
      const currentY = priceToY(currentPrice);

      // ** Draw grid lines with actual price labels **
      // Grid shows 10 rows, each representing a fixed price level
      const priceLabelX = rect.width - 16;
      
      for (let i = 0; i <= 10; i++) {
        const y = i * gridCellHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
        
        // Calculate price at this Y position
        const rowCenterY = y;
        // Convert Y back to price: inverse of priceToY
        const pixelOffsetFromCenter = rowCenterY - rect.height / 2;
        const priceOffsetFromCenter = -pixelOffsetFromCenter * pricePerPixel;
        const priceAtY = viewportCenterPrice + priceOffsetFromCenter;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`$${priceAtY.toFixed(2)}`, priceLabelX, y + 12);
      }

      // ============== FIXED PRICE LINE POSITION (25% from left) ==============

      // Draw "NOW" line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(presentX, 0);
      ctx.lineTo(presentX, rect.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // NOW label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('NOW', presentX + 8, 25);

      // ============== DRAW SCROLLING MULTIPLIERS (Future Zone) ==============
      // PREDICTION GAME: Grid shows future price zones with leverage multipliers
      // User predicts: "Price will be in THIS zone when timer expires"
      // Visual shows: What leverage you get for predicting each zone
      const columnsInView = Math.ceil(rect.width / gridCellWidth) + 2;
      const fadeWindow = 1.5;

      const leverageCalcPrices = priceHistory.slice(-120).map(d => d.price);
      const recentVolatility = computeRecentVolatility(leverageCalcPrices);

      const startColumn = Math.floor(scrollPosition / gridCellWidth);

      for (let i = 0; i < columnsInView; i++) {
        const colIndex = startColumn + i;

        // Use same coordinate system as grid lines so squares align perfectly
        const columnStartX = colIndex * gridCellWidth - scrollPosition;
        const centerX = columnStartX + gridCellWidth / 2;

        // Only draw future cells to the right of the NOW line
        if (centerX < presentX || centerX > rect.width) continue;

        const secondsAhead = MIN_SECONDS_AHEAD + (centerX - presentX) / pixelsPerSecond;
        if (secondsAhead <= MIN_SECONDS_AHEAD) continue;

        const fadeProgress = Math.max(0, secondsAhead - MIN_SECONDS_AHEAD);
        const opacity = fadeProgress < fadeWindow
          ? Math.min(1, 0.3 + (fadeProgress / fadeWindow) * 0.7)
          : 1;

        for (let row = 0; row < 10; row++) {
          // Calculate price at this row's Y position
          const y = (row + 0.5) * gridCellHeight;
          const pixelOffsetFromCenter = y - rect.height / 2;
          const priceOffsetFromCenter = -pixelOffsetFromCenter * pricePerPixel;
          const targetPrice = viewportCenterPrice + priceOffsetFromCenter;
          
          const leverage = calculateLeverage(currentPrice, targetPrice, secondsAhead, recentVolatility);

          // Check if there's an active bet at this cell position
          const activeBets = positions.filter(p => p.status === 'active');
          const betAtThisCell = activeBets.find(bet => {
            const timeRemaining = Math.max(0, (bet.expiryTime - now) / 1000);
            if (timeRemaining <= 0) return false;
            
            // Check if bet is at this column (exact match)
            const betColIndex = bet.gridColumn ?? 0;
            if (betColIndex !== colIndex) return false;
            
            // Check if bet's Y position is close to this row's Y position
            const betScreenY = priceToY(bet.targetPrice);
            const rowY = y;
            const isAtThisRow = Math.abs(betScreenY - rowY) < gridCellHeight / 2;
            
            return isAtThisRow;
          });

          ctx.save();
          ctx.globalAlpha = opacity;
          
          // Draw grid cell background (small centered square)
          const cellSize = 60; // Fixed size for visual consistency
          const cellX = centerX - cellSize / 2;
          const cellY = y - cellSize / 2;
          
          // If there's a bet, make it white/highlighted, otherwise normal
          if (betAtThisCell) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; // Bright white for bet
            ctx.shadowBlur = 25;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
          } else {
            ctx.fillStyle = leverage > 30 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)';
            // Draw glow for high leverage
            if (leverage >= 40) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.lineWidth = 2;
              ctx.shadowBlur = 25;
              ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
            }
          }
          
          ctx.beginPath();
          ctx.roundRect(cellX, cellY, cellSize, cellSize, 8);
          ctx.fill();
          if (!betAtThisCell && leverage >= 40) {
            ctx.stroke();
          }
          
          // Reset shadow and draw text
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = betAtThisCell ? '#000' : 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          if (betAtThisCell) {
            // Show bet amount and leverage
            const timeRemaining = Math.max(0, (betAtThisCell.expiryTime - now) / 1000);
            const fadeOpacity = timeRemaining < 3 ? timeRemaining / 3 : 1;
            ctx.globalAlpha = opacity * fadeOpacity;
            
            ctx.font = 'bold 14px monospace';
            ctx.fillText(`$${betAtThisCell.betAmount}`, centerX, y - 6);
            ctx.font = '11px monospace';
            ctx.fillText(`${Math.round(betAtThisCell.size / betAtThisCell.betAmount)}x`, centerX, y + 7);
          } else {
            // Show leverage multiplier
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`${leverage}x`, centerX, y - 5);
          }
          
          ctx.restore();
        }
      }

      // Draw animated time labels
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const timeLabels = Array.from(new Set([MIN_SECONDS_AHEAD, 10, 20, 30, 45, MAX_SECONDS_AHEAD]))
        .filter((seconds) => seconds >= MIN_SECONDS_AHEAD && seconds <= MAX_SECONDS_AHEAD)
        .sort((a, b) => a - b);

      timeLabels.forEach((seconds: number) => {
        const x = presentX + ((seconds - MIN_SECONDS_AHEAD) / timeRange) * futureWidth;
        if (x > presentX && x < rect.width) {
          ctx.fillText(`+${seconds}s`, x, 15);
        }
      });

      // ============== DRAW SMOOTH PRICE LINE ==============
      
      if (priceHistory.length > 1) {
        const gradient = ctx.createLinearGradient(0, 0, presentX, 0);
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
        gradient.addColorStop(0.7, 'rgba(236, 72, 153, 0.7)');
        gradient.addColorStop(1, '#ec4899');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(236, 72, 153, 0.5)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        // Take enough history to fill the past zone smoothly
        const pointsToShow = Math.min(priceHistory.length, 200);
        const historyToShow = priceHistory.slice(-pointsToShow);
        const xStep = presentX / pointsToShow;
        
        // Start from oldest point
        const firstY = priceToY(historyToShow[0].price);
        ctx.moveTo(0, firstY);
        
        // Draw smooth bezier curves through all points
        for (let i = 1; i < historyToShow.length; i++) {
          const x = i * xStep;
          const y = priceToY(historyToShow[i].price);
          
          // Get previous point
          const prevX = (i - 1) * xStep;
          const prevY = priceToY(historyToShow[i - 1].price);
          
          // Control point for smooth curve
          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          
          ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
        }
        
        // Connect last history point to current price at NOW line
        const lastIdx = historyToShow.length - 1;
        const lastX = lastIdx * xStep;
        const lastY = priceToY(historyToShow[lastIdx].price);
        
        // Draw straight line to current position
        ctx.lineTo(presentX, currentY);
        
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw current price HEAD (pulsing dot at NOW line)
      ctx.fillStyle = '#ec4899';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ec4899';
      ctx.beginPath();
      ctx.arc(presentX, currentY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner glow
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(presentX, currentY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw price label next to the head (show actual current price, not interpolated)
      ctx.fillStyle = '#ec4899';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${currentPrice.toFixed(2)}`, presentX + 15, currentY);

      // Draw horizontal line showing current price level across past zone
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(presentX, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Helper function to convert price to Y coordinate (needed for won bet positioning)
      const priceToYForOverlay = (price: number) => {
        const priceOffset = price - viewportCenterPrice;
        const pixelOffset = -(priceOffset / pricePerPixel);
        return rect.height / 2 + pixelOffset;
      };

      // Update won bet positions for overlay rendering
      const wonBets = positions.filter(p => p.status === 'won');
      const newAnimations = wonBets.map(bet => {
        const timeSinceWin = bet.resolvedAt ? (now - bet.resolvedAt) / 1000 : 0;
        if (timeSinceWin > 6) return null;

        const betColIndex = bet.gridColumn ?? 0;
        if (!bet.gridColumn) return null;
        
        const columnStartX = betColIndex * gridCellWidth - scrollPosition;
        const cellCenterX = columnStartX + gridCellWidth / 2;
        
        if (cellCenterX > rect.width) return null;

        const starY = priceToYForOverlay(bet.targetPrice);
        if (starY < 0 || starY > rect.height) return null;

        return {
          id: bet.id,
          x: cellCenterX,
          y: starY,
          profit: bet.realizedPnL || 0,
          timestamp: bet.resolvedAt || now
        };
      }).filter(Boolean) as Array<{id: string; x: number; y: number; profit: number; timestamp: number}>;

      // Update state if animations changed
      if (JSON.stringify(newAnimations.map(a => a.id)) !== JSON.stringify(wonBetAnimations.map(a => a.id))) {
        setWonBetAnimations(newAnimations);
      }

      // Continue animation
      animationFrameId = requestAnimationFrame(render);
    };

    // Start animation loop
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [priceHistory, currentPrice, positions]);

  // Handle vertical scrolling with mouse wheel
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Scroll vertically to access more price levels
      const scrollAmount = event.deltaY * 0.5; // Adjust sensitivity
      verticalScrollRef.current += scrollAmount;
      // No limit - infinite scrolling!
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle taps directly on the canvas so coordinates align with rendering math
  useEffect(() => {
    if (!onGridTap || !canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleClick = (event: MouseEvent) => {
      if (!currentPrice || currentPrice <= 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const presentX = rect.width * 0.25;
      const futureWidth = rect.width - presentX;
      const gridCellWidth = 80;
      const rowHeight = rect.height / 10;
      
      // Grid targets span ±1% (WIDE betting range)
      const percentRange = 0.01; // ±1% - MATCHES rendering
      const percentStep = (percentRange * 2) / 10;
      const timeRange = MAX_SECONDS_AHEAD - MIN_SECONDS_AHEAD;
      const pixelsPerSecond = futureWidth / timeRange;
      const scrollSpeed = pixelsPerSecond; // Grid scrolls at this speed

      if (x <= presentX) return;

      // Find which grid row was clicked
      // Calculate price at clicked Y position using same world-space coordinate system
      const baseline = baselinePriceRef.current;
      if (!baseline) return;
      
      const verticalScroll = verticalScrollRef.current;
      const pricePerPixel = (baseline * percentStep) / rowHeight;
      const viewportCenterPrice = baseline - (verticalScroll * pricePerPixel);
      
      // Convert clicked Y to price
      const pixelOffsetFromCenter = y - rect.height / 2;
      const priceOffsetFromCenter = -pixelOffsetFromCenter * pricePerPixel;
      const targetPrice = viewportCenterPrice + priceOffsetFromCenter;

      // Calculate which grid cell column was clicked
      const scrollPosition = scrollPositionRef.current;
      
      // RENDERING: centerX = colIndex * gridCellWidth - scrollPosition + gridCellWidth/2
      // Solve for colIndex: colIndex = (centerX + scrollPosition - gridCellWidth/2) / gridCellWidth
      // We want the colIndex whose centerX is CLOSEST to our click x
      
      const clickedColIndex = Math.round((x + scrollPosition - gridCellWidth / 2) / gridCellWidth);
      
      // Reconstruct center using EXACT same formula as rendering
      const columnStartX = clickedColIndex * gridCellWidth - scrollPosition;
      const screenCenterX = columnStartX + gridCellWidth / 2;

      if (screenCenterX <= presentX) {
        return; // Cell is before NOW line
      }

      // Calculate CORRECT expiry time based on grid column position
      // The bet expires when this grid column reaches the NOW line
      // cellCenterX = colIndex * gridCellWidth - scrollPosition + gridCellWidth/2
      // At expiry: presentX = clickedColIndex * gridCellWidth - futureScrollPosition + gridCellWidth/2
      // futureScrollPosition = clickedColIndex * gridCellWidth + gridCellWidth/2 - presentX
      // Time until that scroll position: (futureScrollPosition - currentScrollPosition) / scrollSpeed
      
      const currentScrollPosition = scrollPosition;
      const cellCenterInWorldSpace = clickedColIndex * gridCellWidth + gridCellWidth / 2;
      const scrollPositionAtExpiry = cellCenterInWorldSpace - presentX;
      const scrollDistanceRemaining = scrollPositionAtExpiry - currentScrollPosition;
      const secondsUntilExpiry = scrollDistanceRemaining / scrollSpeed;
      
      // Clamp to valid range
      const secondsAhead = Math.max(MIN_SECONDS_AHEAD, Math.min(MAX_SECONDS_AHEAD, secondsUntilExpiry));
      const expiryTime = Date.now() + secondsAhead * 1000;

      const recentPrices = priceHistory.slice(-120).map(d => d.price);
      if (!recentPrices.length) return;
      const recentVolatility = computeRecentVolatility(recentPrices);
      const leverage = calculateLeverage(currentPrice, targetPrice, secondsAhead, recentVolatility);

      // gridRow not needed anymore - bets position by targetPrice
      onGridTap(targetPrice, expiryTime, leverage, secondsAhead, clickedColIndex, 0);
    };

    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('click', handleClick);
    };
  }, [onGridTap, currentPrice, priceHistory]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Lottie coin burst animations for won bets */}
      {wonBetAnimations.map((animation) => {
        const timeSinceWin = (Date.now() - animation.timestamp) / 1000;
        const opacity = timeSinceWin > 4 ? Math.max(0, 1 - (timeSinceWin - 4) / 2) : 1;
        
        // Floating profit text animation
        const floatDistance = 40;
        const floatProgress = Math.min(1, timeSinceWin / 2);
        const floatY = animation.y - (floatProgress * floatDistance);
        const textOpacity = timeSinceWin < 2 ? 1 : Math.max(0, 1 - (timeSinceWin - 2) / 2);
        
        return (
          <div key={animation.id}>
            {/* Coin bust animation - centered on the bet square */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: animation.x,
                top: animation.y,
                width: 150,
                height: 150,
                transform: 'translate(-50%, -50%)',
                opacity: opacity,
              }}
            >
              <Lottie
                animationData={coinBustAnimation}
                loop={false}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
            
            {/* Floating profit text */}
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: animation.x,
                top: floatY,
                opacity: textOpacity * opacity,
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className="bg-black/70 backdrop-blur-sm px-3 py-1 rounded-lg border border-green-500/50 shadow-lg">
                <div className="text-lg font-bold bg-gradient-to-b from-green-400 to-green-600 bg-clip-text text-transparent">
                  +${animation.profit.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Current Price Label */}
      {currentPrice > 0 && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/15 shadow-xl">
          <div className="text-[10px] text-white/50 uppercase tracking-wider">SOL/USDT (Live)</div>
          <div className="text-3xl font-bold text-white mt-1">
            ${currentPrice.toFixed(2)}
          </div>
          <div className="text-[10px] text-white/50 mt-1">Live feed</div>
        </div>
      )}
      
      {/* Recenter Button */}
      <button
        onClick={() => {
          // Reset viewport to center on current price
          verticalScrollRef.current = 0;
          if (currentPrice > 0) {
            baselinePriceRef.current = currentPrice;
          }
        }}
        className="absolute bottom-4 right-4 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg bg-white/10 text-white hover:bg-white/20 border border-white/20 hover:scale-105"
      >
        🎯 Recenter
      </button>
    </div>
  );
};

export default PriceChart;
