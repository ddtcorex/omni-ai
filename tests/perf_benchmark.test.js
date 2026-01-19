
import { generateContent } from '../lib/ai-service';
import * as Providers from '../lib/providers/index';

// Mock providers to avoid actual logic overhead
jest.mock('../lib/providers/index', () => ({
  getProvider: jest.fn()
}));

const mockProvider = {
  generateContent: jest.fn().mockResolvedValue('Response')
};

describe('Performance Benchmark', () => {
  let store = {};

  beforeEach(() => {
    jest.clearAllMocks();
    store = {
      apiKey: 'test-api-key',
      apiModel: 'gemini-1.5-flash'
    };

    Providers.getProvider.mockReturnValue(mockProvider);

    // Mock chrome.storage.local.get with a delay
    chrome.storage.local.get = jest.fn((keys) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          if (typeof keys === 'string') {
            resolve({ [keys]: store[keys] });
          } else {
            resolve(store); // Simplified
          }
        }, 1); // 1ms delay simulating async storage access
      });
    });

    // Mock onChanged
    chrome.storage.onChanged = {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn()
    };
  });

  test('Benchmark generateContent execution time', async () => {
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await generateContent('test prompt');
    }

    const end = performance.now();
    const duration = end - start;

    console.log(`\n\n[BENCHMARK] ${iterations} calls took ${duration.toFixed(2)}ms\n`);

    // Simple assertion to keep jest happy
    expect(duration).toBeGreaterThan(0);
  });
});
