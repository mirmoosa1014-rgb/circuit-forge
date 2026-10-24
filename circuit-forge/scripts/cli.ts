import { readFileSync, writeFileSync } from "node:fs";
import { circuitSchema, truth, optimize, equivalent } from "../src/engine";
import { testbench, csv, vcd, verilog } from "../src/formats";
import { replay } from "../src/replay";
const [cmd, file, extra, out] = process.argv.slice(2);
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
try {
  if (cmd === "replay") {
    console.log(JSON.stringify(await replay(read(file)), null, 2));
  } else {
    const c = circuitSchema.parse(read(file));
    switch (cmd) {
      case "truth":
        console.log(JSON.stringify(truth(c), null, 2));
        break;
      case "optimize":
        console.log(JSON.stringify(optimize(c), null, 2));
        break;
      case "compare":
        console.log(
          JSON.stringify(
            equivalent(c, circuitSchema.parse(read(extra))),
            null,
            2,
          ),
        );
        break;
      case "verilog":
        if (extra) writeFileSync(extra, verilog(c));
        else console.log(verilog(c));
        break;
      case "testbench": {
        const result = testbench(c, read(extra));
        if (out) {
          writeFileSync(out + ".csv", csv(result.trace, c));
          writeFileSync(out + ".vcd", vcd(result.trace, c));
        }
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) process.exitCode = 1;
        break;
      }
      default:
        throw Error(
          "Usage: npm run cli -- truth|optimize|verilog CIRCUIT [OUTPUT]; compare CIRCUIT OTHER; testbench CIRCUIT BENCH [TRACE_PREFIX]; replay REPLAY",
        );
    }
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
