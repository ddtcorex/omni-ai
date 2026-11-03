import { listModels } from "../../../lib/providers/anthropic.js";

test("anthropic listModels uses x-api-key and the version header", async () => {
  let seen;
  global.fetch = jest.fn(async (u, o) => {
    seen = { u, o };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "claude-sonnet-5",
            display_name: "Claude Sonnet 5",
            created_at: "2026-01-02T00:00:00Z",
            deprecated_at: null,
          },
        ],
        has_more: false,
      }),
    };
  });

  const result = await listModels({ apiKey: "sk-ant" });

  expect(seen.u).toContain("/v1/models");
  expect(seen.o.headers["x-api-key"]).toBe("sk-ant");
  expect(seen.o.headers["anthropic-version"]).toBe("2023-06-01");
  expect(result.models[0].label).toBe("Claude Sonnet 5");
  expect(result.models[0].state).toBe("active");
});

test("anthropic listModels follows has_more up to the page cap and reports truncation", async () => {
  let calls = 0;
  global.fetch = jest.fn(async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: `m${calls}`, deprecated_at: null }],
        has_more: true,
        last_id: `m${calls}`,
      }),
    };
  });

  const result = await listModels({ apiKey: "k" });

  expect(calls).toBe(5);
  expect(result.truncated).toBe(true);
  expect(result.models).toHaveLength(5);
});

test("anthropic listModels marks a deprecated model and keeps page one when page two fails", async () => {
  let calls = 0;
  global.fetch = jest.fn(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "old", deprecated_at: "2026-02-01T00:00:00Z" }],
          has_more: true,
          last_id: "old",
        }),
      };
    }
    return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
  });

  const result = await listModels({ apiKey: "k" });

  expect(result.models).toHaveLength(1);
  expect(result.models[0].state).toBe("deprecated");
  expect(result.truncated).toBe(true);
});
