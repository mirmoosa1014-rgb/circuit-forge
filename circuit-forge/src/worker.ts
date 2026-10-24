import {
  compile,
  truth,
  equivalent,
  optimize,
  type Circuit,
  type Values,
} from "./engine";
import { replay, contentHash, replaySchema } from "./replay";
import { testbench } from "./formats";
let engine: ReturnType<typeof compile> | undefined;
let key = "";
onmessage = async (event: MessageEvent) => {
  const { id, job, circuit, inputs, state, other, bench } = event.data as {
    id: number;
    job: string;
    circuit: Circuit;
    inputs: Values;
    state: Values;
    other: Circuit;
    bench: unknown;
  };
  try {
    let result: unknown;
    if (job === "replay") {
      const recording = replaySchema.parse(bench);
      if ((await contentHash(circuit)) !== recording.hash)
        throw Error(
          "Open the matching circuit before importing this replay. The CLI can replay its embedded circuit directly.",
        );
      result = await replay(recording);
    } else if (job === "truth") result = truth(circuit);
    else if (job === "compare") result = equivalent(circuit, other);
    else if (job === "optimize") result = optimize(circuit);
    else if (job === "testbench") result = testbench(circuit, bench);
    else {
      const next = JSON.stringify({
        ...circuit,
        nodes: circuit.nodes.map(({ x: _x, y: _y, label: _label, ...n }) => n),
      });
      if (next !== key) {
        engine = compile(circuit);
        key = next;
      }
      result =
        job === "step"
          ? engine!.step(inputs, state)
          : {
              state: state || engine!.initial(),
              values: engine!.evaluate(inputs, state),
            };
    }
    postMessage({ id, result });
  } catch (e) {
    postMessage({ id, error: String(e instanceof Error ? e.message : e) });
  }
};
