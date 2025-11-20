# 🔥 EXPLICACIÓN COMPLETA: INTEGRACIÓN CON DRIFT PROTOCOL

## 📍 ARCHIVO PRINCIPAL: `src/services/driftService.ts`

Este archivo contiene TODAS las llamadas al SDK de Drift Protocol.

---

## 🎯 FUNCIÓN PRINCIPAL: `executeTapTrade()`

**Ubicación**: `driftService.ts` línea 152

### **Parámetros que RECIBE:**
```typescript
executeTapTrade(
  direction: 'long' | 'short',      // Dirección del trade
  targetPrice: number,               // Precio objetivo (donde el usuario hizo tap)
  betAmount: number,                 // Cantidad apostada en USD
  leverage: number,                  // Apalancamiento calculado dinámicamente
  marketConfig: MarketConfig,        // Configuración del mercado (SOL)
  userId?: string                    // Wallet address del usuario
)
```

### **Parámetros que ENVÍA a Drift SDK:**
```typescript
// Línea 186-190 en driftService.ts
const marketOrderParams = getMarketOrderParams({
  marketIndex: 0,                    // SOL perpetual market
  direction: PositionDirection.LONG, // o SHORT
  baseAssetAmount: baseAmountBN,     // Cantidad en SOL (calculado)
});

// Línea 192 - LA LLAMADA REAL A DRIFT
const txSig = await this.driftClient.placePerpOrder(marketOrderParams);
```

---

## 📊 CÁLCULOS DE PARÁMETROS

### **1. Dirección (Direction)**
```typescript
// page.tsx línea 540
const direction = targetPrice > currentPrice ? 'long' : 'short';
```
- Si usuario hace tap ARRIBA del precio actual → **LONG**
- Si usuario hace tap ABAJO del precio actual → **SHORT**

### **2. Apalancamiento (Leverage)**
```typescript
// Calculado en PriceChart.tsx usando:
// utils/probability.ts → calculateLeverage()

const leverage = calculateLeverage(
  currentPrice,      // $142.24 (ejemplo)
  targetPrice,       // $142.50 (ejemplo)
  secondsAhead,      // 15 segundos
  recentVolatility   // Volatilidad calculada
);

// Resultado: leverage = 35x (ejemplo)
```

### **3. Tamaño de Posición (Position Size)**
```typescript
// driftService.ts línea 165-167
const notionalSize = betAmount * leverage;     // $10 * 35 = $350
const baseAmount = notionalSize / currentPrice; // $350 / $142.24 = 2.46 SOL
const baseAmountBN = new BN(baseAmount * BASE_PRECISION.toNumber());
```

**BASE_PRECISION** = 1e9 (de Drift SDK)

---

## 🔄 FLUJO COMPLETO DE UNA APUESTA

### **1. Usuario hace click en el grid**
```typescript
// PriceChart.tsx línea 485 → handleClick()
onGridTap(targetPrice, expiryTime, leverage, secondsAhead, clickedColIndex, 0);
```

### **2. Se llama handleGridTap en page.tsx**
```typescript
// page.tsx línea 477
const handleGridTap = async (
  targetPrice: number,    // $142.50
  expiryTime: number,     // 1700000000
  leverage: number,       // 35x
  timeSlotSeconds: number,// 15
  gridColumn: number,     // 12
  gridRow: number         // 0
) => {
```

### **3. Validaciones**
```typescript
// page.tsx líneas 479-530
✅ Verificar wallet conectada
✅ Verificar balance del usuario
✅ Verificar liquidez en Drift
✅ Verificar tiempo mínimo (10 segundos)
```

### **4. Cálculos de parámetros**
```typescript
// page.tsx líneas 535-577
direction = 'long'           // Calculado
betAmount = $10              // Del usuario
leverage = 35x               // Calculado
positionSize = $350          // betAmount * leverage
targetPrice = $142.50        // Del grid
currentPrice = $142.24       // De Pyth
```

### **5. Llamada a Drift**
```typescript
// page.tsx línea 601-610
const result = await driftServiceRef.current.executeTapTrade(
  'long',        // direction
  142.50,        // targetPrice
  10,            // betAmount
  35,            // leverage
  MARKETS.SOL    // marketConfig
);
```

### **6. Drift SDK ejecuta**
```typescript
// driftService.ts línea 192
await this.driftClient.placePerpOrder({
  marketIndex: 0,                    // SOL
  direction: PositionDirection.LONG,
  baseAssetAmount: 2460000000        // 2.46 SOL en base units
});
```

### **7. Resultado**
```typescript
// Retorna:
{
  txSignature: "5j7x...abc",  // Transaction hash en Solana
  entryOrderId: 12345,         // Order ID en Drift
  takeProfitOrderId: undefined,// No usado (manual settlement)
  stopLossOrderId: undefined   // No usado (manual settlement)
}
```

---

## 🧮 MATCH DE PARÁMETROS

### **Lo que ve el USUARIO:**
```
Bet: $10
Multiplier: 35x
Target: $142.50
Current: $142.24
Time: 15 seconds
```

### **Lo que se ENVÍA a Drift:**
```typescript
{
  marketIndex: 0,              // SOL perpetual market
  direction: LONG,             // Subir
  baseAssetAmount: 2.46 SOL,   // $350 / $142.24 = 2.46 SOL
}
```

### **Conversiones:**
1. **Bet Amount ($10)** → Usado para calcular position size
2. **Leverage (35x)** → $10 * 35 = **$350 notional**
3. **Notional ($350)** → $350 / $142.24 = **2.46 SOL**
4. **2.46 SOL** → 2.46 * 1e9 = **2,460,000,000 base units**

