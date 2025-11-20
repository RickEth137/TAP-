# Security & Architecture Fixes

## Critical Vulnerabilities Addressed

1.  **Exposed Private Key**: The original implementation required the "Universal Wallet" private key to be loaded in the browser (`DriftService`). This meant any user could inspect the code and drain the platform's funds.
    *   **Fix**: The private key is now ONLY loaded in `src/lib/server/driftServer.ts` which runs on the server. The client never sees it.

2.  **Client-Side Logic Trust**: Betting and balance updates were happening on the client. A user could manipulate the JavaScript to give themselves infinite money.
    *   **Fix**: All sensitive operations (betting, withdrawals, deposits) are now **Server Actions** in `src/app/actions.ts`. The server verifies everything.

3.  **No Persistence**: Balances were stored in `localStorage` or memory. Refreshing the page would reset data or lose state.
    *   **Fix**: Implemented a JSON-based database in `src/lib/server/db.ts`. This persists user balances and transaction history to `data/db.json`.

## New Architecture

### 1. Server Actions (`src/app/actions.ts`)
This is the API layer. The frontend calls these functions, which run securely on the server.
*   `getUserBalance(walletAddress)`: Gets the secure balance from the DB.
*   `verifyDeposit(signature, walletAddress)`: Verifies a Solana transaction on-chain and credits the user's DB balance.
*   `placeBet(amount, direction, ...)`: Checks DB balance, executes the trade on Drift (server-side), and updates DB balance.
*   `requestWithdrawal(amount, walletAddress)`: Checks DB balance, queues a withdrawal (or executes it if hot wallet is implemented).
*   `settlePosition(marketIndex)`: Closes a position on Drift and updates the user's balance with PnL.

### 2. Server-Side Drift (`src/lib/server/driftServer.ts`)
A singleton class that initializes the Drift SDK with the private key *once* on the server. It handles all actual trading.

### 3. Database (`src/lib/server/db.ts`)
A simple file-based database system.
*   Stores User Balances.
*   Stores Transaction History.
*   **Note**: For high-scale production, replace the implementation of `db.ts` with a real SQL database (Postgres/MySQL), but keep the interface the same.

## How to Run

1.  **Environment Variables**:
    Ensure your `.env` file has:
    ```
    NEXT_PUBLIC_RPC_URL=...
    DRIFT_UNIVERSAL_ACCOUNT_PRIVATE_KEY=... (The Base58 private key of the platform wallet)
    ```

2.  **Build**:
    ```bash
    npm run build
    ```

3.  **Start**:
    ```bash
    npm start
    ```

## Next Steps for Production

1.  **Database**: Swap `src/lib/server/db.ts` to use PostgreSQL or MongoDB.
2.  **Authentication**: Currently, we trust the `walletAddress` passed from the client. In a real app, you should use a message signing flow (SIWS - Sign In With Solana) to prove ownership of the wallet address before returning balances.
3.  **Rate Limiting**: Add rate limiting to `actions.ts` to prevent spam.
