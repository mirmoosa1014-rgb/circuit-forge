# A reproducible 90-second demo

Start `npm run dev` and open http://127.0.0.1:5173. Keep a second browser window ready at the same URL. All controls operate on the local server; no external account is needed.

| Time | Action and expected behavior |
|---|---|
| 0–20 s | Open **4-bit ALU**. Set A=9, B=6, OP=0. RESULT=15, ZERO=0, CARRY=0. Change OP to 1: RESULT=0 and ZERO=1. OP=2 and OP=3 both yield 15 for these inputs. Select an output to inspect it. |
| 20–35 s | Open **8-bit synchronous counter**. Click Single edge several times; COUNT_OUT increments and bus/bit waveforms appear. Set ENABLE=0: the next edge holds. Set RESET=1: the next edge becomes zero, even with ENABLE=0. |
| 35–50 s | Open **Half adder**, select **Faulty half adder** as the comparison, and click Find counterexample. A=B=1 is loaded; SUM differs (0 versus 1), and the output is selected. |
| 50–65 s | Open **Optimization lab**, click Optimize & verify copy. Inspect the actual count/depth reduction and equivalent result. Save the optimized copy to create a separate project. |
| 65–80 s | Open that same project in the second window. Add a constant or move a component in the first window. The second window receives the authoritative revision and edit. Move the cursor to show transient presence. Each window's live simulation remains local. |
| 80–90 s | Export the project JSON, trace CSV/VCD, or replay. The example counter testbench can be run through the Run JSON testbench file input. |

Keyboard: Shift supports multiselection on the canvas; platform Copy/Paste duplicates selected components and their internal wires; Delete removes selected canvas objects. Use the visible fit-view and pan/zoom controls. Search filters the palette. Imports validate JSON and never evaluate code.

`npm run evidence` reproduces genuine browser screenshots and automated workflows with fresh storage. It also exercises concurrent nonconflicting edits and a conflicting case in two contexts. The screenshot is an actual rendered application, not a mockup.
