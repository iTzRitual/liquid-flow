import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let home;
let ctrl;

afterEach(async () => {
  if (ctrl) {
    try { ctrl.dispose(); } catch {}
    ctrl = null;
  }
  if (home) {
    try {
      const pidPath = path.join(home, "daemon.pid");
      if (fs.existsSync(pidPath)) {
        const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
        if (pid > 0) { try { process.kill(pid, "SIGTERM"); } catch {} }
      }
    } catch {}
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
    home = null;
  }
});

describe("Daemon — auto-spawn e2e", () => {
  it("spawns daemon automatically when no daemon is running and connects", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "lf-daemon-e2e-"));
    process.env.LIQUID_FLOW_HOME = home;
    process.env.LIQUID_FLOW_DAEMON_IDLE_MS = "1000";
    delete process.env.LIQUID_FLOW_NO_DAEMON;

    const { connectController } = await import("@liquidflow/core");

    ctrl = await connectController();

    if (!ctrl.getState()) {
      await new Promise((r) => ctrl.once("state", r));
    }

    const state = ctrl.getState();
    expect(state).toBeTruthy();
    expect(typeof state).toBe("object");
    expect(state).toHaveProperty("language");

    expect(fs.existsSync(path.join(home, "daemon.sock"))).toBe(true);
  }, 15000);
});
