import captured from "../../fixtures/models/openrouter.json";
import { listModels as gatewayList } from "../../../lib/providers/custom-gateway.js";
import { filterChatModels } from "../../../lib/model-catalog.js";

// The other provider fixtures in this directory are synthesized from the
// vendors' SDK types. This one is observed: `npm run capture:models` wrote it
// from a real response, and it pins the shared OpenAI-compatible normalizer
// against field names nobody wrote by hand (id, created, and 17 more).

const body = { data: captured.entries };

function stub(responseBody) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => responseBody,
  }));
}

test("the captured payload parses through the OpenAI-compatible normalizer", async () => {
  stub(body);

  const result = await gatewayList({ baseUrl: "https://openrouter.ai/api/v1" });

  expect(result.models).toHaveLength(captured.kept);
  expect(result.truncated).toBe(false);
  result.models.forEach((model) => {
    expect(typeof model.id).toBe("string");
    expect(model.id.length).toBeGreaterThan(0);
  });
});

test("the capture kept the created timestamp in the seconds the API sends", async () => {
  stub(body);

  const result = await gatewayList({ baseUrl: "https://openrouter.ai/api/v1" });
  const withCreated = captured.entries.filter((entry) => typeof entry.created === "number");

  expect(withCreated.length).toBeGreaterThan(0);
  withCreated.forEach((entry, index) => {
    const model = result.models.find((candidate) => candidate.id === entry.id);
    expect(model.createdAt).toBe(entry.created * 1000);
    expect(index).toBeGreaterThanOrEqual(0);
  });
});

test("a gateway keeps every captured id, and the OpenAI include list is what filters", async () => {
  stub(body);

  const result = await gatewayList({ baseUrl: "https://openrouter.ai/api/v1" });

  expect(filterChatModels("customGateway", result.models)).toHaveLength(captured.kept);
  // Real vendor-prefixed ids are not chat models for the OpenAI provider, which
  // is exactly why the include list exists rather than an exclude list.
  expect(filterChatModels("openai", result.models)).toHaveLength(0);
});
