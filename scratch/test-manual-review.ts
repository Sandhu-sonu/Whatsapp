import { PrismaClient } from '@prisma/client';
import { SubmissionRepository } from '../src/repositories/SubmissionRepository.js';

const prisma = new PrismaClient();

async function run() {
  console.log('=== TEST MANUAL CORRECTION CONSTRAINTS ===');
  
  // Find an invalid report, or create one for testing
  let invalidReport = await prisma.dsdReport.findFirst({
    where: { validationStatus: 'INVALID' }
  });

  if (!invalidReport) {
    console.log('Creating a mock invalid report for testing...');
    const district = await prisma.district.findFirst();
    if (!district) throw new Error('No districts found');

    const msg = await prisma.whatsAppMessage.create({
      data: {
        whatsappId: `test-manual-${Date.now()}`,
        message: 'DSD Performance Report...',
        messageType: 'TEXT',
        receivedAt: new Date(),
      }
    });

    const sub = await prisma.dailySubmission.create({
      data: {
        districtId: district.id,
        reportDate: new Date('2026-07-02T00:00:00.000Z'),
        status: 'PENDING',
      }
    });

    invalidReport = await prisma.dsdReport.create({
      data: {
        submissionId: sub.id,
        messageId: msg.id,
        districtId: district.id,
        reportDate: new Date('2026-07-02T00:00:00.000Z'),
        receivedAt: new Date(),
        appointmentsBooked: 10,
        served: 20, // Invalid: served > booked
        cancelled: 0,
        rescheduled: 0,
        validationStatus: 'INVALID',
        validationErrors: '["Served appointments exceed booked"]',
        confidence: 100,
        parserMode: 'TEMPLATE'
      }
    });
  }

  console.log('Attempting to apply manual correction on report:', invalidReport.id);
  try {
    const res = await SubmissionRepository.saveManualCorrection(invalidReport.id, {
      appointmentsBooked: 20,
      served: 20,
      cancelled: 0,
      rescheduled: 0,
      reportDate: '2026-07-02'
    });
    console.log('Success! Corrected report ID:', res.id);
  } catch (err: any) {
    console.error('FAILED with error:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    // Clean up if created mock
    if (invalidReport.messageId?.startsWith('test-manual-')) {
      await prisma.dsdReport.deleteMany({ where: { messageId: invalidReport.messageId } });
      await prisma.dailySubmission.deleteMany({ where: { districtId: invalidReport.districtId, reportDate: new Date('2026-07-02T00:00:00.000Z') } });
      await prisma.whatsAppMessage.deleteMany({ where: { id: invalidReport.messageId } });
    }
    await prisma.$disconnect();
  }
}

run();
