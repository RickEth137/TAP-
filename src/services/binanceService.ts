export interface PriceData {
  price: number;
  confidence: number;
  timestamp: number;
}

class BinanceWebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, (data: PriceData) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private lastPrice = 0;
  private priceBuffer: number[] = []; // For smoothing

  subscribeToPriceUpdates(
    symbol: string, // e.g., 'SOLUSDT'
    callback: (priceData: PriceData) => void
  ): () => void {
    const id = Math.random().toString(36);
    this.subscribers.set(id, callback);

    // Initialize WebSocket connection if not already connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect(symbol);
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0) {
        this.disconnect();
      }
    };
  }

  private connect(symbol: string) {
    try {
      // Binance WebSocket endpoint for individual symbol ticker
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`;
      
      console.log(`🔌 Connecting to Binance WebSocket: ${symbol}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ Connected to Binance WebSocket - Live SOL/USDT prices!');
        console.log('WebSocket URL:', wsUrl);
        console.log('WebSocket ready state:', this.ws?.readyState);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          console.log('📡 Binance message received:', data);
          
          // Binance trade stream format: { p: "price", q: "quantity", T: timestamp }
          const price = parseFloat(data.p);
          
          console.log('💰 Parsed price:', price);
          
          if (!isNaN(price) && price > 0) {
            // Add to buffer for smoothing
            this.priceBuffer.push(price);
            if (this.priceBuffer.length > 5) {
              this.priceBuffer.shift();
            }

            // Use exponential moving average for smooth price
            const smoothedPrice = this.priceBuffer.reduce((a, b) => a + b) / this.priceBuffer.length;
            this.lastPrice = smoothedPrice;
            
            const priceData: PriceData = {
              price: smoothedPrice,
              confidence: 0,
              timestamp: data.T || Date.now(),
            };

            console.log('📤 Notifying subscribers:', priceData.price.toFixed(2), 'Subscribers:', this.subscribers.size);

            // Notify all subscribers
            this.subscribers.forEach((callback) => {
              callback(priceData);
            });
          } else {
            console.warn('⚠️ Invalid price received:', price);
          }
        } catch (error) {
          console.error('❌ Error parsing Binance message:', error, event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Binance WebSocket error:', error);
        console.error('WebSocket state:', this.ws?.readyState);
      };

      this.ws.onclose = (event) => {
        console.log('❌ Binance WebSocket disconnected');
        console.log('Close code:', event.code, 'Reason:', event.reason);
        this.attemptReconnect(symbol);
      };

    } catch (error) {
      console.error('Failed to connect to Binance WebSocket:', error);
      this.attemptReconnect(symbol);
    }
  }

  private attemptReconnect(symbol: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.subscribers.size > 0) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(symbol);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getLastPrice(): number {
    return this.lastPrice;
  }
}

export default BinanceWebSocketService;
