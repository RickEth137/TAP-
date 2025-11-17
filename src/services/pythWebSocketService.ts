import { PriceData } from './pythService';

export class PythWebSocketService {
  private ws: WebSocket | null = null;
  private priceCallbacks: Map<string, (priceData: PriceData) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldAttemptReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private wsUrl: string = 'wss://hermes.pyth.network/ws') {}

  /**
   * Connect to Pyth WebSocket
   */
  connect() {
    try {
      this.shouldAttemptReconnect = true;
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('✅ Connected to Pyth WebSocket');
        this.reconnectAttempts = 0;

        // Subscribe to all price feeds that have callbacks
        this.priceCallbacks.forEach((_, priceId) => {
          this.subscribeToPriceFeed(priceId);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Pyth Hermes WebSocket sends different message types
          if (data.type === 'response' && data.status === 'success') {
            console.log('✅ Subscribed successfully to price feeds');
            return;
          }
          
          // Price update format from Pyth Hermes
          if (data.type === 'price_update' && data.price_feed) {
            const priceFeed = data.price_feed;
            const priceId = '0x' + priceFeed.id;
            
            if (this.priceCallbacks.has(priceId)) {
              const callback = this.priceCallbacks.get(priceId)!;
              
              // Parse Pyth price (price and expo are sent as strings)
              const priceValue = BigInt(priceFeed.price.price);
              const expo = Number(priceFeed.price.expo);
              const confValue = BigInt(priceFeed.price.conf);
              
              const price = Number(priceValue) * Math.pow(10, expo);
              const confidence = Number(confValue) * Math.pow(10, expo);
              
              callback({
                price,
                confidence,
                timestamp: Date.now(),
              });
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Pyth WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('🔌 Pyth WebSocket closed');
        if (this.shouldAttemptReconnect) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to connect to Pyth WebSocket:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Subscribe to price updates for a specific feed
   */
  subscribeToPriceUpdates(
    priceId: string,
    callback: (priceData: PriceData) => void
  ): () => void {
    this.priceCallbacks.set(priceId, callback);

    // If already connected, subscribe immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.subscribeToPriceFeed(priceId);
    } else {
      // Otherwise connect first
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromPriceFeed(priceId);
      this.priceCallbacks.delete(priceId);
    };
  }

  /**
   * Send subscribe message to WebSocket
   */
  private subscribeToPriceFeed(priceId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          ids: [priceId],
        })
      );
      console.log('📡 Subscribed to Pyth price feed:', priceId);
    }
  }

  /**
   * Send unsubscribe message to WebSocket
   */
  private unsubscribeFromPriceFeed(priceId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          ids: [priceId],
        })
      );
      console.log('🔕 Unsubscribed from Pyth price feed:', priceId);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect() {
    if (!this.shouldAttemptReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectTimer = null;
    }, delay);
  }

  /**
   * Close the WebSocket connection
   */
  disconnect() {
    this.shouldAttemptReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.priceCallbacks.clear();
    console.log('🔌 Disconnected from Pyth WebSocket');
  }
}

export default PythWebSocketService;
