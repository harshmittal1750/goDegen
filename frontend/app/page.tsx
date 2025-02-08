"use client";

// import { BlockMonitor } from "./components/BlockMonitor";
// import { TradeMonitor } from "./components/TradeMonitor";
import { Portfolio } from "./components/Portfolio";
import { NetworkManager } from "./components/NetworkManager";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-[#0a0a0a] text-white">
      <div className="container mx-auto p-4 space-y-8">
        <h1 className="gradient-text text-4xl font-bold mb-8">
          GoDegen AI Trading
        </h1>

        <div className="grid gap-8">
          <div className="terminal-card">
            <NetworkManager />
          </div>

          <div className="card">
            <Portfolio />
          </div>

          {/* <div className="grid md:grid-cols-2 gap-8">
            <div className="terminal-card">
              <TradeMonitor />
            </div>
            <div className="terminal-card">
              <BlockMonitor />
            </div>
          </div> */}
        </div>
      </div>
    </main>
  );
}
