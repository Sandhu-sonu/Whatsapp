const { PrismaClient } = require('@prisma/client');
const { parseReport } = require('../dist-electron/src/lib/parser/pipeline.js');
const { SubmissionRepository } = require('../dist-electron/src/repositories/SubmissionRepository.js');

const prisma = new PrismaClient();

const rawMessage = `DSD Performance Report

Date: 08-07-2026
District: Gurdaspur 

1. Total Appointments Booked:  92
2. Total Served: 42
3. Total Cancelled: 5
4. Total Rescheduled: 45

Confirmation:

I have checked all appointments and confirmed that no appointment was cancelled or rescheduled due to Sewa Sahayak's absence or rescheduling.

Name: Varun
Designation: ADITM`;

async function run() {
  console.log('=== INGEST GURDASPUR 8 JULY REPORT ===');
  
  try {
    // 1. Create a WhatsApp message entry
    const whatsappId = `manual-gurdaspur-08-07-2026-${Date.now()}`;
    const receivedAt = new Date('2026-07-08T16:30:00Z'); // Mock sent time on July 8 afternoon
    
    const msg = await prisma.whatsAppMessage.create({
      data: {
        whatsappId,
        sender: 'Varun ADITM Gurdaspur',
        message: rawMessage,
        messageType: 'TEXT',
        ingestionStatus: 'NEW',
        receivedAt,
      }
    });
    console.log(`Created WhatsApp message record in DB. ID: ${msg.id}`);

    // 2. Parse the report
    const parseResult = await parseReport(rawMessage, receivedAt);
    console.log('Successfully parsed report details:', parseResult);

    // 3. Save the parsed report using SubmissionRepository
    const report = await SubmissionRepository.saveParsedReport(msg.id, parseResult);
    console.log(`Successfully saved report in database. Report ID: ${report.id}`);
    
    // 4. Double check the Gurdaspur dailySubmission
    const updatedSub = await prisma.dailySubmission.findUnique({
      where: {
        districtId_reportDate: {
          districtId: parseResult.districtId,
          reportDate: new Date('2026-07-08T00:00:00.000Z')
        }
      }
    });
    console.log('Daily submission status in DB:', updatedSub);
    
  } catch (err) {
    console.error('Failed to ingest Gurdaspur report:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

run();
