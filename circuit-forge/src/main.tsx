import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
  type Node,
  type Edge,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import {
  circuitSchema,
  kinds,
  ports,
  outputs,
  compile,
  flatten,
  type Circuit,
  type Part,
  type Values,
} from "./engine";
import { examples } from "./examples";
import { createReplay } from "./replay";
import { csv, vcd, verilog, verilogTestbench, type Frame } from "./formats";
function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
type Data = { part: Part; value?: number; circuit: Circuit };
function Gate({ data, selected }: NodeProps<Node<Data>>) {
  const n = data.part;
  return (
    <div
      className={"gate " + (selected ? "selected " : "") + n.kind.toLowerCase()}
      style={{
        height: Math.max(
          94,
          Math.max(
            Object.keys(ports(n, data.circuit)).length,
            Object.keys(outputs(n, data.circuit)).length,
          ) * 15,
        ),
      }}
    >
      <div className="gate-kind">
        {n.kind}
        <span>{n.width}b</span>
      </div>
      <strong>{n.label}</strong>
      <div className="gate-value">
        {data.value === undefined
          ? "—"
          : data.value.toString(2).padStart(n.width, "0")}
        <small>{data.value === undefined ? "" : ` = ${data.value}`}</small>
      </div>
      {Object.keys(ports(n, data.circuit)).map((p, i, a) => (
        <Handle
          key={p}
          type="target"
          position={Position.Left}
          id={p}
          style={{ top: `${((i + 1) / (a.length + 1)) * 100}%` }}
        >
          <span className="port-label">{p}</span>
        </Handle>
      ))}
      {Object.keys(outputs(n, data.circuit)).map((p, i, a) => (
        <Handle
          key={p}
          type="source"
          position={Position.Right}
          id={p}
          style={{ top: `${((i + 1) / (a.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}
const nodeTypes = { gate: Gate };
function App() {
  const [c, setC] = useState<Circuit>(examples[0]),
    [project, setProject] = useState("example-0"),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [revision, setRevision] = useState(0),
    [connected, setConnected] = useState(false),
    [pending, setPending] = useState(false),
    [peers, setPeers] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [selectedWires, setSelectedWires] = useState<string[]>([]),
    [inputs, setInputs] = useState<Values>({}),
    [values, setValues] = useState<Values>({}),
    [state, setState] = useState<Values>({}),
    [trace, setTrace] = useState<Frame[]>([]),
    [tick, setTick] = useState(0),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(3),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(
      "Ready. Choose an example, or build a circuit.",
    ),
    [result, setResult] = useState<any>(null),
    [optimized, setOptimized] = useState<Circuit | null>(null),
    [other, setOther] = useState("6"),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState(0),
    [windowSize, setWindowSize] = useState(40),
    [pan, setPan] = useState(0),
    [history, setHistory] = useState<Circuit[]>([]),
    [redo, setRedo] = useState<Circuit[]>([]),
    [conflict, setConflict] = useState(false);
  // React Flow fitView requires measurements to survive controlled node renders.
  const [nodeMeasurements, setNodeMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [remotePresence, setRemotePresence] = useState<
    Record<string, { x: number; y: number; selection: string | null }>
  >({});
  const presenceAt = useRef(0),
    canvasRef = useRef<HTMLDivElement>(null);
  const recordingInitialState = useRef<Values>({});
  const simulationEpoch = useRef(0),
    edgePending = useRef(false);
  const replaySteps = useRef<{ inputs: Values; edge: boolean }[]>([]);
  const lastSaved = useRef(c);
  const session = useRef("");
  const sock = useRef<WebSocket | null>(null),
    worker = useRef<Worker | null>(null),
    request = useRef(0),
    callbacks = useRef(
      new Map<
        number,
        { resolve: (x: any) => void; reject: (x: any) => void }
      >(),
    ),
    latest = useRef({ c, revision, pending, conflict }),
    clipboard = useRef<Part[]>([]);
  latest.current = { c, revision, pending, conflict };
  const flow = useReactFlow();
  const refresh = () =>
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => setMessage("Local server unavailable. Start npm run dev."));
  const startWorker = useCallback(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      const cb = callbacks.current.get(e.data.id);
      callbacks.current.delete(e.data.id);
      if (e.data.error) cb?.reject(Error(e.data.error));
      else cb?.resolve(e.data.result);
    };
    return w;
  }, []);
  useEffect(() => {
    refresh();
    const w = startWorker();
    return () => w.terminate();
  }, [startWorker]);
  const job = useCallback(
    (job: string, extra: object = {}) =>
      new Promise<any>((resolve, reject) => {
        const id = ++request.current;
        callbacks.current.set(id, { resolve, reject });
        worker.current?.postMessage({
          id,
          job,
          circuit: latest.current.c,
          ...extra,
        });
      }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/sync`,
      );
      sock.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        ws.send(JSON.stringify({ type: "join", project }));
      };
      ws.onmessage = (e) => {
        if (disposed) return;
        const m = JSON.parse(e.data);
        if (m.type === "session") {
          session.current = m.session;
        } else if (m.type === "snapshot") {
          setConnected(true);
          if (latest.current.conflict) return;
          if (latest.current.pending && m.session !== session.current) {
            setHistory([]);
            setRedo([]);
            return;
          }
          simulationEpoch.current++;
          replaySteps.current = [];
          recordingInitialState.current = {};
          setProjects((list) =>
            list.map((p) =>
              p.id === project ? { ...p, name: m.circuit.name } : p,
            ),
          );
          lastSaved.current = m.circuit;
          setC(m.circuit);
          setRevision(m.revision);
          setPending(false);
          setMessage(`Saved locally · revision ${m.revision}`);
          if (!m.op || m.session !== session.current) {
            setHistory([]);
            setRedo([]);
          }
          setInputs({});
          setState({});
          setTrace([]);
          setTick(0);
        } else if (m.type === "peers") setPeers(m.sessions);
        else if (m.type === "presence" && m.session !== session.current) {
          setRemotePresence((p) => ({ ...p, [m.session]: m }));
        } else if (m.type === "conflict") {
          setConflict(true);
          setPending(false);
          setMessage(m.message);
        } else if (m.type === "error") {
          setPending(false);
          setMessage(m.message);
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setRunning(false);
        if (latest.current.pending) {
          setConflict(true);
          setPending(false);
          setMessage(
            "Disconnected with an unacknowledged edit. Draft retained. Export it or reload.",
          );
        }
        if (!disposed) timer = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      sock.current?.close();
    };
  }, [project]);
  useEffect(() => {
    if (!connected) return;
    setSelected([]);
    setSelectedWires([]);
    const t = setTimeout(() => flow.fitView({ padding: 0.18 }), 150);
    return () => clearTimeout(t);
  }, [project, connected]);
  const edit = (next: Circuit, record = true) => {
    if (!connected || pending || conflict) {
      setMessage(
        "Editing paused: reconnect, wait for save, or reload the conflicted draft.",
      );
      return;
    }
    if (record) {
      setHistory((h) => [...h.slice(-49), lastSaved.current]);
      setRedo([]);
    }
    setRunning(false);
    setC(next);
    setPending(true);
    sock.current?.send(
      JSON.stringify({
        type: "replace",
        op: crypto.randomUUID(),
        project,
        base: revision,
        circuit: next,
      }),
    );
  };
  const validation = useMemo(() => {
    try {
      compile(c);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, [c]);
  useEffect(() => {
    if (validation) {
      setValues({});
      return;
    }
    let stale = false;
    job("evaluate", { inputs, state })
      .then((r) => {
        if (!stale) setValues(r.values);
      })
      .catch((e) => setMessage(e.message));
    return () => {
      stale = true;
    };
  }, [c, inputs, state, validation]);
  async function step() {
    if (edgePending.current) return;
    if (tick >= 10000) {
      setRunning(false);
      setMessage("Reset to start a new bounded 10,000-edge run.");
      return;
    }
    edgePending.current = true;
    const epoch = simulationEpoch.current;
    try {
      const r = await job("step", { inputs, state });
      if (epoch !== simulationEpoch.current) return;
      replaySteps.current.push({ inputs: { ...inputs }, edge: true });
      setState(r.state);
      setValues(r.values);
      setTick(tick + 1);
      setTrace((t) => [...t.slice(-255), { tick: tick + 1, values: r.values }]);
      setCursor(tick + 1);
      if (tick >= 9999) {
        setRunning(false);
        setMessage("Stopped at the 10,000-edge run bound.");
      }
    } catch (e) {
      setRunning(false);
      setMessage((e as Error).message);
    } finally {
      edgePending.current = false;
    }
  }
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(step, 1000 / speed);
    return () => clearTimeout(t);
  }, [running, tick, speed, state, inputs]);
  async function action(name: string, extra: object = {}) {
    setBusy(true);
    setResult(null);
    try {
      const r = await job(name, extra);
      setResult(r);
      if (name === "optimize") setOptimized(r.circuit);
      if (name === "testbench" || name === "replay") {
        simulationEpoch.current++;
        setRunning(false);
        const frames: Frame[] = r.trace.map((frame: Frame) => ({
          ...frame,
          tick: frame.tick + (name === "testbench" ? 1 : 0),
        }));
        setTrace(frames.slice(-256));
        setTick(frames.at(-1)?.tick || 0);
        setCursor(frames.at(-1)?.tick || 0);
        setState(r.state);
        setInputs(r.inputs);
        setValues(frames.at(-1)?.values || {});
        replaySteps.current = r.events;
        recordingInitialState.current = r.initialState || {};
        if (r.signal) setSelected([r.signal]);
        setMessage(
          r.passed
            ? name === "replay"
              ? "Replay reproduced successfully"
              : "Testbench passed"
            : `Failed at tick ${r.tick}: ${r.signal}, expected ${r.expected}, got ${r.observed}`,
        );
      }
      if (name === "compare" && r.counterexample) {
        setInputs(r.counterexample.inputs);
        setSelected(
          c.nodes
            .filter((n) => n.label === r.counterexample.output)
            .map((n) => n.id),
        );
        setMessage(
          `Counterexample loaded: ${r.counterexample.output}, left ${r.counterexample.expected}, right ${r.counterexample.actual}. Right inputs: ${JSON.stringify(r.counterexample.rightInputs)}`,
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(next: Circuit) {
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw Error("Project creation rejected");
      const p = await r.json();
      setConflict(false);
      setConnected(false);
      setProject(p.id);
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const add = (
    kind: Part["kind"],
    position = {
      x: 100 + (c.nodes.length % 4) * 220,
      y: 100 + Math.floor(c.nodes.length / 4) * 140,
    },
  ) =>
    edit({
      ...c,
      nodes: [
        ...c.nodes,
        {
          id: "n" + crypto.randomUUID().replaceAll("-", ""),
          kind,
          label: kind,
          width: 1,
          value: 0,
          ...position,
        },
      ],
    });
  const remove = () =>
    edit({
      ...c,
      nodes: c.nodes.filter((n) => !selected.includes(n.id)),
      wires: c.wires.filter(
        (w) => !selected.includes(w.from) && !selected.includes(w.to),
      ),
    });
  const paste = () => {
    const ids = new Map(
      clipboard.current.map((n) => [
        n.id,
        "n" + crypto.randomUUID().replaceAll("-", ""),
      ]),
    );
    edit({
      ...c,
      nodes: [
        ...c.nodes,
        ...clipboard.current.map((n) => ({
          ...n,
          id: ids.get(n.id)!,
          x: n.x + 40,
          y: n.y + 40,
        })),
      ],
      wires: [
        ...c.wires,
        ...c.wires
          .filter((w) => ids.has(w.from) && ids.has(w.to))
          .map((w) => ({
            ...w,
            id: crypto.randomUUID(),
            from: ids.get(w.from)!,
            to: ids.get(w.to)!,
          })),
      ],
    });
  };
  const insertModule = () => {
    const source = examples[+other],
      key = "module_" + crypto.randomUUID().replaceAll("-", "");
    const definitions = { ...c.definitions };
    const renamed = structuredClone(source);
    for (const [old, def] of Object.entries(source.definitions || {})) {
      const copy = structuredClone(def);
      for (const n of copy.nodes)
        if (n.definition) n.definition = key + "_" + n.definition;
      definitions[key + "_" + old] = copy;
    }
    for (const n of renamed.nodes)
      if (n.definition) n.definition = key + "_" + n.definition;
    delete renamed.definitions;
    definitions[key] = renamed;
    edit({
      ...c,
      definitions,
      nodes: [
        ...c.nodes,
        {
          id: "s" + crypto.randomUUID().replaceAll("-", ""),
          kind: "SUBCIRCUIT",
          definition: key,
          label: source.name,
          width: 1,
          value: 0,
          x: 200,
          y: 200,
        },
      ],
    });
  };
  const nodes = useMemo<Node<Data>[]>(
    () =>
      c.nodes.map((n) => ({
        id: n.id,
        type: "gate",
        width: 144,
        height: Math.max(
          94,
          Math.max(
            Object.keys(ports(n, c)).length,
            Object.keys(outputs(n, c)).length,
          ) * 15,
        ),
        measured: nodeMeasurements[n.id],
        position: { x: n.x, y: n.y },
        data: { part: n, value: values[n.id], circuit: c },
        selected: selected.includes(n.id),
      })),
    [c, values, selected, nodeMeasurements],
  );
  const edges = useMemo<Edge[]>(
    () =>
      c.wires.map((w) => ({
        id: w.id,
        source: w.from,
        target: w.to,
        sourceHandle: w.port,
        targetHandle: w.input,
        animated: false,
        selected: selectedWires.includes(w.id),
        style: {
          stroke: (
            w.port === "out"
              ? values[w.from]
              : (values[w.from] >>> Number(w.port.slice(1))) & 1
          )
            ? "#47dec1"
            : "#526078",
          strokeWidth: 2,
        },
        label:
          selected.includes(w.from) || selectedWires.includes(w.id)
            ? String(
                values[w.from] === undefined
                  ? ""
                  : w.port === "out"
                    ? values[w.from]
                    : (values[w.from] >>> Number(w.port.slice(1))) & 1,
              )
            : undefined,
      })),
    [c, values, selected, selectedWires],
  );
  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) =>
      setSelected((prev) => {
        const next = nodes.map((n) => n.id);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      }),
    [],
  );
  const part = c.nodes.find((n) => n.id === selected[0]);
  const enabled = connected && !pending && !conflict;
  const visibleTrace = trace.slice(
    Math.max(0, trace.length - windowSize - pan),
    Math.max(0, trace.length - pan),
  );
  const inspected = trace.find((t) => t.tick === cursor)?.values || values;
  return (
    <div
      className="app"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,select,textarea")) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
          clipboard.current = c.nodes.filter((n) => selected.includes(n.id));
          e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
          paste();
          e.preventDefault();
        }
      }}
      tabIndex={-1}
    >
      <header>
        <div className="brand">
          <b>▧</b>
          <span>
            CircuitForge<small>DIGITAL LOGIC STUDIO</small>
          </span>
        </div>
        <select
          aria-label="Project"
          disabled={pending}
          value={project}
          onChange={(e) => {
            setConflict(false);
            setConnected(false);
            setProject(e.target.value);
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="save">
          {pending
            ? "Saving…"
            : `r${revision} · ${connected ? "Saved locally" : "Disconnected"}`}
        </span>
        <div className="grow" />
        <span className="connection">
          ● {peers.length} local client{peers.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() =>
            create({
              version: 1,
              name: "Untitled circuit",
              nodes: [],
              wires: [],
            })
          }
        >
          ＋ Create circuit
        </button>
      </header>
      <div className="toolbar">
        <button
          disabled={!enabled}
          onClick={() => create({ ...c, name: c.name.slice(0, 95) + " copy" })}
        >
          Duplicate
        </button>
        <button
          onClick={() => download("circuit.json", JSON.stringify(c, null, 2))}
        >
          Export JSON
        </button>
        <label className="button">
          Import
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 512000) throw Error("Import exceeds 512 KB");
                await create(circuitSchema.parse(JSON.parse(await f.text())));
              } catch (err) {
                setMessage((err as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
        <button
          disabled={!enabled || !history.length}
          onClick={() => {
            setRedo((r) => [...r, c]);
            const prev = history.at(-1)!;
            setHistory((h) => h.slice(0, -1));
            edit(prev, false);
          }}
        >
          Undo
        </button>
        <button
          disabled={!enabled || !redo.length}
          onClick={() => {
            setHistory((h) => [...h, c]);
            const next = redo.at(-1)!;
            setRedo((r) => r.slice(0, -1));
            edit(next, false);
          }}
        >
          Redo
        </button>
        <div className="grow" />
        <span>LOCAL SIMULATION · REV {revision}</span>
        <button
          onClick={() => {
            setRunning(false);
            simulationEpoch.current++;
            replaySteps.current = [];
            recordingInitialState.current = {};
            setState({});
            setTick(0);
            setTrace([]);
          }}
        >
          Reset
        </button>
        <button disabled={!!validation || busy} onClick={step}>
          Single edge
        </button>
        <button
          className="primary"
          disabled={!!validation || busy}
          onClick={() => setRunning(!running)}
        >
          {running ? "Ⅱ Pause" : "▶ Run"}
        </button>
        <select
          aria-label="Simulation speed"
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        >
          {[1, 3, 10, 30].map((s) => (
            <option key={s} value={s}>
              {s} ticks/s
            </option>
          ))}
        </select>
      </div>
      <main>
        <aside className="palette">
          <h3>COMPONENTS</h3>
          <input
            placeholder="Search components"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p>Drag onto the canvas</p>
          <div className="palette-list">
            {kinds
              .filter(
                (k) => k !== "SUBCIRCUIT" && k.includes(query.toUpperCase()),
              )
              .map((k) => (
                <button
                  key={k}
                  aria-label={"Add " + k}
                  draggable={enabled}
                  disabled={!enabled}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/circuit-kind", k)
                  }
                  onClick={() => add(k)}
                >
                  <span>{k === "REG" ? "▣" : k === "INPUT" ? "◉" : "◇"}</span>
                  {k}
                </button>
              ))}
          </div>
          <div className="model-note">
            <b>Binary · synchronous · zero delay</b>
            <p>
              Logical behavior only. No analog or physical timing simulation.
            </p>
          </div>
        </aside>
        <section className="workspace">
          <div
            className="canvas"
            ref={canvasRef}
            onMouseMove={(e) => {
              if (!connected || Date.now() - presenceAt.current < 100) return;
              presenceAt.current = Date.now();
              const point = flow.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              });
              sock.current?.send(
                JSON.stringify({
                  type: "presence",
                  selection: selected[0] || null,
                  ...point,
                }),
              );
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const k = e.dataTransfer.getData("application/circuit-kind");
              if (kinds.includes(k as any))
                add(
                  k as Part["kind"],
                  flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                );
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              multiSelectionKeyCode={["Shift", "Control", "Meta"]}
              onSelectionChange={onSelectionChange}
              onNodesChange={(changes) => {
                const dimensions = changes.filter(
                  (change) => change.type === "dimensions",
                );
                if (dimensions.length)
                  setNodeMeasurements((previous) => {
                    let next = previous;
                    for (const change of dimensions) {
                      const size = change.dimensions;
                      if (!size) continue;
                      const old = previous[change.id];
                      if (
                        !old ||
                        old.width !== size.width ||
                        old.height !== size.height
                      ) {
                        if (next === previous) next = { ...previous };
                        next[change.id] = {
                          width: size.width,
                          height: size.height,
                        };
                      }
                    }
                    return next;
                  });
                const selections = changes.filter((ch) => ch.type === "select");
                if (selections.length)
                  setSelected((prev) => {
                    const ids = new Set(prev);
                    for (const change of selections) {
                      if (change.selected) ids.add(change.id);
                      else ids.delete(change.id);
                    }
                    const next = [...ids];
                    return JSON.stringify(prev) === JSON.stringify(next)
                      ? prev
                      : next;
                  });
                const moved = changes.filter((ch) => ch.type === "position");
                if (moved.length) {
                  const updated = applyNodeChanges(moved, nodes);
                  setC({
                    ...c,
                    nodes: c.nodes.map((n) => ({
                      ...n,
                      x: updated.find((x) => x.id === n.id)!.position.x,
                      y: updated.find((x) => x.id === n.id)!.position.y,
                    })),
                  });
                }
              }}
              onNodeDragStop={(_, node) =>
                edit({
                  ...c,
                  nodes: c.nodes.map((n) =>
                    n.id === node.id
                      ? { ...n, x: node.position.x, y: node.position.y }
                      : n,
                  ),
                })
              }
              nodesDraggable={enabled}
              nodesConnectable={enabled}
              onConnect={(connection) =>
                edit({
                  ...c,
                  wires: [
                    ...c.wires,
                    {
                      id: crypto.randomUUID(),
                      from: connection.source,
                      to: connection.target,
                      port: connection.sourceHandle || "out",
                      input: connection.targetHandle || "a",
                    },
                  ],
                })
              }
              onEdgesChange={(changes) => {
                const updates = changes.filter(
                  (change) => change.type === "select",
                );
                if (updates.length)
                  setSelectedWires((previous) => {
                    const ids = new Set(previous);
                    for (const change of updates) {
                      if (change.selected) ids.add(change.id);
                      else ids.delete(change.id);
                    }
                    return [...ids];
                  });
              }}
              deleteKeyCode={["Backspace", "Delete"]}
              onDelete={({ nodes: removed, edges: removedEdges }) =>
                edit({
                  ...c,
                  nodes: c.nodes.filter(
                    (n) => !removed.some((x) => x.id === n.id),
                  ),
                  wires: c.wires.filter(
                    (w) =>
                      !removedEdges.some((e) => e.id === w.id) &&
                      !removed.some((n) => n.id === w.from || n.id === w.to),
                  ),
                })
              }
            >
              <Background color="#28344a" gap={24} />
              <Controls />
            </ReactFlow>
            {Object.entries(remotePresence)
              .filter(([id]) => peers.includes(id))
              .map(([id, p]) => {
                const point = flow.flowToScreenPosition(p),
                  rect = canvasRef.current?.getBoundingClientRect();
                return (
                  <div
                    key={id}
                    className="remote-cursor"
                    style={{
                      left: point.x - (rect?.x || 0),
                      top: point.y - (rect?.y || 0),
                    }}
                  >
                    ↖{" "}
                    <span>
                      {id}
                      {p.selection ? " · " + p.selection : ""}
                    </span>
                  </div>
                );
              })}
            <div className="canvas-label">
              {c.name}
              <small>
                {c.nodes.length} components · {c.wires.length} wires
              </small>
            </div>
          </div>
          <div className="waves">
            <div className="panel-title">
              <h3>SIGNAL TIMELINE</h3>
              <span>
                tick {tick} · retained {trace.length}/256
              </span>
              <div className="grow" />
              <button onClick={() => download("trace.csv", csv(trace, c))}>
                CSV
              </button>
              <button onClick={() => download("trace.vcd", vcd(trace, c))}>
                VCD
              </button>
              <select
                aria-label="Waveform range"
                value={windowSize}
                onChange={(e) => setWindowSize(+e.target.value)}
              >
                {[10, 40, 100, 256].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="replay-tools">
              <button
                onClick={async () =>
                  download(
                    "replay.json",
                    JSON.stringify(
                      await createReplay(
                        c,
                        replaySteps.current,
                        recordingInitialState.current,
                      ),
                      null,
                      2,
                    ),
                  )
                }
              >
                Export replay
              </button>
              <label className="button">
                Replay JSON
                <input
                  hidden
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size < 512000)
                      try {
                        await action("replay", {
                          bench: JSON.parse(await f.text()),
                        });
                      } catch (err) {
                        setMessage(String(err));
                      }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="wave-scroll">
              {c.nodes
                .filter((n) => ["OUTPUT", "PROBE"].includes(n.kind))
                .slice(0, 24)
                .map((n) => (
                  <div className="wave-row" key={n.id}>
                    <span>
                      {n.label}
                      <b>{inspected[n.id] ?? "—"}</b>
                    </span>
                    <svg
                      viewBox={`0 0 ${Math.max(1, visibleTrace.length) * 32} 36`}
                      preserveAspectRatio="none"
                    >
                      {visibleTrace.map((f, i) => (
                        <g key={f.tick} onClick={() => setCursor(f.tick)}>
                          <rect
                            x={i * 32}
                            y={0}
                            width={32}
                            height={36}
                            fill={
                              f.tick === cursor ? "#47dec122" : "transparent"
                            }
                          />
                          <path
                            d={`M ${i * 32} ${n.width === 1 && i > 0 ? (visibleTrace[i - 1].values[n.id] ? 6 : 30) : n.width === 1 ? (f.values[n.id] ? 6 : 30) : 8} V ${n.width === 1 ? (f.values[n.id] ? 6 : 30) : 8} h 32`}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            stroke="#47dec1"
                            strokeWidth={2}
                          />
                          {n.width > 1 && (
                            <text
                              x={i * 32 + 6}
                              y={26}
                              fill="#b5c9dd"
                              fontSize={12}
                            >
                              {f.values[n.id]}
                            </text>
                          )}
                        </g>
                      ))}
                    </svg>
                  </div>
                ))}
              {!trace.length && (
                <p className="empty">
                  Step or run the circuit to record waveforms.
                </p>
              )}
            </div>
            <label className="pan-control">
              History pan
              <input
                aria-label="History pan"
                type="range"
                min={0}
                max={Math.max(0, trace.length - windowSize)}
                value={pan}
                onChange={(e) => setPan(+e.target.value)}
              />
            </label>
            <input
              aria-label="Trace cursor"
              type="range"
              min={trace[0]?.tick || 0}
              max={trace.at(-1)?.tick || 0}
              value={cursor}
              onChange={(e) => setCursor(+e.target.value)}
            />
          </div>
        </section>
        <aside className="inspector">
          <h3>INSPECTOR</h3>
          <label>
            Project name
            <input
              value={c.name}
              disabled={!enabled}
              onChange={(e) => setC({ ...c, name: e.target.value })}
              onBlur={() => {
                if (c.name.trim()) edit(c);
              }}
            />
          </label>
          {part?.kind === "SUBCIRCUIT" && (
            <>
              <button
                disabled={!enabled}
                onClick={() => {
                  const text = prompt(
                    "Edit reusable definition JSON",
                    JSON.stringify(
                      c.definitions?.[part.definition || ""],
                      null,
                      2,
                    ),
                  );
                  if (text)
                    try {
                      const definition = circuitSchema.parse(JSON.parse(text));
                      edit({
                        ...c,
                        definitions: {
                          ...c.definitions,
                          [part.definition!]: definition,
                        },
                      });
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                }}
              >
                Edit reusable definition
              </button>
              <button onClick={() => create(flatten(c))}>
                Open flattened copy
              </button>
            </>
          )}
          {part ? (
            <>
              <h2>{part.kind}</h2>
              <label>
                Label
                <input
                  value={part.label}
                  disabled={!enabled}
                  onChange={(e) =>
                    setC({
                      ...c,
                      nodes: c.nodes.map((n) =>
                        n.id === part.id ? { ...n, label: e.target.value } : n,
                      ),
                    })
                  }
                  onBlur={() => edit(c)}
                />
              </label>
              <label>
                Width
                <select
                  disabled={!enabled}
                  value={part.width}
                  onChange={(e) =>
                    edit({
                      ...c,
                      nodes: c.nodes.map((n) =>
                        n.id === part.id ? { ...n, width: +e.target.value } : n,
                      ),
                    })
                  }
                >
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i}>{i + 1}</option>
                  ))}
                </select>
              </label>
              {["INPUT", "CONST", "REG"].includes(part.kind) && (
                <label>
                  {part.kind === "INPUT"
                    ? "Live input"
                    : "Initial / constant value"}
                  <input
                    type="number"
                    min={0}
                    max={2 ** part.width - 1}
                    onBlur={() => {
                      if (part.kind !== "INPUT") edit(c);
                    }}
                    value={
                      part.kind === "INPUT"
                        ? (inputs[part.id] ?? part.value)
                        : part.value
                    }
                    onChange={(e) => {
                      const v = Math.max(
                        0,
                        Math.min(2 ** part.width - 1, +e.target.value),
                      );
                      if (part.kind === "INPUT")
                        setInputs({ ...inputs, [part.id]: v });
                      else
                        setC({
                          ...c,
                          nodes: c.nodes.map((n) =>
                            n.id === part.id ? { ...n, value: v } : n,
                          ),
                        });
                    }}
                  />
                </label>
              )}
              {part.kind === "REG" && (
                <label>
                  Enable pin
                  <select
                    disabled={!enabled}
                    value={part.hasEnable === false ? "off" : "on"}
                    onChange={(e) =>
                      edit({
                        ...c,
                        nodes: c.nodes.map((n) =>
                          n.id === part.id
                            ? { ...n, hasEnable: e.target.value === "on" }
                            : n,
                        ),
                        wires: c.wires.filter(
                          (w) =>
                            !(
                              e.target.value === "off" &&
                              w.to === part.id &&
                              w.input === "enable"
                            ),
                        ),
                      })
                    }
                  >
                    <option value="on">Required enable input</option>
                    <option value="off">Always enabled</option>
                  </select>
                </label>
              )}
              {part.kind === "SUBCIRCUIT" && (
                <div className="internal-signals">
                  <h3>INSTANCE SIGNALS</h3>
                  {Object.entries(values)
                    .filter(([id]) => id.startsWith(part.id + "__"))
                    .slice(0, 100)
                    .map(([id, value]) => (
                      <p key={id}>
                        <code>{id}</code>: {value}
                      </p>
                    ))}
                </div>
              )}
              <div className="readout">
                {values[part.id] ?? "—"}
                <small>unsigned decimal</small>
              </div>
              <button disabled={!enabled} onClick={remove}>
                Delete selected
              </button>
            </>
          ) : (
            <p>Select a component to inspect its signal and properties.</p>
          )}
          <h3>INPUT SWITCHES</h3>
          {c.nodes
            .filter((n) => n.kind === "INPUT")
            .map((n) => (
              <label className="input-switch" key={n.id}>
                {n.label}
                <input
                  aria-label={"Input " + n.label}
                  type="number"
                  min={0}
                  max={2 ** n.width - 1}
                  value={inputs[n.id] ?? n.value}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      [n.id]: Math.max(
                        0,
                        Math.min(2 ** n.width - 1, +e.target.value),
                      ),
                    })
                  }
                />
              </label>
            ))}
          <h3>VALIDATION</h3>
          <p className={validation ? "error" : "valid"}>
            {validation || "✓ Valid executable netlist"}
          </p>
          <h3>VERIFICATION LAB</h3>
          <button
            disabled={!!validation || busy}
            onClick={() => action("truth")}
          >
            Generate truth table
          </button>
          <select
            aria-label="Comparison circuit"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          >
            {examples.map((e, i) => (
              <option key={i} value={i}>
                {e.name}
              </option>
            ))}
          </select>
          <button disabled={!enabled} onClick={insertModule}>
            Insert example as subcircuit
          </button>
          <button
            disabled={!!validation || busy}
            onClick={() => action("compare", { other: examples[+other] })}
          >
            Find counterexample
          </button>
          <button
            disabled={!!validation || busy}
            onClick={() => action("optimize")}
          >
            Optimize & verify copy
          </button>
          {optimized && result?.check?.equivalent && (
            <button onClick={() => create(optimized)}>
              Save optimized copy
            </button>
          )}
          <label className="button">
            Run JSON testbench
            <input
              type="file"
              hidden
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && f.size < 512000)
                  try {
                    action("testbench", { bench: JSON.parse(await f.text()) });
                  } catch (err) {
                    setMessage(String(err));
                  }
                e.target.value = "";
              }}
            />
          </label>
          <button
            disabled={!!validation}
            onClick={() => download("circuit.v", verilog(c))}
          >
            Export Verilog
          </button>
          <button
            disabled={!!validation}
            onClick={() => download("testbench.v", verilogTestbench(c))}
          >
            Export HDL testbench
          </button>
          {busy && (
            <button
              onClick={() => {
                worker.current?.terminate();
                for (const cb of callbacks.current.values())
                  cb.reject(Error("Job cancelled"));
                callbacks.current.clear();
                startWorker();
                setBusy(false);
                setMessage(
                  "Worker job cancelled. Ready for another operation.",
                );
              }}
            >
              Cancel worker job
            </button>
          )}
          {result?.counterexample && (
            <div className="comparison">
              <h3>COUNTEREXAMPLE</h3>
              <p>
                Input assignment is loaded on the left. Both circuit outputs
                below were evaluated with this assignment.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Output</th>
                    <th>Current</th>
                    <th>Compared</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="error">
                    <td>{result.counterexample.output}</td>
                    <td>{result.counterexample.expected}</td>
                    <td>{result.counterexample.actual}</td>
                  </tr>
                </tbody>
              </table>
              <p>
                {examples[+other].name}:{" "}
                {JSON.stringify(result.counterexample.rightInputs)}
              </p>
            </div>
          )}
          {Array.isArray(result) && (
            <button
              onClick={() => {
                const ins = c.nodes.filter((n) => n.kind === "INPUT");
                const rows = [
                  ins
                    .map((n) => n.label)
                    .concat(
                      c.nodes
                        .filter((n) => n.kind === "OUTPUT")
                        .map((n) => n.label),
                    ),
                  ...result.map((row: any) =>
                    ins
                      .map((n) => row.inputs[n.id])
                      .concat(Object.values(row.outputs)),
                  ),
                ];
                download(
                  "truth-table.csv",
                  rows
                    .map((row) =>
                      row
                        .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                        .join(","),
                    )
                    .join("\n"),
                );
              }}
            >
              Export truth CSV
            </button>
          )}
          {result && (
            <>
              <pre>
                {JSON.stringify(
                  result,
                  (_, v) =>
                    Array.isArray(v) && v.length > 16
                      ? [...v.slice(0, 16), "…export to see all rows"]
                      : v,
                  2,
                )}
              </pre>
              <button
                onClick={() =>
                  download("verification.json", JSON.stringify(result, null, 2))
                }
              >
                Export result
              </button>
            </>
          )}
        </aside>
      </main>
      <footer>
        <span className={validation ? "error" : ""}>{message}</span>
        {conflict && (
          <button onClick={() => location.reload()}>
            Discard draft & reload
          </button>
        )}
        <div className="grow" />
        <span>LOCAL ONLY · NO PHYSICAL TIMING</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ReactFlowProvider>
    <App />
  </ReactFlowProvider>,
);
