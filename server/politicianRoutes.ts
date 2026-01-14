import { Router } from "express";
import { storage } from "./storage.js";
import { requireAuth, type AuthUser } from "./simpleAuth.js";
import { db } from "./db.js";
import {
  insertAssemblyRatingSchema,
  insertLocalCouncilRatingSchema,
  insertAssemblyCommentSchema,
  insertLocalCouncilCommentSchema,
  localCouncilMembers,
} from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const router = Router();

// Get politician average ratings
router.get("/politicians/:type/:id/ratings", async (req, res) => {
  try {
    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId || (type !== 'assembly' && type !== 'local_council' && type !== 'national' && type !== 'local')) {
      return res.status(400).json({ error: "Invalid politician type or ID" });
    }

    // Normalize type
    const normalizedType = (type === 'assembly' || type === 'national') ? 'assembly' : 'local';

    const averageRatings = await storage.getPoliticianAverageRatings(politicianId, normalizedType);

    // Get user's rating if authenticated and verified
    let userRating: any = null;
    if (req.user?.isVerified) {
      userRating = await storage.getUserPoliticianRating(req.user.id, politicianId, normalizedType);
    }

    res.json({ averageRatings, userRating });
  } catch (error) {
    console.error("Error fetching politician ratings:", error);
    res.status(500).json({ error: "Failed to fetch ratings" });
  }
});

// Create or update politician rating (authenticated users only)
router.post("/politicians/:type/:id/ratings", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return res.status(401).json({ error: "본인인증을 완료한 회원만 평가할 수 있습니다." });
    }

    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId || (type !== 'assembly' && type !== 'local_council' && type !== 'local' && type !== 'national')) {
      return res.status(400).json({ error: "Invalid politician type or ID" });
    }

    const normalizedType = (type === 'assembly' || type === 'national') ? 'assembly' : 'local';

    // Validate using appropriate schema
    let validatedData;

    // Calculate average rating if not provided but detailed ratings are present
    const { communicationRating, policyRating, integrityRating, localDevRating } = req.body;
    let calculatedRating = req.body.rating;

    if (!calculatedRating && (communicationRating || policyRating || integrityRating || localDevRating)) {
      const sum = (Number(communicationRating) || 0) +
        (Number(policyRating) || 0) +
        (Number(integrityRating) || 0) +
        (Number(localDevRating) || 0);
      const count = 4; // Assuming all 4 are always relevant in the UI form
      calculatedRating = Math.round(sum / count);
    }

    const bodyWithIds = {
      ...req.body,
      userId: req.user!.id,
      targetId: politicianId,
      rating: calculatedRating || 0 // Ensure rating exists
    };

    if (normalizedType === 'assembly') {
      validatedData = insertAssemblyRatingSchema.parse(bodyWithIds);
    } else {
      validatedData = insertLocalCouncilRatingSchema.parse(bodyWithIds);
    }

    // Region check removed as per user request (anyone can rate)
    /*
    // Check if user is rating their local representative
    const userLocation = {
      cityProvince: req.user!.cityProvince,
      district: req.user!.district,
    };

    if (!userLocation.cityProvince || !userLocation.district) {
      return res.status(403).json({ error: "프로필에서 지역 정보를 먼저 설정해주세요." });
    }

    // Verify politician is from user's district
    let isLocalRepresentative = false;

    if (normalizedType === 'assembly') {
      const member = await storage.getPolitician(politicianId, 'assembly');
      if (member) {
        // Check if member represents user's district
        const normalizedUserLocation = `${userLocation.cityProvince} ${userLocation.district} `.replace(/특별시|광역시|특별자치시|도$/g, '').trim();
        const normalizedConstituency = (member.constituency || '').replace(/특별시|광역시|특별자치시|도$/g, '').trim();
        isLocalRepresentative = normalizedConstituency.includes(normalizedUserLocation) ||
          normalizedUserLocation.includes(normalizedConstituency);
      }
    } else {
      const members = await db
        .select()
        .from(localCouncilMembers)
        .where(
          and(
            eq(localCouncilMembers.cityProvince, userLocation.cityProvince),
            eq(localCouncilMembers.district, userLocation.district),
            eq(localCouncilMembers.isActive, true)
          )
        );
      isLocalRepresentative = members.some((m: any) => m.id === politicianId);
    }

    if (!isLocalRepresentative) {
      return res.status(403).json({ error: "내 지역구 대표만 평가할 수 있습니다." });
    }
    */

    // Call storage
    const rating = await storage.createOrUpdatePoliticianRating(
      req.user!.id,
      politicianId,
      normalizedType,
      validatedData.rating,
      validatedData.comment || undefined,
      {
        communicationRating: validatedData.communicationRating,
        policyRating: validatedData.policyRating,
        integrityRating: validatedData.integrityRating,
        localDevRating: validatedData.localDevRating
      }
    );
    res.json(rating);
  } catch (error) {
    console.error("Error creating/updating rating:", error);
    res.status(500).json({ error: "Failed to save rating" });
  }
});

