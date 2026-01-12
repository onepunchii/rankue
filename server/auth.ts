import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";
import { storage } from "./storage";
import { type User } from "@shared/schema";

// Supabase Auth 연동 미들웨어
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "인증 토큰이 필요합니다." });
    }

    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
        }

        // 서버 사이드 사용자 객체 설정
        (req as any).user = user;

        // DB 프로필 동기화 (최초 로그인 시 생성)
        const profile = await storage.users.getUser(user.id);
        if (!profile) {
            await storage.users.upsertUser({
                id: user.id,
                email: user.email,
                nickname: user.user_metadata.nickname || user.user_metadata.full_name || user.email?.split('@')[0],
                fullName: user.user_metadata.full_name,
                profileImageUrl: user.user_metadata.avatar_url,
                userType: 'verified',
                level: 1,
                experience: 0,
                personalPoints: 0,
                availableLotteryTickets: 1,
                badges: [],
            });
        }

        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        res.status(500).json({ message: "인증 처리 중 오류가 발생했습니다." });
    }
}

// 프로필 라우트 핸들러
export async function handleGetProfile(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });

    try {
        const profile = await storage.users.getUser(user.id);
        if (!profile) return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
        res.json(profile);
    } catch (err) {
        res.status(500).json({ message: "프로필 조회 실패" });
    }
}
