import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
mkdirSync("results", { recursive: true });
const steps: { command: string; passed: boolean; seconds: number }[] = [];
let server: ChildProcess | undefined;
const storage = mkdtempSync(path.join(tmpdir(), "circuit-evidence-"));
let failed = false;
function run(args: string[], env = process.env) {
  const start = performance.now(),
    r = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env,
      timeout: 180000,
    });
  steps.push({
    command: ["node", ...args].join(" "),
    passed: r.status === 0,
    seconds: (performance.now() - start) / 1000,
  });
  if (r.status !== 0) throw Error("Failed: " + args.join(" "));
}
try {
  for (const script of ["lint", "typecheck", "test", "build", "examples"]) {
    const start = performance.now(),
      r = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", script],
        { stdio: "inherit", timeout: 180000 },
      );
    steps.push({
      command: "npm run " + script,
      passed: r.status === 0,
      seconds: (performance.now() - start) / 1000,
    });
    if (r.status !== 0) throw Error("Failed quality gate: " + script);
  }
  run(["--import", "tsx", "scripts/protocol-check.ts"]);
  run(["--import", "tsx", "scripts/benchmark.ts"]);
  run(["--import", "tsx", "scripts/export-check.ts"]);
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: "3003", CIRCUITFORGE_DATA: storage },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Evidence server startup timeout")),
      10000,
    );
    server!.once("error", reject);
    server!.stdout!.on("data", (chunk) => {
      if (String(chunk).includes(":3003")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  run(["--import", "tsx", "scripts/browser-check.ts"], {
    ...process.env,
    CIRCUITFORGE_URL: "http://127.0.0.1:3003",
  });
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server!.once("exit", resolve));
  }
  rmSync(storage, { recursive: true, force: true });
  writeFileSync(
    "results/validation.json",
    JSON.stringify({ passed: !failed, node: process.version, steps }, null, 2),
  );
}
if (failed) process.exitCode = 1;
