// Byte-for-byte FactoryOS data-only codec. No Lua/JavaScript evaluation.
export function decode(input) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (data.length > 65536) throw new Error("payload_limit");
  let at = 0, nodes = 0;
  function length() {
    const end = data.indexOf(58, at);
    if (end < at || end - at > 6) throw new Error("invalid_length");
    const digits = data.toString("ascii", at, end);
    if (!/^\d+$/.test(digits) || Number(digits) > 65536) throw new Error("invalid_length");
    at = end + 1; return Number(digits);
  }
  function value(depth) {
    if (++nodes > 16000 || depth > 12) throw new Error("complexity_limit");
    const tag = data[at++];
    if (tag === 122) return null;
    if (tag === 116) return true;
    if (tag === 102) return false;
    if (tag === 115 || tag === 110) {
      const n = length(); if (at + n > data.length) throw new Error("truncated_value");
      const text = data.toString("utf8", at, at + n); at += n;
      if (tag === 115) return text;
      if (!/^[\d.+\-eE]+$/.test(text) || !Number.isFinite(Number(text))) throw new Error("invalid_number");
      return Number(text);
    }
    if (tag !== 109) throw new Error("invalid_tag");
    const n = length(); if (n > 4000) throw new Error("map_limit");
    const out = Object.create(null); const keys = new Set(); let isArray = n > 0;
    for (let i = 0; i < n; i++) {
      const k = value(depth + 1), v = value(depth + 1);
      if (!["string", "number"].includes(typeof k) || v === null || keys.has(String(k))) throw new Error("invalid_key");
      if (k === "__proto__" || k === "constructor" || k === "prototype") throw new Error("unsafe_key");
      keys.add(String(k)); out[k] = v; isArray &&= Number.isInteger(k) && k >= 1 && k <= n;
    }
    return isArray ? Array.from({ length: n }, (_, i) => out[i + 1]) : out;
  }
  const result = value(0); if (at !== data.length) throw new Error("trailing_bytes"); return result;
}
export function encode(input) {
  let nodes = 0; const seen = new Set();
  function value(v, depth) {
    if (++nodes > 16000 || depth > 12) throw new Error("complexity_limit");
    if (v == null) return "z";
    if (typeof v === "boolean") return v ? "t" : "f";
    if (typeof v === "string") return `s${Buffer.byteLength(v)}:${v}`;
    if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("invalid_number"); const s = String(v); return `n${s.length}:${s}`; }
    if (typeof v !== "object" || seen.has(v)) throw new Error("invalid_value");
    seen.add(v);
    const pairs = Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [value(Array.isArray(v) ? Number(k) + 1 : k, depth + 1), x]);
    pairs.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const out = `m${pairs.length}:` + pairs.map(([k, x]) => k + value(x, depth + 1)).join("");
    seen.delete(v); return out;
  }
  const result = value(input, 0); if (Buffer.byteLength(result) > 65536) throw new Error("payload_limit"); return result;
}
export const array = (v) => Array.isArray(v) ? v : [];
