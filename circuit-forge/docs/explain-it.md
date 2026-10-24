# How CircuitForge works

Think of a combinational circuit as a recipe. Inputs are ingredients; every gate computes a small operation; wires say which earlier result an operation uses. The compiler sorts the recipe so each operation reads values that have already been computed. A cycle with no register has no first instruction, so it is rejected.

A register is memory. On an edge, every register reads the old settled circuit before any register changes. Then all new values become visible together. This is why a two-register swap really swaps values instead of accidentally copying one value into both registers.

Verification asks a precise question. With nine input bits, a ripple adder has only 512 possible input assignments. Checking every assignment can establish equivalence over this binary model. With 30 bits, there are over a billion assignments; the tool declines exhaustive work rather than pretending a handful of trials is a proof.

Optimization simplifies a circuit while preserving its external answers. `x XOR 0` can become `x`, and duplicated identical gates can share a result. The tool still enumerates the allowed input domain afterward because a plausible rewrite can contain a width or wiring bug.

Collaboration adds another kind of ordering. Each accepted edit receives a server revision. Independent changes can merge, while two different edits to the same component need an explicit conflict. SQLite keeps acknowledged revisions when the server restarts.

## Ten technical questions

1. **Why a topological order?** It guarantees that each combinational node's dependencies have values before evaluation and avoids repeating dependency traversal for every vector.
2. **Why separate compile and evaluate?** Structural validation and ordering are paid once; many input vectors reuse that work. Benchmarks measure these costs separately.
3. **Why an independent reference evaluator?** A separate recursive implementation can expose scheduling and value bugs in the compiled implementation. Comparing two wrappers around the same code would provide much weaker evidence.
4. **What does a 4-bit NOT of zero return?** Fifteen (`1111`), because NOT is masked to the declared width.
5. **Why does reset beat enable?** The model declares synchronous reset priority. A register with reset=1 becomes zero at the edge even if enable=0. This convention is tested and exported consistently.
6. **Can a combinational loop work?** This zero-delay binary model rejects it. Register feedback is supported because register outputs are old-state sources during settling.
7. **Does exhaustive equivalence prove the hardware works?** It verifies the supported finite combinational model. It says nothing about analog behavior, fabrication, physical timing, metastability, or an incorrectly specified intended function.
8. **Why measure depth and counts?** They describe circuit structure. They are not direct measurements of silicon area, power, or maximum clock speed.
9. **Is the collaboration algorithm a CRDT?** No. An authoritative server serializes accepted revisions and compares changes against retained base versions. Some simultaneous edits explicitly conflict.
10. **Why use Icarus?** Compiling and running generated Verilog through a separate implementation can reveal exporter errors the TypeScript simulator alone cannot detect. Its expected output vectors still come from the tested internal model, so this is an export-parity check rather than a new hardware specification.

AI assistance contributed implementation, tests, and documentation. Reading the code, reproducing experiments, and explaining tradeoffs are separate learning activities; this project does not claim the owner already independently mastered them.
