
import { db } from "./server/db.js";
import { golfBookings, golfJoins } from "./shared/schema.js";
import { sql, and, gte, lte } from "drizzle-orm";

async function main() {
    try {
        const rows = await db.select({
            id: golfBookings.id,
            courseName: golfBookings.courseName,
            datetime: golfBookings.datetime,
            listingType: golfBookings.listingType,
            region: golfBookings.region
        }).from(golfBookings);

        console.log("Total golfBookings rows:", rows.length);
        rows.sort((a, b) => a.datetime.getTime() - b.datetime.getTime()).forEach(r => {
            const date = new Date(r.datetime);
            const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
            console.log(`[${r.listingType}] ${kst.toISOString().split("T")[0]} ${kst.toISOString().split("T")[1].substring(0, 5)} - ${r.courseName}`);
        });

        const jRows = await db.select().from(golfJoins);
        console.log("Total golfJoins rows:", jRows.length);
        jRows.forEach(r => {
            const date = new Date(r.datetime);
            const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
            console.log(`[USER_JOIN] ${kst.toISOString().split("T")[0]} ${kst.toISOString().split("T")[1].substring(0, 5)} - ${r.courseName}`);
        });

    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
main();
