import { generateContent } from "../../../lib/providers/anthropic";

describe("Anthropic Provider", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("throws error if apiKey is missing", async () => {
    await expect(generateContent("test", {})).rejects.toThrow("Anthropic API key not configured");
  });

  it("calls the Messages API with x-api-key auth and the anthropic-version header", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: "Response Text" }] }),
    });

    const config = { apiKey: "test-key", model: "claude-sonnet-5", temperature: 0.5, maxTokens: 100 };
    const result = await generateContent("Hello", config);

    expect(result).toBe("Response Text");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }),
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("handles API errors", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid x-api-key" } }),
    });

    const config = { apiKey: "bad-key", model: "claude-sonnet-5" };
    await expect(generateContent("test", config)).rejects.toThrow("invalid x-api-key");
  });
});
