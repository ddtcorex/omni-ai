/**
 * Omni AI - Authentication Module
 * Handles Google OAuth 2.0 authentication using Chrome Identity API
 */

// ============================================
// Constants
// ============================================
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// ============================================
// Authentication Functions
// ============================================

/**
 * Sign in with Google using Chrome Identity API
 * @param {boolean} interactive - Whether to show sign-in UI
 * @returns {Promise<Object>} User info object
 */
export async function signIn(interactive = true) {
  try {
    const token = await getAuthToken(interactive);
    if (!token) {
      throw new Error('Failed to get auth token');
    }

    const userInfo = await fetchUserInfo(token);
    await saveUserInfo(userInfo);
    
    console.log('[Auth] Sign in successful:', userInfo.email);
    return userInfo;
  } catch (error) {
    console.error('[Auth] Sign in failed:', error);
    throw error;
  }
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    const token = await getAuthToken(false);
    
    if (token) {
      // Revoke the token
      await revokeToken(token);
      
      // Remove the cached token
      await chrome.identity.removeCachedAuthToken({ token });
    }

    // Clear user info from storage
    await clearUserInfo();
    
    console.log('[Auth] Sign out successful');
  } catch (error) {
    console.error('[Auth] Sign out failed:', error);
    throw error;
  }
}

/**
 * Get the current authentication token
 * @param {boolean} interactive - Whether to show sign-in UI if not authenticated
 * @returns {Promise<string|null>} Auth token or null
 */
export async function getToken(interactive = false) {
  try {
    return await getAuthToken(interactive);
  } catch (error) {
    console.error('[Auth] Get token failed:', error);
    return null;
  }
}

/**
 * Get current user info from storage
 * @returns {Promise<Object|null>} User info or null if not signed in
 */
export async function getUser() {
  try {
    const result = await chrome.storage.sync.get('user');
    return result.user || null;
  } catch (error) {
    console.error('[Auth] Get user failed:', error);
    return null;
  }
}

/**
 * Check if user is currently signed in
 * @returns {Promise<boolean>}
 */
export async function isSignedIn() {
  const user = await getUser();
  return user !== null;
}

/**
 * Refresh user info from Google
 * @returns {Promise<Object|null>} Updated user info or null
 */
export async function refreshUser() {
  try {
    const token = await getAuthToken(false);
    if (!token) {
      return null;
    }

    const userInfo = await fetchUserInfo(token);
    await saveUserInfo(userInfo);
    
    return userInfo;
  } catch (error) {
    console.error('[Auth] Refresh user failed:', error);
    return null;
  }
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Get auth token using Chrome Identity API
 * @param {boolean} interactive - Whether to show sign-in UI
 * @returns {Promise<string|null>}
 */
async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (interactive) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(null);
        }
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Fetch user info from Google API
 * @param {string} token - Auth token
 * @returns {Promise<Object>} User info
 */
async function fetchUserInfo(token) {
  const response = await fetch(USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    given_name: data.given_name,
    picture: data.picture,
    verified_email: data.verified_email,
  };
}

/**
 * Save user info to storage
 * @param {Object} userInfo - User info object
 * @returns {Promise<void>}
 */
async function saveUserInfo(userInfo) {
  await chrome.storage.sync.set({ user: userInfo });
}

/**
 * Clear user info from storage
 * @returns {Promise<void>}
 */
async function clearUserInfo() {
  await chrome.storage.sync.remove('user');
}

/**
 * Revoke an auth token
 * @param {string} token - Token to revoke
 * @returns {Promise<void>}
 */
async function revokeToken(token) {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    if (!response.ok) {
      console.warn('[Auth] Token revocation failed:', response.status);
    }
  } catch (error) {
    console.warn('[Auth] Token revocation error:', error);
  }
}

// ============================================
// Auth State Change Listener
// ============================================

/**
 * Listen for auth state changes
 * @param {Function} callback - Called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  const listener = (changes, areaName) => {
    if (areaName === 'sync' && changes.user) {
      callback(changes.user.newValue || null);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// Default export for convenience
export default {
  signIn,
  signOut,
  getToken,
  getUser,
  isSignedIn,
  refreshUser,
  onAuthStateChange,
};
