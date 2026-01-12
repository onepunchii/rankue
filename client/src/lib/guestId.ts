// 디바이스 기반 고유 게스트 ID 생성 및 관리

function generateDeviceFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx!.textBaseline = 'top';
  ctx!.font = '14px Arial';
  ctx!.fillText('Device fingerprint', 2, 2);
  
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL()
  ].join('|');
  
  return btoa(fingerprint).replace(/[^a-zA-Z0-9]/g, '').substr(0, 16);
}

function generateGuestId(): string {
  const timestamp = Date.now();
  const fingerprint = generateDeviceFingerprint();
  return `guest_${timestamp}_${fingerprint}`;
}

export async function getOrCreateGuestId(): Promise<string> {
  // 1. localStorage에서 기존 ID 확인
  let guestId = localStorage.getItem('polli_guest_id');
  
  if (!guestId) {
    // 2. 디바이스 기반 ID 생성
    guestId = generateGuestId();
    
    // 3. localStorage에 저장
    localStorage.setItem('polli_guest_id', guestId);
    localStorage.setItem('polli_guest_created_at', new Date().toISOString());
    
    console.log('새 게스트 ID 생성:', guestId);
  } else {
    console.log('기존 게스트 ID 사용:', guestId);
  }
  
  // 4. 닉네임이 없으면 랜덤 생성 (기존 사용자도 포함)
  if (!localStorage.getItem('polli_guest_nickname')) {
    const { generateRandomNickname } = await import('./nicknameGenerator');
    const nickname = generateRandomNickname();
    localStorage.setItem('polli_guest_nickname', nickname);
    console.log('랜덤 닉네임 생성:', nickname);
  }
  
  return guestId;
}

export function getGuestInfo() {
  const guestId = localStorage.getItem('polli_guest_id');
  const createdAt = localStorage.getItem('polli_guest_created_at');
  const nickname = localStorage.getItem('polli_guest_nickname');
  
  return {
    id: guestId,
    nickname: nickname,
    createdAt: createdAt ? new Date(createdAt) : null,
    isGuest: !!guestId
  };
}

export function updateGuestNickname(nickname: string) {
  localStorage.setItem('polli_guest_nickname', nickname);
}

export function clearGuestId() {
  localStorage.removeItem('polli_guest_id');
  localStorage.removeItem('polli_guest_created_at');
}