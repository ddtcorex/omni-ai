import * as History from '../../lib/history';
import * as AIService from '../../lib/ai-service';

jest.mock('../../lib/history');
jest.mock('../../lib/ai-service');

describe('Service Worker Performance', () => {
  let chromeMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Manual Chrome Mock
    chromeMock = {
        runtime: {
            onInstalled: { addListener: jest.fn() },
            onMessage: { addListener: jest.fn() },
        },
        contextMenus: {
            create: jest.fn(),
            onClicked: { addListener: jest.fn() }
        },
        tabs: {
            query: jest.fn().mockResolvedValue([]),
            sendMessage: jest.fn().mockResolvedValue({})
        },
        storage: {
            local: {
                get: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({}),
                remove: jest.fn().mockResolvedValue({})
            },
            sync: {
                get: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({}),
                remove: jest.fn().mockResolvedValue({})
            }
        },
        identity: { getAuthToken: jest.fn() },
        commands: { onCommand: { addListener: jest.fn() } }
    };

    global.chrome = chromeMock;
  });

  it('measures response time for WRITING_ACTION with slow history I/O', async () => {
    const AIService = await import('../../lib/ai-service');
    const History = await import('../../lib/history');

    await import('../../background/service-worker');

    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    // Mock AI service to be fast
    AIService.improveText.mockResolvedValue('Improved Text');

    // Mock History to be SLOW (simulating I/O)
    const DELAY = 100;
    History.addToHistory.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, DELAY));
        return {};
    });

    const mockTab = { id: 123, url: 'http://example.com' };
    chromeMock.tabs.query.mockResolvedValue([mockTab]);

    const sendResponse = jest.fn();
    const message = {
      type: 'WRITING_ACTION',
      payload: { action: 'grammar', preset: 'email', text: 'original text' }
    };

    const startTime = Date.now();

    // Call listener
    await listener(message, {}, sendResponse);

    // In the current implementation, we expect sendResponse to be called ONLY AFTER the history op is done if it is awaited.
    // However, the listener itself might return `true` immediately.
    // But `sendResponse` is the callback we care about.

    // NOTE: The listener is async but returns `true` synchronously to keep the message channel open.
    // We need to wait for `sendResponse` to be called.

    // Since we are running in a test environment with mocked timers or real timers,
    // and the code awaits, we can just check if sendResponse has been called *before* we wait for the delay manually?
    // Actually, since the code awaits, `listener` execution will effectively pause at the await.
    // But `listener` returns `true` at the end of the case... wait, looking at the code:

    /*
    case "WRITING_ACTION":
      handleWritingAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    */

    // Ah, `handleWritingAction` is called and `.then` is attached.
    // `handleWritingAction` is async.
    // Inside `handleWritingAction`:
    /*
      // Save to history
      try { ... await addToHistory(...) ... }
      return { response: result };
    */

    // So `handleWritingAction` promise only resolves AFTER `addToHistory` is done.
    // So `sendResponse` is only called AFTER `addToHistory` is done.

    // We can simulate waiting for promises to flush.

    // But to measure "real time" in a jest test is tricky if we use real timers.
    // Let's rely on the fact that if it awaits, it WILL take at least DELAY ms.

    const endTime = Date.now();
    // This synchronous execution of `listener` just kicks off the promise chain.
    // We need to wait for sendResponse to be called.

    // Let's wait for sendResponse
    let attempts = 0;
    while (sendResponse.mock.calls.length === 0 && attempts < 20) {
        await new Promise(r => setTimeout(r, 10)); // check every 10ms
        attempts++;
    }

    const responseTime = Date.now() - startTime;
    console.log(`Response time: ${responseTime}ms`);

    expect(sendResponse).toHaveBeenCalled();

    // The response should be sent before the 100ms history delay completes.
    // Allow some buffer for execution overhead (e.g., 50ms)
    expect(responseTime).toBeLessThan(50);
  });
});
