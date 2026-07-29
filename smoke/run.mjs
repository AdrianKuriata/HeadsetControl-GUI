#!/usr/bin/env node
// Smoke E2E on the real app — level 3 of the pyramid (docs/architecture/testing.md).
//
// This is the only automated test of the *real* IPC path: the built Tauri binary,
// its Rust adapter, and a fake `headsetcontrol` on PATH answering with recorded
// fixtures. Everything below the webview is genuine; only the CLI is a stand-in.
//
// Playwright cannot drive a WebKitGTK webview, so this speaks WebDriver to
// `tauri-driver` — over plain HTTP, because the client libraries negotiate
// extensions (BiDi sockets, vendor capabilities) that tauri-driver rejects the
// whole session over. The protocol surface used here is four calls wide.
//
// One app launch per case: what the app does *at startup* is most of what there
// is to check.
import { spawn } from "node:child_process";
import { access, constants, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "src-tauri/target/release/headset-deck");
const FAKE = join(ROOT, "smoke/fake-headsetcontrol");
const FIXTURES = join(ROOT, "docs/fixtures");

// Resolved up front and passed as absolute paths: one of the cases hands the
// app an empty PATH, and the drivers must still be findable — they are the
// harness, not part of what is being tested.
const DRIVER = await onPath(process.env.TAURI_DRIVER ?? "tauri-driver");
const NATIVE_DRIVER = await onPath(process.env.WEBKIT_WEBDRIVER ?? "WebKitWebDriver");
const PORT = Number(process.env.SMOKE_PORT ?? 4444);

/**
 * Long enough to cover a cold launch plus the worst wait a case can produce: two
 * of the adapter's 10 s call timeouts back to back, because the hotplug loop
 * lists devices on its own thread while the startup probe runs and the two are
 * serialised against each other. Twice that, so a slow CI runner is not a flake.
 */
const TIMEOUT = 45_000;

const SIDETONE = "[data-capability='CAP_SIDETONE']";

/**
 * `scenario` is what the fake binary answers with; `null` means it is not on
 * PATH at all — the missing-binary case.
 */
const CASES = [
  {
    name: "a healthy device lands on the ready screen",
    scenario: "healthy",
    async check(app) {
      await app.expectText("h1", "Audeze Maxwell 2");
      // Rendered from the capabilities the fixture reports, parsed by the real
      // adapter: every one of them but the battery, which is a header.
      await app.expectCount("[data-capability]", 6);
      await app.expectText("[data-part='battery']", "%");
    },
  },
  {
    name: "nothing connected lands on the no-device screen",
    scenario: "no-devices",
    check: (app) => app.expectText("h1", "No headset connected"),
  },
  {
    name: "a released 3.1.0 binary lands on the bad-version screen",
    scenario: "old-release",
    async check(app) {
      await app.expectText("h1", "too old");
      await app.expectText("[data-part='body']", "3.1.0");
    },
  },
  {
    // The `healthy` fixture is a source build, whose version the gate cannot
    // compare and therefore waves through. This is the other half: a real
    // release number, actually compared against the minimum, and accepted.
    name: "a released binary at the minimum version lands on the ready screen",
    scenario: "supported-release",
    check: (app) => app.expectText("h1", "Audeze Maxwell 2"),
  },
  {
    name: "output the adapter cannot read lands on the bad-version screen",
    scenario: "malformed",
    check: (app) => app.expectText("[data-part='body']", "could not be read"),
  },
  {
    name: "a binary that never answers lands on the missing-binary screen",
    scenario: "hang",
    // The adapter kills the call after its timeout and reports a binary it
    // cannot run, which is the screen telling the user how to get a working one.
    check: (app) => app.expectText("h1", "headsetcontrol not found"),
  },
  {
    // The same as above, except the fake leaves a child holding the pipes the
    // adapter reads. The kill reaches the process it spawned and no further, so
    // this is the case that proves the timeout bounds the *call* and not just
    // the child (issue #50).
    name: "a binary that hangs behind a child of its own is still bounded",
    scenario: "hang-forking",
    check: (app) => app.expectText("h1", "headsetcontrol not found"),
  },
  {
    name: "no binary at all lands on the missing-binary screen",
    scenario: null,
    check: (app) => app.expectText("h1", "headsetcontrol not found"),
  },
  {
    name: "a write reaches the binary with the arguments the CLI wants",
    scenario: "healthy",
    async check(app, { log }) {
      await app.expectText("h1", "Audeze Maxwell 2");
      await app.setSlider(`${SIDETONE} input`, 64);

      const write = await waitFor(
        async () => (await calls(log)).find((call) => call.includes(" -s ")),
        "the write to reach the binary",
      );

      // The device id the CLI insists on, the flag the capability maps to, the
      // value, and json output — assembled by the adapter, not by the UI.
      assert(write === "-d 0x3329:0x4b28 -s 64 --output=json", `unexpected write call: ${write}`);
      // The value stuck, so the adapter read the `actions` array as a success.
      await app.expectText(`${SIDETONE} [data-part='level']`, "64");
    },
  },
  {
    name: "a write the device refuses rolls back and reports it",
    scenario: "write-refused",
    async check(app) {
      await app.expectText("h1", "Audeze Maxwell 2");
      await app.setSlider(`${SIDETONE} input`, 64);

      // The fixture's `actions` array carries a failure for this device while
      // the CLI still exits 0 — parsing is what catches it (ADR 0009).
      await app.expectText("[data-part='toast']", "CAP_SIDETONE");
      await app.expectText(`${SIDETONE} [data-part='level']`, "—");
    },
  },
];

