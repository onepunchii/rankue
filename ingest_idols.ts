import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { celebrities } from "./shared/schema";

async function ingestIdols() {
    const idolDir = path.join(process.cwd(), "idol");
    const files = fs.readdirSync(idolDir).filter(f => f.endsWith(".csv"));

    console.log(`Found ${files.length} CSV files to ingest.`);

    for (const file of files) {
        const filePath = path.join(idolDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(line => line.trim() !== "");
        const category = file.replace(".csv", "");

        // Skip header
        const dataLines = lines.slice(1);

        console.log(`Ingesting ${category} (${dataLines.length} items)...`);

        const records = dataLines.map(line => {
            // Simple CSV parsing (handling simple cases, we might need more robust if there are commas in names)
            const parts = line.split(",");
            if (parts.length < 2) return null;

            const rankOriginal = parseInt(parts[0]);
            const name = parts[1];
            const gender = parts[2] || null;
            const type = parts[3] || null;

            return {
                name,
                category,
                gender,
                type,
                rankOriginal: isNaN(rankOriginal) ? null : rankOriginal
            };
        }).filter(r => r !== null);

        if (records.length > 0) {
            try {
                await db.insert(celebrities).values(records);
            } catch (err) {
                console.error(`Error inserting records for ${category}:`, err);
            }
        }
    }

    console.log("Ingestion completed successfully.");
    process.exit(0);
}

ingestIdols();
