import { z } from "zod";
export const kinds = [
  "INPUT",
  "CONST",
  "OUTPUT",
  "PROBE",
  "AND",
  "OR",
  "XOR",
  "NOT",
  "NAND",
  "NOR",
  "MUX",
  "SPLIT",
  "JOIN",
  "REG",
  "SUBCIRCUIT",
] as const;
export type Kind = (typeof kinds)[number];
const nodeSchema = z.object({
  id: z.string().regex(/^[a-zA-Z_][\w-]{0,79}$/),
  kind: z.enum(kinds),
  label: z.string().max(80),
  width: z.number().int().min(1).max(16),
  definition: z.string().max(80).optional(),
  hasEnable: z.boolean().optional(),
  value: z.number().int().min(0).max(65535).default(0),
  x: z.number().finite(),
  y: z.number().finite(),
});
const baseSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(100),
  nodes: z.array(nodeSchema).max(1000),
  wires: z
    .array(
      z.object({
        id: z.string().max(100),
        from: z.string(),
        port: z.string().default("out"),
        to: z.string(),
        input: z.string(),
      }),
    )
    .max(4000),
});
export const circuitSchema = baseSchema.extend({
  definitions: z.record(z.string(), baseSchema).optional(),
});
export type Circuit = z.infer<typeof circuitSchema>;
export type Part = Circuit["nodes"][number];
export type Values = Record<string, number>;
export const mask = (w: number) => (1 << w) - 1;
export function ports(n: Part, c?: Circuit): Record<string, number> {
  if (n.kind === "SUBCIRCUIT")
    return Object.fromEntries(
      (c?.definitions?.[n.definition || ""]?.nodes || [])
        .filter((n) => n.kind === "INPUT")
        .map((n) => [n.label, n.width]),
    );
  switch (n.kind) {
    case "INPUT":
    case "CONST":
      return {};
    case "MUX":
      return { a: n.width, b: n.width, sel: 1 };
    case "REG":
      return n.hasEnable === false
        ? { d: n.width, reset: 1 }
        : { d: n.width, reset: 1, enable: 1 };
    case "JOIN":
      return Object.fromEntries(
        Array.from({ length: n.width }, (_, i) => ["b" + i, 1]),
      );
    case "NOT":
    case "OUTPUT":
    case "PROBE":
    case "SPLIT":
      return { a: n.width };
    default:
      return { a: n.width, b: n.width };
  }
}
export function outputs(n: Part, c?: Circuit): Record<string, number> {
  if (n.kind === "SUBCIRCUIT")
    return Object.fromEntries(
      (c?.definitions?.[n.definition || ""]?.nodes || [])
        .filter((n) => n.kind === "OUTPUT")
        .map((n) => [n.label, n.width]),
    );
  return n.kind === "SPLIT"
    ? Object.fromEntries(
        Array.from({ length: n.width }, (_, i) => ["b" + i, 1]),
      )
    : { out: n.width };
}
export function operation(n: Part, p: Values): number {
  switch (n.kind) {
    case "CONST":
      return n.value;
    case "AND":
      return p.a & p.b;
    case "OR":
      return p.a | p.b;
    case "XOR":
      return p.a ^ p.b;
    case "NAND":
      return ~(p.a & p.b);
    case "NOR":
      return ~(p.a | p.b);
    case "NOT":
      return ~p.a;
    case "MUX":
      return p.sel ? p.b : p.a;
    case "JOIN":
      return Object.entries(p).reduce(
        (a, [k, v]) => a | ((v & 1) << Number(k.slice(1))),
        0,
      );
    default:
      return p.a;
  }
}
export function compile(raw: Circuit) {
  const c = flatten(circuitSchema.parse(raw));
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  if (byId.size !== c.nodes.length) throw Error("Duplicate component ID");
  if (new Set(c.wires.map((w) => w.id)).size !== c.wires.length)
    throw Error("Duplicate wire ID");
  const inputs = new Map<string, Map<string, Circuit["wires"][number]>>();
  for (const w of c.wires) {
    const src = byId.get(w.from),
      dst = byId.get(w.to);
    if (!src || !dst) throw Error(`Wire ${w.id}: unknown component`);
    if (outputs(src)[w.port] === undefined || ports(dst)[w.input] === undefined)
      throw Error(`Wire ${w.id}: invalid port`);
    if (outputs(src)[w.port] !== ports(dst)[w.input])
      throw Error(`${dst.label}.${w.input}: width mismatch`);
    const m = inputs.get(w.to) || new Map();
    if (m.has(w.input))
      throw Error(`${dst.label}.${w.input}: multiple drivers`);
    m.set(w.input, w);
    inputs.set(w.to, m);
  }
  for (const n of c.nodes)
    for (const p of Object.keys(ports(n)))
      if (!inputs.get(n.id)?.has(p))
        throw Error(`${n.label}.${p}: missing input`);
  const order: Part[] = [];
  const visited = new Set<string>(),
    active = new Set<string>();
  function visit(n: Part) {
    if (visited.has(n.id)) return;
    if (active.has(n.id)) throw Error(`${n.label}: combinational loop`);
    active.add(n.id);
    if (n.kind !== "REG")
      for (const w of inputs.get(n.id)?.values() || [])
        visit(byId.get(w.from)!);
    active.delete(n.id);
    visited.add(n.id);
    order.push(n);
  }
  c.nodes.forEach(visit);
  const read = (values: Values, w: Circuit["wires"][number]) =>
    w.port === "out"
      ? values[w.from]
      : (values[w.from] >>> Number(w.port.slice(1))) & 1;
  const args = (n: Part, values: Values) =>
    Object.fromEntries(
      [...(inputs.get(n.id)?.entries() || [])].map(([p, w]) => [
        p,
        read(values, w),
      ]),
    );
  const initial = () =>
    Object.fromEntries(
      c.nodes
        .filter((n) => n.kind === "REG")
        .map((n) => [n.id, n.value & mask(n.width)]),
    );
  const evaluate = (external: Values = {}, state: Values = initial()) => {
    const v: Values = {};
    for (const n of order)
      v[n.id] =
        (n.kind === "INPUT"
          ? (external[n.id] ?? n.value)
          : n.kind === "REG"
            ? (state[n.id] ?? n.value)
            : operation(n, args(n, v))) & mask(n.width);
    return v;
  };
  const step = (external: Values, state: Values) => {
    const before = evaluate(external, state);
    const next = { ...state };
    for (const n of c.nodes.filter((n) => n.kind === "REG")) {
      const p = args(n, before);
      next[n.id] = p.reset
        ? 0
        : n.hasEnable === false || p.enable
          ? p.d
          : before[n.id];
    }
    return { state: next, values: evaluate(external, next) };
  };
  return {
    c,
    order,
    inputs,
    initial,
    evaluate,
    step,
    args,
  };
}
// Independent recursive oracle: a separate traversal and primitive dispatch, never uses compiled evaluate.
export function reference(
  raw: Circuit,
  external: Values = {},
  state: Values = {},
): Values {
  const c = flatten(raw);
  const v: Values = {},
    active = new Set<string>();
  function get(id: string): number {
    if (id in v) return v[id];
    if (active.has(id)) throw Error("cycle");
    active.add(id);
    const n = c.nodes.find((n) => n.id === id)!;
    const p: Values = {};
    if (n.kind !== "REG")
      for (const w of c.wires.filter((w) => w.to === id)) {
        const x = get(w.from);
        p[w.input] = w.port === "out" ? x : (x >>> +w.port.slice(1)) & 1;
      }
    let x = 0;
    switch (n.kind) {
      case "INPUT":
        x = external[id] ?? n.value;
        break;
      case "CONST":
        x = n.value;
        break;
      case "REG":
        x = state[id] ?? n.value;
        break;
      case "AND":
        x = p.a & p.b;
        break;
      case "OR":
        x = p.a | p.b;
        break;
      case "XOR":
        x = p.a ^ p.b;
        break;
      case "NOT":
        x = ~p.a;
        break;
      case "NAND":
        x = ~(p.a & p.b);
        break;
      case "NOR":
        x = ~(p.a | p.b);
        break;
      case "MUX":
        x = p.sel ? p.b : p.a;
        break;
      case "JOIN":
        for (let i = 0; i < n.width; i++) x |= p["b" + i] << i;
        break;
      default:
        x = p.a;
    }
    active.delete(id);
    return (v[id] = x & mask(n.width));
  }
  c.nodes.forEach((n) => get(n.id));
  return v;
}
export function stats(c: Circuit) {
  c = flatten(c);
  const e = compile(c),
    depth: Values = {};
  for (const n of e.order)
    depth[n.id] = ["REG", "INPUT", "CONST"].includes(n.kind)
      ? 0
      : Math.max(
          0,
          ...c.wires
            .filter((w) => w.to === n.id)
            .map((w) => depth[w.from] || 0),
        ) + (["OUTPUT", "PROBE"].includes(n.kind) ? 0 : 1);
  return {
    primitives: c.nodes.length,
    wires: c.wires.length,
    depth: Math.max(0, ...Object.values(depth)),
  };
}
export function truth(c: Circuit) {
  c = flatten(c);
  const e = compile(c);
  if (c.nodes.some((n) => n.kind === "REG"))
    throw Error("Truth tables require combinational circuits");
  const ins = c.nodes.filter((n) => n.kind === "INPUT");
  const bits = ins.reduce((s, n) => s + n.width, 0);
  if (bits > 12) throw Error("Exhaustive limit: 12 independent input bits");
  return Array.from({ length: 2 ** bits }, (_, i) => {
    let x = i;
    const inputs: Values = {};
    for (const n of ins) {
      inputs[n.id] = x & mask(n.width);
      x >>>= n.width;
    }
    const all = e.evaluate(inputs);
    return {
      inputs,
      outputs: Object.fromEntries(
        c.nodes
          .filter((n) => n.kind === "OUTPUT")
          .map((n) => [n.label, all[n.id]]),
      ),
    };
  });
}
export function equivalent(a: Circuit, b: Circuit) {
  a = flatten(a);
  b = flatten(b);
  const io = (c: Circuit, k: Kind) =>
    c.nodes
      .filter((n) => n.kind === k)
      .map((n) => [n.label, n.width])
      .sort();
  for (const k of ["INPUT", "OUTPUT"] as Kind[]) {
    if (JSON.stringify(io(a, k)) !== JSON.stringify(io(b, k)))
      throw Error("External port labels and widths must match");
    if (new Set(io(a, k).map((p) => p[0])).size !== io(a, k).length)
      throw Error("External labels must be unique");
  }
  const rows = truth(a),
    eb = compile(b);
  if (b.nodes.some((n) => n.kind === "REG"))
    throw Error("Sequential equivalence is not supported");
  for (const row of rows) {
    const bv: Values = {};
    for (const n of b.nodes.filter((n) => n.kind === "INPUT"))
      bv[n.id] =
        row.inputs[
          a.nodes.find((x) => x.kind === "INPUT" && x.label === n.label)!.id
        ];
    const all = eb.evaluate(bv);
    for (const n of b.nodes.filter((n) => n.kind === "OUTPUT"))
      if (all[n.id] !== row.outputs[n.label])
        return {
          equivalent: false,
          count: rows.length,
          counterexample: {
            inputs: row.inputs,
            rightInputs: bv,
            output: n.label,
            expected: row.outputs[n.label],
            actual: all[n.id],
          },
        };
  }
  return { equivalent: true, count: rows.length };
}
export function optimize(raw: Circuit) {
  raw = flatten(raw);
  compile(raw);
  if (raw.nodes.some((n) => n.kind === "REG"))
    throw Error("Optimization currently supports combinational circuits");
  const c = structuredClone(raw),
    changes: string[] = [];
  const redirect = (old: string, to: string) => {
    for (const w of c.wires) if (w.from === old) w.from = to;
    c.wires = c.wires.filter((w) => w.to !== old);
    c.nodes = c.nodes.filter((n) => n.id !== old);
  };
  const seen = new Map<string, string>();
  for (const ordered of compile(c).order) {
    const n = c.nodes.find((n) => n.id === ordered.id);
    if (!n) continue;
    if (["INPUT", "CONST", "OUTPUT", "PROBE", "SPLIT", "JOIN"].includes(n.kind))
      continue;
    const ws = c.wires.filter((w) => w.to === n.id);
    if (
      ws.every((w) => c.nodes.find((n) => n.id === w.from)?.kind === "CONST")
    ) {
      const v = compile(c).evaluate()[n.id];
      n.kind = "CONST";
      n.value = v;
      c.wires = c.wires.filter((w) => w.to !== n.id);
      changes.push(`Folded ${n.label} to ${v}`);
      continue;
    }
    const a = ws.find((w) => w.input === "a"),
      b = ws.find((w) => w.input === "b");
    if (a && b && a.port === "out" && b.port === "out") {
      const bn = c.nodes.find((n) => n.id === b.from)!;
      if (
        (["OR", "XOR"].includes(n.kind) &&
          bn.kind === "CONST" &&
          bn.value === 0) ||
        (n.kind === "AND" &&
          bn.kind === "CONST" &&
          (bn.value & mask(n.width)) === mask(n.width)) ||
        (["AND", "OR"].includes(n.kind) && a.from === b.from)
      ) {
        redirect(n.id, a.from);
        changes.push(`Removed identity ${n.label}`);
        continue;
      }
    }
    const key = JSON.stringify([
      n.kind,
      n.width,
      ws.map((w) => [w.input, w.from, w.port]).sort(),
    ]);
    if (seen.has(key)) {
      redirect(n.id, seen.get(key)!);
      changes.push(`Merged duplicate ${n.label}`);
    } else seen.set(key, n.id);
  }
  const live = new Set<string>();
  function mark(id: string) {
    if (live.has(id)) return;
    live.add(id);
    c.wires.filter((w) => w.to === id).forEach((w) => mark(w.from));
  }
  c.nodes
    .filter((n) => ["OUTPUT", "PROBE", "INPUT"].includes(n.kind))
    .forEach((n) => mark(n.id));
  const removed = c.nodes.filter((n) => !live.has(n.id)).length;
  c.nodes = c.nodes.filter((n) => live.has(n.id));
  c.wires = c.wires.filter((w) => live.has(w.to));
  if (removed) changes.push(`Removed ${removed} dead components`);
  c.name = c.name.slice(0, 88) + " (optimized)";
  return {
    circuit: c,
    changes,
    before: stats(raw),
    after: stats(c),
    check: equivalent(raw, c),
  };
}

