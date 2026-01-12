import { supabaseAdmin } from "./supabase";

async function testCelebrities() {
    console.log("🧪 Testing Celebrities Table...");

    try {
        // Test 1: Count all celebrities
        const { count, error: countError } = await supabaseAdmin
            .from('celebrities')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error("❌ Count Error:", countError);
        } else {
            console.log(`✅ Total celebrities: ${count}`);
        }

        // Test 2: Fetch first 5 celebrities
        const { data, error } = await supabaseAdmin
            .from('celebrities')
            .select('*')
            .limit(5);

        if (error) {
            console.error("❌ Fetch Error:", error);
        } else {
            console.log(`✅ Fetched ${data?.length} celebrities:`);
            console.log(JSON.stringify(data, null, 2));
        }

        // Test 3: Fetch by category
        const { data: actorData, error: actorError } = await supabaseAdmin
            .from('celebrities')
            .select('*')
            .eq('category', 'actor')
            .limit(3);

        if (actorError) {
            console.error("❌ Actor Fetch Error:", actorError);
        } else {
            console.log(`✅ Fetched ${actorData?.length} actors:`);
            console.log(JSON.stringify(actorData, null, 2));
        }

    } catch (err) {
        console.error("❌ Unexpected Error:", err);
    }
}

testCelebrities();
