"use client";

import { StarknetConfig, jsonRpcProvider } from "@starknet-react/core";
import { mainnet, sepolia } from "@starknet-react/chains";
import { web3Config } from "@/lib/web3-config";
import { StarkSdkProvider, controllerConnector } from "@/providers/stark-sdk-provider";
import { EgsProvider } from "@/providers/egs-provider";
import { BudokanProvider } from "@/providers/budokan-provider";

const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: web3Config.rpcUrl }),
});

const defaultChainId = web3Config.chainId === "MAINNET" ? mainnet.id : sepolia.id;

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      chains={[mainnet, sepolia]}
      defaultChainId={defaultChainId}
      provider={provider}
      connectors={[controllerConnector]}
      autoConnect
    >
      <StarkSdkProvider>
          <EgsProvider>
            <BudokanProvider>{children}</BudokanProvider>
          </EgsProvider>
      </StarkSdkProvider>
    </StarknetConfig>
  );
}
