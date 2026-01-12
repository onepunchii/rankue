import { InsertProviderLog } from "@shared/schema";

// KT 기프티쇼 API 어댑터
export class GiftishowAdapter {
  private apiKey: string;
  private baseUrl: string;
  private partnerCode: string;

  constructor() {
    this.apiKey = process.env.GIFTISHOW_API_KEY || "test_key";
    this.baseUrl = process.env.GIFTISHOW_BASE_URL || "https://test-api.giftishow.com";
    this.partnerCode = process.env.GIFTISHOW_PARTNER_CODE || "POLLI";
  }

  private log(action: string, requestPayload: any, responsePayload: any, success: boolean, duration?: number, errorMessage?: string): InsertProviderLog {
    return {
      provider: "giftishow",
      action,
      requestPayload,
      responsePayload,
      statusCode: responsePayload?.statusCode || null,
      success,
      errorMessage,
      duration,
    };
  }

  // 기프티쇼에 쿠폰 발행 요청
  async issueCoupon(orderId: number, productSku: string, recipientPhone: string, recipientName?: string) {
    const startTime = Date.now();
    const requestPayload = {
      partnerCode: this.partnerCode,
      partnerOrderId: `POLLI-${orderId}`,
      productSku,
      recipientPhone,
      recipientName,
      sendChannel: "sms",
    };

    try {
      // 개발 환경에서는 모의 응답 반환
      if (process.env.NODE_ENV !== "production") {
        const mockResponse = {
          success: true,
          statusCode: 200,
          data: {
            giftCode: `MOCK-${orderId}-${Date.now()}`,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1년 후
            providerOrderId: `GS-${orderId}-${Date.now()}`,
            message: "모의 쿠폰이 발행되었습니다",
          },
        };
        
        const duration = Date.now() - startTime;
        const logEntry = this.log("issue", requestPayload, mockResponse, true, duration);
        
        return { 
          success: true, 
          data: mockResponse.data,
          logEntry
        };
      }

      // 실제 API 호출 (프로덕션)
      const response = await fetch(`${this.baseUrl}/api/v1/coupons/issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      const responseData = await response.json();
      const duration = Date.now() - startTime;
      const success = response.ok && responseData.success;

      const logEntry = this.log(
        "issue",
        requestPayload,
        { statusCode: response.status, ...responseData },
        success,
        duration,
        success ? undefined : responseData.message || "API 호출 실패"
      );

      if (success) {
        return {
          success: true,
          data: {
            giftCode: responseData.data.giftCode,
            expiresAt: responseData.data.expiresAt,
            providerOrderId: responseData.data.providerOrderId,
            message: responseData.message || "쿠폰이 성공적으로 발행되었습니다",
          },
          logEntry
        };
      } else {
        return {
          success: false,
          error: responseData.message || "쿠폰 발행에 실패했습니다",
          logEntry
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const logEntry = this.log(
        "issue",
        requestPayload,
        null,
        false,
        duration,
        error instanceof Error ? error.message : "알 수 없는 오류"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "네트워크 오류가 발생했습니다",
        logEntry
      };
    }
  }

  // 쿠폰 취소 요청
  async cancelCoupon(providerOrderId: string, reason: string) {
    const startTime = Date.now();
    const requestPayload = {
      partnerCode: this.partnerCode,
      providerOrderId,
      reason,
    };

    try {
      // 개발 환경에서는 모의 응답 반환
      if (process.env.NODE_ENV !== "production") {
        const mockResponse = {
          success: true,
          statusCode: 200,
          message: "모의 쿠폰이 취소되었습니다",
        };
        
        const duration = Date.now() - startTime;
        const logEntry = this.log("cancel", requestPayload, mockResponse, true, duration);
        
        return { 
          success: true, 
          message: mockResponse.message,
          logEntry
        };
      }

      // 실제 API 호출 (프로덕션)
      const response = await fetch(`${this.baseUrl}/api/v1/coupons/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      const responseData = await response.json();
      const duration = Date.now() - startTime;
      const success = response.ok && responseData.success;

      const logEntry = this.log(
        "cancel",
        requestPayload,
        { statusCode: response.status, ...responseData },
        success,
        duration,
        success ? undefined : responseData.message || "API 호출 실패"
      );

      if (success) {
        return {
          success: true,
          message: responseData.message || "쿠폰이 성공적으로 취소되었습니다",
          logEntry
        };
      } else {
        return {
          success: false,
          error: responseData.message || "쿠폰 취소에 실패했습니다",
          logEntry
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const logEntry = this.log(
        "cancel",
        requestPayload,
        null,
        false,
        duration,
        error instanceof Error ? error.message : "알 수 없는 오류"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "네트워크 오류가 발생했습니다",
        logEntry
      };
    }
  }

  // 쿠폰 상태 확인
  async checkCouponStatus(providerOrderId: string) {
    const startTime = Date.now();
    const requestPayload = {
      partnerCode: this.partnerCode,
      providerOrderId,
    };

    try {
      // 개발 환경에서는 모의 응답 반환
      if (process.env.NODE_ENV !== "production") {
        const mockResponse = {
          success: true,
          statusCode: 200,
          data: {
            status: "delivered",
            deliveredAt: new Date().toISOString(),
          },
        };
        
        const duration = Date.now() - startTime;
        const logEntry = this.log("status_check", requestPayload, mockResponse, true, duration);
        
        return { 
          success: true, 
          data: mockResponse.data,
          logEntry
        };
      }

      // 실제 API 호출 (프로덕션)
      const response = await fetch(`${this.baseUrl}/api/v1/coupons/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      const responseData = await response.json();
      const duration = Date.now() - startTime;
      const success = response.ok && responseData.success;

      const logEntry = this.log(
        "status_check",
        requestPayload,
        { statusCode: response.status, ...responseData },
        success,
        duration,
        success ? undefined : responseData.message || "API 호출 실패"
      );

      if (success) {
        return {
          success: true,
          data: responseData.data,
          logEntry
        };
      } else {
        return {
          success: false,
          error: responseData.message || "상태 확인에 실패했습니다",
          logEntry
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const logEntry = this.log(
        "status_check",
        requestPayload,
        null,
        false,
        duration,
        error instanceof Error ? error.message : "알 수 없는 오류"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "네트워크 오류가 발생했습니다",
        logEntry
      };
    }
  }
}

export const giftishowAdapter = new GiftishowAdapter();