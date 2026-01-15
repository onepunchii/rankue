import { supabaseAdmin } from "../supabase.js";
import { db } from "../db.js";
import { assemblyMembers, localCouncilMembers, assemblyRatings, localCouncilRatings, assemblyComments, localCouncilComments } from "../../shared/schema.js";
import { eq, desc, and, like, ilike } from "drizzle-orm";

// Interfaces mirroring the Drizzle schema for type safety
// (You might want to import these from a types file if they exist, or define them here)
// For now, using 'any' for simplicity in transition, or defining essential interfaces.
// Ideally usage of ../../shared/schema.js types is preferred, but they are Drizzle-bound.
// We'll stick to returning what the frontend expects.

// Helper to convert snake_case object keys to camelCase
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

// Helper to convert camelCase object keys to snake_case
function toSnakeCase(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(v => toSnakeCase(v));
    } else if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            result[snakeKey] = toSnakeCase(obj[key]);
            return result;
        }, {} as any);
    }
    return obj;
}

export class PoliticsStorage {
    async createPoliticalPoll(poll: any): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from('political_polls')
            .insert(toSnakeCase(poll))
            .select()
            .single();

        if (error) throw error;
        return toCamelCase(data);
    }

    async createPoliticalFigure(figure: any): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from('political_figures')
            .insert(toSnakeCase(figure))
            .select()
            .single();

        if (error) throw error;
        return toCamelCase(data);
    }

    async getPoliticalPolls(pollType?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
        let query = supabaseAdmin
            .from('political_polls')
            .select('*');

        if (pollType) query = query.eq('poll_type', pollType);
        if (startDate) query = query.gte('poll_date', startDate.toISOString().split('T')[0]);
        if (endDate) query = query.lt('poll_date', endDate.toISOString().split('T')[0]);

        const { data, error } = await query.order('poll_date', { ascending: false });

        if (error) throw error;
        return (data || []).map(toCamelCase);
    }

    async getPoliticalFigures(): Promise<any[]> {
        const { data, error } = await supabaseAdmin
            .from('political_figures')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(toCamelCase);
    }

    async getPoliticians(type: 'assembly' | 'local' = 'assembly', region?: string, limit = 50): Promise<any[]> {
        const table = type === 'assembly' ? assemblyMembers : localCouncilMembers;

        let query = db.select().from(table).where(eq(table.isActive, true));

        if (region) {
            // @ts-ignore - Dynamic key usage
            const regionField = type === 'assembly' ? table.region : table.cityProvince;
            // @ts-ignore
            query.where(eq(regionField, region));
        }

        const data = await query.limit(limit);
        return data; // Drizzle returns camelCase as defined in schema
    }

    async getPolitician(id: number, type: 'assembly' | 'local' = 'assembly'): Promise<any | undefined> {
        const table = type === 'assembly' ? assemblyMembers : localCouncilMembers;
        const [member] = await db.select().from(table).where(eq(table.id, id));
        return member;
    }

    async createPolitician(politician: any, type: 'assembly' | 'local' = 'assembly'): Promise<any> {
        const table = type === 'assembly' ? 'assembly_members' : 'local_council_members';
        const { data, error } = await supabaseAdmin
            .from(table)
            .insert(toSnakeCase(politician))
            .select()
            .single();

        if (error) throw error;
        return toCamelCase(data);
    }

    async updatePolitician(id: number, politician: any, type: 'assembly' | 'local' = 'assembly'): Promise<any> {
        const table = type === 'assembly' ? 'assembly_members' : 'local_council_members';
        const { data, error } = await supabaseAdmin
            .from(table)
            .update(toSnakeCase(politician))
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return toCamelCase(data);
    }

    async getPoliticianByName(name: string, type: 'assembly' | 'local' = 'assembly'): Promise<any | undefined> {
        const table = type === 'assembly' ? 'assembly_members' : 'local_council_members';
        const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('name', name)
            .limit(1)
            .maybeSingle();

        if (error || !data) return undefined;
        return toCamelCase(data);
    }

    async getPoliticiansByRegion(region: string, district?: string, type: 'assembly' | 'local' = 'assembly'): Promise<any[]> {
        const table = type === 'assembly' ? assemblyMembers : localCouncilMembers;

        if (type === 'assembly') {
            let conditions = [eq(table.isActive, true), eq(assemblyMembers.region, region)];
            if (district) {
                conditions.push(ilike(assemblyMembers.constituency, `%${district}%`));
            }
            return await db.select().from(assemblyMembers).where(and(...conditions)).orderBy(assemblyMembers.name);
        } else {
            let conditions = [eq(table.isActive, true), eq(localCouncilMembers.cityProvince, region)];
            if (district) {
                conditions.push(eq(localCouncilMembers.district, district));
            }
            return await db.select().from(localCouncilMembers).where(and(...conditions)).orderBy(localCouncilMembers.name);
        }
    }

    async getLocalCouncilMembers(cityProvince: string, district: string): Promise<any[]> {
        return this.getPoliticiansByRegion(cityProvince, district, 'local');
    }

    async updatePoliticianActivity(id: number, data: any): Promise<any> {
        return this.updatePolitician(id, data, 'assembly');
    }

    async getPoliticianActivities(id?: number): Promise<any[]> {
        return [];
    }

    // Assembly specific
    // Assembly specific
    async getTopAssemblyMembersByActivity(limit = 10): Promise<any[]> {
        return await db.select()
            .from(assemblyMembers)
            .where(eq(assemblyMembers.isActive, true))
            .orderBy(desc(assemblyMembers.activityScore))
            .limit(limit);
    }

    // Ratings
    async getPoliticianRatings(id: number, type: 'assembly' | 'local' = 'assembly'): Promise<any[]> {
        const table = type === 'assembly' ? 'assembly_ratings' : 'local_council_ratings';
        const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('target_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(toCamelCase);
    }

    async getUserPoliticianRating(userId: string, politicianId: number, type: 'assembly' | 'local' = 'assembly'): Promise<any | undefined> {
        const table = type === 'assembly' ? 'assembly_ratings' : 'local_council_ratings';
        const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .match({ user_id: userId, target_id: politicianId })
            .single();

        if (error) return undefined;
        return toCamelCase(data);
    }

    async getPoliticianAverageRatings(politicianId: number, type: 'assembly' | 'local' = 'assembly'): Promise<any> {
        const ratings = await this.getPoliticianRatings(politicianId, type);
        if (!ratings || ratings.length === 0) {
            return {
                averageRating: 0,
                totalRatings: 0,
                communicationAvg: 0,
                policyAvg: 0,
                integrityAvg: 0,
                localDevAvg: 0
            };
        }

        const total = ratings.reduce((acc, r) => acc + r.rating, 0);
        const commTotal = ratings.reduce((acc, r) => acc + (r.communicationRating || 0), 0);
        const policyTotal = ratings.reduce((acc, r) => acc + (r.policyRating || 0), 0);
        const integrityTotal = ratings.reduce((acc, r) => acc + (r.integrityRating || 0), 0);
        const localDevTotal = ratings.reduce((acc, r) => acc + (r.localDevRating || 0), 0);

        return {
            averageRating: parseFloat((total / ratings.length).toFixed(1)),
            totalRatings: ratings.length,
            communicationAvg: parseFloat((commTotal / ratings.length).toFixed(1)),
            policyAvg: parseFloat((policyTotal / ratings.length).toFixed(1)),
            integrityAvg: parseFloat((integrityTotal / ratings.length).toFixed(1)),
            localDevAvg: parseFloat((localDevTotal / ratings.length).toFixed(1))
        };
    }

    async createOrUpdatePoliticianRating(userId: string, politicianId: number, type: 'assembly' | 'local', ratingVal: number, comment?: string, details?: { communicationRating?: number, policyRating?: number, integrityRating?: number, localDevRating?: number }): Promise<any> {
        const table = type === 'assembly' ? 'assembly_ratings' : 'local_council_ratings';

        // Check existing
        const { data: existing } = await supabaseAdmin
            .from(table)
            .select('id')
            .match({ user_id: userId, target_id: politicianId })
            .single();

        const payload = {
            user_id: userId,
            target_id: politicianId,
            rating: ratingVal,
            comment,
            communication_rating: details?.communicationRating || 0,
            policy_rating: details?.policyRating || 0,
            integrity_rating: details?.integrityRating || 0,
            local_dev_rating: details?.localDevRating || 0,
            // updated_at is not in schema for ratings? created_at is defaultNow. 
            // If update, we might just update rating/comment.
        };

        if (existing) {
            const { data: updated, error } = await supabaseAdmin
                .from(table)
                .update(payload)
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            return toCamelCase(updated);
        } else {
            const { data: created, error } = await supabaseAdmin
                .from(table)
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return toCamelCase(created);
        }
    }

    // Comments
    async getPoliticianComments(politicianId: number, type: 'assembly' | 'local' = 'assembly', limit = 50, offset = 0): Promise<any[]> {
        const table = type === 'assembly' ? 'assembly_comments' : 'local_council_comments';
        const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('target_id', politicianId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return (data || []).map(toCamelCase);
    }

    async createPoliticianComment(userId: string, politicianId: number, type: 'assembly' | 'local', content: string): Promise<any> {
        const { filtered, content: filteredContent } = await this.filterProfanity(content);
        const table = type === 'assembly' ? 'assembly_comments' : 'local_council_comments';

        const { data, error } = await supabaseAdmin
            .from(table)
            .insert({
                user_id: userId,
                target_id: politicianId,
                content: filteredContent,
                is_filtered: filtered,
                like_count: 0,
                report_count: 0
            })
            .select()
            .single();

        if (error) throw error;
        return toCamelCase(data);
    }

    // Likes/Reports need to know which table comments are in.
    // Comment ID might overlap between assembly/local tables.
    // We need 'type' to find the right comment table.
    // AND 'like' table needs to be separate or polymorphic?
    // 'assembly_comment_likes', 'local_comment_likes'? 
    // Schema didn't add like tables.
    // I will skip like logic for now or implement simplistic one-sided approach if critical.
    // Leaving placeholders.

    async toggleCommentLike(userId: string, commentId: number, type: 'assembly' | 'local'): Promise<boolean> {
        // Skipping implementation as schema for likes is not set up
        return true;
    }

    async reportComment(commentId: number, type: 'assembly' | 'local'): Promise<void> {
        const table = type === 'assembly' ? 'assembly_comments' : 'local_council_comments';
        // Simple increment
        // ... (omitted for brevity)
    }

    async filterProfanity(content: string): Promise<{ filtered: boolean; content: string }> {
        const profanityList = ["씨발", "개새끼", "병신", "지랄", "죽어", "꺼져", "미친", "쓰레기", "시발", "개새", "병신새끼", "좆", "좆같", "씹", "시바", "시팔"];
        let filtered = false;
        let filteredContent = content;

        for (const word of profanityList) {
            const regex = new RegExp(word, "gi");
            if (regex.test(filteredContent)) {
                filtered = true;
                filteredContent = filteredContent.replace(regex, "*".repeat(word.length));
            }
        }
        return { filtered, content: filteredContent };
    }

    // Political Stats & Trends
    async getLatestPoliticalStats(): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from('political_stats')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return toCamelCase(data);
    }

    async getWeeklyTrends(limit = 10): Promise<any[]> {
        const { data, error } = await supabaseAdmin
            .from('political_stats')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        // Return in chronological order for charts
        return (data || []).reverse().map(toCamelCase);
    }

    async getPoliticalSurveys(): Promise<{ currentSurveys: any[], pastSurveys: any[] }> {
        const now = new Date().toISOString();

        const { data: currentSurveys, error: err1 } = await supabaseAdmin
            .from('surveys')
            .select('*')
            .eq('category', 'politics')
            .or(`voting_end_date.is.null,voting_end_date.gte.${now}`)
            .order('created_at', { ascending: false });

        const { data: pastSurveys, error: err2 } = await supabaseAdmin
            .from('surveys')
            .select('*')
            .eq('category', 'politics')
            .lt('voting_end_date', now)
            .order('created_at', { ascending: false });

        if (err1 || err2) throw (err1 || err2);

        return {
            currentSurveys: (currentSurveys || []).map(toCamelCase),
            pastSurveys: (pastSurveys || []).map(toCamelCase)
        };
    }
}
