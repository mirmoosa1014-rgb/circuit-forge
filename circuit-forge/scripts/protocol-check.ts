import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { examples } from "../src/examples";
const storage = mkdtempSync(path.join(tmpdir(), "circuit-protocol-"));
let server: ChildProcess | undefined;
const clients: Client[] = [];
let counter = 0;
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: "3002", CIRCUITFORGE_DATA: storage },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr?.on("data", (data) => process.stderr.write(data));
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Server startup timeout")),
      10000,
    );
    server!.once("error", reject);
    server!.stdout!.on("data", (data) => {
      if (String(data).includes("http://127.0.0.1:3002")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    server!.once("exit", () => resolve());
    server!.kill("SIGTERM");
  });
}
class Client {
  ws: WebSocket;
  queue: any[] = [];
  notify?: () => void;
  constructor() {
    this.ws = new WebSocket("ws://127.0.0.1:3002/sync", {
      origin: "http://127.0.0.1:3001",
    });
    this.ws.on("message", (raw) => {
      this.queue.push(JSON.parse(raw.toString()));
      this.notify?.();
    });
    clients.push(this);
  }
  async wait(type: string) {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const i = this.queue.findIndex((m) => m.type === type);
      if (i >= 0) return this.queue.splice(i, 1)[0];
      await new Promise<void>((resolve) => {
        this.notify = resolve;
        setTimeout(resolve, 20);
      });
    }
    throw Error(
      "Timed out waiting for " + type + ": " + JSON.stringify(this.queue),
    );
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  async join(project: string) {
    await this.wait("session");
    this.send({ type: "join", project });
    return this.wait("snapshot");
  }
}
const assert = (condition: unknown, msg: string) => {
  if (!condition) throw Error(msg);
};
try {
  await start();
  const a = new Client(),
    b = new Client();
  const [one, two] = await Promise.all([
    a.join("example-0"),
    b.join("example-0"),
  ]);
  assert(one.revision === 0 && two.revision === 0, "Fresh revision");
  const base = examples[0],
    left = structuredClone(base),
    right = structuredClone(base);
  left.nodes[0].label = "LEFT";
  right.nodes[1].label = "RIGHT";
  const op = crypto.randomUUID();
  a.send({ type: "replace", project: "example-0", base: 0, op, circuit: left });
  b.send({
    type: "replace",
    project: "example-0",
    base: 0,
    op: crypto.randomUUID(),
    circuit: right,
  });
  let final: any;
  for (let i = 0; i < 2; i++) final = await a.wait("snapshot");
  assert(
    final.revision === 2,
    "Concurrent nonconflicting revisions serialized",
  );
  assert(
    final.circuit.nodes[0].label === "LEFT" &&
      final.circuit.nodes[1].label === "RIGHT",
    "Nonconflicting edits merged",
  );
  a.send({ type: "replace", project: "example-0", base: 0, op, circuit: left });
  const ack = await a.wait("ack");
  assert(ack.revision === 1, "Duplicate retry idempotent");
  const conflict = structuredClone(base);
  conflict.nodes[0].label = "CONFLICT";
  a.send({
    type: "replace",
    project: "example-0",
    base: 0,
    op: crypto.randomUUID(),
    circuit: conflict,
  });
  await a.wait("conflict");
  a.send({ type: "unknown" });
  await a.wait("error");
  a.ws.close();
  b.ws.close();
  const c = new Client();
  const snapshot = await c.join("example-0");
  assert(snapshot.revision === 2, "Reconnect snapshot");
  const observer = new Client();
  await observer.join("example-0");
  const samples: number[] = [];
  let current = snapshot;
  for (let i = 0; i < 12; i++) {
    const next = structuredClone(current.circuit);
    next.name = "Latency " + i;
    const t = performance.now();
    c.send({
      type: "replace",
      project: "example-0",
      base: current.revision,
      op: crypto.randomUUID(),
      circuit: next,
    });
    current = await c.wait("snapshot");
    samples.push(performance.now() - t);
    counter++;
  }
  c.ws.close();
  observer.ws.close();
  await stop();
  await start();
  const d = new Client();
  const recovered = await d.join("example-0");
  assert(recovered.revision === 2 + counter, "Restart revision persisted");
  assert(recovered.circuit.name === "Latency 11", "Restart content persisted");
  await new Promise<void>((resolve, reject) => {
    const bad = new WebSocket("ws://127.0.0.1:3002/sync", {
      origin: "https://untrusted.example",
    });
    bad.once("error", () => resolve());
    bad.once("open", () => {
      bad.close();
      reject(Error("Unexpected origin accepted"));
    });
  });
  const sorted = [...samples].sort((a, b) => a - b);
  const result = {
    passed: true,
    checks: [
      "two genuine WebSocket clients",
      "concurrent nonconflicting edits",
      "same-object conflict",
      "duplicate operation retry",
      "malformed operation rejected",
      "reconnect snapshot",
      "SQLite server restart recovery",
      "unexpected origin rejected",
    ],
    latency: {
      condition:
        "localhost, Node WebSocket clients, SQLite WAL commit + accepted operation round-trip; 12 sequential edits, 2 connected clients, 1 active sender for latency",
      samples_ms: samples,
      median_ms: sorted[6],
      p95_ms: sorted[11],
    },
  };
  writeFileSync("results/collaboration.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  clients.forEach((c) => c.ws.close());
  await stop();
  rmSync(storage, { recursive: true, force: true });
}
