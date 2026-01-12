import { Router } from 'express';
import { db } from './db';
import { assemblyBills, surveys, surveyQuestions } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// 국회 발의법률안 목록 조회
router.get('/api/assembly-bills', async (req, res) => {
  try {
    // Drizzle을 데이터 조회 (Supabase RLS 우회)
    const bills = await db.select()
      .from(assemblyBills)
      .where(eq(assemblyBills.isActive, true))
      .orderBy(desc(assemblyBills.proposalDate))
      .limit(20);

    // 필드 매핑은 Drizzle이 처리해주지만, 명시적으로 필요한 형태로 가공
    const transformedBills = bills.map((bill) => ({
      id: bill.id,
      billName: bill.billName,
      proposer: bill.proposer,
      // coProposers: bill.coProposers, // Schema might not have this defined yet, check schema types if needed
      billId: bill.billId,
      committee: bill.committee || '미지정',
      procStage: bill.procStage,
      proposalDate: bill.proposalDate,
      detailLink: bill.detailLink,
      summary: bill.summary,
      // surveyQuestion: bill.surveyQuestion, // Note: Schema check needed if these exist
      surveyId: bill.surveyId,
      isActive: bill.isActive,
      createdAt: bill.createdAt,
    }));

    res.json(transformedBills);
  } catch (error) {
    console.error('법률안 조회 오류:', error);
    res.status(500).json({ error: '법률안을 불러올 수 없습니다.' });
  }
});

// 수동 테스트용 스케줄러 실행 API
router.post('/api/assembly-bills/run-scheduler', async (req, res) => {
  try {
    const { runAssemblyBillScheduler } = await import('./assemblyBillScheduler');
    const result = await runAssemblyBillScheduler();
    res.json(result);
  } catch (error) {
    console.error('스케줄러 실행 오류:', error);
    res.status(500).json({ error: '스케줄러 실행 실패' });
  }
});

export default router;