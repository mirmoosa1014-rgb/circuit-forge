import { type Circuit, type Kind } from "./engine";
export function builder(name: string) {
  const c: Circuit = { version: 1, name, nodes: [], wires: [] };
  let id = 0;
  const add = (
    kind: Kind,
    label: string,
    width = 1,
    value = 0,
    x = 0,
    y = 0,
  ) => {
    const key = "n" + id++;
    c.nodes.push({ id: key, kind, label, width, value, x, y });
    return key;
  };
  const wire = (from: string, to: string, input: string, port = "out") =>
    c.wires.push({ id: "w" + c.wires.length, from, to, input, port });
  const gate = (
    kind: Kind,
    a: string,
    b?: string,
    width = 1,
    label = kind as string,
  ) => {
    const n = add(kind, label, width);
    wire(a, n, "a");
    if (b) wire(b, n, "b");
    return n;
  };
  const out = (a: string, label: string, width = 1) =>
    gate("OUTPUT", a, undefined, width, label);
  const layout = () => {
    const ranks: Record<string, number> = {};
    for (let pass = 0; pass < c.nodes.length; pass++)
      for (const n of c.nodes)
        ranks[n.id] = ["INPUT", "CONST", "REG"].includes(n.kind)
          ? 0
          : 1 +
            Math.max(
              0,
              ...c.wires
                .filter((w) => w.to === n.id)
                .map((w) => ranks[w.from] || 0),
            );
    const rows: Record<number, number> = {};
    for (const n of c.nodes) {
      n.x = ranks[n.id] * 200;
      n.y = (rows[ranks[n.id]] || 0) * 140;
      rows[ranks[n.id]] = (rows[ranks[n.id]] || 0) + 1;
    }
    return c;
  };
  return { c, add, wire, gate, out, layout };
}
function half(faulty = false) {
  const b = builder(faulty ? "Faulty half adder" : "Half adder");
  const a = b.add("INPUT", "A"),
    d = b.add("INPUT", "B");
  b.out(b.gate(faulty ? "OR" : "XOR", a, d), "SUM");
  b.out(b.gate("AND", a, d), "CARRY");
  return b.layout();
}
function adder(width: number) {
  const b = builder(width === 1 ? "Full adder" : "4-bit ripple-carry adder");
  const a = b.add("INPUT", "A", width),
    d = b.add("INPUT", "B", width);
  let carry = b.add("INPUT", "CIN");
  const sa = b.gate("SPLIT", a, undefined, width),
    sb = b.gate("SPLIT", d, undefined, width),
    join = b.add("JOIN", "SUM bus", width);
  for (let i = 0; i < width; i++) {
    const ai = b.add("PROBE", "A" + i),
      bi = b.add("PROBE", "B" + i);
    b.wire(sa, ai, "a", "b" + i);
    b.wire(sb, bi, "a", "b" + i);
    const x = b.gate("XOR", ai, bi);
    const s = b.gate("XOR", x, carry);
    b.wire(s, join, "b" + i);
    carry = b.gate("OR", b.gate("AND", ai, bi), b.gate("AND", x, carry));
  }
  b.out(join, "SUM", width);
  b.out(carry, "CARRY");
  return b.layout();
}
function counter() {
  const b = builder("8-bit synchronous counter");
  const reset = b.add("INPUT", "RESET"),
    enable = b.add("INPUT", "ENABLE", 1, 1),
    reg = b.add("REG", "COUNT", 8),
    split = b.gate("SPLIT", reg, undefined, 8),
    join = b.add("JOIN", "Next count", 8);
  let carry = b.add("CONST", "One", 1, 1);
  for (let i = 0; i < 8; i++) {
    const bit = b.add("PROBE", "Bit " + i);
    b.wire(split, bit, "a", "b" + i);
    b.wire(b.gate("XOR", bit, carry), join, "b" + i);
    carry = b.gate("AND", bit, carry);
  }
  b.wire(join, reg, "d");
  b.wire(reset, reg, "reset");
  b.wire(enable, reg, "enable");
  b.out(reg, "COUNT_OUT", 8);
  return b.layout();
}
function inefficient() {
  const b = builder("Optimization lab");
  const a = b.add("INPUT", "A", 4),
    d = b.add("INPUT", "B", 4),
    zero = b.add("CONST", "Zero", 4);
  const x = b.gate("XOR", a, d, 4),
    y = b.gate("XOR", a, d, 4);
  b.out(b.gate("OR", x, zero, 4), "RESULT", 4);
  b.out(y, "DUPLICATE", 4);
  b.gate("NOT", a, undefined, 4, "Unused");
  return b.layout();
}
function alu() {
  const c = adder(4);
  c.name = "4-bit ALU";
  const b = builder(c.name);
  b.c.nodes = c.nodes;
  b.c.wires = c.wires; // Use namespaced helper to prevent builder IDs colliding.
  let i = 100;
  const add = (kind: Kind, label: string, width = 4) => {
    const id = "n" + i++;
    c.nodes.push({ id, kind, label, width, value: 0, x: 0, y: 0 });
    return id;
  };
  const wire = (from: string, to: string, input: string, port = "out") =>
    c.wires.push({ id: "w" + c.wires.length, from, to, input, port });
  const gate = (kind: Kind, a: string, d: string) => {
    const id = add(kind, kind);
    wire(a, id, "a");
    wire(d, id, "b");
    return id;
  };
  const a = c.nodes.find((n) => n.label === "A")!.id,
    d = c.nodes.find((n) => n.label === "B")!.id;
  const cin = c.nodes.find((n) => n.label === "CIN")!;
  cin.kind = "CONST";
  cin.label = "Carry zero";
  const op = add("INPUT", "OP", 2),
    split = add("SPLIT", "Opcode", 2);
  wire(op, split, "a");
  const sum = c.nodes.find((n) => n.label === "SUM")!;
  sum.kind = "PROBE";
  sum.label = "Addition";
  const mux = (a: string, d: string, bit: number) => {
    const id = add("MUX", "Select");
    wire(a, id, "a");
    wire(d, id, "b");
    wire(split, id, "sel", "b" + bit);
    return id;
  };
  const value = mux(
    mux(sum.id, gate("AND", a, d), 0),
    mux(gate("OR", a, d), gate("XOR", a, d), 0),
    1,
  );
  const output = add("OUTPUT", "RESULT");
  wire(value, output, "a");
  const bits = add("SPLIT", "Result bits");
  wire(value, bits, "a");
  let any = "";
  for (let bit = 0; bit < 4; bit++) {
    const probe = add("PROBE", "Result " + bit, 1);
    wire(bits, probe, "a", "b" + bit);
    if (!any) any = probe;
    else {
      const n = add("OR", "Any", 1);
      wire(any, n, "a");
      wire(probe, n, "b");
      any = n;
    }
  }
  const not = add("NOT", "Zero flag", 1),
    z = add("OUTPUT", "ZERO", 1);
  wire(any, not, "a");
  wire(not, z, "a");
  return b.layout();
}
function hierarchicalAdder() {
  const b = builder("Hierarchical 4-bit ripple-carry adder");
  b.c.definitions = { fullAdder: adder(1) };
  const a = b.add("INPUT", "A", 4),
    d = b.add("INPUT", "B", 4);
  let carry = b.add("INPUT", "CIN");
  const sa = b.gate("SPLIT", a, undefined, 4),
    sb = b.gate("SPLIT", d, undefined, 4),
    join = b.add("JOIN", "SUM bus", 4);
  for (let i = 0; i < 4; i++) {
    const instance = b.add("SUBCIRCUIT", "Full adder " + i);
    b.c.nodes.find((n) => n.id === instance)!.definition = "fullAdder";
    b.wire(sa, instance, "A", "b" + i);
    b.wire(sb, instance, "B", "b" + i);
    b.wire(carry, instance, "CIN", i === 0 ? "out" : "CARRY");
    b.wire(instance, join, "b" + i, "SUM");
    carry = instance;
  }
  b.out(join, "SUM", 4);
  const out = b.add("OUTPUT", "CARRY");
  b.wire(carry, out, "a", "CARRY");
  return b.layout();
}
function traffic() {
  const b = builder("Traffic-light FSM");
  const reset = b.add("INPUT", "RESET"),
    one = b.add("CONST", "Enabled", 1, 1),
    reg = b.add("REG", "State", 2),
    split = b.gate("SPLIT", reg, undefined, 2),
    join = b.add("JOIN", "Next state", 2);
  const low = b.add("PROBE", "State bit 0"),
    high = b.add("PROBE", "State bit 1");
  b.wire(split, low, "a", "b0");
  b.wire(split, high, "a", "b1");
  const nh = b.gate("NOT", high),
    nl = b.gate("NOT", low);
  b.wire(b.gate("AND", nh, nl), join, "b0");
  b.wire(b.gate("AND", nh, low), join, "b1");
  b.wire(join, reg, "d");
  b.wire(reset, reg, "reset");
  b.wire(one, reg, "enable");
  b.out(b.gate("AND", nh, nl), "RED");
  b.out(b.gate("AND", nh, low), "GREEN");
  b.out(b.gate("AND", high, nl), "YELLOW");
  return b.layout();
}
export const examples = [
  half(),
  adder(1),
  hierarchicalAdder(),
  alu(),
  counter(),
  inefficient(),
  half(true),
  traffic(),
];
