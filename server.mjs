import http from "node:http";
import next from "next";
import { createHub } from "./bridge/hub.mjs";

const dev = process.argv.includes("--dev");
process.env.NODE_ENV = dev ? "development" : "production";
const hostname = process.env.HOST || "127.0.0.1", port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
await app.prepare();
const hub = createHub({ bridgeToken: process.env.BRIDGE_TOKEN, panelToken: process.env.PANEL_TOKEN, passwordHash: process.env.PANEL_PASSWORD_HASH, origin: process.env.PUBLIC_ORIGIN });
const handle = app.getRequestHandler(), upgrade = app.getUpgradeHandler();
const server = http.createServer(async (req, res) => {
  if (await hub.handle(req, res)) return;
  const path = new URL(req.url, "http://local").pathname;
  if (path !== "/login" && !path.startsWith("/_next/") && path !== "/favicon.ico" && !hub.authenticated(req)) {
    res.writeHead(303, { Location: "/login", "Cache-Control": "no-store" }); res.end(); return;
  }
  handle(req, res);
});
server.on("upgrade", (req, socket, head) => { if (!hub.upgrade(req, socket, head)) upgrade(req, socket, head); });
server.listen(port, hostname, () => console.log(`FactoryOS panel: http://${hostname}:${port} (${dev ? "development" : "production"})`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  hub.close(); server.close(); app.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});
