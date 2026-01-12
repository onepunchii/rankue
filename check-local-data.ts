
import { storage } from "./server/storage";
import { supabaseAdmin } from "./server/supabase";

async function checkLocalPoliticians() {
    console.log("Checking for local politicians...");

    // Check raw count
    const { count, error } = await supabaseAdmin
        .from('politicians')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'local')
        .eq('level', '기초');

    if (error) {
        console.error("Error checking raw count:", error);
    } else {
        console.log(`Raw count of local/기초 politicians: ${count}`);
    }

    // Check unique regions
    const { data: regions } = await supabaseAdmin
        .from('politicians')
        .select('region')
        .eq('type', 'local')
        .limit(50);

    if (regions) {
        const uniqueRegions = [...new Set(regions.map(r => r.region))];
        console.log("Sample regions in DB:", uniqueRegions);
    }

    // Check 'getPoliticians'
    const members = await storage.getPoliticians('local', undefined, 10);
    console.log(`storage.getPoliticians('local') returned ${members.length} items`);
    if (members.length > 0) {
        console.log("First item:", members[0].name, members[0].region, members[0].district);
    } else {
        console.log("storage.getPoliticians('local') returned EMPTY array.");
    }
}

checkLocalPoliticians().catch(console.error);
