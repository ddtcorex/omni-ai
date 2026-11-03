import { filterChatModels } from "../../lib/model-catalog.js";

const m = (id, extra = {}) => ({
  id,
  label: id,
  createdAt: null,
  state: "unknown",
  methods: null,
  ...extra,
});

test("openai filter keeps chat families and drops everything else", () => {
  const ids = filterChatModels("openai", [
    m("gpt-5.7-nova"),
    m("o4-mini"),
    m("text-embedding-3-large"),
    m("whisper-1"),
    m("dall-e-3"),
    m("omni-moderation-latest"),
  ]).map((x) => x.id);

  expect(ids).toEqual(["gpt-5.7-nova", "o4-mini"]);
});

test("gemini filter requires generateContent", () => {
  const ids = filterChatModels("google", [
    m("gemini-3.6-flash", { methods: ["generateContent"] }),
    m("text-embedding-004", { methods: ["embedContent"] }),
    m("aqa", { methods: [] }),
  ]).map((x) => x.id);

  expect(ids).toEqual(["gemini-3.6-flash"]);
});

test("retired models never survive and custom gateway is never filtered", () => {
  expect(
    filterChatModels("anthropic", [
      m("claude-old", { state: "retired" }),
      m("claude-sonnet-5", { state: "active" }),
    ]),
  ).toHaveLength(1);
  expect(filterChatModels("customGateway", [m("anything-goes")])).toHaveLength(1);
});

test("an empty result from a non empty payload is not the filter's problem to hide", () => {
  const listed = [m("text-embedding-3-large")];
  expect(filterChatModels("openai", listed)).toHaveLength(0);
});
