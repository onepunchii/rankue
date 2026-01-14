import type { Express } from "express";
import { z } from "zod";
import { authMiddleware, requireAuth } from "./simpleAuth.js";
import { storage } from "./storage.js";
// Schema imports removed - using basic validation instead

// 관리자 권한 체크 미들웨어
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.isGuest || !req.user.isAuthenticated) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }

  // 관리자 권한 체크 (레벨 5 이상 또는 특정 이메일)
  if (req.user.level_number < 5 && req.user.email !== "admin@polli.com") {
    return res.status(403).json({ error: "관리자 권한이 필요합니다" });
  }

  next();
};

// 일반 사용자 인증 체크 미들웨어
const requireMember = (req: any, res: any, next: any) => {
  if (!req.user || req.user.isGuest || !req.user.isAuthenticated) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  next();
};

export function registerRewardsRoutes(app: Express): void {
  // 관리자 전용: 상품 관리
  app.get("/api/admin/rewards/products", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const products = await storage.getRewardProducts();
      res.json(products);
    } catch (error) {
      console.error("상품 목록 조회 오류:", error);
      res.status(500).json({ error: "상품 목록 조회에 실패했습니다" });
    }
  });

  app.post("/api/admin/rewards/products", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const product = await storage.createRewardProduct(req.body);
      res.json(product);
    } catch (error) {
      console.error("상품 생성 오류:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "입력 데이터가 올바르지 않습니다", details: error.errors });
      } else {
        res.status(500).json({ error: "상품 생성에 실패했습니다" });
      }
    }
  });

  app.put("/api/admin/rewards/products/:id", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const product = await storage.updateRewardProduct(id, updates);
      res.json(product);
    } catch (error) {
      console.error("상품 수정 오류:", error);
      res.status(500).json({ error: "상품 수정에 실패했습니다" });
    }
  });

  app.delete("/api/admin/rewards/products/:id", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRewardProduct(id);
      res.json({ success: true });
    } catch (error) {
      console.error("상품 삭제 오류:", error);
      res.status(500).json({ error: "상품 삭제에 실패했습니다" });
    }
  });

  // 관리자 전용: 주문 관리
  app.get("/api/admin/rewards/orders", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const orders = await storage.getRewardOrders(status, limit, offset);
      res.json(orders);
    } catch (error) {
      console.error("주문 목록 조회 오류:", error);
      res.status(500).json({ error: "주문 목록 조회에 실패했습니다" });
    }
  });

  app.get("/api/admin/rewards/orders/:id", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getRewardOrder(id);
      if (!order) {
        return res.status(404).json({ error: "주문을 찾을 수 없습니다" });
      }
      res.json(order);
    } catch (error) {
      console.error("주문 조회 오류:", error);
      res.status(500).json({ error: "주문 조회에 실패했습니다" });
    }
  });

  app.post("/api/admin/rewards/orders/:id/approve", authMiddleware, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const approverId = req.user.id;

      await storage.approveRewardOrder(id, approverId);

      // 승인 후 자동으로 쿠폰 발행 처리
      const result = await storage.processRewardOrder(id);

      res.json({ success: true, processed: result.success });
    } catch (error) {
      console.error("주문 승인 오류:", error);
      res.status(500).json({ error: "주문 승인에 실패했습니다" });
    }
  });

  app.post("/api/admin/rewards/orders/:id/reject", authMiddleware, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const approverId = req.user.id;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "거절 사유를 입력해주세요" });
      }

      await storage.rejectRewardOrder(id, approverId, reason);
      res.json({ success: true });
    } catch (error) {
      console.error("주문 거절 오류:", error);
      res.status(500).json({ error: "주문 거절에 실패했습니다" });
    }
  });

  app.post("/api/admin/rewards/orders/:id/process", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.processRewardOrder(id);
      res.json(result);
    } catch (error) {
      console.error("쿠폰 발행 오류:", error);
      res.status(500).json({ error: "쿠폰 발행에 실패했습니다" });
    }
  });

  // 관리자 전용: 연동 로그 조회
  app.get("/api/admin/rewards/logs", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const orderId = req.query.orderId ? parseInt(req.query.orderId as string) : undefined;
      const provider = req.query.provider as string;
      const limit = parseInt(req.query.limit as string) || 100;

      const logs = await storage.getProviderLogs(orderId, provider, limit);
      res.json(logs);
    } catch (error) {
      console.error("연동 로그 조회 오류:", error);
      res.status(500).json({ error: "연동 로그 조회에 실패했습니다" });
    }
  });

  // 관리자 전용: 통계 조회
  app.get("/api/admin/rewards/stats", authMiddleware, requireAdmin, async (req, res) => {
    try {
      // 기본 통계 반환 (실제 구현에서는 더 복잡한 통계 가능)
      const stats = {
        totalOrders: 0,
        pendingOrders: 0,
        approvedOrders: 0,
        rejectedOrders: 0,
        totalPointsSpent: 0,
        activeProducts: 0,
      };

      res.json(stats);
    } catch (error) {
      console.error("통계 조회 오류:", error);
      res.status(500).json({ error: "통계 조회에 실패했습니다" });
    }
  });

  // 사용자용: 상품 목록 조회
  app.get("/api/rewards/products", authMiddleware, requireMember, async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string;
      const products = await storage.getRewardProducts(categoryId);
      res.json(products);
    } catch (error) {
      console.error("상품 목록 조회 오류:", error);
      res.status(500).json({ error: "상품 목록 조회에 실패했습니다" });
    }
  });

  // 사용자용: 포인트 잔액 조회
  app.get("/api/rewards/balance", authMiddleware, requireMember, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const balance = await storage.getUserPointBalance(userId);
      res.json(balance);
    } catch (error) {
      console.error("포인트 잔액 조회 오류:", error);
      res.status(500).json({ error: "포인트 잔액 조회에 실패했습니다" });
    }
  });

  // 사용자용: 포인트 내역 조회
  app.get("/api/rewards/ledger", authMiddleware, requireMember, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const ledger = await storage.getPointLedger(userId, limit);
      res.json(ledger);
    } catch (error) {
      console.error("포인트 내역 조회 오류:", error);
      res.status(500).json({ error: "포인트 내역 조회에 실패했습니다" });
    }
  });

  // 사용자용: 내 주문 내역 조회
  app.get("/api/rewards/orders", authMiddleware, requireMember, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const orders = await storage.getUserRewardOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("주문 내역 조회 오류:", error);
      res.status(500).json({ error: "주문 내역 조회에 실패했습니다" });
    }
  });

  // 사용자용: 상품 주문하기
  app.post("/api/rewards/orders", authMiddleware, requireMember, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const orderData = req.body;

      // 상품 정보 확인
      const product = await storage.getRewardProduct(orderData.productId);
      if (!product) {
        return res.status(404).json({ error: "상품을 찾을 수 없습니다" });
      }

      if (!product.isActive) {
        return res.status(400).json({ error: "현재 판매하지 않는 상품입니다" });
      }

      // 포인트 잔액 확인 및 홀드
      let transactionId: number;
      try {
        transactionId = await storage.holdPoints(
          userId,
          product.pointCost,
          "reward_orders",
          "pending", // 임시 참조 ID
          `상품 주문: ${product.name}`
        );
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "포인트가 부족합니다" });
      }

      // 주문 생성
      const order = await storage.createRewardOrder({
        ...orderData,
        userId,
        pointCost: product.pointCost,
      });

      // 트랜잭션 참조 업데이트 (주문 ID 연결)
      await storage.updatePointTransactionReference(transactionId, order.id.toString());

      res.json(order);
    } catch (error) {
      console.error("주문 생성 오류:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "입력 데이터가 올바르지 않습니다", details: error.errors });
      } else {
        res.status(500).json({ error: "주문 생성에 실패했습니다" });
      }
    }
  });
}