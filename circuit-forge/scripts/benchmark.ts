import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import { compile, reference, optimize } from "../src/engine";
import { builder, examples } from "../src/examples";
mkdirSync("results", { recursive: true });
mkdirSync("docs/images", { recursive: true });
const full = process.argv.includes("--full"),
  vectors = full ? 300 : 100,
  trials = full ? 15 : 9;
const rows = [];
const percentile = (v: number[], p: number) =>
  [...v].sort((a, b) => a - b)[
    Math.min(v.length - 1, Math.floor(v.length * p))
  ];
for (const size of full ? [32, 64, 128, 256, 512] : [32, 64, 128, 256])
  for (const style of ["chain", "branched"])
    for (const switching of ["high", "low"]) {
      const b = builder(`${style} ${size}`),
        a = b.add("INPUT", "A", 8),
        d = b.add("INPUT", "B", 8),
        ids = [a, d];
      let seed = 41;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed;
      };
      for (let i = 0; i < size; i++) {
        const first =
            style === "chain" ? ids.at(-1)! : ids[random() % ids.length],
          second = style === "chain" ? a : ids[random() % ids.length];
        ids.push(
          b.gate((["XOR", "OR", "AND"] as const)[i % 3], first, second, 8),
        );
      }
      b.out(ids.at(-1)!, "OUT", 8);
      const inputs = Array.from({ length: vectors }, (_, i) => ({
        [a]: ((switching === "high" ? i : Math.floor(i / 10)) * 73) & 255,
        [d]: ((switching === "high" ? i : Math.floor(i / 10)) * 31) & 255,
      }));
      const e = compile(b.c);
      for (const x of inputs)
        if (JSON.stringify(e.evaluate(x)) !== JSON.stringify(reference(b.c, x)))
          throw Error("Oracle mismatch");
      const samples = {
        compile: [] as number[],
        compiled: [] as number[],
        reference: [] as number[],
      };
      for (let trial = -2; trial < trials; trial++) {
        let t = performance.now();
        compile(b.c);
        if (trial >= 0) samples.compile.push(performance.now() - t);
        t = performance.now();
        for (const x of inputs) e.evaluate(x);
        if (trial >= 0)
          samples.compiled.push(((performance.now() - t) * 100) / vectors);
        t = performance.now();
        for (const x of inputs) reference(b.c, x);
        if (trial >= 0)
          samples.reference.push(((performance.now() - t) * 100) / vectors);
      }
      rows.push({
        size,
        scenario: style + "/" + switching,
        compile_ms: percentile(samples.compile, 0.5),
        compiled_ms_per_100: percentile(samples.compiled, 0.5),
        reference_ms_per_100: percentile(samples.reference, 0.5),
        compiled_evaluations_per_second:
          100000 / percentile(samples.compiled, 0.5),
        reference_evaluations_per_second:
          100000 / percentile(samples.reference, 0.5),
        p95: {
          compile_ms: percentile(samples.compile, 0.95),
          compiled_ms_per_100: percentile(samples.compiled, 0.95),
          reference_ms_per_100: percentile(samples.reference, 0.95),
        },
        samples,
      });
    }
