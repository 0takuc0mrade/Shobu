"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { ChainId, StarkZap } from "starkzap";
import { controllerPolicies, web3Config } from "@/lib/web3-config";
import { createStarkzapWallet } from "@/lib/starkzap-wallet-adapter";

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

export const controllerConnector = new ControllerConnector({
  policies: controllerPolicies,
  chains: [{ rpcUrl: web3Config.rpcUrl }],
});

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
      address: address ?? getWalletAddress(wallet),
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
