import type { Item, Snapshot, Stocks } from "./types";
const rows = [
  ["Infused Alloy", "mekanism:enrichedalloy", 1250, true], ["Steel Ingot", "mekanism:ingot", 81640, true],
  ["Fluix Crystal", "appliedenergistics2:material", 2840, true], ["Logic Processor", "appliedenergistics2:material", 512, true],
  ["Basic Control Circuit", "mekanism:controlcircuit", 840, true], ["Diamond", "minecraft:diamond", 425, false],
  ["Copper Ingot", "thermalfoundation:material", 28400, true], ["Iron Ingot", "minecraft:iron_ingot", 72100, true],
  ["Gold Ingot", "minecraft:gold_ingot", 9800, true], ["Redstone", "minecraft:redstone", 154200, false],
  ["Silicon", "appliedenergistics2:material", 3200, true], ["Quartz Glass", "appliedenergistics2:quartz_glass", 1280, true],
] as const;
export const demoItems: Item[] = rows.map(([label, name, size, isCraftable], i) => ({ label, name, size, isCraftable, damage: i, hasTag: false, tag: "", identityComplete: true }));
export const demoStocks: Stocks = { items: demoItems, page: 1, pages: 1, total: demoItems.length, allTotal: demoItems.length, revision: 45, truncated: false };
export const demoSnapshot: Snapshot = {
  type: "snapshot", online: true, receivedAt: null, configured: true, controlAllowed: false,
  telemetry: { boot: "example-only", controlEnabled: false,
    status: { version: "0.6.0", uptime: 12587, automation: true, ae2: { online: true, itemTypes: 1834, revision: 45, truncated: false, error: "" },
      clients: [{ role: "main", address: "örnek-ana-ekran", age: 2 }, { role: "side", address: "örnek-yan-ekran", age: 1 }],
      power: { ae2: { supported: true, stored: 782000, capacity: 1000000, injection: 129, usage: 121 } } },
    jobs: { cpus: [{ name: "ASSEMBLY / 01", busy: true, storage: 65536 }, { name: "CHEMICAL / 02", busy: true, storage: 262144 },
      { name: "GENERAL / 03", busy: false, storage: 65536 }, { name: "PROCESSORS / 04", busy: false, storage: 131072 }],
      trackedJobs: [{ id: "demo-1", owner: "@factoryos-stock", automatic: true, label: "Infused Alloy", amount: 2846, cpu: "", state: "running", error: "" },
        { id: "demo-2", owner: "@factoryos-web", label: "Logic Processor", amount: 64, cpu: "ASSEMBLY / 01", state: "computing", error: "" },
        { id: "demo-3", owner: "@factoryos-web", label: "Steel Ingot", amount: 128, cpu: "GENERAL / 03", state: "done", error: "" }], error: "", craftingError: "" },
    rules: [{ id: 1, item: demoItems[0], label: "Infused Alloy", minimum: 2048, target: 4096, enabled: true, stock: 1250, inFlight: 2846, state: "URETIM BEKLENIYOR", error: "", retryIn: 0 },
      { id: 2, item: demoItems[4], label: "Basic Control Circuit", minimum: 1024, target: 2048, enabled: true, stock: 840, inFlight: 0, state: "TEKRAR BEKLENIYOR", error: "request failed (missing resources?)", retryIn: 57 },
      { id: 3, item: demoItems[2], label: "Fluix Crystal", minimum: 1024, target: 4096, enabled: false, stock: 2840, inFlight: 0, state: "KAPALI", error: "", retryIn: 0 }],
    rulesRevision: 8, paused: false,
  },
};
export const demoEnergy = [63, 66, 62, 68, 65, 69, 72, 69, 71, 75, 72, 77, 74, 78, 76, 79, 78, 78.2];
