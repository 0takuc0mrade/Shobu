"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { PrivyStatusContext, type PrivyStatus } from "./privy-status-context";
import { defineChain } from "viem";

/**
 * Inner component that reads Privy hooks and pushes values into
 * the lightweight PrivyStatusContext so the rest of the app can
 * check auth state without importing @privy-io/react-auth.
 */
function PrivyStatusBridge({ children }: { children: React.ReactNode }) {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  const status: PrivyStatus = {
    ready,
    authenticated,
    evmAddress: wallets?.[0]?.address,
    wallets: wallets ?? [],
    login,
    logout,
  };

  return (
    <PrivyStatusContext.Provider value={status}>
      {children}
    </PrivyStatusContext.Provider>
  );
}

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR / prerendering, or when no valid Privy app ID is configured,
  // just render children without the Privy wrapper so the build succeeds.
  if (!mounted || !appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#676FFF",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        supportedChains: [
          defineChain({
            id: 133,
            name: "HashKey Chain Testnet",
            network: "hashkey-testnet",
            nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://hashkeychain-testnet.alt.technology"] },
              public:  { http: ["https://hashkeychain-testnet.alt.technology"] },
            },
            blockExplorers: {
              default: { name: "HashKey Explorer", url: "https://hashkeychain-testnet-explorer.alt.technology" },
            },
            testnet: true,
          })
        ],
      }}
    >
      <PrivyStatusBridge>{children}</PrivyStatusBridge>
    </PrivyProvider>
  );
}
