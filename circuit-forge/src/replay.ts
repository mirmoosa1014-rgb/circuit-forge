import { z } from "zod";
import { circuitSchema, compile, type Circuit, type Values } from "./engine";
import { type Frame } from "./formats";
export const replaySchema = z.object({
  version: z.literal(1),
  circuit: circuitSchema,
  hash: z.string().length(64),
  initialState: z.record(z.string(), z.number().int().min(0).max(65535)),
  steps: z
    .array(
      z.object({
        inputs: z.record(z.string(), z.number().int().min(0).max(65535)),
        edge: z.boolean(),
      }),
    )
    .max(10000),
});
export async function contentHash(c: Circuit) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(circuitSchema.parse(c))),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function createReplay(
  c: Circuit,
  steps: { inputs: Values; edge: boolean }[],
  initialState: Values = {},
) {
  return {
    version: 1 as const,
    circuit: c,
    hash: await contentHash(c),
    initialState,
    steps,
  };
}
export async function replay(raw: unknown) {
  const r = replaySchema.parse(raw);
  if ((await contentHash(r.circuit)) !== r.hash)
    throw Error("Replay circuit content hash mismatch");
  const e = compile(r.circuit);
  let state = { ...e.initial(), ...r.initialState };
  const trace: Frame[] = [];
  for (const [tick, s] of r.steps.entries()) {
    for (const id of Object.keys(s.inputs))
      if (!e.c.nodes.some((n) => n.id === id && n.kind === "INPUT"))
        throw Error(`Unknown replay input ${id}`);
    const values = s.edge
      ? e.step(s.inputs, state)
      : { state, values: e.evaluate(s.inputs, state) };
    state = values.state;
    trace.push({ tick: tick + 1, values: values.values });
  }
  return {
    passed: true,
    trace,
    state,
    hash: r.hash,
    initialState: r.initialState,
    inputs: r.steps.at(-1)?.inputs || {},
    events: r.steps,
  };
}
