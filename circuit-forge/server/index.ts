import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { circuitSchema, type Circuit } from "../src/engine";
import { mergeEdit } from "../src/protocol";
import { examples } from "../src/examples";
const port = Number(process.env.PORT || 3001);
const allowedOrigin = (origin: string) =>
  [3001, 5173, port].some(
    (p) =>
      origin === `http://127.0.0.1:${p}` || origin === `http://localhost:${p}`,
  );
const root = process.cwd(),
  data = process.env.CIRCUITFORGE_DATA || path.join(root, ".data");
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(path.join(data, "projects.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, project TEXT NOT NULL, revision INTEGER NOT NULL)",
);
db.exec(
  "CREATE TABLE IF NOT EXISTS revisions (project TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project,revision))",
);
const get = (id: string) => {
  const r = db
    .prepare("SELECT revision,body FROM projects WHERE id=?")
    .get(id) as { revision: number; body: string } | undefined;
  return r
    ? { revision: r.revision, circuit: JSON.parse(r.body) as Circuit }
    : undefined;
};
const put = (id: string, revision: number, c: Circuit) => {
  const body = JSON.stringify(c);
  db.prepare("INSERT OR REPLACE INTO projects VALUES (?,?,?)").run(
    id,
    revision,
    body,
  );
  db.prepare("INSERT OR REPLACE INTO revisions VALUES (?,?,?)").run(
    id,
    revision,
    body,
  );
  db.prepare("DELETE FROM revisions WHERE project=? AND revision<?").run(
    id,
    revision - 100,
  );
};
for (const [i, c] of examples.entries())
  if (!get("example-" + i)) put("example-" + i, 0, c);
const app = express();
app.use((req, res, next) => {
  const host = req.headers.host || "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    res.sendStatus(403);
    return;
  }
  const origin = req.headers.origin;
  if (origin && !allowedOrigin(origin)) {
    res.sendStatus(403);
    return;
  }
  next();
});
app.use(express.json({ limit: "512kb" }));
app.get("/api/projects", (_req, res) =>
  res.json(
    db
      .prepare("SELECT id,revision,body FROM projects")
      .all()
      .map((r) => ({
        id: r.id,
        revision: r.revision,
        name: JSON.parse(r.body as string).name,
      })),
  ),
);
app.post("/api/projects", (req, res) => {
  const parsed = circuitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = crypto.randomUUID();
  put(id, 0, parsed.data);
  res.json({ id });
});
app.get("/api/projects/:id", (req, res) => {
  const p = get(req.params.id);
  if (!p) {
    res.sendStatus(404);
    return;
  }
  res.json(p);
});
app.use(express.static(path.join(root, "dist")));
const server = createServer(app),
  wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/sync" || !allowedOrigin(req.headers.origin || "")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});
const peers = new Map<WebSocket, { session: string; project?: string }>();
const send = (ws: WebSocket, m: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
const broadcast = (project: string, m: unknown) => {
  if (process.env.CIRCUITFORGE_DEBUG)
    console.error("broadcast", project, [...peers.values()], m);
  for (const [ws, p] of peers) if (p.project === project) send(ws, m);
};
const message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), project: z.string().max(100) }),
  z.object({
    type: z.literal("replace"),
    op: z.string().uuid(),
    project: z.string().max(100),
    base: z.number().int().nonnegative(),
    circuit: circuitSchema,
  }),
  z.object({
    type: z.literal("presence"),
    selection: z.string().max(100).nullable(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
]);
const presence = (project: string) =>
  broadcast(project, {
    type: "peers",
    sessions: [...peers.values()]
      .filter((p) => p.project === project)
      .map((p) => p.session),
  });
wss.on("connection", (ws) => {
  const peer = {
    session: crypto.randomUUID().slice(0, 8),
    project: undefined as string | undefined,
  };
  if (peers.size >= 32) {
    ws.close(1013, "Local session limit");
    return;
  }
  let rateStart = Date.now(),
    rateCount = 0;
  peers.set(ws, peer);
  send(ws, { type: "session", session: peer.session });
  ws.on("message", (raw) => {
    try {
      if (Date.now() - rateStart >= 1000) {
        rateStart = Date.now();
        rateCount = 0;
      }
      if (++rateCount > 120) {
        ws.close(1008, "Message rate limit");
        return;
      }
      const m = message.parse(JSON.parse(raw.toString()));
      if (process.env.CIRCUITFORGE_DEBUG) console.error("received", m.type);
      if (m.type === "join") {
        const snapshot = get(m.project);
        if (!snapshot) throw Error("Project not found");
        const old = peer.project;
        peer.project = m.project;
        if (old) presence(old);
        send(ws, { type: "snapshot", ...snapshot });
        presence(m.project);
      } else if (m.type === "presence") {
        if (peer.project)
          broadcast(peer.project, { ...m, session: peer.session });
      } else {
        if (peer.project !== m.project)
          throw Error("Join the project before editing");
        const previous = db
          .prepare("SELECT project,revision FROM operations WHERE id=?")
          .get(m.op);
        if (previous) {
          if (previous.project !== m.project)
            throw Error("Operation ID collision");
          send(ws, { type: "ack", op: m.op, revision: previous.revision });
          return;
        }
        const current = get(m.project)!;
        let accepted = m.circuit;
        if (current.revision !== m.base) {
          const row = db
            .prepare(
              "SELECT body FROM revisions WHERE project=? AND revision=?",
            )
            .get(m.project, m.base);
          try {
            if (!row) throw Error("Base revision is no longer retained");
            accepted = mergeEdit(
              JSON.parse(row.body as string),
              current.circuit,
              m.circuit,
            );
          } catch (error) {
            send(ws, {
              type: "conflict",
              message:
                (error as Error).message +
                ". Draft retained; export or reload.",
              ...current,
            });
            return;
          }
        }
        if (process.env.CIRCUITFORGE_DEBUG) console.error("accept", m.project);
        const revision = current.revision + 1;
        db.exec("BEGIN IMMEDIATE");
        try {
          put(m.project, revision, accepted);
          db.prepare("INSERT INTO operations VALUES (?,?,?)").run(
            m.op,
            m.project,
            revision,
          );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        broadcast(m.project, {
          type: "snapshot",
          revision,
          circuit: accepted,
          op: m.op,
          session: peer.session,
        });
      }
    } catch (e) {
      if (process.env.CIRCUITFORGE_DEBUG) console.error(e);
      send(ws, {
        type: "error",
        message: e instanceof Error ? e.message : "Invalid message",
      });
    }
  });
  ws.on("close", () => {
    peers.delete(ws);
    if (peer.project) presence(peer.project);
  });
});
server.listen(port, "127.0.0.1", () =>
  console.log(`CircuitForge http://127.0.0.1:${port}`),
);
