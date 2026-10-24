# Validation evidence

The evidence command starts isolated local servers with fresh temporary SQLite storage. It runs lint, type checking, engine tests, production build, example generation, protocol checks, measurements, Icarus cross-checks when installed, and actual browser workflows. It removes its temporary storage after completion and writes `results/validation.json`.

- `results/browser.json`: 14 workflows at 1366×900, including circuit construction, waveforms, testbench/replay continuation, keyboard editing, imports/exports, concurrent independent edits, and a conflict in two browser contexts. No mocked server is used. Before concurrent edits, the browser asserts that the component is in the viewport rather than relying on a fixed loading delay.
- `results/collaboration.json`: real WebSocket clients, retry/idempotence, conflicts, malformed input, rejected origin, reconnect and a real server restart. Latency samples use two connected clients on localhost, one active sender.
- `results/verilog.json`: actual Icarus version and per-example parity checks. A missing executable is explicitly reported as locally unverified; CI requires the tool.
- `results/benchmark.json` and `.csv`: saved observations with environment, trial counts, median/p95 and raw samples. Charts are derived from these values. Full mode is an optional larger bounded run; the checked-in results use quick mode.
- `results/clean-checkout.json`: a fresh temporary copy without installed dependencies, built assets or storage passed locked installation, type checking, tests and build.

Engine tests cover every primitive family at representative widths, seeded DAG/reference agreement, exhaustive adders and ALU, register/reset/enable/simultaneous updates, hierarchy recursion, invalid netlists, safe optimization including constant outputs, replay hashes/events and CSV/VCD/HDL emission.

The suite records failures with a nonzero exit status. Earlier failed attempts were fixed before the final local pass; only representative final evidence is checked in. Browser failure screenshots are ignored by Git. A clean hosted CI run remains separate from these local results.
