"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

type BrowserWallet = {
  isPhantom?: boolean;
  publicKey?: {
    toBase58(): string;
  };
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void> | void;
};

type WalletState = {
  connected: boolean;
  publicKey: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

declare global {
  interface Window {
    solana?: BrowserWallet;
    solflare?: BrowserWallet;
  }
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);

  useEffect(() => {
    const injected = getInjectedWallet();
    setWallet(injected);

    if (!injected) {
      return;
    }

    injected
      .connect({ onlyIfTrusted: true })
      .then((response) => setPublicKey(response.publicKey.toBase58()))
      .catch(() => undefined);
  }, []);

  const connect = useCallback(async () => {
    const injected = getInjectedWallet();

    if (!injected) {
      window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
      return;
    }

    const response = await injected.connect();
    setWallet(injected);
    setPublicKey(response.publicKey.toBase58());
  }, []);

  const disconnect = useCallback(async () => {
    await wallet?.disconnect?.();
    setPublicKey(null);
  }, [wallet]);

  const value = useMemo<WalletState>(
    () => ({
      connected: Boolean(publicKey),
      publicKey,
      connect,
      disconnect
    }),
    [connect, disconnect, publicKey]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletAccount() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWalletAccount must be used inside WalletContextProvider");
  }

  return context;
}

export function WalletButton() {
  const { connected, publicKey, connect, disconnect } = useWalletAccount();

  return (
    <button className="walletButton" onClick={connected ? disconnect : connect} type="button">
      {connected && publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : "Connect Wallet"}
    </button>
  );
}

function getInjectedWallet(): BrowserWallet | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.solana ?? window.solflare ?? null;
}
