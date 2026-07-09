import { Router } from "express";
import { db } from "../../db.js";
import { regions } from "../../../shared/schema.js";
import { ilike } from "drizzle-orm";

const router = Router();

router.get("/search", async (req, res) => {
    try {
        const q = req.query.q as string;

        if (!q || q.length < 1) {
            return res.json([]);
        }

        const results = await db.select()
            .from(regions)
            .where(ilike(regions.fullName, `%${q}%`))
            .limit(30);

        res.json(results);
    } catch (error) {
        console.error("Region search error:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

export default router;
