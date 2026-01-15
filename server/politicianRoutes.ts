import { Router } from "express";
import { storage } from "./storage.js";
import { requireAuth } from "./auth.js";
import { type AuthUser } from "./services/authService.js";
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
import { sendSuccess, sendError } from "./utils/response.js";
import { generatePoliticianPersona } from "./ai.js";

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
      return sendError(res, 400, "Invalid politician type or ID");
    }

    // Normalize type
    const normalizedType = (type === 'assembly' || type === 'national') ? 'assembly' : 'local';

    const averageRatings = await storage.getPoliticianAverageRatings(politicianId, normalizedType);

    // Get user's rating if authenticated and verified
    let userRating: any = null;
    if (req.user?.isVerified) {
      userRating = await storage.getUserPoliticianRating(req.user.id, politicianId, normalizedType);
    }

    return sendSuccess(res, { averageRatings, userRating });
  } catch (error) {
    console.error("Error fetching politician ratings:", error);
    return sendError(res, 500, "Failed to fetch ratings");
  }
});

// Create or update politician rating (authenticated users only)
router.post("/politicians/:type/:id/ratings", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return sendError(res, 401, "본인인증을 완료한 회원만 평가할 수 있습니다.", "UNVERIFIED");
    }

    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId || (type !== 'assembly' && type !== 'local_council' && type !== 'local' && type !== 'national')) {
      return sendError(res, 400, "Invalid politician type or ID");
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
    return sendSuccess(res, rating);
  } catch (error) {
    console.error("Error creating/updating rating:", error);
    return sendError(res, 500, "Failed to save rating");
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
      return sendError(res, 400, "Invalid politician ID");
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    const comments = await storage.getPoliticianComments(politicianId, normalizedType, limit, offset);
    return sendSuccess(res, comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return sendError(res, 500, "Failed to fetch comments");
  }
});

// Create politician comment (authenticated users only)
router.post("/politicians/:type/:id/comments", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return sendError(res, 401, "본인인증을 완료한 회원만 댓글을 작성할 수 있습니다.", "UNVERIFIED");
    }

    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId) {
      return sendError(res, 400, "Invalid politician ID");
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    // Validate body
    const bodyWithIds = { ...req.body, userId: req.user!.id, targetId: politicianId };
    if (normalizedType === 'assembly') {
      insertAssemblyCommentSchema.parse(bodyWithIds);
    } else {
      insertLocalCouncilCommentSchema.parse(bodyWithIds);
    }

    const comment = await storage.createPoliticianComment(req.user!.id, politicianId, normalizedType, req.body.content);
    return sendSuccess(res, comment);
  } catch (error) {
    console.error("Error creating comment:", error);
    return sendError(res, 500, "Failed to create comment");
  }
});

// Toggle comment like (authenticated users only)
// Updated route to include type: /comments/:type/:id/like
router.post("/comments/:type/:id/like", requireAuth, async (req, res) => {
  try {
    if (!req.user?.isVerified) {
      return sendError(res, 401, "본인인증을 완료한 회원만 이용 가능합니다.", "UNVERIFIED");
    }
    const { type, id } = req.params;
    const commentId = parseInt(id);
    if (!commentId) {
      return sendError(res, 400, "Invalid comment ID");
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    const liked = await storage.toggleCommentLike(req.user!.id, commentId, normalizedType);
    return sendSuccess(res, { liked });
  } catch (error) {
    console.error("Error toggling like:", error);
    return sendError(res, 500, "Failed to toggle like");
  }
});

// Report comment
router.post("/comments/:type/:id/report", async (req, res) => {
  try {
    const { type, id } = req.params;
    const commentId = parseInt(id);
    if (!commentId) {
      return sendError(res, 400, "Invalid comment ID");
    }
    const normalizedType = (type === 'local_council' || type === 'local') ? 'local' : 'assembly';

    await storage.reportComment(commentId, normalizedType);
    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("Error reporting comment:", error);
    return sendError(res, 500, "Failed to report comment");
  }
});

// Political Persona Generation (Strict Type Version)
router.get("/politicians/:type/:id/persona", async (req, res) => {
  try {
    const { type, id } = req.params;
    const politicianId = parseInt(id);

    if (!politicianId || (type !== 'assembly' && type !== 'local_council' && type !== 'national' && type !== 'local')) {
      return sendError(res, 400, "Invalid politician type or ID");
    }

    const normalizedType = (type === 'assembly' || type === 'national') ? 'assembly' : 'local';

    console.log(`🎮 Generating persona for ${normalizedType} politician ID: ${politicianId} `);

    const politician = await storage.getPolitician(politicianId, normalizedType);
    if (!politician) {
      return sendError(res, 404, "Politician not found");
    }

    if (politician.aiPersona) {
      console.log(`✅ Using cached persona for ${normalizedType} politician ID: ${politicianId} `);
      // Ensure type is correct in cached version just in case
      if (politician.aiPersona.type !== (normalizedType === 'assembly' ? 'national' : 'local')) {
        console.warn("⚠️ Cached persona type mismatch. Regenerating...");
      } else {
        return sendSuccess(res, politician.aiPersona);
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

    return sendSuccess(res, persona);
  } catch (error) {
    console.error("Error generating persona route:", error);
    return sendError(res, 500, "Failed to generate politician persona");
  }
});

export const politicianRoutes = router;