async function main() {
  await assertBuilt();

  const failures = [];

  for (const testCase of CASES) {
    process.stdout.write(`• ${testCase.name}\n`);

    try {
      await run(testCase);
      process.stdout.write("  ✓ passed\n");
    } catch (error) {
      failures.push(testCase.name);
      process.stdout.write(`  ✗ ${error.message}\n`);
    }
  }

  process.stdout.write(
    failures.length > 0
      ? `\n${failures.length}/${CASES.length} smoke cases failed\n`
      : `\n${CASES.length} smoke cases passed\n`,
  );
  process.exit(failures.length > 0 ? 1 : 0);
}

/** Launches the app under `tauri-driver` with the fake binary in place. */
async function run(testCase) {
  const workspace = await mkdtemp(join(tmpdir(), "headset-deck-smoke-"));
  const log = join(workspace, "calls.log");
  const env = {
    ...process.env,
    SMOKE_FIXTURES: FIXTURES,
    SMOKE_LOG: log,
    // The app picks its language from `navigator.language`, which WebKitGTK
    // takes from the environment. Pinned, so the assertions can name the
    // English copy on a machine whose owner reads Polish.
    LANG: "en_US.UTF-8",
    LANGUAGE: "en",
    LC_ALL: "en_US.UTF-8",
  };

  if (testCase.scenario === null) {
    // An empty directory as the *whole* PATH: nothing named headsetcontrol can
    // be found, which is the case the app has to survive.
    const empty = join(workspace, "empty");
    await mkdir(empty);
    env.PATH = empty;
  } else {
    await symlink(FAKE, join(workspace, "headsetcontrol"));
    env.PATH = `${workspace}:${process.env.PATH}`;
    env.SMOKE_SCENARIO = testCase.scenario;
  }

  const driver = spawn(DRIVER, ["--native-driver", NATIVE_DRIVER, "--port", String(PORT)], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });

  let app;

  try {
    await waitForPort(PORT);
    app = await waitFor(() => App.start().catch(() => undefined), "a WebDriver session");
    await testCase.check(app, { log });
  } finally {
    await app?.stop();
    driver.kill();
    await waitForPortFree(PORT);
    await rm(workspace, { recursive: true, force: true });
  }
}

/** The app under WebDriver: a session and the few things the checks ask of it. */
class App {
  constructor(sessionId) {
    this.base = `http://127.0.0.1:${PORT}/session/${sessionId}`;
  }

  static async start() {
    const session = await request("POST", `http://127.0.0.1:${PORT}/session`, {
      capabilities: {
        alwaysMatch: { browserName: "wry", "tauri:options": { application: APP } },
        firstMatch: [{}],
      },
    });

    return new App(session.sessionId);
  }

  stop() {
    return request("DELETE", this.base).catch(() => {});
  }

  /** Runs a snippet in the page and returns what it returns. */
  execute(script, args = []) {
    return request("POST", `${this.base}/execute/sync`, { script, args });
  }

  text(selector) {
    return this.execute("return document.querySelector(arguments[0])?.innerText ?? null", [
      selector,
    ]);
  }

  count(selector) {
    return this.execute("return document.querySelectorAll(arguments[0]).length", [selector]);
  }

  /**
   * Moves a range input the way a person would — assigning `.value` alone would
   * not tell Vue anything, so the `input` event goes with it.
   */
  setSlider(selector, value) {
    return this.execute(
      `const input = document.querySelector(arguments[0]);
       const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
       setter.call(input, String(arguments[1]));
       input.dispatchEvent(new Event("input", { bubbles: true }));
       return true;`,
      [selector, value],
    );
  }

  /** Case-insensitive: much of the design renders text uppercase in CSS. */
  async expectText(selector, needle) {
    const wanted = needle.toLowerCase();

    await waitFor(
      async () => (await this.text(selector))?.toLowerCase().includes(wanted),
      `${selector} to contain "${needle}"`,
    );
  }

  async expectCount(selector, expected) {
    await waitFor(
      async () => (await this.count(selector)) === expected,
      `${expected} elements matching ${selector}`,
    );
  }
}

/** One WebDriver call. Its errors carry the driver's own message. */
async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.value?.message ?? `${method} ${url} failed (${response.status})`);
  }

  return payload.value;
}

/** Absolute path of a binary, looked up the way a shell would. */
async function onPath(name) {
  if (name.includes("/")) {
    return name;
  }

  for (const dir of (process.env.PATH ?? "").split(":")) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`${name} is not on PATH — see docs/architecture/testing.md`);
}

async function assertBuilt() {
  try {
    await readFile(APP);
  } catch {
    throw new Error(`${APP} is missing — run \`make build-ci\` first`);
  }
}

/** Every argument list the fake binary has been called with so far. */
async function calls(log) {
  try {
    return (await readFile(log, "utf8")).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Polls rather than sleeps, and answers with whatever the condition produced. */
async function waitFor(condition, what) {
  const deadline = Date.now() + TIMEOUT;

  while (Date.now() < deadline) {
    const outcome = await condition().catch(() => undefined);
    if (outcome) {
      return outcome;
    }
    await pause(100);
  }

  throw new Error(`timed out waiting for ${what}`);
}

function reachable(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.end();
      done(true);
    });
    socket.on("error", () => done(false));
  });
}

/**
 * The port being connectable is necessary but not sufficient: `tauri-driver`
 * binds it before it can serve, so the first `POST /session` can still be reset.
 * This is the cheap half — creating the session is retried on top of it.
 */
function waitForPort(port) {
  return waitFor(() => reachable(port), `tauri-driver on port ${port}`);
}

/** The next case reuses the port; starting before it is free would race. */
function waitForPortFree(port) {
  return waitFor(async () => !(await reachable(port)), `port ${port} to be free`);
}

function pause(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
