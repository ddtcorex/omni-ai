import {
  selectionFromStored,
  selectionToStored,
  customNameFor,
  customSentinelFor,
} from "../../lib/model-selection.js";

describe("selectionFromStored", () => {
  test("a listed model selects its button under the saved provider", () => {
    expect(selectionFromStored({ apiProvider: "openai", apiModel: "gpt-5.7-nova" })).toEqual({
      providerId: "openai",
      modelId: "gpt-5.7-nova",
      customName: "",
    });
  });

  test("a saved shipped id is kept verbatim", () => {
    expect(
      selectionFromStored({ apiProvider: "openai", apiModel: "openai-gpt-5.6-terra" }).modelId,
    ).toBe("openai-gpt-5.6-terra");
  });

  test("the gateway entry fills the custom name from the gateway's own key", () => {
    expect(
      selectionFromStored({
        apiProvider: "customGateway",
        apiModel: "custom-gateway",
        customGatewayModelName: "qwen3.8-27b",
        customModelName: "other",
      }),
    ).toEqual({ providerId: "customGateway", modelId: null, customName: "qwen3.8-27b" });
  });

  test("a provider's custom entry fills the custom name", () => {
    expect(
      selectionFromStored({
        apiProvider: "openai",
        apiModel: "openai-custom",
        customModelName: "ft:x",
      }),
    ).toEqual({ providerId: "openai", modelId: null, customName: "ft:x" });
  });

  test("a legacy config without apiProvider resolves through the registry", () => {
    expect(
      selectionFromStored({ apiModel: "custom-gateway", customGatewayModelName: "qwen3.8-27b" }),
    ).toEqual({ providerId: "customGateway", modelId: null, customName: "qwen3.8-27b" });
  });

  test("a listed model whose id ends in -custom is a model, not the custom entry", () => {
    expect(
      selectionFromStored({
        apiProvider: "customGateway",
        apiModel: "acme/llama-custom",
        customModelName: "x",
      }),
    ).toEqual({ providerId: "customGateway", modelId: "acme/llama-custom", customName: "" });
  });

  test("nothing saved selects nothing", () => {
    expect(selectionFromStored({})).toEqual({ providerId: null, modelId: null, customName: "" });
  });
});

describe("customNameFor", () => {
  const config = { apiProvider: "openai", apiModel: "openai-custom", customModelName: "ft:x" };

  test("the custom field belongs to the saved provider", () => {
    expect(customNameFor("openai", config)).toBe("ft:x");
    expect(customNameFor("groq", config)).toBe("");
  });

  test("a saved listed model leaves the field empty", () => {
    expect(
      customNameFor("openai", {
        apiProvider: "openai",
        apiModel: "gpt-5.7-nova",
        customModelName: "x",
      }),
    ).toBe("");
  });
});

describe("customSentinelFor", () => {
  test("each provider has its custom entry id", () => {
    expect(customSentinelFor("openai")).toBe("openai-custom");
    expect(customSentinelFor("google")).toBe("google-custom");
    expect(customSentinelFor("customGateway")).toBe("custom-gateway");
  });
});

describe("selectionToStored", () => {
  test("a model button saves its API name with the provider", () => {
    expect(
      selectionToStored({ providerId: "openai", modelId: "gpt-5.7-nova", customName: "" }, {}),
    ).toEqual({ ok: true, values: { apiProvider: "openai", apiModel: "gpt-5.7-nova" } });
  });

  test("a saved shipped id survives an untouched save byte for byte", () => {
    const stored = { apiProvider: "openai", apiModel: "openai-gpt-5.6-terra" };
    expect(
      selectionToStored({ providerId: "openai", modelId: "gpt-5.6-terra", customName: "" }, stored)
        .values,
    ).toEqual({ apiProvider: "openai", apiModel: "openai-gpt-5.6-terra" });
  });

  test("the same API name under another provider is a new choice", () => {
    const stored = { apiProvider: "anthropic", apiModel: "claude-sonnet-5" };
    expect(
      selectionToStored(
        { providerId: "customGateway", modelId: "claude-sonnet-5", customName: "" },
        stored,
      ).values,
    ).toEqual({ apiProvider: "customGateway", apiModel: "claude-sonnet-5" });
  });

  test("a gateway custom name saves the gateway entry and its own key", () => {
    expect(
      selectionToStored(
        { providerId: "customGateway", modelId: null, customName: " qwen3.8-27b " },
        {},
      ).values,
    ).toEqual({
      apiProvider: "customGateway",
      apiModel: "custom-gateway",
      customGatewayModelName: "qwen3.8-27b",
    });
  });

  test("a provider custom name saves its custom entry", () => {
    expect(
      selectionToStored({ providerId: "groq", modelId: "x", customName: "my-model" }, {}).values,
    ).toEqual({ apiProvider: "groq", apiModel: "groq-custom", customModelName: "my-model" });
  });

  test("a custom name of spaces is no custom name", () => {
    expect(
      selectionToStored({ providerId: "openai", modelId: null, customName: "   " }, {}),
    ).toEqual({ ok: false, reason: "no-model" });
  });

  test("no provider writes no AI values", () => {
    expect(selectionToStored({ providerId: null, modelId: null, customName: "" }, {})).toEqual({
      ok: true,
      values: {},
    });
  });
});
