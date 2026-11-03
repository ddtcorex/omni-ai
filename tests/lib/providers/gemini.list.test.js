import { listModels } from "../../../lib/providers/gemini.js";

test("gemini listModels sends the key in the query and strips the models prefix", async () => {
  let seen;
  global.fetch = jest.fn(async (u) => {
    seen = u;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          {
            name: "models/gemini-3.6-flash",
            displayName: "Gemini 3.6 Flash",
            supportedGenerationMethods: ["generateContent", "countTokens"],
          },
        ],
      }),
    };
  });

  const result = await listModels({ apiKey: "AIza-x" });

  expect(seen).toContain("/v1beta/models?key=AIza-x");
  expect(result.models[0].id).toBe("gemini-3.6-flash");
  expect(result.models[0].label).toBe("Gemini 3.6 Flash");
  expect(result.models[0].methods).toEqual(["generateContent", "countTokens"]);
});

test("gemini listModels follows nextPageToken", async () => {
  let calls = 0;
  global.fetch = jest.fn(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: "models/a", supportedGenerationMethods: ["generateContent"] }],
          nextPageToken: "t1",
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: "models/b", supportedGenerationMethods: ["generateContent"] }],
      }),
    };
  });

  const result = await listModels({ apiKey: "k" });

  expect(calls).toBe(2);
  expect(result.models.map((m) => m.id)).toEqual(["a", "b"]);
  expect(result.truncated).toBe(false);
});
