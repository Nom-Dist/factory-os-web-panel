export type Item = { name: string; label: string; damage: number; size: number; hasTag: boolean; tag: string; identityComplete: boolean; isCraftable: boolean };
export type Cpu = { name: string; busy: boolean; selectable?: boolean; storage: number };
export type Job = { id: string; owner: string; automatic?: boolean; label: string; amount: number; cpu: string; state: string; error: string; errorCode?: string; errorMessage?: string };
export type Rule = { id: number; item?: Item; label: string; minimum: number; target: number; enabled: boolean; stock?: number; inFlight: number; state: string; error: string; retryIn: number };
export type Rules = { rules: Rule[]; page: number; pages: number; total: number; revision: number; paused: boolean; error: string };
export type Stocks = { items: Item[]; page: number; pages: number; total: number; allTotal: number; revision: number; truncated: boolean; query?: string };
export type Quote = { token: string; sequence: number; label: string; cpus: Cpu[]; maxAmount: number };
export type Telemetry = {
  boot: string; controlEnabled: boolean;
  status: { version: string; uptime: number; automation: boolean; ae2: { online: boolean; itemTypes: number; error: string; truncated: boolean; revision: number };
    clients: { address: string; role: string; age: number }[]; power: { ae2: { supported: boolean; stored: number; capacity: number; injection?: number; usage?: number } } };
  jobs: { cpus: Cpu[]; trackedJobs: Job[]; error: string; craftingError: string };
  rules: Rule[]; rulesRevision: number; paused: boolean;
};
export type Snapshot = { type: "snapshot"; online: boolean; receivedAt: number | null; configured: boolean; controlAllowed: boolean; telemetry: Telemetry | null };
export function list<T>(v: T[] | undefined | null): T[];
export function list<T = unknown>(v: unknown): T[];
export function list(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
