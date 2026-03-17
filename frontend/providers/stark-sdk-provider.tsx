"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ChainId, OnboardStrategy, StarkZap } from "starkzap";
import { cartridgePolicies, web3Config } from "@/lib/web3-config";

type StarkZapWallet = {
  address?: string;
  account?: { address?: string };
  ensureReady?: (options?: { deploy?: "if_needed" | "always" | "never" }) => Promise<void>;
  execute?: (...args: unknown[]) => Promise<unknown>;
};

type StarkSdkContextValue = {
  sdk: StarkZap;
  wallet: StarkZapWallet | null;
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
  address?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const StarkSdkContext = createContext<StarkSdkContextValue | null>(null);

function resolveChainId() {
  switch (web3Config.chainId) {
    case "SEPOLIA":
      return ChainId.SEPOLIA;
    case "MAINNET":
      return ChainId.MAINNET;
    default:
      return ChainId.SEPOLIA;
  }
}

function getWalletAddress(wallet: StarkZapWallet | null) {
  return wallet?.account?.address ?? wallet?.address ?? undefined;
}

export function StarkSdkProvider({ children }: { children: React.ReactNode }) {
  const sdk = useMemo(
    () =>
      new StarkZap({
        rpcUrl: web3Config.rpcUrl,
        chainId: resolveChainId(),
      }),
    []
  );
  const [wallet, setWallet] = useState<StarkZapWallet | null>(null);
  const [status, setStatus] = useState<StarkSdkContextValue["status"]>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(undefined);
    try {
      const { wallet: connectedWallet } = await sdk.onboard({
        strategy: OnboardStrategy.Cartridge,
        cartridge: {
          preset: "controller",
          policies: cartridgePolicies,
        },
        feeMode: "sponsored",
        deploy: "if_needed",
      });

      if (connectedWallet?.ensureReady) {
        await connectedWallet.ensureReady({ deploy: "if_needed" });
      }

      setWallet(connectedWallet as StarkZapWallet);
      setStatus("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      setStatus("error");
    }
  }, [sdk]);

  const disconnect = useCallback(() => {
    setWallet(null);
    setStatus("idle");
    setError(undefined);
  }, []);

  const value = useMemo<StarkSdkContextValue>(
    () => ({
      sdk,
      wallet,
      status,
      error,
      address: getWalletAddress(wallet),
      connect,
      disconnect,
    }),
    [sdk, wallet, status, error, connect, disconnect]
  );

  return <StarkSdkContext.Provider value={value}>{children}</StarkSdkContext.Provider>;
}

export function useStarkSdk() {
  const context = useContext(StarkSdkContext);
  if (!context) {
    throw new Error("useStarkSdk must be used within StarkSdkProvider");
  }
  return context;
}
