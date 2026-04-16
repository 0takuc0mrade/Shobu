"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { PrivyStatusContext, type PrivyStatus } from "./privy-status-context";
import { defineChain } from "viem";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

/**
 * Inner component that reads Privy hooks and pushes values into
 * the lightweight PrivyStatusContext so the rest of the app can
 * check auth state without importing @privy-io/react-auth.
 */
function PrivyStatusBridge({ children }: { children: React.ReactNode }) {
  const { login, logout, authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();

  const stellarWallet = wallets.find((w: any) => 
    (w.walletClientType === 'privy' && w.chainType === 'stellar') ||
    (w.address && w.address.startsWith('G') && w.address.length === 56)
  );

  const stellarLinkedAccount = user?.linkedAccounts?.find((a: any) => 
    a.type === 'wallet' && 
    (a.chainType === 'stellar' || (a.address && a.address.startsWith('G') && a.address.length === 56))
  );

  const [freighterAddress, setFreighterAddress] = useState<string | undefined>();
  const [stellarKit, setStellarKit] = useState<any>(null);

  const FREIGHTER_DISCONNECT_KEY = 'shobu_freighter_disconnected';

  useEffect(() => {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      selectedWalletId: 'freighter',
      modules: defaultModules(),
    });
    setStellarKit(() => StellarWalletsKit);

    if (typeof window !== 'undefined' && sessionStorage.getItem(FREIGHTER_DISCONNECT_KEY)) {
      return;
    }
    
    // Auto-connect if allowed
    StellarWalletsKit.getAddress()
       .then(({ address }: { address: string }) => setFreighterAddress(address))
       .catch((e: any) => { /* ignore */ });
  }, []);

  const connectFreighter = async () => {
    if (!stellarKit) return;
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(FREIGHTER_DISCONNECT_KEY);
      }
      const { address } = await StellarWalletsKit.authModal();
      setFreighterAddress(address);
    } catch (e) {
      console.error(e);
    }
  };

  const disconnectFreighter = () => {
    setFreighterAddress(undefined);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(FREIGHTER_DISCONNECT_KEY, '1');
    }
  };

  const status: PrivyStatus = {
    ready,
    authenticated,
    evmAddress: wallets?.[0]?.address,
    stellarAddress: freighterAddress || stellarWallet?.address || (stellarLinkedAccount as any)?.address,
    wallets: wallets ?? [],
    login,
    logout,
    connectFreighter,
    disconnectFreighter,
    isFreighterConnected: !!freighterAddress,
    stellarKit,
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
          // @ts-ignore: Stellar support newly added into privy provider backend
          stellar: {
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
