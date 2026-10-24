import { circuitSchema, type Circuit } from "./engine";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
/** Three-way merge by stable object ID. Same-object simultaneous edits conflict. */
export function mergeEdit(
  base: Circuit,
  current: Circuit,
  proposed: Circuit,
): Circuit {
  const next = structuredClone(current);
  for (const key of ["name", "definitions"] as const) {
    if (!same(base[key], proposed[key])) {
      if (!same(base[key], current[key]))
        throw Error(`Conflicting project ${key} edit`);
      if (key === "name") next.name = proposed.name;
      else next.definitions = proposed.definitions;
    }
  }
  for (const key of ["nodes", "wires"] as const) {
    const before = new Map(base[key].map((n) => [n.id, n])),
      after = new Map(proposed[key].map((n) => [n.id, n])),
      now = new Map(current[key].map((n) => [n.id, n]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (same(before.get(id), after.get(id))) continue;
      if (!same(before.get(id), now.get(id)))
        throw Error(`Conflicting ${key} edit: ${id}`);
      if (after.has(id)) now.set(id, after.get(id)!);
      else now.delete(id);
    }
    if (key === "nodes") next.nodes = [...now.values()] as Circuit["nodes"];
    else next.wires = [...now.values()] as Circuit["wires"];
  }
  const ids = new Set(next.nodes.map((n) => n.id));
  for (const w of next.wires)
    if (!ids.has(w.from) || !ids.has(w.to))
      throw Error(`Wire ${w.id}: endpoint was deleted concurrently`);
  return circuitSchema.parse(next);
}
