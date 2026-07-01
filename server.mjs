import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(rootDir, "data", "state.json");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function ensureStateFile() {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  try {
    await fs.access(statePath);
  } catch {
    await fs.writeFile(statePath, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), settings: null, snapshots: [] }, null, 2));
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = decoded === "/" ? "/app/index.html" : decoded;
  const resolved = path.resolve(rootDir, `.${clean}`);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

await ensureStateFile();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/api/state" && request.method === "GET") {
      const state = JSON.parse(await fs.readFile(statePath, "utf8"));
      await sendJson(response, 200, state);
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      const body = await readBody(request);
      const incoming = JSON.parse(body || "{}");
      const state = {
        version: 1,
        updatedAt: new Date().toISOString(),
        settings: incoming.settings ?? null,
        holdings: Array.isArray(incoming.holdings) ? incoming.holdings : [],
        lastUploaded: incoming.lastUploaded ?? null,
        snapshots: Array.isArray(incoming.snapshots) ? incoming.snapshots : [],
      };
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
      await sendJson(response, 200, { ok: true, updatedAt: state.updatedAt });
      return;
    }

    const targetPath = safePath(url.pathname);
    if (!targetPath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const data = await fs.readFile(targetPath);
    const ext = path.extname(targetPath);
    response.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
    });
    response.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack || String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio monitor: http://127.0.0.1:${port}/app/index.html`);
  console.log(`State file: ${statePath}`);
});
