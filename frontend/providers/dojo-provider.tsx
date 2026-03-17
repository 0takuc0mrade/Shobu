"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { init } from "@dojoengine/sdk";
import { web3Config } from "@/lib/web3-config";

type DojoSdk = Awaited<ReturnType<typeof init>>;

type DojoContextValue = {
  sdk: DojoSdk | null;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

const DojoContext = createContext<DojoContextValue | null>(null);

export function DojoProvider({ children }: { children: React.ReactNode }) {
  const [sdk, setSdk] = useState<DojoSdk | null>(null);
  const [status, setStatus] = useState<DojoContextValue["status"]>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    async function boot() {
      setStatus("loading");
      setError(undefined);
      try {
        const dojoSdk = await init({
          client: {
            worldAddress: web3Config.worldAddress,
            toriiUrl: web3Config.toriiUrl,
          },
          domain: {
            name: "Shobu",
            version: "1.0",
            chainId: web3Config.chainId,
            revision: "1",
          },
        });

        if (!active) return;
        setSdk(dojoSdk);
        setStatus("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to init Dojo SDK";
        if (!active) return;
        setError(message);
        setStatus("error");
      }
    }

    boot();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      sdk,
      status,
      error,
    }),
    [sdk, status, error]
  );

  return <DojoContext.Provider value={value}>{children}</DojoContext.Provider>;
}

export function useDojoSdk() {
  const context = useContext(DojoContext);
  if (!context) {
    throw new Error("useDojoSdk must be used within DojoProvider");
  }
  return context;
}
