# Project summary

CircuitForge is a local digital-logic editor with a shared TypeScript simulator, reusable subcircuits, clocked state, waveform inspection, exhaustive small-domain verification, optimization, HDL export, and revisioned multi-client editing backed by SQLite. Editable generated examples exercise arithmetic and sequential behavior using the same primitive engine as user-created circuits.

Evidence includes engine/oracle tests, exhaustive ALU and adder checks, deterministic replay, real browser interactions, two-client conflict/reconnect checks, server restart recovery, saved benchmark samples and charts, actual screenshots, and an optional independent Icarus export cross-check. Consult results files for the latest exact pass/fail status and docs/progress.md for unresolved acceptance items. Hosted CI is separate from local validation.

Suggested resume bullet, after reviewing and reproducing the implementation:

> Developed CircuitForge with AI assistance: a TypeScript digital-logic workbench with clocked simulation, exhaustive equivalence checks over up to 12 input bits, SQLite-backed local collaboration, and Verilog export cross-checked on eight editable examples.

AI assistance was used to author and debug code, tests, evidence scripts, and documentation. This description does not imply that the repository owner independently wrote every component, measured physical hardware, created a SAT solver, or completed learning activities that have not occurred.

Future extensions: a visual FSM synthesis editor, educational CPU, or independently validated bounded SAT checker. None is implemented or required by core operation.
