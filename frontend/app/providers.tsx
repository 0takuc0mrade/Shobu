"use client";

import { StarknetConfig, jsonRpcProvider } from "@starknet-react/core";
import { mainnet, sepolia } from "@starknet-react/chains";
import { web3Config } from "@/lib/web3-config";
import { StarkSdkProvider } from "@/providers/stark-sdk-provider";
import { DojoProvider } from "@/providers/dojo-provider";
import { EgsProvider } from "@/providers/egs-provider";

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
      autoConnect={false}
    >
      <StarkSdkProvider>
        <DojoProvider>
          <EgsProvider>{children}</EgsProvider>
        </DojoProvider>
      </StarkSdkProvider>
    </StarknetConfig>
  );
}
