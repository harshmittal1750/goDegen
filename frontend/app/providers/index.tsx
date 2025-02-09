"use client";

import type { ReactNode } from "react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "wagmi/chains";
import "@coinbase/onchainkit/styles.css";
export function Providers(props: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{
        appearance: {
          name: "OnchainKit Playground",
          logo: "https://onchainkit.xyz/favicon/48x48.png?v4-19-24",
          mode: "auto",
          theme: "default",
        },
      }}
    >
      {props.children}
    </OnchainKitProvider>
  );
}
