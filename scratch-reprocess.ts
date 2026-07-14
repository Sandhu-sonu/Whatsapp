import { prisma } from './src/lib/prisma';
import { parseReport } from './src/lib/parser/pipeline';
import { SubmissionRepository } from './src/repositories/SubmissionRepository';

async function main() {
  console.log('=== REPROCESSING UNPARSED MESSAGES ===');
  
  // Find messages that do not have an associated DsdReport and are of type TEXT
  const unparsedMessages = await prisma.whatsAppMessage.findMany({
    where: {
      messageType: 'TEXT',
      dsdReport: {
        is: null
      }
    }
  });

  console.log(`Found ${unparsedMessages.length} unparsed TEXT messages.`);

  let parsedCount = 0;
  let failedCount = 0;

  for (const m of unparsedMessages) {
    console.log(`\nProcessing Message ID: ${m.id} from ${m.sender || 'Unknown'}`);
    try {
      const parseResult = await parseReport(m.message, m.receivedAt);
      
      if (parseResult.districtId) {
        await SubmissionRepository.saveParsedReport(m.id, parseResult);
        await prisma.whatsAppMessage.update({
          where: { id: m.id },
          data: { ingestionStatus: 'PARSED', districtId: parseResult.districtId }
        });
        console.log(`✔ [PARSED] Report created for district: ${parseResult.districtName} (Mode: ${parseResult.parserMode})`);
        parsedCount++;
      } else {
        await prisma.whatsAppMessage.update({
          where: { id: m.id },
          data: { ingestionStatus: 'FAILED' }
        });
        console.log(`✖ [SKIPPED] No district identified in message body.`);
        failedCount++;
      }
    } catch (err: any) {
      await prisma.whatsAppMessage.update({
        where: { id: m.id },
        data: { ingestionStatus: 'FAILED' }
      });
      console.log(`✖ [ERROR] Parsing failed: ${err.message}`);
      failedCount++;
    }
  }

  console.log(`\n=== Reprocessing Summary ===\n- Reports Created: ${parsedCount}\n- Failed/Skipped: ${failedCount}`);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
