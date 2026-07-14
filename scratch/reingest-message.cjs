const { PrismaClient } = require('@prisma/client');
const { parseReport } = require('../dist-electron/src/lib/parser/pipeline.js');
const { SubmissionRepository } = require('../dist-electron/src/repositories/SubmissionRepository.js');

const prisma = new PrismaClient();

async function run() {
  console.log('=== RE-INGEST FAILED MESSAGE FOR RUPNAGAR ===');
  
  try {
    const msgId = '6ec380ca-aebc-4f1f-bd80-dd5507a60f8b';
    const msg = await prisma.whatsAppMessage.findUnique({
      where: { id: msgId }
    });

    if (!msg) {
      console.error(`Message ${msgId} not found in database!`);
      return;
    }

    console.log(`Found message. Status: ${msg.ingestionStatus}`);

    // Delete any existing DsdReport linked to this message first to clear unique constraint
    const del = await prisma.dsdReport.deleteMany({
      where: { messageId: msg.id }
    });
    console.log(`Deleted ${del.count} existing invalid report records for this message.`);

    // Parse the report text with the new parsing pipeline code
    const parseResult = await parseReport(msg.message, msg.receivedAt);
    console.log('Parsing result:', parseResult);

    if (parseResult.validationStatus === 'INVALID') {
      console.error('Parsing still fails! Validation errors:', parseResult.validationErrors);
      return;
    }

    // Save the parsed report using SubmissionRepository
    const report = await SubmissionRepository.saveParsedReport(msg.id, parseResult);
    console.log(`Saved report successfully. ID: ${report.id}`);

    // Update message status to PARSED
    await prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: { ingestionStatus: 'PARSED' }
    });
    console.log('Updated message ingestionStatus to PARSED.');

  } catch (err) {
    console.error('Failed during re-ingestion:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

run();
