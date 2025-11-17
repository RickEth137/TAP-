'use client';

import { FC, ReactNode, useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { DRIFT_CONFIG } from '@/config/constants';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletContextProviderProps {
  children: ReactNode;
}

/**
 * WalletContextProvider
 * 
 * NOTE: Individual user wallets are NOT required for trading!
 * The app uses a universal Drift account for all trading.
 * 
 * User wallets are OPTIONAL and only needed for:
 * - Depositing funds into the game
 * - Withdrawing winnings
 * - Proving identity/ownership
 * 
 * Trading happens on the universal account without user wallet signatures.
 */
export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const endpoint = useMemo(() => DRIFT_CONFIG.RPC_URL, []);

  const wallets = useMemo(
    () => [
      new SolflareWalletAdapter(),
    ],
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering wallet UI on server
  if (!mounted) {
    return (
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          {children}
        </WalletProvider>
      </ConnectionProvider>
    );
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
