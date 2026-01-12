// 간단한 인증 상태 관리 유틸리티

export function getAuthId(): string | null {
  // user_id 우선, 없으면 guest_id 사용
  return localStorage.getItem("user_id") || localStorage.getItem("guest_id");
}

export function isGuestUser(): boolean {
  const authId = getAuthId();
  return authId ? authId.startsWith('guest_') : false;
}

export function isVerifiedUser(): boolean {
  return !!localStorage.getItem("user_id");
}

export function switchToUserMode(userId: string) {
  // guest → user 전환 시 호출
  localStorage.removeItem("guest_id");
  localStorage.setItem("user_id", userId);
}

export function checkAuthState() {
  const pending = localStorage.getItem("auth_pending");
  const expire = localStorage.getItem("auth_expire_at");
  const now = new Date().toISOString();

  if (pending === "true" && expire && now < expire) {
    // 인증 중이었음 → 인증화면 유지
    return { status: "pending", action: "show_verify_screen" };
  } else if (localStorage.getItem("user_id")) {
    // 인증 완료된 사용자
    return { status: "verified", action: "enter_user_mode" };
  } else if (localStorage.getItem("guest_id")) {
    // 게스트
    return { status: "guest", action: "enter_guest_mode" };
  } else {
    // 처음 진입 → guest_id 생성 필요
    return { status: "new", action: "create_guest_id" };
  }
}

export function clearAuthPending() {
  localStorage.removeItem("auth_pending");
  localStorage.removeItem("auth_expire_at");
}

export function setAuthPending(expireMinutes: number = 5) {
  const expireAt = new Date();
  expireAt.setMinutes(expireAt.getMinutes() + expireMinutes);
  
  localStorage.setItem("auth_pending", "true");
  localStorage.setItem("auth_expire_at", expireAt.toISOString());
}

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}