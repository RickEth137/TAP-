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
  const priceOffsetRef = useRef(0); // Vertical scroll (price offset from baseline)
  const targetPriceOffsetRef = useRef(0); // Target price offset for smoothing
  const pricePerPixelRef = useRef(0); // Shared state for event handler
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

      // ============== AUTO-SCALING LOGIC ==============
      // Calculate min/max of visible history to maximize "action"
      const pointsToShow = Math.min(priceHistory.length, 100); // Look at recent history
      const recentHistory = priceHistory.slice(-pointsToShow);
      
      let minP = currentPrice;
      let maxP = currentPrice;
      
      if (recentHistory.length > 0) {
        minP = Math.min(currentPrice, ...recentHistory.map(p => p.price));
        maxP = Math.max(currentPrice, ...recentHistory.map(p => p.price));
      }
      
      // Calculate volatility-based range
      const priceDiff = maxP - minP;
      // Ensure we don't zoom in TOO much on flat lines (min 0.02% range)
      const minRange = currentPrice * 0.0002; 
      const targetRange = Math.max(priceDiff * 2.5, minRange); // Keep line in middle 40% of screen
      
      // Smoothly interpolate the visible range to prevent jumpy zooming
      // We store the current range in a ref to animate it
      if (!canvas.dataset.currentRange) {
        canvas.dataset.currentRange = targetRange.toString();
      }
      
      const currentRange = parseFloat(canvas.dataset.currentRange);
      const smoothRange = currentRange + (targetRange - currentRange) * 0.05; // Smooth zoom
      canvas.dataset.currentRange = smoothRange.toString();
      
      const visiblePriceRange = smoothRange;
      const percentStep = visiblePriceRange / 10; // For grid lines

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
      
      // Calculate price range for visible viewport
      // Each gridCellHeight pixels = percentStep price change
      const pricePerPixel = (baseline * percentStep) / gridCellHeight;
      pricePerPixelRef.current = pricePerPixel; // Update ref for event handler
      
      // Smooth scroll interpolation (Price Offset)
      const scrollLerp = 0.1;
      priceOffsetRef.current += (targetPriceOffsetRef.current - priceOffsetRef.current) * scrollLerp;
      
      // Center of viewport represents this price
      // viewportCenterPrice = baseline - priceOffset
      // (Positive offset = scrolling down = viewing lower prices)
      const viewportCenterPrice = baseline - priceOffsetRef.current;
      
      // Visible range is determined by auto-scaling
      const minVisiblePrice = viewportCenterPrice - visiblePriceRange / 2;
      const maxVisiblePrice = viewportCenterPrice + visiblePriceRange / 2;
      
      // Convert price to screen Y coordinate
      const priceToY = (price: number) => {
        // How far is this price from viewport center?
        const priceOffset = price - viewportCenterPrice;
        // Convert to pixels (negative because Y increases downward)
        // pricePerPixel = visiblePriceRange / rect.height
        const pixelOffset = -(priceOffset / (visiblePriceRange / rect.height));
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
      const priceOffsetFromCenter = -pixelOffsetFromCenter * (visiblePriceRange / rect.height);
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
          const priceOffsetFromCenter = -pixelOffsetFromCenter * (visiblePriceRange / rect.height);
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
        // Determine trend color
        const startPrice = priceHistory[0].price;
        const isUp = currentPrice >= startPrice;
        
        const gradient = ctx.createLinearGradient(0, 0, presentX, 0);
        if (isUp) {
            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)'); // Green start
            gradient.addColorStop(1, '#22c55e'); // Green end
        } else {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)'); // Red start
            gradient.addColorStop(1, '#ef4444'); // Red end
        }
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4; // Thicker line
        ctx.shadowBlur = 15;
        ctx.shadowColor = isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
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
      const isUp = priceHistory.length > 0 ? currentPrice >= priceHistory[Math.max(0, priceHistory.length - 5)].price : true;
      const headColor = isUp ? '#22c55e' : '#ef4444';

      ctx.fillStyle = headColor;
      ctx.shadowBlur = 25;
      ctx.shadowColor = headColor;
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
      ctx.fillStyle = headColor;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${currentPrice.toFixed(2)}`, presentX + 15, currentY);

      // Draw horizontal line showing current price level across past zone
      ctx.strokeStyle = isUp ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
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
        const pixelOffset = -(priceOffset / (visiblePriceRange / rect.height));
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
  }, [priceHistory, currentPrice, positions, wonBetAnimations]);

  // Handle vertical scrolling with mouse wheel
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      
      let deltaY = event.deltaY;
      let sensitivity = 0;

      // Adaptive sensitivity based on input device characteristics
      if (event.deltaMode === 1) { 
        // Line mode (Firefox/some mice) - definitely a mouse wheel
        // Convert lines to pixels first (approx 40px per line)
        deltaY *= 40; 
        sensitivity = 0.01; // Very low sensitivity for line mode
      } else if (Math.abs(deltaY) >= 50) {
        // Large delta (likely a physical mouse wheel on Windows)
        // Typical Windows mouse wheel is 100 per tick
        // We want 1 tick to move just a small fraction of the screen
        sensitivity = 0.02; // 100 * 0.02 = 2 pixels per tick (very smooth/slow)
      } else {
        // Small delta (likely a trackpad or high-precision mouse)
        sensitivity = 0.5; // Keep responsive for trackpads
      }
      
      const pixelScrollAmount = deltaY * sensitivity;
      
      // Convert pixel scroll to price scroll using CURRENT zoom level
      const currentPricePerPixel = pricePerPixelRef.current || 0;
      const priceScrollAmount = pixelScrollAmount * currentPricePerPixel;
      
      targetPriceOffsetRef.current += priceScrollAmount;
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle taps directly on the canvas so coordinates align with rendering math
  useEffect(() => {
    if (!onGridTap || !canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleClick = (event: MouseEvent) => {
      console.log('🖱️ Canvas clicked!', { x: event.clientX, y: event.clientY });
      console.log('📊 PriceChart: Calling onGridTap handler...');
      
      if (!currentPrice || currentPrice <= 0) {
        console.warn('⚠️ No current price available');
        return;
      }

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

      if (x <= presentX) {
        console.log('❌ Clicked before NOW line');
        return;
      }

      // Find which grid row was clicked
      // Calculate price at clicked Y position using same world-space coordinate system
      const baseline = baselinePriceRef.current;
      if (!baseline) return;
      
      // Get current range from dataset (synced with render loop)
      const currentRange = parseFloat(canvas.dataset.currentRange || '0');
      if (!currentRange) return;

      const priceOffset = priceOffsetRef.current;
      const pricePerPixel = currentRange / rect.height;
      const viewportCenterPrice = baseline - priceOffset;
      
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

      console.log('✅ Bet placement triggered:', {
        targetPrice: targetPrice.toFixed(2),
        secondsAhead: secondsAhead.toFixed(1),
        leverage: leverage.toFixed(1) + 'x',
        gridColumn: clickedColIndex
      });

      console.log('🎯 PriceChart: Now calling page.tsx handleGridTap...');
      // gridRow not needed anymore - bets position by targetPrice
      onGridTap(targetPrice, expiryTime, leverage, secondsAhead, clickedColIndex, 0);
      console.log('✅ PriceChart: onGridTap call completed');
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
        className="w-full h-full cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Lottie coin burst animations for won bets */}
      {wonBetAnimations.map((animation) => {
        const timeSinceWin = (Date.now() - animation.timestamp) / 1000;
        const opacity = timeSinceWin > 4 ? Math.max(0, 1 - (timeSinceWin - 4) / 2) : 1;
        
        // Floating profit text animation - starts ABOVE the bet square
        const floatDistance = 60;
        const floatProgress = Math.min(1, timeSinceWin / 2);
        const initialOffset = -50; // Start 50px above the bet square
        const floatY = animation.y + initialOffset - (floatProgress * floatDistance);
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
          targetPriceOffsetRef.current = 0;
          // priceOffsetRef.current will lerp to 0 automatically
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
