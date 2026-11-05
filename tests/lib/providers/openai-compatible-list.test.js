import { listModels as openaiList } from "../../../lib/providers/openai.js";
import { listModels as groqList } from "../../../lib/providers/groq.js";
import { listModels as gatewayList } from "../../../lib/providers/custom-gateway.js";

test("openai listModels GETs /v1/models with a bearer header", async () => {
  let seen;
  global.fetch = jest.fn(async (url, opts) => {
    seen = { url, opts };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "gpt-5.7-nova", created: 1700000000 }] }),
    };
  });

  const result = await openaiList({ apiKey: "sk-x" });

  expect(seen.url).toBe("https://api.openai.com/v1/models");
  expect(seen.opts.headers.Authorization).toBe("Bearer sk-x");
  expect(result.models[0]).toEqual({
    id: "gpt-5.7-nova",
    label: "gpt-5.7-nova",
    createdAt: 1700000000000,
    state: "unknown",
    methods: null,
  });
  expect(result.truncated).toBe(false);
});

test("groq listModels points at the groq host", async () => {
  let url;
  global.fetch = jest.fn(async (u) => {
    url = u;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });

  await groqList({ apiKey: "gsk_x" });

  expect(url).toBe("https://api.groq.com/openai/v1/models");
});

test("custom gateway listModels appends /models to its base url and omits auth when no key", async () => {
  let seen;
  global.fetch = jest.fn(async (u, o) => {
    seen = { u, o };
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });

  await gatewayList({ baseUrl: "https://gw.example/v1/", apiKey: "" });

  expect(seen.u).toBe("https://gw.example/v1/models");
  expect(seen.o.headers.Authorization).toBeUndefined();
});

test("a non ok response throws with the provider message", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "bad key" } }),
  }));

  await expect(openaiList({ apiKey: "k" })).rejects.toThrow("bad key");
});
