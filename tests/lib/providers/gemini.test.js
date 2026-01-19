import { generateContent } from '../../../lib/providers/gemini';

describe('Gemini Provider', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws error if apiKey is missing', async () => {
    await expect(generateContent('test', {})).rejects.toThrow('Gemini API key not configured');
  });

  it('calls the correct API endpoint with correct body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Response Text' }] } }]
      })
    });

    const config = {
      apiKey: 'test-key',
      model: 'gemini-1.5-flash',
      temperature: 0.5
    };

    const result = await generateContent('Hello', config);

    expect(result).toBe('Response Text');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String)
      })
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe('Hello');
    expect(body.generationConfig.temperature).toBe(0.5);
  });

  it('handles API errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad Request' } })
    });

    const config = { apiKey: 'test-key', model: 'gemini-1.5-flash' };

    await expect(generateContent('test', config)).rejects.toThrow('Bad Request');
  });

  it('retries on 429 errors', async () => {
     global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Success after retry' }] } }]
        })
      });

    const config = { apiKey: 'test-key', model: 'gemini-1.5-flash' };

    const result = await generateContent('test', config);

    expect(result).toBe('Success after retry');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
