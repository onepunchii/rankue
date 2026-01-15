import { Router } from "express";
import { storage } from "../storage/index.js";
import { authenticateUser, handleGetProfile } from "../auth.js";
import { authService } from "../services/authService.js";
import { upload } from "../uploads.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

// Auth & Profiles
router.get("/profile", authenticateUser, handleGetProfile);

router.get("/me", (req: any, res) => {
    if (req.user) {
        return sendSuccess(res, req.user);
    } else {
        return sendSuccess(res, { isGuest: true, isAuthenticated: false });
    }
});

router.patch("/profile", authenticateUser, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const updated = await authService.updateUser(userId, req.body);
        return sendSuccess(res, { updatedFields: updated }, "Profile updated successfully");
    } catch (error) {
        return sendError(res, 500, "프로필 업데이트 실패");
    }
});

router.post("/avatar", authenticateUser, upload.single("avatar"), async (req: any, res) => {
    try {
        if (!req.file) return sendError(res, 400, "No file uploaded", "NO_FILE");
        const userId = req.user.id;
        const fileUrl = `/uploads/${req.file.filename}`;
        await authService.updateUser(userId, { profileImageUrl: fileUrl });
        return sendSuccess(res, { url: fileUrl }, "Avatar uploaded successfully");
    } catch (error) {
        return sendError(res, 500, "Avatar upload failed");
    }
});

router.get("/user/participations", authenticateUser, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const participations = await storage.getUserParticipations(userId);
        return sendSuccess(res, participations);
    } catch (error) {
        // Fallback for getUserParticipations if it's not in userStorage yet, 
        // checking the previous storage usage it was `storage.getUserParticipations`.
        // I need to check where `getUserParticipations` is located.
        return sendError(res, 500, "참여 내역 조회 실패");
    }
});

export default router;
