import { db } from "./server/db.js";
import { hiqMembers } from "./shared/schema.js";
import { sql } from "drizzle-orm";

async function checkPhone() {
    const keyword = '01063548882';
    const results = await db.select({
        name: hiqMembers.name,
        phone: hiqMembers.phone
    })
        .from(hiqMembers)
        .where(sql`REPLACE(${hiqMembers.phone}, '-', '') = ${keyword}`);

    console.log("Results for REPLACE match:", JSON.stringify(results, null, 2));

    const all = await db.select({ name: hiqMembers.name, phone: hiqMembers.phone }).from(hiqMembers).limit(10);
    console.log("Sample users:", JSON.stringify(all, null, 2));

    process.exit(0);
}

checkPhone().catch(err => {
    console.error(err);
    process.exit(1);
});
