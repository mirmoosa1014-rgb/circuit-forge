import { describe, it, expect } from "vitest";
import {
  compile,
  reference,
  equivalent,
  optimize,
  truth,
  mask,
  type Kind,
} from "../src/engine";
import { examples, builder } from "../src/examples";
import { testbench, csv, vcd, verilog } from "../src/formats";
describe("binary circuit engine", () => {
  it("exhaustively verifies half/full and ripple adders", () => {
    for (const index of [0, 1, 2]) {
      const c = examples[index],
        e = compile(c);
      for (const row of truth(c)) {
        const ins = Object.fromEntries(
          c.nodes
            .filter((n) => n.kind === "INPUT")
            .map((n) => [n.label, row.inputs[n.id]]),
        );
        const sum = ins.A + ins.B + (ins.CIN || 0);
        const w = index === 2 ? 4 : 1;
        expect(row.outputs.SUM).toBe(sum & mask(w));
        expect(row.outputs.CARRY).toBe(sum >> w);
        expect(e.evaluate(row.inputs)).toEqual(reference(c, row.inputs));
      }
    }
  });
  it("checks all 1024 ALU vectors", () => {
    const c = examples[3];
    for (const row of truth(c)) {
      const n = (label: string) =>
        row.inputs[
          c.nodes.find((n) => n.label === label && n.kind === "INPUT")!.id
        ];
      const a = n("A"),
        b = n("B"),
        op = n("OP");
      const result = [a + b, a & b, a | b, a ^ b][op] & 15;
      expect(row.outputs.RESULT).toBe(result);
      expect(row.outputs.ZERO).toBe(result === 0 ? 1 : 0);
    }
  });
  it("counter wraps, enable holds and synchronous reset wins", () => {
    const c = examples[4],
      e = compile(c);
    let state = e.initial();
    const input = (label: string) => c.nodes.find((n) => n.label === label)!.id;
    for (let i = 1; i <= 260; i++) {
      const r = e.step({}, state);
      state = r.state;
      expect(r.values[input("COUNT_OUT")]).toBe(i & 255);
    }
    let r = e.step({ [input("ENABLE")]: 0 }, state);
    expect(r.state).toEqual(state);
    r = e.step({ [input("ENABLE")]: 0, [input("RESET")]: 1 }, state);
    expect(r.values[input("COUNT_OUT")]).toBe(0);
  });
  it("samples registers simultaneously", () => {
    const b = builder("swap"),
      a = b.add("REG", "a", 1, 0),
      d = b.add("REG", "b", 1, 1),
      zero = b.add("CONST", "zero"),
      one = b.add("CONST", "one", 1, 1);
    for (const n of [a, d]) {
      b.wire(zero, n, "reset");
      b.wire(one, n, "enable");
    }
    b.wire(a, d, "d");
    b.wire(d, a, "d");
    const e = compile(b.c);
    expect(e.step({}, e.initial()).state).toEqual({ [a]: 1, [d]: 0 });
  });
  it("finds a real counterexample and verifies optimization", () => {
    const r = equivalent(examples[0], examples[6]);
    expect(r.equivalent).toBe(false);
    expect(r.counterexample?.expected).toBe(0);
    const o = optimize(examples[5]);
    expect(o.check.equivalent).toBe(true);
    expect(o.after.primitives).toBeLessThan(o.before.primitives);
  });
  it("rejects missing, multiple, mismatched and cyclic connections", () => {
    const c = structuredClone(examples[0]);
    c.wires.pop();
    expect(() => compile(c)).toThrow("missing");
    const d = structuredClone(examples[0]);
    d.wires.push({ ...d.wires[0], id: "extra" });
    expect(() => compile(d)).toThrow("multiple");
    const w = structuredClone(examples[0]);
    w.nodes[0].width = 2;
    expect(() => compile(w)).toThrow("width");
    const b = builder("loop"),
      x = b.add("NOT", "x");
    b.wire(x, x, "a");
    expect(() => compile(b.c)).toThrow("loop");
  });
  it("checks primitive arithmetic across widths", () => {
    for (const width of [1, 4, 8, 16])
      for (const kind of [
        "AND",
        "OR",
        "XOR",
        "NOT",
        "NAND",
        "NOR",
        "MUX",
      ] as Kind[]) {
        const b = builder(kind),
          a = b.add("INPUT", "a", width),
          d = b.add("INPUT", "b", width),
          n = b.gate(kind, a, kind === "NOT" ? undefined : d, width);
        if (kind === "MUX") {
          const s = b.add("INPUT", "s");
          b.wire(s, n, "sel");
        }
        const e = compile(b.c);
        let seed = 12;
        for (let i = 0; i < 100; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const inputs = {
            [a]: seed & mask(width),
            [d]: (seed >>> 8) & mask(width),
          };
          expect(e.evaluate(inputs)).toEqual(reference(b.c, inputs));
        }
      }
  });
  it("exports trace and Verilog and reports failing testbench", () => {
    const c = examples[0],
      a = c.nodes[0].id,
      out = c.nodes.find((n) => n.label === "SUM")!.id;
    const r = testbench(c, {
      steps: [{ inputs: { [a]: 1 }, expect: { [out]: 0 }, edge: false }],
    });
    expect(r.passed).toBe(false);
    expect(csv(r.trace, c)).toContain("SUM");
    expect(vcd(r.trace, c)).toContain("$enddefinitions");
    expect(verilog(examples[4])).toContain("posedge clk");
  });
  it("bounds exhaustive work by bits", () => {
    const b = builder("wide");
    b.add("INPUT", "A", 13);
    expect(() => truth(b.c)).toThrow("12 independent");
  });
});
