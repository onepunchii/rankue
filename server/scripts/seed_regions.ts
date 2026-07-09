import { db } from "../db.js";
import { regions } from "../../shared/schema.js";
import fs from "fs";
import path from "path";

async function main() {
    // map/map.tsv is at project root
    const tsvPath = path.resolve(process.cwd(), "map/map.tsv");

    if (!fs.existsSync(tsvPath)) {
        console.error("TSV not found at", tsvPath);
        console.log("Current directory:", process.cwd());
        process.exit(1);
    }

    console.log("Reading TSV file:", tsvPath);
    const content = fs.readFileSync(tsvPath, "utf-8");
    const lines = content.split("\n").slice(1); // skip header

    console.log(`Found ${lines.length} lines. Processing...`);

    const chunkSize = 100;
    let batch: any[] = [];
    let totalInserted = 0;

    for (const line of lines) {
        if (!line.trim()) continue;

        const columns = line.split('\t');
        if (columns.length < 3) continue;

        const [SERIAL, ADMCD, ADMNM, X, Y] = columns;

        // Parse Address
        const parts = ADMNM.split(' ');
        const sido = parts[0] || null;
        const sigungu = parts[1] || null;
        // Join remaining parts as dong if multiple words exist after sigungu
        const dong = parts.slice(2).join(' ') || null;

        batch.push({
            code: ADMCD,
            sido: sido,
            sigungu: sigungu,
            dong: dong,
            fullName: ADMNM
        });

        if (batch.length >= chunkSize) {
            await db.insert(regions).values(batch).onConflictDoNothing().execute();
            totalInserted += batch.length;
            process.stdout.write(`\rInserted ${totalInserted} / ${lines.length}`);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await db.insert(regions).values(batch).onConflictDoNothing().execute();
        totalInserted += batch.length;
    }

    console.log(`\nDone! Total inserted: ${totalInserted}`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
