"use client";

// import { BlockMonitor } from "./components/BlockMonitor";
import { TradeMonitor } from "./components/TradeMonitor";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-12 text-center">Network Monitor</h1>

      <div className="grid gap-8 max-w-7xl mx-auto">
        {/* <BlockMonitor /> */}
        <TradeMonitor />
      </div>
    </main>
  );
}
