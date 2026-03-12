import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRunManager, type RunManager } from "../run-manager.js";

const noopLog = {
  info: () => {},
  error: () => {},
};

function makeManager(overrides: Record<string, unknown> = {}): RunManager {
  return createRunManager({
    maxConcurrent: 3,
    runTimeout: 30_000,
    dedupeWindow: 5_000,
    idempotencyTTL: 60_000,
    cliBin: "/usr/bin/false",
    log: noopLog,
    ...overrides,
  });
}

describe("RunManager", () => {
  let mgr: RunManager;

  beforeEach(() => {
    mgr = makeManager();
  });

  afterEach(() => {
    mgr.cleanup();
  });

  // ── questionHash ──────────────────────────────────────────

  it("questionHash is deterministic and case-insensitive", () => {
    const h1 = mgr.questionHash("Will BTC hit 100k?");
    const h2 = mgr.questionHash("will btc hit 100k?");
    const h3 = mgr.questionHash("  WILL BTC HIT 100K?  ");

    assert.equal(h1, h2);
    assert.equal(h2, h3);
    assert.equal(h1.length, 16);
  });

  it("questionHash differs for different questions", () => {
    const h1 = mgr.questionHash("Will BTC hit 100k?");
    const h2 = mgr.questionHash("Will ETH hit 10k?");

    assert.notEqual(h1, h2);
  });

  // ── canSpawn ──────────────────────────────────────────────

  it("canSpawn returns false when maxConcurrent reached", () => {
    const m = makeManager({ maxConcurrent: 2 });

    assert.equal(m.canSpawn(), true);

    // Manually add entries to _activeRuns to simulate active processes
    m._activeRuns.set("run-1", {
      runId: "run-1",
      process: null,
      topic: "topic1",
      startedAt: Date.now(),
      timeoutTimer: null,
      killTimer: null,
    });
    assert.equal(m.canSpawn(), true);

    m._activeRuns.set("run-2", {
      runId: "run-2",
      process: null,
      topic: "topic2",
      startedAt: Date.now(),
      timeoutTimer: null,
      killTimer: null,
    });
    assert.equal(m.canSpawn(), false);

    m.cleanup();
  });

  // ── checkDedupe ───────────────────────────────────────────

  it("checkDedupe blocks same messageId within window", () => {
    const m = makeManager({ dedupeWindow: 5_000 });

    assert.equal(m.checkDedupe("msg-1"), true);  // first call: allowed
    assert.equal(m.checkDedupe("msg-1"), false); // second call: blocked
    assert.equal(m.checkDedupe("msg-2"), true);  // different id: allowed

    m.cleanup();
  });

  it("checkDedupe allows same messageId after window expires", async () => {
    const m = makeManager({ dedupeWindow: 50 });

    assert.equal(m.checkDedupe("msg-1"), true);
    assert.equal(m.checkDedupe("msg-1"), false);

    // Wait for the dedupe window to expire
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(m.checkDedupe("msg-1"), true);

    m.cleanup();
  });

  // ── cacheResult / getCachedResult ─────────────────────────

  it("cacheResult and getCachedResult round-trip", () => {
    const hash = mgr.questionHash("test question");
    mgr.cacheResult(hash, "report-abc-123");

    assert.equal(mgr.getCachedResult(hash), "report-abc-123");
  });

  it("getCachedResult returns null for expired entries", async () => {
    const m = makeManager({ idempotencyTTL: 50 });
    const hash = m.questionHash("test question");
    m.cacheResult(hash, "report-abc-123");

    assert.equal(m.getCachedResult(hash), "report-abc-123");

    // Wait for the TTL to expire
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(m.getCachedResult(hash), null);

    m.cleanup();
  });

  // ── cleanup ───────────────────────────────────────────────

  it("cleanup clears all state", () => {
    // Add some state
    mgr._activeRuns.set("run-1", {
      runId: "run-1",
      process: null,
      topic: "topic1",
      startedAt: Date.now(),
      timeoutTimer: null,
      killTimer: null,
    });
    mgr.checkDedupe("msg-1");
    mgr.cacheResult("hash-1", "report-1");

    assert.equal(mgr._activeRuns.size, 1);

    mgr.cleanup();

    assert.equal(mgr._activeRuns.size, 0);
    // After cleanup, dedupe should allow same messageId again
    assert.equal(mgr.checkDedupe("msg-1"), true);
    // After cleanup, cache should return null
    assert.equal(mgr.getCachedResult("hash-1"), null);
  });
});
