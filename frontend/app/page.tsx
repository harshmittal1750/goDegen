"use client";

import { BlockMonitor } from "./components/BlockMonitor";
import { TradeMonitor } from "./components/TradeMonitor";
import { Portfolio } from "./components/Portfolio";
import { NetworkManager } from "./components/NetworkManager";

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <div className="grid gap-8">
        <NetworkManager />
        <Portfolio />
        {/* <TradeMonitor />
        <BlockMonitor /> */}
      </div>
    </main>
  );
}