---

## 📦 CONSTANTES IMPORTANTES

### **De `constants.ts`:**
```typescript
DRIFT_CONFIG = {
  ENV: 'mainnet-beta',
  RPC_URL: 'https://chaotic-flashy-water.solana-mainnet.quiknode.pro/...',
  DRIFT_PROGRAM_ID: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
  UNIVERSAL_ACCOUNT_PRIVATE_KEY: [157,154,8,48,...] // Tu wallet
}

TRADING_CONFIG = {
  MIN_BET_TIME_SECONDS: 10,        // Mínimo para Drift
  STOP_LOSS_PERCENTAGE: 0.02,      // 2% (no usado actualmente)
}

MARKETS.SOL = {
  marketIndex: 0,                  // SOL perpetual en Drift
  symbol: 'SOL',
  pythPriceId: '0xef0d8b6fda...',  // Oracle de Pyth
}
```

### **De Drift SDK:**
```typescript
PRICE_PRECISION = 1e6      // Precio en millonésimas
BASE_PRECISION = 1e9       // Base asset en billonésimas
```

---

## ⚠️ IMPORTANTE: LIQUIDACIÓN

### **¿Cómo se cierra la posición?**

**DRIFT NO LO CIERRA AUTOMÁTICAMENTE** - El juego lo hace manualmente:

```typescript
// page.tsx líneas 197-242 → Settlement useEffect
if (position.status === 'won' || position.status === 'lost') {
  if (!position.settledOnChain) {
    // Cerrar posición en Drift manualmente
    await driftServiceRef.current.closePosition(
      position.marketIndex,
      position.direction
    );
  }
}
```

**Función de cierre:**
```typescript
// driftService.ts línea 355
async closePosition(marketIndex: number, direction: string) {
  const currentPosition = positions.find(p => 
    p.marketIndex === marketIndex && 
    p.direction.toLowerCase() === direction
  );
  
  if (currentPosition) {
    // Cerrar la posición opuesta
    const closeDirection = direction === 'long' 
      ? PositionDirection.SHORT 
      : PositionDirection.LONG;
    
    const marketOrderParams = getMarketOrderParams({
      marketIndex,
      direction: closeDirection,  // Orden opuesta para cerrar
      baseAssetAmount: currentPosition.baseAssetAmount.abs(),
      reduceOnly: true  // Solo reduce, no abre nueva
    });
    
    return await this.driftClient.placePerpOrder(marketOrderParams);
  }
}
```

---

## 🔍 DEBUGGING

### **Logs importantes:**
```typescript
// Cuando se coloca apuesta
console.log('🔥 Executing REAL trade on Drift Protocol...');
console.log('📊 Trade Parameters:', {
  direction,
  currentPrice,
  targetPrice,
  betAmount,
  leverage,
  notionalSize,
  baseAmount
});

// Cuando se liquida
console.log('🔄 Settling position on Drift...');
console.log('✅ Position closed on Drift:', txSig);
```

### **Verificar en Solana Explorer:**
```
https://solscan.io/tx/[txSignature]
```

---

## 📋 RESUMEN VISUAL

```
USUARIO                      APP                         DRIFT SDK
   |                          |                              |
   | Tap en $142.50          |                              |
   |------------------------>|                              |
   |                          | Calculate:                  |
   |                          | - direction: LONG           |
   |                          | - leverage: 35x             |
   |                          | - positionSize: $350        |
   |                          | - baseAmount: 2.46 SOL      |
   |                          |                              |
   |                          | executeTapTrade()           |
   |                          |---------------------------->|
   |                          |                              |
   |                          |        placePerpOrder({     |
   |                          |          marketIndex: 0,    |
   |                          |          direction: LONG,   |
   |                          |          baseAssetAmount:   |
   |                          |            2460000000       |
   |                          |        })                   |
   |                          |<----------------------------|
   |                          | txSignature: "5j7x..."      |
   |<------------------------|                              |
   | "Bet placed! $10 @ 35x" |                              |
```

---

## 🎯 PREGUNTAS FRECUENTES

**Q: ¿Por qué leverage es dinámico?**  
A: Se calcula basado en distancia al precio y tiempo. Más cerca = más apalancamiento.

**Q: ¿Dónde está el take-profit?**  
A: NO hay take-profit automático. El juego detecta cuando precio toca la zona objetivo y cierra manualmente.

**Q: ¿Qué pasa si el usuario pierde?**  
A: Cuando expira el tiempo, el juego marca la posición como "lost" y la cierra en Drift.

**Q: ¿Se pueden ver todas las posiciones en Drift?**  
A: Sí, con `getUserPositions()` pero muestra TODAS las de TODOS los usuarios (es una cuenta universal).

**Q: ¿Cómo se rastrea qué posición es de qué usuario?**  
A: En el estado del app (`tradingStore.ts`) con el campo `userId` (wallet address).

---

## 🚀 PRÓXIMOS PASOS RECOMENDADOS

1. ✅ Verificar que `BASE_PRECISION` y `PRICE_PRECISION` coinciden con Drift
2. ✅ Probar con cantidades pequeñas ($1-$5)
3. ✅ Monitorear transacciones en Solscan
4. ✅ Verificar que positions se cierran correctamente
5. ⚠️ Implementar límites de riesgo (max position size)

---

**Archivo creado el:** ${new Date().toISOString()}  
**Versión del SDK:** @drift-labs/sdk v2.80.0