// Get politician comments
router.get("/politicians/:type/:id/comments", async (req, res) => {
  try {
    const { type, id } = req.params;
    const politicianId = parseInt(id);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!politicianId) {
      return res.status(400).json({ error: "Invalid politician ID" });
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    const comments = await storage.getPoliticianComments(politicianId, normalizedType, limit, offset);
    res.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Create politician comment (authenticated users only)
router.post("/politicians/:type/:id/comments", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return res.status(401).json({ error: "본인인증을 완료한 회원만 댓글을 작성할 수 있습니다." });
    }

    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId) {
      return res.status(400).json({ error: "Invalid politician ID" });
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    // Validate body
    const bodyWithIds = { ...req.body, userId: req.user!.id, targetId: politicianId };
    if (normalizedType === 'assembly') {
      insertAssemblyCommentSchema.parse(bodyWithIds);
    } else {
      insertLocalCouncilCommentSchema.parse(bodyWithIds);
    }

    // Check if user is commenting on their local representative
    /*
    const userLocation = {
      cityProvince: req.user!.cityProvince,
      district: req.user!.district,
    };

    if (!userLocation.cityProvince || !userLocation.district) {
      return res.status(403).json({ error: "프로필에서 지역 정보를 먼저 설정해주세요." });
    }

    // Verify politician is from user's district
    let isLocalRepresentative = false;
    if (normalizedType === 'assembly') {
      const member = await storage.getPolitician(politicianId, 'assembly');
      if (member) {
        const normalizedUserLocation = `${userLocation.cityProvince} ${userLocation.district} `.replace(/특별시|광역시|특별자치시|도$/g, '').trim();
        const normalizedConstituency = (member.constituency || '').replace(/특별시|광역시|특별자치시|도$/g, '').trim();
        isLocalRepresentative = normalizedConstituency.includes(normalizedUserLocation) ||
          normalizedUserLocation.includes(normalizedConstituency);
      }
    } else {
      // Only verifying region match for local council for now to save DB call if needed, 
      // but strictly we should check ID existence in region.
      // Reusing previous logic:
      const members = await db
        .select()
        .from(localCouncilMembers)
        .where(
          and(
            eq(localCouncilMembers.cityProvince, userLocation.cityProvince),
            eq(localCouncilMembers.district, userLocation.district),
            eq(localCouncilMembers.isActive, true)
          )
        );
      isLocalRepresentative = members.some((m: any) => m.id === politicianId);
    }

    if (!isLocalRepresentative) {
      return res.status(403).json({ error: "내 지역구 대표에게만 댓글을 작성할 수 있습니다." });
    }
    */

    const comment = await storage.createPoliticianComment(req.user!.id, politicianId, normalizedType, req.body.content);
    res.json(comment);
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// Toggle comment like (authenticated users only)
// Updated route to include type: /comments/:type/:id/like
router.post("/comments/:type/:id/like", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return res.status(401).json({ error: "본인인증을 완료한 회원만 이용 가능합니다." });
    }
    const { type, id } = req.params;
    const commentId = parseInt(id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment ID" });
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    const liked = await storage.toggleCommentLike(req.user!.id, commentId, normalizedType);
    res.json({ liked });
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

// Report comment
router.post("/comments/:type/:id/report", async (req, res) => {
  try {
    const { type, id } = req.params;
    const commentId = parseInt(id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment ID" });
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    await storage.reportComment(commentId, normalizedType);
    res.json({ success: true });
  } catch (error) {
    console.error("Error reporting comment:", error);
    res.status(500).json({ error: "Failed to report comment" });
  }
});

// Political Persona Generation (Strict Type Version)
import { generatePoliticianPersona } from "./ai.js";

router.get("/politicians/:type/:id/persona", async (req, res) => {
  try {
    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId || (type !== 'assembly' && type !== 'local_council' && type !== 'national' && type !== 'local')) {
      return res.status(400).json({ error: "Invalid politician type or ID" });
    }

    const normalizedType = (type === 'assembly' || type === 'national') ? 'assembly' : 'local';

    console.log(`🎮 Generating persona for ${normalizedType} politician ID: ${politicianId} `);

    const politician = await storage.getPolitician(politicianId, normalizedType);
    if (!politician) {
      return res.status(404).json({ message: "Politician not found" });
    }

    if (politician.aiPersona) {
      console.log(`✅ Using cached persona for ${normalizedType} politician ID: ${politicianId} `);
      // Ensure type is correct in cached version just in case
      if (politician.aiPersona.type !== (normalizedType === 'assembly' ? 'national' : 'local')) {
        console.warn("⚠️ Cached persona type mismatch. Regenerating...");
      } else {
        return res.json(politician.aiPersona);
      }
    }

    console.log(`🚀 No valid cached persona.Generating new on for ${normalizedType} ID: ${politicianId} `);

    // Explicitly pass type to generator
    const politicianForAI = { ...politician, type: normalizedType };
    const persona = await generatePoliticianPersona(politicianForAI);

    try {
      await storage.updatePolitician(politicianId, { aiPersona: persona }, normalizedType);
      console.log(`💾 Saved newly generated persona to DB for ${normalizedType} ID: ${politicianId} `);
    } catch (saveError) {
      console.error("⚠️ Error saving persona to DB (non-fatal):", saveError);
    }

    res.json(persona);
  } catch (error) {
    console.error("Error generating persona route:", error);
    res.status(500).json({ message: "Failed to generate politician persona" });
  }
});

export const politicianRoutes = router;