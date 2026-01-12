// 단일 auth_id 기반 간단한 인증 시스템

function generateUUID(): string {
  return 'auth_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

export function getAuthId(): string {
  // PolliAuth와 호환을 위해 두 키 모두 확인
  let authId = localStorage.getItem("auth_id") || localStorage.getItem("polli-device-id");
  
  if (!authId) {
    authId = `guest_${Date.now()}_${btoa(navigator.userAgent.slice(0, 20))}`;
    // 두 키 모두에 저장하여 호환성 유지
    localStorage.setItem("auth_id", authId);
    localStorage.setItem("polli-device-id", authId);
  } else {
    // 하나만 있는 경우 다른 키에도 저장
    if (!localStorage.getItem("auth_id")) {
      localStorage.setItem("auth_id", authId);
    }
    if (!localStorage.getItem("polli-device-id")) {
      localStorage.setItem("polli-device-id", authId);
    }
  }
  
  return authId;
}

export async function getUserState() {
  const authId = getAuthId();
  try {
    const response = await fetch(`/api/user-state?auth_id=${authId}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch user state');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching user state:', error);
    return { auth_id: authId, is_verified: false };
  }
}

export function clearAuth() {
  localStorage.removeItem("auth_id");
}

export async function apiRequestWithAuth(url: string, options: any = {}) {
  const authId = getAuthId();
  
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include' as RequestCredentials,
    ...options
  };

  if (options.body && typeof options.body === 'object') {
    defaultOptions.body = JSON.stringify({
      ...options.body,
      auth_id: authId
    });
  } else if (defaultOptions.method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}auth_id=${authId}`;
  }

  const response = await fetch(url, defaultOptions);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`${response.status}: ${errorData.message}`);
  }
  
  return await response.json();
}