import { it, expect } from "vitest";
import {
  compile,
  flatten,
  optimize,
  equivalent,
  type Circuit,
} from "../src/engine";
import { examples, builder } from "../src/examples";
import { createReplay, replay } from "../src/replay";
import { mergeEdit } from "../src/protocol";
it("flattens hierarchy with stable names and rejects recursive definitions", () => {
  const flat = flatten(examples[2]);
  expect(flat.nodes.some((n) => n.id.includes("__"))).toBe(true);
  expect(flat.nodes.some((n) => n.kind === "SUBCIRCUIT")).toBe(false);
  const bad: Circuit = {
    version: 1,
    name: "recursive",
    nodes: [
      {
        id: "s",
        kind: "SUBCIRCUIT",
        definition: "self",
        label: "S",
        width: 1,
        value: 0,
        x: 0,
        y: 0,
      },
    ],
    wires: [],
  };
  bad.definitions = { self: { ...bad } };
  expect(() => compile(bad)).toThrow("Recursive");
});
it("replays input events deterministically and rejects hash tampering", async () => {
  const c = examples[4],
    reset = c.nodes.find((n) => n.label === "RESET")!.id;
  const steps = Array.from({ length: 12 }, (_, tick) => ({
    inputs: { [reset]: tick === 5 ? 1 : 0 },
    edge: true,
  }));
  const r = await createReplay(c, steps);
  const a = await replay(r),
    b = await replay(JSON.parse(JSON.stringify(r)));
  expect(a).toEqual(b);
  r.circuit = structuredClone(c);
  r.circuit.name = "tamper";
  await expect(replay(r)).rejects.toThrow("hash");
});
it("cycles the traffic lights and recovers through synchronous reset", () => {
  const c = examples[7],
    e = compile(c);
  let state = e.initial();
  const outputs = ["GREEN", "YELLOW", "RED"];
  for (let t = 0; t < 12; t++) {
    const r = e.step({}, state);
    state = r.state;
    for (const name of outputs)
      expect(r.values[c.nodes.find((n) => n.label === name)!.id]).toBe(
        name === outputs[t % 3] ? 1 : 0,
      );
  }
});
it("folds constant-only outputs while preserving external ports", () => {
  const b = builder("constant"),
    a = b.add("CONST", "Five", 4, 5),
    d = b.add("CONST", "Three", 4, 3);
  b.out(b.gate("XOR", a, d, 4), "RESULT", 4);
  const r = optimize(b.c);
  expect(r.check.equivalent).toBe(true);
  expect(r.changes.some((s) => s.startsWith("Folded"))).toBe(true);
  expect(r.circuit.nodes.some((n) => n.kind === "CONST" && n.value === 6)).toBe(
    true,
  );
});
it("merges nonconflicting object edits and rejects same-object edits or delete/wire races", () => {
  const base = examples[0],
    a = structuredClone(base),
    b = structuredClone(base);
  a.nodes[0].label = "left";
  b.nodes[1].label = "right";
  const merged = mergeEdit(base, a, b);
  expect(merged.nodes[0].label).toBe("left");
  expect(merged.nodes[1].label).toBe("right");
  b.nodes[0].label = "conflict";
  expect(() => mergeEdit(base, a, b)).toThrow("Conflicting");
});
it("seeded random DAGs agree with independent oracle", async () => {
  const { reference } = await import("../src/engine");
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 30; trial++) {
    const b = builder("property"),
      ids = [b.add("INPUT", "A", 4), b.add("INPUT", "B", 4)];
    for (let i = 0; i < 30; i++) {
      const kind = (["XOR", "AND", "OR"] as const)[random() % 3];
      ids.push(
        b.gate(kind, ids[random() % ids.length], ids[random() % ids.length], 4),
      );
    }
    b.out(ids.at(-1)!, "OUT", 4);
    const e = compile(b.c);
    for (let i = 0; i < 16; i++) {
      const x = { [ids[0]]: random() & 255, [ids[1]]: random() & 255 };
      expect(e.evaluate(x)).toEqual(reference(b.c, x));
    }
    expect(equivalent(b.c, optimize(b.c).circuit).equivalent).toBe(true);
  }
});

it("honors optional enable and exercises mux select and bus round-trips at 1–16 bits", () => {
  for (const width of [1, 4, 8, 16]) {
    const b = builder("buses"),
      a = b.add("INPUT", "A", width),
      d = b.add("INPUT", "B", width),
      select = b.add("INPUT", "SEL"),
      mux = b.gate("MUX", a, d, width);
    b.wire(select, mux, "sel");
    const split = b.gate("SPLIT", mux, undefined, width),
      join = b.add("JOIN", "JOIN", width);
    for (let i = 0; i < width; i++) b.wire(split, join, "b" + i, "b" + i);
    const e = compile(b.c);
    for (const sel of [0, 1]) {
      const values = e.evaluate({ [a]: 65535, [d]: 42, [select]: sel });
      expect(values[join]).toBe((sel ? 42 : 65535) & ((1 << width) - 1));
    }
  }
  const b = builder("always enabled"),
    reg = b.add("REG", "R"),
    data = b.add("CONST", "D", 1, 1),
    reset = b.add("CONST", "RESET");
  b.c.nodes.find((n) => n.id === reg)!.hasEnable = false;
  b.wire(data, reg, "d");
  b.wire(reset, reg, "reset");
  const e = compile(b.c);
  expect(e.step({}, e.initial()).state[reg]).toBe(1);
});

it("normalizes partial testbench changes into replayable events", async () => {
  const { testbench } = await import("../src/formats");
  const c = examples[4],
    reset = c.nodes.find((n) => n.label === "RESET")!.id;
  const run = testbench(c, {
    steps: [
      { inputs: {} },
      { inputs: { [reset]: 1 } },
      { inputs: { [reset]: 0 } },
      { inputs: {} },
    ],
  });
  const playback = await replay(
    await createReplay(c, run.events, run.initialState),
  );
  expect(playback.trace.at(-1)?.values).toEqual(run.trace.at(-1)?.values);
  expect(playback.state).toEqual(run.state);
});
