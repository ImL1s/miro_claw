import { describe, it } from "node:test";
import assert from "node:assert";

describe("MiroFish Extension Integration", () => {
  it("plugin exports correct shape", async () => {
    const mod = await import("../../index.js");
    const plugin = mod.default;

    assert.strictEqual(plugin.id, "mirofish");
    assert.strictEqual(typeof plugin.register, "function");
    assert.ok(plugin.name);
    assert.ok(plugin.description);
    assert.ok(plugin.version);
  });

  it("register calls all registration methods", async () => {
    const calls: string[] = [];
    const mockApi = {
      id: "test",
      logger: { info: () => {}, error: () => {} },
      pluginConfig: { cliBin: "echo" },
      registerTool: () => calls.push("tool"),
      registerHook: (_events: unknown, _handler: unknown, _opts?: unknown) =>
        calls.push("hook"),
      registerGatewayMethod: (method: string) =>
        calls.push(`gateway:${method}`),
      registerHttpRoute: () => calls.push("httpRoute"),
      registerService: () => calls.push("service"),
    };

    const mod = await import("../../index.js");
    mod.default.register(mockApi);

    assert.ok(calls.includes("tool"), "should register at least one tool");
    assert.ok(calls.includes("hook"), "should register message hook");
    assert.ok(calls.includes("service"), "should register service");
    assert.ok(
      calls.some((c) => c.startsWith("gateway:")),
      "should register gateway methods",
    );
    assert.ok(calls.includes("gateway:mirofish.predict"));
    assert.ok(calls.includes("gateway:mirofish.status"));
    assert.ok(calls.includes("gateway:mirofish.cancel"));
    assert.ok(calls.includes("gateway:mirofish.list"));
  });
});
