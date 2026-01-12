// localStorage 기반 게스트 인증 시스템
interface GuestData {
  guestId: string;
  nickname: string;
  isAuthenticated: boolean;
  isSimpleAuth: boolean;
  phoneNumber?: string;
  createdAt: string;
}

export class GuestAuthManager {
  private static readonly GUEST_KEY = 'polli_guest_data';
  private static readonly GUEST_PREFIX = 'guest_';

  // 새로운 게스트 ID 생성
  static generateGuestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.GUEST_PREFIX}${timestamp}${random}`;
  }

  // 랜덤 닉네임 생성
  static generateNickname(): string {
    const adjectives = ['귀여운', '멋진', '똑똑한', '재미있는', '활발한', '따뜻한', '시원한', '빠른', '느린', '큰'];
    const nouns = ['고양이', '강아지', '토끼', '햄스터', '새', '물고기', '거북이', '나비', '벌', '개미'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;
    return `${adjective} ${noun}${number}`;
  }

  // 게스트 데이터 가져오기 (없으면 새로 생성)
  static getGuestData(): GuestData {
    try {
      const stored = localStorage.getItem(this.GUEST_KEY);
      if (stored) {
        const data = JSON.parse(stored) as GuestData;
        // 유효성 검사
        if (data.guestId && data.guestId.startsWith(this.GUEST_PREFIX)) {
          return data;
        }
      }
    } catch (error) {
      console.warn('게스트 데이터 로드 실패:', error);
    }

    // 새로운 게스트 데이터 생성
    const newGuestData: GuestData = {
      guestId: this.generateGuestId(),
      nickname: this.generateNickname(),
      isAuthenticated: true, // 게스트는 기본적으로 인증된 상태
      isSimpleAuth: false,
      createdAt: new Date().toISOString()
    };

    this.saveGuestData(newGuestData);
    return newGuestData;
  }

  // 게스트 데이터 저장
  static saveGuestData(data: GuestData): void {
    try {
      localStorage.setItem(this.GUEST_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('게스트 데이터 저장 실패:', error);
    }
  }

  // 간편본인인증 완료 처리
  static markSimpleAuthCompleted(phoneNumber: string): void {
    const data = this.getGuestData();
    data.isSimpleAuth = true;
    data.phoneNumber = phoneNumber;
    this.saveGuestData(data);
  }

  // 닉네임 업데이트
  static updateNickname(nickname: string): void {
    const data = this.getGuestData();
    data.nickname = nickname;
    this.saveGuestData(data);
  }

  // 게스트 데이터 초기화
  static clearGuestData(): void {
    localStorage.removeItem(this.GUEST_KEY);
  }

  // 현재 게스트 ID 반환
  static getCurrentGuestId(): string {
    return this.getGuestData().guestId;
  }

  // 간편본인인증 상태 확인
  static isSimpleAuthCompleted(): boolean {
    return this.getGuestData().isSimpleAuth;
  }
}