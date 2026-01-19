import { chrome } from 'jest-chrome';

// Mock ai-service
jest.mock('../../lib/ai-service.js', () => ({
  quickAsk: jest.fn().mockResolvedValue('Mock response'),
  improveText: jest.fn(),
  translateText: jest.fn(),
  explainText: jest.fn(),
  summarizeText: jest.fn(),
  generateReply: jest.fn(),
  emojifyText: jest.fn(),
}));

// Mock history with a delay
jest.mock('../../lib/history.js', () => ({
  addToHistory: jest.fn().mockImplementation(async () => {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {};
  }),
}));

describe('Performance Benchmark', () => {
  beforeAll(async () => {
    // Setup Chrome mocks
    chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://example.com' }]);
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue({});
    chrome.storage.sync.get.mockResolvedValue({});

    // Import the service worker to trigger listener registration
    await import('../../background/service-worker.js');
  });

  test('handleQuickAsk response time', async () => {
    const message = {
      type: 'QUICK_ASK',
      payload: { query: 'test', preset: 'default' }
    };

    const sendResponse = jest.fn();

    const start = Date.now();

    // Trigger the listener
    // We need to wait for sendResponse to be called.
    const responsePromise = new Promise(resolve => {
        sendResponse.mockImplementation((response) => {
            resolve(response);
        });
    });

    chrome.runtime.onMessage.callListeners(message, {}, sendResponse);

    await responsePromise;
    const end = Date.now();
    const duration = end - start;

    console.log(`BENCHMARK_RESULT: ${duration}ms`);

    // Expectation:
    // With bug: > 1000ms
    // With fix: < 200ms
    // We set expectation for the "optimized" state, so this should fail initially.
    expect(duration).toBeLessThan(200);
  });
});
