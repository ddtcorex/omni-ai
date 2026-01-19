import { generateContent, improveText } from '../../lib/ai-service';
import * as Providers from '../../lib/providers/index';

jest.mock('../../lib/providers/index', () => ({
  getProvider: jest.fn()
}));

const mockProvider = {
  generateContent: jest.fn()
};

describe('AI Service', () => {
  let store = {};

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};

    Providers.getProvider.mockReturnValue(mockProvider);

    // Mock chrome storage implementation to support Promises
    chrome.storage.local.get.mockImplementation((keys) => {
        return new Promise((resolve) => {
            if (keys === null) {
                resolve(store);
                return;
            }
            if (typeof keys === 'string') {
                resolve({ [keys]: store[keys] });
                return;
            }
             if (Array.isArray(keys)) {
                 const res = {};
                 keys.forEach(k => res[k] = store[k]);
                 resolve(res);
                 return;
            }
            // Object with defaults
            const res = {};
            for (const k in keys) {
                res[k] = store[k] !== undefined ? store[k] : keys[k];
            }
            resolve(res);
        });
    });

     chrome.storage.local.set.mockImplementation((items) => {
        return new Promise((resolve) => {
            Object.assign(store, items);
            resolve();
        });
    });
  });

  it('generateContent uses Gemini by default and calls provider', async () => {
    // Setup storage
    store['apiKey'] = 'gemini-key';
    store['apiModel'] = 'gemini-1.5-flash';

    mockProvider.generateContent.mockResolvedValue('AI Response');

    const result = await generateContent('Test Prompt');

    expect(result).toBe('AI Response');
    expect(Providers.getProvider).toHaveBeenCalledWith('gemini-1.5-flash');
    expect(mockProvider.generateContent).toHaveBeenCalledWith('Test Prompt', expect.objectContaining({
      apiKey: 'gemini-key',
      model: 'gemini-1.5-flash'
    }));
  });

  it('generateContent uses Groq if model starts with groq-', async () => {
    store['groqApiKey'] = 'groq-key';
    store['apiModel'] = 'groq-llama-3';

    mockProvider.generateContent.mockResolvedValue('Groq Response');

    // Passing model explicitly in options to override storage if needed,
    // but here let's assume it picks from storage if options.model is default.
    // Wait, the code says:
    // const activeModel = model === DEFAULT_MODEL ? storedModel || DEFAULT_MODEL : model;

    // So if I pass 'groq-llama-3' in options
    const result = await generateContent('Test', { model: 'groq-llama-3' });

    expect(result).toBe('Groq Response');
    expect(Providers.getProvider).toHaveBeenCalledWith('groq-llama-3');
    expect(mockProvider.generateContent).toHaveBeenCalledWith('Test', expect.objectContaining({
        apiKey: 'groq-key'
    }));
  });

  it('improveText generates correct prompt', async () => {
     store['apiKey'] = 'key';
     mockProvider.generateContent.mockResolvedValue('Improved Text');

     const result = await improveText('Bad text', 'grammar', 'email');

     expect(result).toBe('Improved Text');
     const callArgs = mockProvider.generateContent.mock.calls[0];
     expect(callArgs[0]).toContain('You are a professional writing assistant');
     expect(callArgs[0]).toContain('Original text:\nBad text');
  });

  it('throws error if API key is missing', async () => {
      // No keys in store
      await expect(generateContent('Test')).rejects.toThrow('Gemini API key not configured');
  });
});
