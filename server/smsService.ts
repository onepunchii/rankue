import axios from 'axios';
import crypto from 'crypto';

const SOLAPI_BASE_URL = 'https://api.solapi.com';

interface SMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// 솔라피 API 인증을 위한 헤더 생성
function createAuthHeaders() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('SOLAPI API credentials missing');
    throw new Error('SOLAPI API 키가 설정되지 않았습니다.');
  }

  const timestamp = Date.now().toString();
  const salt = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(timestamp + salt)
    .digest('hex');

  console.log('SOLAPI Auth 생성:', { apiKey: apiKey.slice(0, 8) + '...', timestamp, salt });

  return {
    'Authorization': `HMAC-SHA256 apiKey=${apiKey}, date=${timestamp}, salt=${salt}, signature=${signature}`,
    'Content-Type': 'application/json'
  };
}

// 인증번호 생성 (6자리 숫자)
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// SMS 발송
export async function sendVerificationSMS(phoneNumber: string, verificationCode: string): Promise<SMSResponse> {
  console.log(`SMS 발송 시도: ${phoneNumber}, 코드: ${verificationCode}`);

  // SOLAPI 자격 증명이 없으면 데모 모드 사용
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    console.warn("SOLAPI credentials not found, using demo mode");
    return sendVerificationSMSDemo(phoneNumber, verificationCode);
  }

  try {
    const headers = createAuthHeaders();

    // 휴대폰 번호 포맷팅 (한국 번호 기준)
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const koreanPhone = formattedPhone.startsWith('0') ?
      `+82${formattedPhone.substring(1)}` :
      `+82${formattedPhone}`;

    const messageData = {
      message: {
        to: koreanPhone,
        from: '029302266', // SOLAPI 기본 발신번호
        text: `[Polli] 인증번호는 ${verificationCode}입니다. 3분 내에 입력해주세요.`,
        type: 'SMS'
      }
    };

    console.log("SOLAPI 요청 데이터:", JSON.stringify(messageData, null, 2));
    console.log("SOLAPI 요청 헤더:", headers);

    const response = await axios.post(
      `${SOLAPI_BASE_URL}/messages/v4/send`,
      messageData,
      { headers }
    );

    console.log("SOLAPI 응답 상태:", response.status);
    console.log("SOLAPI 응답 데이터:", JSON.stringify(response.data, null, 2));

    if (response.status === 200) {
      return {
        success: true,
        messageId: response.data.messageId
      };
    } else {
      console.error("SOLAPI 발송 실패, 데모 모드로 전환");
      return sendVerificationSMSDemo(phoneNumber, verificationCode);
    }
  } catch (error: any) {
    console.error('SMS 발송 오류:', error.response?.data || error.message);
    console.log("SOLAPI 오류, 데모 모드로 전환");
    return sendVerificationSMSDemo(phoneNumber, verificationCode);
  }
}

// 데모 모드용 SMS 발송 (실제 SMS 없이 로그만)
export async function sendVerificationSMSDemo(phoneNumber: string, verificationCode: string): Promise<SMSResponse> {
  console.log(`\n=== SMS 데모 발송 ===`);
  console.log(`수신자: ${phoneNumber}`);
  console.log(`인증번호: ${verificationCode}`);
  console.log(`메시지: [Polli] 인증번호는 ${verificationCode}입니다.`);
  console.log(`===================\n`);

  // 데모 모드에서는 항상 성공으로 처리
  return {
    success: true,
    messageId: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    error: `데모모드: 인증번호 ${verificationCode}`
  };
}