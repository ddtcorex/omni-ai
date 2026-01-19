import { addToHistory, getHistory, clearHistory, getStats } from '../../lib/history';

describe('History Service', () => {
  let store = {};

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};

    chrome.storage.local.get.mockImplementation((keys) => {
        return new Promise((resolve) => {
             if (typeof keys === 'string') {
                resolve({ [keys]: store[keys] });
                return;
            }
             // ... other cases if needed
            resolve(store);
        });
    });

     chrome.storage.local.set.mockImplementation((items) => {
        return new Promise((resolve) => {
            Object.assign(store, items);
            resolve();
        });
    });

    chrome.storage.local.remove.mockImplementation((key) => {
         return new Promise((resolve) => {
            delete store[key];
            resolve();
         });
    });
  });

  it('addToHistory adds an entry and updates stats', async () => {
    const entryData = {
      action: 'improve',
      inputText: 'hello world',
      outputText: 'Hello World',
      preset: 'general',
      site: 'example.com'
    };

    const entry = await addToHistory(entryData);

    expect(entry).toHaveProperty('id');
    expect(entry.action).toBe('improve');
    expect(store['usageHistory']).toHaveLength(1);
    expect(store['usageHistory'][0]).toEqual(entry);

    const stats = store['usageStats'];
    expect(stats.totalActions).toBe(1);
    expect(stats.totalWordsProcessed).toBe(2);
  });

  it('getHistory retrieves history', async () => {
      const history = [{ id: '1', action: 'test' }];
      store['usageHistory'] = history;

      const result = await getHistory();
      expect(result).toEqual(history);
  });

  it('clearHistory removes history', async () => {
       store['usageHistory'] = [{ id: '1' }];
       await clearHistory();
       expect(store['usageHistory']).toBeUndefined();
  });
});
