
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Content Script Verification', () => {
  let context;
  let chromeMock;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock chrome
    chromeMock = {
      runtime: {
        onMessage: {
          addListener: jest.fn()
        },
        sendMessage: jest.fn()
      }
    };

    // Prepare context with global objects
    context = {
      document: document,
      window: window,
      chrome: chromeMock,
      navigator: navigator,
      console: console,
      setTimeout: setTimeout,
      Event: Event,
      MouseEvent: MouseEvent,
      KeyboardEvent: KeyboardEvent
    };

    vm.createContext(context);

    const code = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
    vm.runInContext(code, context);
  });

  test('showResultOverlay creates the overlay with correct structure and content', () => {
    const payload = {
      action: 'improve',
      original: 'test',
      result: 'Improved test result'
    };

    // Call the function from the context
    // The function showResultOverlay is defined in the global scope of the context
    // However, it's not explicitly attached to window/global, but in a script `function x(){}` usually puts it on global.
    // In vm context, top level var/function declarations are properties of the global object.

    // Note: 'let' variables at top level might NOT be on the global object in strict mode or module,
    // but this is a script.

    // If showResultOverlay is not accessible, we might need to rely on it being called via message listener,
    // but we can just try accessing it.

    if (typeof context.showResultOverlay === 'function') {
        context.showResultOverlay(payload);
    } else {
        // Fallback: If it's not exposed (e.g. scope issues), we might have to use runInContext to call it
        vm.runInContext(`showResultOverlay(${JSON.stringify(payload)})`, context);
    }

    const overlay = document.getElementById('omniAiOverlay');
    expect(overlay).not.toBeNull();

    // Verify Header
    const header = overlay.querySelector('.omni-ai-overlay-header');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('Omni AI - Improved');

    // Verify Content
    const resultDiv = overlay.querySelector('.omni-ai-result');
    expect(resultDiv).not.toBeNull();
    expect(resultDiv.textContent).toBe('Improved test result');

    // Verify Footer
    const footer = overlay.querySelector('.omni-ai-overlay-footer');
    expect(footer).not.toBeNull();
    const copyBtn = footer.querySelector('#omniAiCopy');
    const replaceBtn = footer.querySelector('#omniAiReplace');
    expect(copyBtn).not.toBeNull();
    expect(replaceBtn).not.toBeNull();
  });

  test('Close button removes the overlay', () => {
    const payload = { action: 'improve', original: 'x', result: 'y' };

    if (typeof context.showResultOverlay === 'function') {
        context.showResultOverlay(payload);
    } else {
        vm.runInContext(`showResultOverlay(${JSON.stringify(payload)})`, context);
    }

    const overlay = document.getElementById('omniAiOverlay');
    expect(overlay).not.toBeNull();

    const closeBtn = overlay.querySelector('#omniAiClose');
    closeBtn.click();

    expect(document.getElementById('omniAiOverlay')).toBeNull();
  });
});