/** Deterministic namespace flattening; shared definitions can instantiate other definitions. */
export function flatten(raw: Circuit): Circuit {
  const c = structuredClone(raw),
    defs = c.definitions || {};
  let count = 0;
  function expand(source: Circuit, prefix: string, stack: string[]): Circuit {
    if (stack.length > 16) throw Error("Hierarchy depth exceeds 16");
    const nodes: Part[] = [],
      wires: Circuit["wires"] = [],
      boundaries = new Map<
        string,
        { inputs: Record<string, string>; outputs: Record<string, string> }
      >();
    for (const n of source.nodes) {
      if (++count > 1000)
        throw Error("Flattened circuit exceeds 1000 components");
      if (n.kind !== "SUBCIRCUIT") {
        nodes.push({ ...n, id: prefix + n.id });
        continue;
      }
      const key = n.definition || "",
        def = defs[key];
      if (!def) throw Error(`${n.label}: unknown subcircuit ${key}`);
      if (stack.includes(key))
        throw Error(`Recursive subcircuit: ${[...stack, key].join(" -> ")}`);
      const ins = def.nodes.filter((n) => n.kind === "INPUT"),
        outs = def.nodes.filter((n) => n.kind === "OUTPUT");
      for (const list of [ins, outs])
        if (new Set(list.map((n) => n.label)).size !== list.length)
          throw Error(`${key}: duplicate external port labels`);
      const namespace = prefix + n.id + "__";
      const sub = expand(def, namespace, [...stack, key]);
      for (const node of sub.nodes) {
        if (ins.some((i) => namespace + i.id === node.id)) node.kind = "PROBE";
        if (outs.some((i) => namespace + i.id === node.id)) node.kind = "PROBE";
      }
      nodes.push(...sub.nodes);
      wires.push(...sub.wires);
      boundaries.set(n.id, {
        inputs: Object.fromEntries(ins.map((i) => [i.label, namespace + i.id])),
        outputs: Object.fromEntries(
          outs.map((i) => [i.label, namespace + i.id]),
        ),
      });
    }
    for (const w of source.wires) {
      const from = boundaries.get(w.from),
        to = boundaries.get(w.to);
      if (from && !from.outputs[w.port])
        throw Error(`${w.from}.${w.port}: unknown hierarchy output`);
      if (to && !to.inputs[w.input])
        throw Error(`${w.to}.${w.input}: unknown hierarchy input`);
      wires.push({
        ...w,
        id: prefix + w.id,
        from: from ? from.outputs[w.port] : prefix + w.from,
        port: from ? "out" : w.port,
        to: to ? to.inputs[w.input] : prefix + w.to,
        input: to ? "a" : w.input,
      });
    }
    return { version: 1, name: source.name, nodes, wires };
  }
  return expand(c, "", []);
}
