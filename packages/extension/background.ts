// ============================================================================
// OMNISUPPORT AI - CHROME EXTENSION BACKGROUND SERVICE WORKER
// ============================================================================
// Handles Auth0 JWT authentication and refresh for the extension

const API_BASE_URL = 'https://api.omnisupport.ai'; // Production API URL
const AUTH0_DOMAIN = 'omnisupport.auth0.com'; // Replace with actual Auth0 domain
const AUTH0_CLIENT_ID = 'YOUR_AUTH0_CLIENT_ID'; // Replace with actual client ID

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  idToken?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  token?: TokenData;
  user?: {
    email: string;
    name: string;
    companyId: string;
    role: string;
  };
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

async function getStoredToken(): Promise<TokenData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['omnisupportToken'], (result) => {
      resolve(result.omnisupportToken || null);
    });
  });
}

async function storeToken(token: TokenData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ omnisupportToken: token }, resolve);
  });
}

async function clearToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['omnisupportToken', 'omnisupportUser'], resolve);
  });
}

async function storeUser(user: AuthState['user']): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ omnisupportUser: user }, resolve);
  });
}

// ============================================================================
// AUTH0 AUTHENTICATION
// ============================================================================

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function initiateLogin(): Promise<AuthState> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  // Store for callback
  await chrome.storage.local.set({ authState: { codeVerifier, state } });

  const redirectUrl = chrome.identity.getRedirectURL('oauth2');
  const authUrl = new URL(`https://${AUTH0_DOMAIN}/authorize`);
  authUrl.searchParams.set('client_id', AUTH0_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', 'openid profile email offline_access');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('audience', `${API_BASE_URL}/api`);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Auth failed'));
          return;
        }

        try {
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          // Verify state
          const { authState } = await chrome.storage.local.get('authState');
          if (returnedState !== authState?.state) {
            throw new Error('State mismatch');
          }

          // Exchange code for tokens
          const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              client_id: AUTH0_CLIENT_ID,
              code,
              redirect_uri: redirectUrl,
              code_verifier: authState.codeVerifier,
            }),
          });

          if (!tokenResponse.ok) {
            throw new Error('Token exchange failed');
          }

          const tokens = await tokenResponse.json();
          const tokenData: TokenData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            idToken: tokens.id_token,
          };

          await storeToken(tokenData);

          // Parse user from ID token
          const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
          const user = {
            email: payload.email,
            name: payload.name,
            companyId: payload['https://omnisupport.ai/company_id'],
            role: payload['https://omnisupport.ai/role'],
          };
          await storeUser(user);

          resolve({ isAuthenticated: true, token: tokenData, user });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

async function refreshAccessToken(): Promise<TokenData | null> {
  const currentToken = await getStoredToken();
  if (!currentToken?.refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: AUTH0_CLIENT_ID,
        refresh_token: currentToken.refreshToken,
      }),
    });

    if (!response.ok) {
      await clearToken();
      return null;
    }

    const tokens = await response.json();
    const tokenData: TokenData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || currentToken.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      idToken: tokens.id_token,
    };

    await storeToken(tokenData);
    return tokenData;
  } catch {
    await clearToken();
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const token = await getStoredToken();
  if (!token) {
    return null;
  }

  // Refresh if expires within 5 minutes
  if (token.expiresAt - Date.now() < 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken();
    return refreshed?.accessToken || null;
  }

  return token.accessToken;
}

async function logout(): Promise<void> {
  await clearToken();
  // Optionally logout from Auth0
  const logoutUrl = `https://${AUTH0_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${encodeURIComponent(chrome.runtime.getURL('popup.html'))}`;
  chrome.tabs.create({ url: logoutUrl });
}

// ============================================================================
// API REQUESTS
// ============================================================================

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await clearToken();
      throw new Error('Session expired');
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

interface Message {
  type: string;
  payload?: unknown;
}

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: unknown) => void) => {
    handleMessage(message).then(sendResponse).catch((error) => {
      sendResponse({ error: error.message });
    });
    return true; // Keep message channel open for async response
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'GET_AUTH_STATE': {
      const token = await getStoredToken();
      const userResult = await chrome.storage.local.get('omnisupportUser');
      return {
        isAuthenticated: !!token && token.expiresAt > Date.now(),
        user: userResult.omnisupportUser,
      };
    }

    case 'LOGIN':
      return initiateLogin();

    case 'LOGOUT':
      await logout();
      return { success: true };

    case 'GET_TOKEN':
      return { token: await getValidToken() };

    case 'API_REQUEST': {
      const { endpoint, method, body } = message.payload as {
        endpoint: string;
        method?: string;
        body?: unknown;
      };
      return apiRequest(endpoint, {
        method: method || 'GET',
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    case 'GET_TICKET_CONTEXT': {
      const { externalId } = message.payload as { externalId: string };
      return apiRequest(`/extension/ticket-context/${externalId}`);
    }

    case 'SEARCH_KB': {
      const { query, limit } = message.payload as { query: string; limit?: number };
      return apiRequest(`/extension/kb-search?query=${encodeURIComponent(query)}&limit=${limit || 5}`);
    }

    case 'GET_CUSTOMER': {
      const { identifier } = message.payload as { identifier: string };
      return apiRequest(`/extension/customer/${encodeURIComponent(identifier)}`);
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// ============================================================================
// ALARM FOR TOKEN REFRESH
// ============================================================================

chrome.alarms.create('tokenRefresh', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tokenRefresh') {
    const token = await getStoredToken();
    if (token && token.expiresAt - Date.now() < 30 * 60 * 1000) {
      await refreshAccessToken();
    }
  }
});

// ============================================================================
// EXTENSION INSTALL/UPDATE
// ============================================================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[OmniSupport] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[OmniSupport] Extension updated');
  }
});

console.log('[OmniSupport] Background service worker loaded');

export {};
