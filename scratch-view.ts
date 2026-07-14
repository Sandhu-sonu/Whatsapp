import { prisma } from './src/lib/prisma';

async function main() {
  console.log('=== DATABASE DIAGNOSTICS ===');
  
  const messagesCount = await prisma.whatsAppMessage.count();
  const reportsCount = await prisma.dsdReport.count();
  const submissionsCount = await prisma.dailySubmission.count();
  const districtsCount = await prisma.district.count();

  console.log(`Summary Counts:\n- Districts: ${districtsCount}\n- WhatsApp Messages: ${messagesCount}\n- DSD Reports: ${reportsCount}\n- Daily Submissions: ${submissionsCount}\n`);

  console.log('--- LATEST 5 MESSAGES ---');
  const messages = await prisma.whatsAppMessage.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log(messages.map((m: any) => ({
    id: m.id,
    sender: m.sender,
    type: m.messageType,
    status: m.ingestionStatus,
    receivedAt: m.receivedAt,
    textPreview: m.message.substring(0, 80)
  })));

  console.log('--- LATEST 5 REPORTS ---');
  const reports = await prisma.dsdReport.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { district: true }
  });
  console.log(reports.map((r: any) => ({
    id: r.id,
    district: r.district.name,
    reportDate: r.reportDate,
    receivedAt: r.receivedAt,
    booked: r.appointmentsBooked,
    served: r.served,
    status: r.validationStatus,
    isLatest: r.isLatest
  })));
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
