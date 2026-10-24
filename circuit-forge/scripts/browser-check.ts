import { chromium, expect } from "@playwright/test";
import { writeFileSync, readFileSync } from "node:fs";
const base = process.env.CIRCUITFORGE_URL || "http://127.0.0.1:3001";
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
  headless: true,
});
const errors: string[] = [];
const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  }),
  page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const checks: string[] = [];
try {
  await page.goto(base);
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  await page.getByLabel("Input A", { exact: true }).fill("1");
  await page.getByLabel("Input B", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Single edge", exact: true }).click();
  await expect(page.getByText("tick 1 · retained 1/256")).toBeVisible();
  await page
    .getByRole("button", { name: "Find counterexample", exact: true })
    .click();
  await expect(page.getByText(/Counterexample loaded:/)).toBeVisible();
  await expect(page.locator(".comparison")).toContainText("0");
  checks.push(
    "input switches and counterexample assignment with differing outputs",
  );
  for (const [i, assignment] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].entries()) {
    await page
      .getByLabel("Input A", { exact: true })
      .fill(String(assignment[0]));
    await page
      .getByLabel("Input B", { exact: true })
      .fill(String(assignment[1]));
    await page
      .getByRole("button", { name: "Single edge", exact: true })
      .click();
    await expect(
      page.getByText(`tick ${i + 2} · retained ${i + 2}/256`),
    ).toBeVisible();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/images/editor.png", fullPage: true });
  await page.getByLabel("Project", { exact: true }).selectOption("example-4");
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  for (let i = 1; i <= 8; i++) {
    await page
      .getByRole("button", { name: "Single edge", exact: true })
      .click();
    await expect(page.getByText(`tick ${i} · retained ${i}/256`)).toBeVisible();
  }
  await expect(
    page.locator(".wave-row").filter({ hasText: "COUNT_OUT" }).locator("b"),
  ).toHaveText("8");
  checks.push("eight counter edges and waveform output");
  await page
    .locator("label")
    .filter({ hasText: "Run JSON testbench" })
    .locator("input")
    .setInputFiles({
      name: "counter.json",
      mimeType: "application/json",
      buffer: readFileSync("examples/counter.testbench.json"),
    });
  await expect(
    page.getByText("Testbench passed", { exact: true }),
  ).toBeVisible();
  checks.push("real JSON testbench through worker");
  await page.getByRole("button", { name: "Single edge", exact: true }).click();
  await expect(
    page.locator(".wave-row").filter({ hasText: "COUNT_OUT" }).locator("b"),
  ).toHaveText("2");
  checks.push("manual edge continues from the testbench final state");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  for (let i = 1; i <= 8; i++) {
    await page
      .getByRole("button", { name: "Single edge", exact: true })
      .click();
    await expect(page.getByText(`tick ${i} · retained ${i}/256`)).toBeVisible();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/images/counter.png", fullPage: true });
  const [recorded] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export replay", exact: true }).click(),
  ]);
  const recordedPath = await recorded.path();
  if (!recordedPath) throw Error("Missing replay download");
  const recording = JSON.parse(readFileSync(recordedPath, "utf8"));
  if (recording.steps.length !== 8)
    throw Error("Replay retained events across Reset");
  checks.push("replay export contains only the current run events");
  await page
    .locator("label")
    .filter({ hasText: "Replay JSON" })
    .locator("input")
    .setInputFiles({
      name: "replay.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(recording)),
    });
  await expect(
    page.getByText("Replay reproduced successfully", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".wave-row").filter({ hasText: "COUNT_OUT" }).locator("b"),
  ).toHaveText("8");
  await page.getByRole("button", { name: "Single edge", exact: true }).click();
  await expect(
    page.locator(".wave-row").filter({ hasText: "COUNT_OUT" }).locator("b"),
  ).toHaveText("9");
  checks.push("replay import reproduces state and subsequent clock behavior");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "8-bit synchronous counter copy",
  );
  const shared = await page.getByLabel("Project", { exact: true }).inputValue();
  const second = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    }),
    p2 = await second.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto(base);
  await p2.getByLabel("Project", { exact: true }).selectOption(shared);
  await expect(p2.getByText("● 2 local clients")).toBeVisible();
  await expect(page.getByText("● 2 local clients")).toBeVisible();
  const count = await page.locator(".react-flow__node").count();
  await page.getByRole("button", { name: "Add CONST", exact: true }).click();
  await expect(p2.locator(".react-flow__node")).toHaveCount(count + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(p2.locator(".react-flow__node")).toHaveCount(count);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(p2.locator(".react-flow__node")).toHaveCount(count + 1);
  checks.push("two browser contexts share a structural edit, undo and redo");
  await p2.reload();
  await expect(p2.locator(".react-flow__node")).toHaveCount(6);
  await p2.getByLabel("Project", { exact: true }).selectOption(shared);
  await expect(p2.locator(".react-flow__node")).toHaveCount(count + 1);
  checks.push("saved project reopened from server");
  // Delay outgoing edits to give both UIs the same base revision. All messages still reach the real local server.
  async function hold(p: typeof page) {
    await p.evaluate(() => {
      const original = WebSocket.prototype.send;
      const held: {
        socket: WebSocket;
        data: Parameters<WebSocket["send"]>[0];
      }[] = [];
      WebSocket.prototype.send = function (data) {
        if (typeof data === "string" && JSON.parse(data).type === "replace")
          held.push({ socket: this, data });
        else original.call(this, data);
      };
      (window as any).__release = () => {
        WebSocket.prototype.send = original;
        for (const item of held) original.call(item.socket, item.data);
      };
    });
  }
  async function rename(p: typeof page, index: number, label: string) {
    const node = p.locator(".react-flow__node").nth(index);
    await expect(node).toBeInViewport({ ratio: 0.9 });
    await node.locator("strong").click();
    await p.getByLabel("Label", { exact: true }).fill(label);
    await p
      .getByLabel("Label", { exact: true })
      .evaluate((e: HTMLInputElement) => e.blur());
  }
  console.log("Concurrent UI checks");
  await Promise.all([hold(page), hold(p2)]);
  await Promise.all([rename(page, 0, "RESET_A"), rename(p2, 1, "ENABLE_B")]);
  await Promise.all([
    page.evaluate(() => (window as any).__release()),
    p2.evaluate(() => (window as any).__release()),
  ]);
  for (const p of [page, p2]) {
    await expect(p.locator(".react-flow__node").nth(0)).toContainText(
      "RESET_A",
    );
    await expect(p.locator(".react-flow__node").nth(1)).toContainText(
      "ENABLE_B",
    );
  }
  checks.push(
    "two UI clients concurrently edit different components and converge",
  );
  await Promise.all([hold(page), hold(p2)]);
  await Promise.all([
    rename(page, 0, "CONFLICT_A"),
    rename(p2, 0, "CONFLICT_B"),
  ]);
  await Promise.all([
    page.evaluate(() => (window as any).__release()),
    p2.evaluate(() => (window as any).__release()),
  ]);
  await expect
    .poll(async () => {
      const texts = await Promise.all([
        page.locator("footer").innerText(),
        p2.locator("footer").innerText(),
      ]);
      return texts.some((t) => t.includes("Conflicting"));
    })
    .toBe(true);
  checks.push("two UI clients conflicting edit retains an explicit draft");
  await page.reload();
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  // Build a small circuit entirely through visible palette and connector interactions.
  await page
    .getByRole("button", { name: "Create circuit", exact: false })
    .click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Untitled circuit",
  );
  for (const kind of ["INPUT", "NOT", "OUTPUT"]) {
    await page
      .getByRole("button", { name: "Add " + kind, exact: true })
      .click();
    await expect(page.locator(".save")).toContainText("Saved locally");
  }
  await page.locator(".react-flow__controls-fitview").click();
  const ns = page.locator(".react-flow__node");
  await expect(ns).toHaveCount(3);
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) throw Error("Missing canvas");
  for (let i = 0; i < 3; i++) {
    const node = ns.nth(i);
    await expect(node).toBeInViewport({ ratio: 0.9 });
    const box = await node.boundingBox(),
      grab = await node.locator("strong").boundingBox();
    if (!box || !grab) throw Error("Missing node bounds");
    const before = Number(
      (await page.locator(".save").innerText()).match(/r(\d+)/)?.[1] || 0,
    );
    const targetX = canvas.x + 40 + (i * (canvas.width - box.width - 80)) / 2,
      targetY = canvas.y + canvas.height * 0.45 - box.height / 2;
    const startX = grab.x + grab.width / 2,
      startY = grab.y + grab.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + targetX - box.x, startY + targetY - box.y, {
      steps: 15,
    });
    await page.mouse.up();
    await expect
      .poll(async () =>
        Number(
          (await page.locator(".save").innerText()).match(/r(\d+)/)?.[1] || 0,
        ),
      )
      .toBeGreaterThan(before);
    await expect(node).toBeInViewport({ ratio: 0.9 });
  }
  async function connect(from: number, to: number) {
    const source = ns.nth(from).locator(".source"),
      target = ns.nth(to).locator(".target");
    await expect(source).toBeInViewport();
    await expect(target).toBeInViewport();
    const a = await source.boundingBox(),
      b = await target.boundingBox();
    if (!a || !b) throw Error("Missing handle");
    const before = await page.locator(".react-flow__edge").count();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await expect(target).toHaveClass(/\bvalid\b/);
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(before + 1);
    await expect(page.locator(".save")).toContainText("Saved locally");
  }
  await connect(0, 1);
  await connect(1, 2);
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  await page.getByLabel("Input INPUT", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Single edge", exact: true }).click();
  await expect(page.locator(".wave-row").locator("b")).toHaveText("0");
  checks.push("created and connected INPUT → NOT → OUTPUT on canvas");
  const wireStart = await ns.nth(0).locator(".source").boundingBox(),
    wireEnd = await ns.nth(1).locator(".target").boundingBox();
  if (!wireStart || !wireEnd) throw Error("Missing wire endpoints");
  await page.mouse.click(
    (wireStart.x + wireStart.width / 2 + wireEnd.x + wireEnd.width / 2) / 2,
    (wireStart.y + wireStart.height / 2 + wireEnd.y + wireEnd.height / 2) / 2,
  );
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(
    page.getByText("NOT.a: missing input", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  checks.push("wire selection, keyboard deletion and validated undo");

  await ns.nth(0).click();
  await ns.nth(1).click({ modifiers: ["Shift"] });
  await ns.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(ns).toHaveCount(6);
  await expect(page.locator(".save")).toContainText("Saved locally");
  await page.keyboard.press("Delete");
  await expect(ns).toHaveCount(3);
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  checks.push(
    "keyboard multiselection, copy/paste and delete preserve internal wires",
  );
  const [exported] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON", exact: true }).click(),
  ]);
  const path = await exported.path();
  if (!path) throw Error("No exported JSON");
  await page
    .locator("label")
    .filter({ hasText: /^Import$/ })
    .locator("input")
    .setInputFiles(path);
  await expect(page.getByText("✓ Valid executable netlist")).toBeVisible();
  checks.push("JSON download and import");
  if (errors.length) throw Error(errors.join("\n"));
  writeFileSync(
    "results/browser.json",
    JSON.stringify(
      {
        passed: true,
        viewport: { width: 1366, height: 900 },
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Browser checks passed: " + checks.length);
} catch (e) {
  await page
    .screenshot({ path: "test-results/failure.png", fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
