import * as History from '../../lib/history';
import * as AIService from '../../lib/ai-service';

jest.mock('../../lib/history');
jest.mock('../../lib/ai-service');

describe('Service Worker Integration', () => {
  let chromeMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Manual Chrome Mock (bypassing jest-chrome to ensure full control over event listeners and module loading)
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
            },
            onChanged: { addListener: jest.fn() }
        },
        identity: { getAuthToken: jest.fn() },
        commands: { onCommand: { addListener: jest.fn() } }
    };

    global.chrome = chromeMock;
  });

  it('registers listeners on load', async () => {
    await import('../../background/service-worker');

    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(chromeMock.contextMenus.onClicked.addListener).toHaveBeenCalled();
  });

  it('handles WRITING_ACTION message correctly', async () => {
    // Re-import dependencies to get the fresh mocks associated with the current module registry
    const AIService = await import('../../lib/ai-service');
    const History = await import('../../lib/history');

    await import('../../background/service-worker');

    // Find the message listener
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    expect(listener).toBeDefined();

    // Mock dependencies
    AIService.improveText.mockResolvedValue('Improved Text');
    History.addToHistory.mockResolvedValue({});

    // Mock active tab
    const mockTab = { id: 123, url: 'http://example.com' };
    chromeMock.tabs.query.mockResolvedValue([mockTab]);

    // Mock sendResponse
    const sendResponse = jest.fn();

    // Simulate message
    const message = {
      type: 'WRITING_ACTION',
      payload: { action: 'grammar', preset: 'email', text: 'original text' }
    };

    // Call listener
    const result = listener(message, {}, sendResponse);

    // Expect it to return true for async response
    expect(result).toBe(true);

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify AI Service call
    expect(AIService.improveText).toHaveBeenCalledWith('original text', 'grammar', 'email');

    // Verify content script update
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'grammar',
        original: 'original text',
        result: 'Improved Text'
      }
    });

    // Verify response sent back to caller (popup or content)
    expect(sendResponse).toHaveBeenCalledWith({ success: true, data: { response: 'Improved Text' } });

    // Verify history update
    expect(History.addToHistory).toHaveBeenCalledWith(expect.objectContaining({
        action: 'grammar',
        inputText: 'original text',
        outputText: 'Improved Text'
    }));
  });
});
