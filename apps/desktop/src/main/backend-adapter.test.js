const test = require("node:test");
const assert = require("node:assert/strict");

const { BackendEventAdapter } = require("./backend-adapter");

test("backend adapter emits enter_task when focus_active toggles on", () => {
  const adapter = new BackendEventAdapter();

  const first = adapter.adapt({
    event: "wristband",
    data: {
      metrics_status: "ready",
      focus_active: false,
      sdnn: 56
    }
  });

  assert.equal(first.some((item) => item.type === "enter_task"), false);

  const second = adapter.adapt({
    event: "wristband",
    data: {
      metrics_status: "ready",
      focus_active: true,
      sdnn: 58
    }
  });

  assert.equal(second.some((item) => item.type === "enter_task"), true);
});
