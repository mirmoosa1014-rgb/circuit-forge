# Delivery audit

The local application and measured evidence are delivered and published at [mirmoosa1014-rgb/circuit-forge](https://github.com/mirmoosa1014-rgb/circuit-forge). The user directly approved public repository creation and pushing this project. The local `codex/circuit-forge` branch tracks the remote `main` branch. Hosted validation results are available in [GitHub Actions](https://github.com/mirmoosa1014-rgb/circuit-forge/actions/workflows/ci.yml).

## Completed and verified locally

| Milestone | Evidence |
|---|---|
| 1: model/engine | Version 1 schema; 1–16 bit primitives; compiler, independent reference evaluator, simultaneous register scheduling, hierarchy and recursion checks. Engine/oracle tests pass. |
| 2: editor | Palette, connections, wire/node deletion, selection/multiselection, keyboard copy/paste, drag/drop, pan/zoom/fit, inspector editing, project CRUD through create/open/rename/duplicate/save, imports/exports, guarded undo/redo. Browser construction and keyboard workflows pass. |
| 3: simulation | Worker jobs, bounded run/pause/reset/single edge/speed, retained waveforms/cursor/range/pan, JSON testbenches, continuation from final test state, CSV/VCD, content-hashed replay and state continuation. |
| 4: verification | Exhaustive tables/equivalence within 12 input bits, concrete counterexample assignment/selection/results, constant folding/identities/dead logic/structural sharing, before/after statistics, separate verified optimized copy. |
| 5: collaboration | Real two-context UI edits, concurrent independent edits, explicit conflict drafts, cursor/selection presence, authoritative revisions, operation retry handling, reconnect, SQLite transactions and real restart recovery. |
| 6: examples | Eight generated editable examples, including hierarchical ripple adder, exhaustive ALU checks, enabled/reset counter and traffic-light FSM. |
| 7: export | Deterministic Verilog + generated testbench. Icarus Verilog 13.0 locally cross-checks all eight examples, including 1,024 ALU vectors and 512 ripple-adder vectors. |
| 8: evidence | Six measured SVG charts, two actual editor screenshots, machine-readable CSV/JSON, raw timing trials, medians/p95, compiler cost and engine evaluation, optimization statistics, two-client localhost acknowledgment latency. |
| 9: checks | Lint, type checking, 17 engine tests, production build, 14 browser workflows, protocol/restart checks, export cross-checks. Secret scanning passes. Exact statuses are in results/. |
| 10: packaging | Locked dependencies, one-command development and evidence, production origin, clean temporary install/build/test, documentation, MIT license, notices, VS Code tasks and Linux CI workflow. Hosted Linux CI is configured; its current result is linked above. |

## Commands used

From `circuit-forge/`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run evidence`, `npm run bench`, `npm run test:protocol`, `npm run test:export -- --required`. A fresh temporary copy with no node_modules, dist, or local storage passed install, type checking, tests, and build. Dependency audit reported zero known advisories at the validation time. A temporary npm cache avoided an existing permissions problem in the user's default cache.

## Material limits

- The public repository contains only CircuitForge source and representative evidence. Local SQLite/session data, dependencies, caches, and temporary recordings are excluded.
- Definition editing is through schema-validated JSON or an expanded editable copy; the canvas does not offer nested visual navigation. Named instance signals can be inspected by their deterministic namespaced IDs.
- Equivalence/optimization are combinational only and decline domains above 12 bits. There is no sampled proof badge, SAT solver, sequential equivalence, technology mapping or physical timing.
- The local server has no account authentication or public-service deployment mode. Simulation is local per browser; presence is shared, not simulation state. Conflicted drafts require export or explicit discard.
- Interactive records are bounded to 10,000 events and 256 displayed frames. UI imports are limited to 512 KB; larger replay artifacts require the headless CLI. Replay UI import requires the matching circuit to be open.
- No demo animation was recorded; the screenshots and 90-second walkthrough are real/reproducible. Optional CPU, SAT and visual-FSM extensions were not implemented.

The checked-in results describe measured local workloads. Hosted CI runs independently on Linux; its status is linked above. Neither implies cross-machine or physical-hardware performance.
