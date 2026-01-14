import type { Express } from "express";
import { supabaseAdmin } from "./supabase.js";

// Helper to convert snake_case to camelCase
function toCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(v => toCamelCase(v));
    } else if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            result[camelKey] = toCamelCase(obj[key]);
            return result;
        }, {} as any);
    }
    return obj;
}

export function registerCelebrityRoutes(app: Express) {
    // 디버그 엔드포인트 - Supabase 연결 테스트
    app.get("/api/celebrities/debug", async (req, res) => {
        try {
            console.log("🔍 Debug: Testing Supabase connection...");

            const { data, error, count } = await supabaseAdmin
                .from('celebrities')
                .select('*', { count: 'exact' })
                .limit(5);

            if (error) {
                console.error("❌ Debug Error:", error);
                return res.json({ success: false, error: error.message, details: error });
            }

            console.log(`✅ Debug Success: Found ${count} total celebrities, showing first ${data?.length}`);
            res.json({
                success: true,
                totalCount: count,
                sampleData: data?.map(toCamelCase),
                message: `Successfully fetched ${data?.length} celebrities out of ${count} total`
            });
        } catch (error: any) {
            console.error("❌ Debug Exception:", error);
            res.json({ success: false, error: error.message, stack: error.stack });
        }
    });

    // 카테고리 목록 조회
    app.get("/api/celebrities/categories", async (req, res) => {
        try {
            console.log("📋 Fetching all unique categories...");

            const { data, error } = await supabaseAdmin
                .from('celebrities')
                .select('category, gender, type');

            if (error) {
                console.error("❌ Error:", error);
                throw error;
            }

            // 고유한 카테고리 값들 추출
            const categories = Array.from(new Set(data?.map(item => item.category))).filter(Boolean).sort();
            const genders = Array.from(new Set(data?.map(item => item.gender))).filter(Boolean).sort();
            const types = Array.from(new Set(data?.map(item => item.type))).filter(Boolean).sort();

            console.log(`✅ Found ${categories.length} unique categories`);
            res.json({ categories, genders, types });
        } catch (error: any) {
            console.error("❌ Exception:", error);
            res.json({ success: false, error: error.message });
        }
    });

    // 카테고리별 셀럽 조회 (category 필드에 'actor_female' 같은 값이 저장됨)
    app.get("/api/celebrities/by-category", async (req, res) => {
        try {
            const { category } = req.query;
            console.log(`🎬 Fetching celebrities - category: ${category}`);

            let query = supabaseAdmin
                .from('celebrities')
                .select('*');

            // category 파라미터로 직접 필터링 (예: 'actor_female')
            if (category) {
                query = query.eq('category', category);
            }

            const { data, error } = await query.order('name', { ascending: true });

            if (error) {
                console.error("❌ Supabase Error:", error);
                throw error;
            }

            console.log(`✅ Fetched ${data?.length || 0} celebrities for category: ${category}`);
            res.json((data || []).map(toCamelCase));
        } catch (error) {
            console.error("❌ Error fetching celebrities:", error);
            res.status(500).json({ message: "Failed to fetch celebrities" });
        }
    });

    // 특정 셀럽 조회
    app.get("/api/celebrities/:id", async (req, res) => {
        try {
            const id = Number(req.params.id);

            const { data, error } = await supabaseAdmin
                .from('celebrities')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) return res.status(404).json({ message: "Celebrity not found" });

            res.json(toCamelCase(data));
        } catch (error) {
            console.error("Error fetching celebrity:", error);
            res.status(500).json({ message: "Failed to fetch celebrity" });
        }
    });

    // 배틀용 셀럽 목록 조회 (카테고리별 랜덤)
    app.get("/api/celebrities/battle-candidates", async (req, res) => {
        try {
            const { category, limit = 10 } = req.query;

            let query = supabaseAdmin
                .from('celebrities')
                .select('*');

            if (category) query = query.eq('category', category);

            const { data, error } = await query.limit(Number(limit));

            if (error) throw error;

            // 랜덤 셔플
            const shuffled = (data || [])
                .map(value => ({ value, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ value }) => value);

            res.json(shuffled.map(toCamelCase));
        } catch (error) {
            console.error("Error fetching battle candidates:", error);
            res.status(500).json({ message: "Failed to fetch battle candidates" });
        }
    });

    // 카테고리별 통계
    app.get("/api/celebrities/stats", async (req, res) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('celebrities')
                .select('category, gender, type');

            if (error) throw error;

            const stats = {
                total: data?.length || 0,
                byCategory: {} as Record<string, number>,
                byGender: {} as Record<string, number>,
                byType: {} as Record<string, number>,
            };

            data?.forEach(item => {
                // Category stats
                if (item.category) {
                    stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
                }
                // Gender stats
                if (item.gender) {
                    stats.byGender[item.gender] = (stats.byGender[item.gender] || 0) + 1;
                }
                // Type stats
                if (item.type) {
                    stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
                }
            });

            res.json(stats);
        } catch (error) {
            console.error("Error fetching celebrity stats:", error);
            res.status(500).json({ message: "Failed to fetch celebrity stats" });
        }
    });
}
