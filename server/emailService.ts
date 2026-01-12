import nodemailer from 'nodemailer';

// Create transporter for sending emails
// In demo mode, we'll simulate email sending
const isDemoMode = !process.env.EMAIL_USER || !process.env.EMAIL_PASS;

const transporter = isDemoMode ? null : nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    if (isDemoMode) {
      // In demo mode, just log the verification code to console
      console.log(`📧 [DEMO MODE] 이메일 인증 코드 for ${email}: ${code}`);
      console.log(`📧 실제 운영 환경에서는 ${email}로 인증 메일이 발송됩니다.`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Polli 이메일 인증 코드',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #F54990; margin: 0;">Polli</h1>
            <p style="color: #666; margin: 5px 0;">나만의 투표! 나만의 설문조사!</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 20px;">이메일 인증 코드</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #F54990; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #666; margin: 20px 0;">위 6자리 코드를 입력하여 이메일 인증을 완료해주세요.</p>
            <p style="color: #999; font-size: 14px;">이 코드는 10분 후 만료됩니다.</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
            <p>본 메일은 Polli 회원가입을 위한 인증 메일입니다.</p>
            <p>만약 본인이 요청하지 않은 메일이라면 무시하셔도 됩니다.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}