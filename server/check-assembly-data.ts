import 'dotenv/config';
import { supabaseAdmin } from './supabase';
import { db } from './db';
import { surveys } from '../shared/schema.js';
import { eq, desc } from 'drizzle-orm';

async function checkData() {
    console.log('🔍 Checking Assembly Bills and Surveys in Supabase/DB...');

    try {
        // 1. Check assembly_bills in Supabase
        const { data: bills, error } = await supabaseAdmin
            .from('assembly_bills')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('❌ Error fetching assembly_bills:', error);
        } else {
            console.log(`\n🏛️  Latest 5 Assembly Bills:`);
            bills.forEach((bill: any) => {
                console.log(`- [${bill.bill_id}] ${bill.bill_name} (Survey ID: ${bill.survey_id})`);
                console.log(`  └ AI Summary: ${bill.summary ? '✅ Exists' : '❌ Missing'}`);
            });
        }

        // 2. Check related surveys in Drizzle (or Supabase if synced)
        console.log(`\n🗳️  Checking corresponding Surveys (Category: politics):`);
        const recentSurveys = await db.select()
            .from(surveys)
            .where(eq(surveys.category, 'politics'))
            .orderBy(desc(surveys.createdAt))
            .limit(5);

        recentSurveys.forEach((s: any) => {
            const isBillSurvey = s.title.includes('법률안') || s.description.includes('발의');
            console.log(`- [${s.id}] ${s.title} (${isBillSurvey ? '🏛️ Bill Survey' : '🗳️ General Survey'})`);
            console.log(`  └ CreatedAt: ${s.createdAt}`);
        });

    } catch (err) {
        console.error('❌ Check failed:', err);
    } finally {
        process.exit(0);
    }
}

checkData();
