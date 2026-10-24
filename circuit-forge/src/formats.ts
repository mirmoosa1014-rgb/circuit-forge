import { z } from "zod";
import { compile, flatten, type Circuit, type Values } from "./engine";
export const benchSchema = z.object({
  steps: z
    .array(
      z.object({
        inputs: z.record(z.string(), z.number().int().min(0).max(65535)),
        expect: z
          .record(z.string(), z.number().int().min(0).max(65535))
          .optional(),
        edge: z.boolean().default(true),
      }),
    )
    .max(10000),
});
export type Frame = { tick: number; values: Values };
export function testbench(c: Circuit, raw: unknown) {
  const bench = benchSchema.parse(raw),
    e = compile(c);
  let state = e.initial(),
    inputs: Values = {};
  const trace: Frame[] = [];
  const events: { inputs: Values; edge: boolean }[] = [];
  for (const [tick, s] of bench.steps.entries()) {
    inputs = { ...inputs, ...s.inputs };
    for (const id of Object.keys(inputs))
      if (!c.nodes.some((n) => n.id === id && n.kind === "INPUT"))
        throw Error(`Unknown input ${id}`);
    let values = e.evaluate(inputs, state);
    if (s.edge) {
      const r = e.step(inputs, state);
      state = r.state;
      values = r.values;
    }
    trace.push({ tick, values });
    events.push({ inputs: { ...inputs }, edge: s.edge });
    for (const [id, expected] of Object.entries(s.expect || {}))
      if (values[id] !== expected)
        return {
          passed: false,
          tick,
          signal: id,
          expected,
          observed: values[id],
          trace,
          state,
          inputs,
          events,
          initialState: e.initial(),
        };
  }
  return {
    passed: true,
    trace,
    state,
    inputs,
    events,
    initialState: e.initial(),
  };
}
export function csv(trace: Frame[], c: Circuit) {
  const ids = c.nodes.filter((n) => ["OUTPUT", "PROBE"].includes(n.kind));
  return [
    ["tick", ...ids.map((n) => n.label)],
    ...trace.map((f) => [f.tick, ...ids.map((n) => f.values[n.id])]),
  ]
    .map((row) =>
      row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
    )
    .join("\n");
}
export function vcd(trace: Frame[], c: Circuit) {
  const nodes = c.nodes.filter((n) => ["OUTPUT", "PROBE"].includes(n.kind));
  return (
    "$timescale 1ns $end\n$comment Logical ticks only; no physical timing $end\n$scope module circuit $end\n" +
    nodes.map((n, i) => `$var wire ${n.width} s${i} ${n.id} $end`).join("\n") +
    "\n$upscope $end\n$enddefinitions $end\n" +
    trace
      .map(
        (f) =>
          "#" +
          f.tick +
          "\n" +
          nodes
            .map(
              (n, i) =>
                `b${f.values[n.id].toString(2).padStart(n.width, "0")} s${i}`,
            )
            .join("\n"),
      )
      .join("\n")
  );
}
export function verilog(c: Circuit) {
  c = flatten(c);
  const e = compile(c),
    names = new Map(c.nodes.map((n, i) => [n.id, "n" + i]));
  const name = (id: string) => names.get(id)!;
  const width = (n: { width: number }) => `[${n.width - 1}:0] `;
  const read = (id: string, p: string) => {
    const w = e.inputs.get(id)!.get(p)!;
    return name(w.from) + (w.port === "out" ? "" : `[${+w.port.slice(1)}]`);
  };
  const regs = c.nodes.some((n) => n.kind === "REG");
  const ports = c.nodes.filter((n) => ["INPUT", "OUTPUT"].includes(n.kind));
  const lines = [
    `// CircuitForge binary synchronous model. Ports map to component IDs below.`,
    `module circuit(${[...(regs ? ["input wire clk"] : []), ...ports.map((n) => `${n.kind === "INPUT" ? "input" : "output"} wire ${width(n)}${name(n.id)}`)].join(", ")});`,
  ];
  for (const n of c.nodes)
    if (!["INPUT", "OUTPUT"].includes(n.kind))
      lines.push(
        `${n.kind === "REG" ? "reg" : "wire"} ${width(n)}${name(n.id)};`,
      );
  for (const n of c.nodes) {
    lines.push(`// ${name(n.id)} = ${n.id}`);
    if (n.kind === "INPUT") continue;
    let expr = "";
    switch (n.kind) {
      case "REG":
        lines.push(
          `initial ${name(n.id)} = ${n.width}'d${n.value};`,
          `always @(posedge clk) if (${read(n.id, "reset")}) ${name(n.id)} <= 0; else ${n.hasEnable === false ? "" : `if (${read(n.id, "enable")}) `}${name(n.id)} <= ${read(n.id, "d")};`,
        );
        continue;
      case "CONST":
        expr = `${n.width}'d${n.value}`;
        break;
      case "AND":
      case "OR":
      case "XOR":
      case "NAND":
      case "NOR":
        expr = `(${read(n.id, "a")} ${{ AND: "&", OR: "|", XOR: "^", NAND: "&", NOR: "|" }[n.kind]} ${read(n.id, "b")})`;
        if (["NAND", "NOR"].includes(n.kind)) expr = "~" + expr;
        break;
      case "NOT":
        expr = "~" + read(n.id, "a");
        break;
      case "MUX":
        expr = `${read(n.id, "sel")} ? ${read(n.id, "b")} : ${read(n.id, "a")}`;
        break;
      case "JOIN":
        expr =
          "{" +
          Array.from({ length: n.width }, (_, i) =>
            read(n.id, "b" + (n.width - 1 - i)),
          ).join(", ") +
          "}";
        break;
      default:
        expr = read(n.id, "a");
    }
    lines.push(`assign ${name(n.id)} = ${expr};`);
  }
  return lines.join("\n") + "\nendmodule\n";
}

