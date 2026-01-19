/**
 * Omni AI - Theme Manager
 * Handles theme persistence and application
 */

// Key for storage
export const THEME_KEY = 'omni_ai_theme';

// Available themes
export const THEMES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

/**
 * Get current theme preference
 * @returns {Promise<string>}
 */
export async function getThemePreference() {
  const result = await chrome.storage.sync.get(THEME_KEY);
  return result[THEME_KEY] || THEMES.LIGHT;
}

/**
 * Set theme preference
 * @param {string} theme
 */
export async function setThemePreference(theme) {
  if (!Object.values(THEMES).includes(theme)) return;
  await chrome.storage.sync.set({ [THEME_KEY]: theme });
}

/**
 * Apply theme to document
 * @param {string} themePreference
 */
export function applyTheme(themePreference) {
  const root = document.documentElement;

  // Remove existing classes
  root.classList.remove('light-mode');

  let effectiveTheme = themePreference;

  if (themePreference === THEMES.SYSTEM) {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    effectiveTheme = isDark ? THEMES.DARK : THEMES.LIGHT;
  }

  if (effectiveTheme === THEMES.LIGHT) {
    root.classList.add('light-mode');
  }
}

/**
 * Initialize theme listener
 */
export async function initTheme() {
  // Initial apply
  const pref = await getThemePreference();
  applyTheme(pref);

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[THEME_KEY]) {
      applyTheme(changes[THEME_KEY].newValue);
    }
  });

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const currentPref = await getThemePreference();
    if (currentPref === THEMES.SYSTEM) {
      applyTheme(THEMES.SYSTEM);
    }
  });
}
