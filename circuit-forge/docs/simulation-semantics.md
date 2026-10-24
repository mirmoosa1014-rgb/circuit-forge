# Simulation semantics

Circuit format version 1 contains named nodes with stable IDs, explicit widths, wires with source/output and destination/input port names, canvas coordinates, and optional reusable definitions. Unknown schema versions are rejected. A future migration must be an explicit tested version-to-version function; version 1 is the only supported version today. JSON imports are data only and never evaluated as code.

Values are unsigned binary integers. Widths are 1–16. A node's output is truncated with `(1 << width) - 1`; bit zero is the least significant bit. Splitter output `b0` selects bit zero. Joiner input `b0` contributes bit zero. Mux `sel=0` selects `a`; `sel=1` selects `b`. NOT, NAND, and NOR are masked to the declared width.

Inputs default to their stored initial value and may be changed through live input switches. Constants use their stored value. Probes and output nodes forward their `a` input. Every declared required input must be driven exactly once, including register reset and enabled register enable pins. A register may be explicitly configured without an enable pin; then it samples every edge. An unconnected required input never receives a convenient inferred value.

A register starts at its masked initial value. One global clock is controlled by the toolbar or testbench. A rising edge:

1. Settles all combinational logic from the old register state and current inputs.
2. Samples every register from that same settled state.
3. Applies synchronous reset to zero with priority over enable. Otherwise samples `d` if enabled, or holds.
4. Updates all registers simultaneously and settles combinational logic again.

Reset is synchronous: changing RESET alone does not change state until the next edge. The toolbar Reset restores initial state and clears the run history; it is a separate simulator control. Combinational feedback is rejected; feedback broken by registers is valid. Layout changes do not change node semantics.

A testbench has a `steps` array. Each step merges its input changes into the prior input assignment. With `edge:true` (the default), it takes exactly one rising edge and samples expectations after post-edge settling. With `edge:false`, it settles without a clock edge, then samples. Expectations use stable component IDs. Tick zero is the first headless testbench step. The UI numbers completed events starting at one, loads the final testbench state and input assignment, and can continue stepping from it. The example counter bench demonstrates enabled increments, hold, and reset priority.

Replay version 1 includes the exact circuit content, a SHA-256 content hash, explicit initial state, and each recorded input assignment and edge flag. The UI records input assignments at clock edges. Intermediate combinational changes between edges are outside the UI recording; callers can record them explicitly with `edge:false`. Replay frames number completed events starting at one. The UI requires the matching circuit to be open before importing a replay; the CLI can use the embedded circuit directly. Replaying the same content and events reproduces the same logical values.

The viewer retains the most recent 256 frames and labels this retention. Its cursor inspects a retained frame, the range selector changes zoom, and the history slider pans the displayed interval. Bus values are unsigned decimal. CSV names are escaped. VCD uses a conventional time unit solely to encode logical ticks; it does not claim a physical timing result.

All behavior is binary, synchronous, and zero delay. There are no X/Z values, analog voltage, gate delay, asynchronous reset, clock skew, metastability, or hardware validation.