/** Generates trusted testbench source for this model; never imports or runs supplied HDL. */
export function verilogTestbench(raw: Circuit, limit = 32) {
  const c = flatten(raw),
    e = compile(c);
  const sequential = c.nodes.some((n) => n.kind === "REG");
  const ins = c.nodes.filter((n) => n.kind === "INPUT"),
    outs = c.nodes.filter((n) => n.kind === "OUTPUT");
  const name = (id: string) => "n" + c.nodes.findIndex((n) => n.id === id);
  const bits = ins.reduce((sum, n) => sum + n.width, 0);
  const count = sequential ? 32 : Math.min(2 ** Math.min(bits, 12), limit);
  const lines = [
    "module testbench;",
    ...(sequential ? ["reg clk = 0;"] : []),
    ...ins.map(
      (n) => `reg ${n.width > 1 ? `[${n.width - 1}:0] ` : ""}${name(n.id)};`,
    ),
    ...outs.map(
      (n) => `wire ${n.width > 1 ? `[${n.width - 1}:0] ` : ""}${name(n.id)};`,
    ),
    `circuit dut(${[...(sequential ? [".clk(clk)"] : []), ...ins.concat(outs).map((n) => `.${name(n.id)}(${name(n.id)})`)].join(", ")});`,
    "initial begin",
  ];
  let state = e.initial();
  for (let tick = 0; tick < count; tick++) {
    let packed = tick;
    const inputs: Values = {};
    for (const n of ins) {
      inputs[n.id] = sequential
        ? n.label === "RESET"
          ? tick === 8
            ? 1
            : 0
          : n.label === "ENABLE"
            ? tick % 5 === 0
              ? 0
              : 1
            : tick & ((1 << n.width) - 1)
        : packed & ((1 << n.width) - 1);
      packed >>>= n.width;
      lines.push(`${name(n.id)} = ${n.width}'d${inputs[n.id]};`);
    }
    let values = e.evaluate(inputs, state);
    lines.push("#1;");
    if (sequential) {
      const result = e.step(inputs, state);
      state = result.state;
      values = result.values;
      lines.push("clk = 1; #1;");
    }
    for (const n of outs)
      lines.push(
        `if (${name(n.id)} !== ${n.width}'d${values[n.id]}) $fatal(1, "Mismatch tick ${tick}, ${name(n.id)}");`,
      );
    if (sequential) lines.push("clk = 0; #1;");
  }
  lines.push(
    `$display("PASS ${count} vectors/edges");`,
    "$finish;",
    "end",
    "endmodule",
  );
  return lines.join("\n") + "\n";
}
