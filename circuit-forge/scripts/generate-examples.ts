import { mkdirSync, writeFileSync } from "node:fs";
import { examples } from "../src/examples";
import { compile } from "../src/engine";
mkdirSync("examples", { recursive: true });
for (const [i, c] of examples.entries()) {
  compile(c);
  const file = i + "-" + c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  writeFileSync("examples/" + file + ".json", JSON.stringify(c, null, 2));
  if (i === 4) {
    const out = c.nodes.find((n) => n.label === "COUNT_OUT")!.id,
      enable = c.nodes.find((n) => n.label === "ENABLE")!.id,
      reset = c.nodes.find((n) => n.label === "RESET")!.id;
    writeFileSync(
      "examples/counter.testbench.json",
      JSON.stringify(
        {
          steps: [
            { inputs: {}, expect: { [out]: 1 } },
            { inputs: {}, expect: { [out]: 2 } },
            { inputs: { [enable]: 0 }, expect: { [out]: 2 } },
            { inputs: { [reset]: 1 }, expect: { [out]: 0 } },
            { inputs: { [reset]: 0, [enable]: 1 }, expect: { [out]: 1 } },
          ],
        },
        null,
        2,
      ),
    );
  }
}
