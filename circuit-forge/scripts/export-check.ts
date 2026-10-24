import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { examples } from "../src/examples";
import { verilog, verilogTestbench } from "../src/formats";
const available = spawnSync("iverilog", ["-V"], { encoding: "utf8" });
if (available.error) {
  const result = {
    status: "unverified locally",
    reason:
      "Icarus Verilog executable is not installed. CI contains a bounded Linux cross-check.",
    generatedExamples: examples.length,
  };
  writeFileSync("results/verilog.json", JSON.stringify(result, null, 2));
  console.log(result.reason);
  if (process.argv.includes("--required")) process.exitCode = 1;
} else {
  const dir = mkdtempSync(path.join(tmpdir(), "circuit-hdl-"));
  const checks = [];
  try {
    for (const c of examples) {
      const source = path.join(dir, "circuit.v"),
        bench = path.join(dir, "testbench.v"),
        output = path.join(dir, "sim");
      writeFileSync(source, verilog(c));
      writeFileSync(bench, verilogTestbench(c, 4096));
      const compile = spawnSync(
        "iverilog",
        ["-g2012", "-s", "testbench", "-o", output, source, bench],
        { encoding: "utf8", timeout: 15000 },
      );
      if (compile.status !== 0) throw Error(compile.stderr);
      const result = spawnSync("vvp", [output], {
        encoding: "utf8",
        timeout: 15000,
      });
      if (result.status !== 0) throw Error(result.stdout + result.stderr);
      checks.push({
        name: c.name,
        output: result.stdout
          .split("\n")
          .filter((line) => line.startsWith("PASS "))
          .join("\n"),
      });
    }
    writeFileSync(
      "results/verilog.json",
      JSON.stringify(
        { status: "passed", version: available.stdout.split("\n")[0], checks },
        null,
        2,
      ),
    );
    console.log(checks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
