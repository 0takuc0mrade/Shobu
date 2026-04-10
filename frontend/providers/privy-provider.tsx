"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { PrivyStatusContext, type PrivyStatus } from "./privy-status-context";

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
      }}
    >
      <PrivyStatusBridge>{children}</PrivyStatusBridge>
    </PrivyProvider>
  );
}
