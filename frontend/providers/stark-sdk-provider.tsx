"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { controllerPolicies, web3Config } from "@/lib/web3-config";
import { createStarkzapWallet } from "@/lib/starkzap-wallet-adapter";
import { getStarkzap, getStarkzapSync } from "@/lib/starkzap-client";

type StarkZapWallet = {
  address?: string;
  account?: { address?: string };
  ensureReady?: (options?: { deploy?: "if_needed" | "always" | "never" }) => Promise<void>;
  execute?: (...args: unknown[]) => Promise<unknown>;
};

type StarkSdkContextValue = {
  sdk: any | null;
  wallet: StarkZapWallet | null;
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
  address?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const StarkSdkContext = createContext<StarkSdkContextValue | null>(null);

export const controllerConnector = new ControllerConnector({
  policies: controllerPolicies,
  chains: [{ rpcUrl: web3Config.rpcUrl }],
});

export function StarkSdkProvider({ children }: { children: React.ReactNode }) {
  const [sdk, setSdk] = useState<any | null>(null);

  // Lazy-load the StarkZap SDK on mount (client-side only)
  useEffect(() => {
    getStarkzap().then(setSdk).catch(console.error);
  }, []);

  const { connect: connectWallet, connectors } = useConnect();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { account, address, status: accountStatus } = useAccount();
  const [error, setError] = useState<string | undefined>(undefined);

  const controller = useMemo(
    () => connectors.find((c) => c.id === "controller"),
    [connectors]
  );

  const wallet = useMemo<StarkZapWallet | null>(() => {
    const adapter = createStarkzapWallet(account);
    return adapter as StarkZapWallet | null;
  }, [account]);

  const status = useMemo<StarkSdkContextValue["status"]>(() => {
    if (error) return "error";
    if (accountStatus === "connected") return "connected";
    if (accountStatus === "connecting" || accountStatus === "reconnecting") return "connecting";
    return "idle";
  }, [accountStatus, error]);

  useEffect(() => {
    if (accountStatus === "connected" && error) {
      setError(undefined);
    }
  }, [accountStatus, error]);

  const connect = useCallback(async () => {
    setError(undefined);
    if (!controller) {
      setError("Cartridge connector unavailable");
      return;
    }
    try {
      await connectWallet({ connector: controller });
    } catch (err) {
      console.error("Cartridge Connection Error:", err);
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
    }
  }, [connectWallet, controller]);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setError(undefined);
  }, [disconnectWallet]);

  const value = useMemo<StarkSdkContextValue>(
    () => ({
      sdk,
      wallet,
      status,
      error,
      address: address ?? wallet?.account?.address ?? wallet?.address ?? undefined,
      connect,
      disconnect,
    }),
    [sdk, wallet, status, error, address, connect, disconnect]
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
