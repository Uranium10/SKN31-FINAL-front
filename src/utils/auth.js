export const getAccessToken = () => localStorage.getItem('access_token');
export const getRefreshToken = () => localStorage.getItem('refresh_token');

export const setTokens = (accessToken, refreshToken) => {
  localStorage.setItem('access_token', accessToken);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
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
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      window.location.reload(); // 로그아웃 처리
      throw new Error('Refresh token not found');
    }

    try {
      const refreshResponse = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh token');
      }

      const refreshData = await refreshResponse.json();
      
      if (refreshData.success) {
        // 새 액세스 토큰 저장
        accessToken = refreshData.access_token;
        setTokens(accessToken, null); // 리프레시는 기존 것 유지

        // 3. 실패했던 원래 요청 재시도
        response = await fetch(url, {
          ...options,
          headers: createHeaders(accessToken)
        });
      } else {
        throw new Error('Refresh failed');
      }
    } catch (error) {
      clearTokens();
      window.location.reload();
      throw error;
    }
  }

  return response;
};
