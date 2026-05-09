"use client";

import { clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork, type WalletAdapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useMemo, type ComponentType, type ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

const TypedConnectionProvider = ConnectionProvider as unknown as ComponentType<{
  endpoint: string;
  children: ReactNode;
}>;
const TypedWalletProvider = WalletProvider as unknown as ComponentType<{
  wallets: WalletAdapter[];
  autoConnect?: boolean;
  children: ReactNode;
}>;
const TypedWalletModalProvider = WalletModalProvider as unknown as ComponentType<{
  children: ReactNode;
}>;

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl(WalletAdapterNetwork.Devnet);
  const wallets = useMemo<WalletAdapter[]>(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <TypedConnectionProvider endpoint={endpoint}>
      <TypedWalletProvider wallets={wallets} autoConnect>
        <TypedWalletModalProvider>{children}</TypedWalletModalProvider>
      </TypedWalletProvider>
    </TypedConnectionProvider>
  );
}
