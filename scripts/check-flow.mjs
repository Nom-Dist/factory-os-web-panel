import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHub } from "../bridge/hub.mjs";
import { hashPassword } from "../bridge/password.mjs";

const panelRoot = fileURLToPath(new URL("../", import.meta.url));
const candidates = process.env.FACTORYOS_ROOT ? [resolve(process.env.FACTORYOS_ROOT)] : [dirname(panelRoot), resolve(panelRoot, "../factory-os")];
const factoryRoot = candidates.find(root => existsSync(resolve(root, "tests/web_interop.py")) && existsSync(resolve(root, "src/server/web.lua")));
if (!factoryRoot) {
  console.error("Integration test requires the FactoryOS v0.6.2 source checkout and Lupa. Set FACTORYOS_ROOT to that checkout. npm test runs the standalone relay tests.");
  process.exit(2);
}
for (const [architecture, planFailure] of [["52", false], ["53", false], ["52", true], ["53", true]]) {
  let hub, child;
  const server = http.createServer((req, res) => hub.handle(req, res));
  server.on("upgrade", (req, socket, head) => hub.upgrade(req, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const bridgeToken = randomBytes(32).toString("hex"), panelToken = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("hex");
  hub = createHub({ bridgeToken, panelToken, passwordHash: await hashPassword(password), origin: base, commandMs: 5000 });
  try {
    child = spawn("python", [resolve(factoryRoot, "tests/web_interop.py")], { env: { ...process.env, TEST_LUA: architecture, TEST_PLAN_FAILURE: planFailure ? "1" : "0", TEST_PORT: String(port), TEST_BRIDGE_TOKEN: bridgeToken }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", stderr = ""; child.stdout.on("data", x => output += x.toString()); child.stderr.on("data", x => stderr += x.toString());
    const exited = once(child, "exit");
    const deadline = Date.now() + 8000;
    while (!hub.snapshot().online && Date.now() < deadline && child.exitCode === null) await new Promise(r => setTimeout(r, 20));
    assert.equal(hub.snapshot().online, true, stderr || "Lua device did not connect");
    const login = await fetch(base + "/bridge/session", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie").split(";")[0];
    async function rpc(command, args) {
      const res = await fetch(base + "/bridge/command", { method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ command, args }) });
      const result = await res.json(); assert.equal(result.ok, true, result.error); return result.data;
    }
    const stock = await rpc("GET_AE2_STOCKS", {}); assert.equal(stock.items[0].label, "Interop Alloy (mock device)");
    const quote = await rpc("GET_CRAFT_OPTIONS", { item: stock.items[0] }); assert.equal(quote.sequence, 1);
    const args = { token: quote.token, sequence: quote.sequence, amount: 3, cpu: "" };
    const first = await rpc("START_CRAFT", args), duplicate = await rpc("START_CRAFT", args);
    assert.equal(first.id, duplicate.id); assert.equal(first.state, "computing");
    if (planFailure) {
      let job; const until = Date.now() + 2500;
      do {
        const data = await rpc("GET_CRAFTING_JOBS", {}); job = data.trackedJobs.find(j => j.id === first.id);
        if (job?.state === "failed") break;
        await new Promise(r => setTimeout(r, 100));
      } while (Date.now() < until);
      assert.equal(job?.state, "failed"); assert.equal(job.errorCode, "AE2_REJECTED");
      assert.equal(job.error, "request failed (missing resources?)"); assert.match(job.errorMessage, /olabilir/);
    }
    const [code] = await exited; assert.equal(code, 0, stderr);
    const report = JSON.parse(output.trim().split("\n").at(-1));
    assert.equal(report.nativeRequests, 1); assert.equal(report.durable, true);
    console.log(`PASS Lua ${architecture} → real TCP/WebSocket → Node relay → authenticated RPC → ${planFailure ? "planning failure + readable reason" : "durable crafting"}; duplicate START = 1 native request`);
  } finally {
    child?.kill(); hub.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  }
}