const optimization = optimize(examples[5]);
const result = {
  environment: {
    node: process.version,
    platform: process.platform,
    cpu: os.cpus()[0]?.model,
  },
  mode: full ? "full" : "quick",
  vectors,
  trials,
  method: `${vectors} vectors per trial; 2 warmups; ${trials} measured trials; medians and p95; engine only. Chained and seeded branched DAGs with differing fan-out, high/low input switching. Reference evaluation includes its deliberately simple hierarchy-copy and recursive traversal. Compiled evaluation reuses one netlist. No rendering/network time or cross-machine claim. All output values checked before timing. No timeouts or failed cases in this bounded run.`,
  rows,
  optimization: { before: optimization.before, after: optimization.after },
};
writeFileSync("results/benchmark.json", JSON.stringify(result, null, 2));
writeFileSync(
  "results/benchmark.csv",
  "size,scenario,compile_ms,compiled_ms_per_100,reference_ms_per_100\n" +
    rows
      .map((r) =>
        [
          r.size,
          r.scenario,
          r.compile_ms,
          r.compiled_ms_per_100,
          r.reference_ms_per_100,
        ].join(","),
      )
      .join("\n"),
);
const chartRows = rows.filter((r) => r.scenario === "chain/high");
function chart(
  file: string,
  title: string,
  labels: string[],
  series: { name: string; values: number[]; color: string }[],
  unit: string,
) {
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.1;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360" viewBox="0 0 760 360"><rect width="760" height="360" fill="#10192a"/><g fill="#cddbea" font-family="sans-serif"><text x="32" y="35" font-size="19">${title}</text><text x="32" y="60" font-size="12">${unit} · ${unit === "eval/s" ? "higher" : "lower"} is better</text>`;
  labels.forEach((label, i) => {
    const x = 80 + i * (600 / labels.length);
    svg += `<text x="${x}" y="315" font-size="12">${label}</text>`;
    series.forEach((s, j) => {
      const value = s.values[i],
        h = (value / max) * 200;
      svg += `<rect x="${x + j * 35}" y="${290 - h}" width="28" height="${h}" fill="${s.color}"/><text x="${x + j * 35}" y="${282 - h}" font-size="10">${value.toFixed(2)}</text>`;
    });
  });
  series.forEach(
    (s, i) =>
      (svg += `<text x="${32 + i * 250}" y="342" fill="${s.color}" font-size="12">${s.name}</text>`),
  );
  writeFileSync("docs/images/" + file, svg + "</g></svg>");
}
chart(
  "evaluation.svg",
  "Engine evaluation time",
  chartRows.map((r) => "" + r.size),
  [
    {
      name: "Compiled",
      values: chartRows.map((r) => r.compiled_ms_per_100),
      color: "#47dec1",
    },
    {
      name: "Reference",
      values: chartRows.map((r) => r.reference_ms_per_100),
      color: "#ad9fff",
    },
  ],
  "ms / 100 vectors",
);
chart(
  "throughput.svg",
  "Engine throughput: chain/high",
  chartRows.map((r) => String(r.size)),
  [
    {
      name: "Compiled",
      values: chartRows.map((r) => r.compiled_evaluations_per_second),
      color: "#47dec1",
    },
    {
      name: "Reference",
      values: chartRows.map((r) => r.reference_evaluations_per_second),
      color: "#ad9fff",
    },
  ],
  "eval/s",
);
chart(
  "compilation.svg",
  "Netlist compilation",
  chartRows.map((r) => "" + r.size),
  [
    {
      name: "Compile",
      values: chartRows.map((r) => r.compile_ms),
      color: "#47dec1",
    },
  ],
  "ms",
);
chart(
  "optimization.svg",
  "Optimization lab: structural counts",
  ["Primitives", "Wires"],
  [
    {
      name: "Before",
      values: [optimization.before.primitives, optimization.before.wires],
      color: "#ad9fff",
    },
    {
      name: "After",
      values: [optimization.after.primitives, optimization.after.wires],
      color: "#47dec1",
    },
  ],
  "count",
);
chart(
  "depth.svg",
  "Optimization lab: logic depth",
  ["Depth"],
  [
    { name: "Before", values: [optimization.before.depth], color: "#ad9fff" },
    { name: "After", values: [optimization.after.depth], color: "#47dec1" },
  ],
  "gate levels",
);
writeFileSync(
  "docs/benchmarks.md",
  "# Measured engine benchmarks\n\n" +
    result.method +
    "\n\nEnvironment: " +
    JSON.stringify(result.environment) +
    "\n\n```json\n" +
    JSON.stringify(
      rows.map(({ samples: _samples, ...r }) => r),
      null,
      2,
    ) +
    "\n```\n\nRaw trial samples are in results/benchmark.json. These synthetic DAGs are narrow workloads, not a general performance claim. Structural counts are not physical area, power or delay.\n",
);
console.log(JSON.stringify(result, null, 2));

if (existsSync("results/collaboration.json")) {
  const collaboration = JSON.parse(
    readFileSync("results/collaboration.json", "utf8"),
  );
  chart(
    "collaboration.svg",
    "Accepted edit round-trip: localhost",
    ["Median", "p95"],
    [
      {
        name: "2 connected clients, 12 edits",
        values: [collaboration.latency.median_ms, collaboration.latency.p95_ms],
        color: "#47dec1",
      },
    ],
    "ms",
  );
}
