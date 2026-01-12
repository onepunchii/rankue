// 간단한 메모리 기반 인증번호 저장소
interface VerificationData {
  code: string;
  authId: string;
  expiresAt: number;
}

class VerificationStore {
  private store: Map<string, VerificationData> = new Map();
  private readonly EXPIRY_MINUTES = 5;

  store(phone: string, code: string, authId: string): void {
    const expiresAt = Date.now() + (this.EXPIRY_MINUTES * 60 * 1000);
    this.store.set(phone, { code, authId, expiresAt });
    console.log(`인증번호 저장: ${phone} -> ${code} (만료: ${new Date(expiresAt).toLocaleTimeString()})`);
  }

  verify(phone: string, inputCode: string): { authId: string } | null {
    const data = this.store.get(phone);
    
    if (!data) {
      console.log(`인증번호 없음: ${phone}`);
      return null;
    }

    if (Date.now() > data.expiresAt) {
      this.store.delete(phone);
      console.log(`인증번호 만료: ${phone}`);
      return null;
    }

    if (data.code !== inputCode) {
      console.log(`인증번호 불일치: ${phone} (입력: ${inputCode}, 저장: ${data.code})`);
      return null;
    }

    this.store.delete(phone);
    console.log(`인증번호 확인 성공: ${phone}`);
    return { authId: data.authId };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [phone, data] of this.store.entries()) {
      if (now > data.expiresAt) {
        this.store.delete(phone);
      }
    }
  }
}

export const verificationStore = new VerificationStore();

// 10분마다 만료된 인증번호 정리
setInterval(() => {
  verificationStore.cleanup();
}, 10 * 60 * 1000);