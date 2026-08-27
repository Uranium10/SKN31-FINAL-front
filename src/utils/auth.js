export const getAccessToken = () => localStorage.getItem('access_token');
export const getRefreshToken = () => localStorage.getItem('refresh_token');

const USER_PROFILE_KEY = 'erp_user_profile';
let refreshPromise = null;

const normalizeUser = (user = {}) => {
  const metadata = user.user_metadata || {};
  const id = user.id || metadata.erp_user_id || user.sub || user.email || metadata.email || '';
  const email = user.email || metadata.email || '';
  const username = user.username || metadata.username || id;
  const fullName = user.full_name || user.name || metadata.full_name || username || email || id;

  return {
    id,
    email,
    username,
    full_name: fullName,
    user_type: user.user_type || metadata.user_type || 'System User',
  };
};

const readUserFromToken = (token) => {
  try {
    const payloadPart = token?.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return normalizeUser(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
};

export const getCurrentUser = () => {
  try {
    const stored = localStorage.getItem(USER_PROFILE_KEY);
    if (stored) return normalizeUser(JSON.parse(stored));
  } catch {
    localStorage.removeItem(USER_PROFILE_KEY);
  }
  return readUserFromToken(getAccessToken());
};

export const setTokens = (accessToken, refreshToken, userProfile) => {
  localStorage.setItem('access_token', accessToken);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
  if (userProfile) {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(normalizeUser(userProfile)));
  } else if (!localStorage.getItem(USER_PROFILE_KEY)) {
    const tokenUser = readUserFromToken(accessToken);
    if (tokenUser) localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(tokenUser));
  }
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem(USER_PROFILE_KEY);
};

const refreshSession = async () => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('Refresh token not found');

    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.detail || 'Failed to refresh token');
    }

    // Refresh tokens are one-time credentials. Persist the newly rotated pair.
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
};

export const fetchWithAuth = async (url, options = {}) => {
  let accessToken = getAccessToken();
  
  const createHeaders = (token) => {
    return {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
  };

  // 1. 처음 요청 시도
  let response = await fetch(url, {
    ...options,
    headers: createHeaders(accessToken)
  });

  // 2. 만료된 경우 (401 Unauthorized) -> Refresh Token으로 갱신 시도
  if (response.status === 401) {
    try {
      accessToken = await refreshSession();

      // 3. 실패했던 원래 요청 재시도
      response = await fetch(url, {
        ...options,
        headers: createHeaders(accessToken)
      });
    } catch (error) {
      clearTokens();
      window.location.reload();
      throw error;
    }
  }

  return response;
};

export const logoutSession = async () => {
  try {
    if (getAccessToken()) {
      await fetchWithAuth('/api/logout', { method: 'POST' });
    }
  } finally {
    clearTokens();
  }
};
