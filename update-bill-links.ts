import 'dotenv/config';
import { db } from './server/db';
import { assemblyBills } from './shared/schema';
import { eq } from 'drizzle-orm';

async function updateBillLinks() {
    console.log('=== Updating All Assembly Bills ===\n');

    const bills = await db.select().from(assemblyBills);

    console.log(`Found ${bills.length} bills\n`);

    for (const bill of bills) {
        console.log(`Bill: ${bill.billName}`);
        console.log(`  Bill ID: ${bill.billId}`);
        console.log(`  Detail Link: ${bill.detailLink || 'NOT SET'}`);
        console.log('');

        // Update if detailLink is missing
        if (!bill.detailLink && bill.billId) {
            const link = `http://likms.assembly.go.kr/bill/billDetail.do?billId=${bill.billId}`;
            await db.update(assemblyBills)
                .set({ detailLink: link })
                .where(eq(assemblyBills.id, bill.id));
            console.log(`  ✓ Updated with link: ${link}\n`);
        }
    }

    console.log('✓ Complete');
    process.exit(0);
}

updateBillLinks().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
