import { generateContent } from '../../../lib/providers/groq';

describe('Groq Provider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  it('throws error if apiKey is missing', async () => {
    await expect(generateContent('test', {})).rejects.toThrow('Groq API key not configured');
  });

  it('calls the correct API endpoint with correct body', async () => {
     global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Groq Response' } }]
      })
    });

    const config = {
      apiKey: 'groq-key',
      model: 'groq-llama-3.3-70b',
      temperature: 0.7
    };

    const result = await generateContent('Hello Groq', config);

    expect(result).toBe('Groq Response');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
            'Authorization': 'Bearer groq-key',
            'Content-Type': 'application/json'
        }),
        body: expect.any(String)
      })
    );
     const body = JSON.parse(global.fetch.mock.calls[0][1].body);
     expect(body.messages[0].content).toBe('Hello Groq');
     expect(body.model).toBe('llama-3.3-70b-versatile');
  });

   it('handles API errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Server Error' } })
    });

    const config = { apiKey: 'groq-key', model: 'groq-llama-3.3-70b' };

    await expect(generateContent('test', config)).rejects.toThrow('Server Error');
  });
});
