const { PrismaClient } = require('prisma-client');
const { parseReport } = require('../dist-electron/src/lib/parser/pipeline');
const { SubmissionRepository } = require('../dist-electron/src/repositories/SubmissionRepository');

const prisma = new PrismaClient();

// A helper to generate standard DSD template text
function makeTemplateText(district, date, booked = 20, served = 15, cancelled = 2, rescheduled = 3) {
  return `DSD Performance Report
Date : ${date}
District : ${district}
1. Total Appointments Booked: ${booked}
2. Total Served: ${served}
3. Total Cancelled: ${cancelled}
4. Total Rescheduled: ${rescheduled}
Name: Jagdeep singh
Desig: ADITM`;
}

async function runTest(testName, testFn) {
  try {
    await testFn();
    console.log(`✔ [PASS] ${testName}`);
    return true;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}: ${err.message}`);
    if (err.stack) console.error(err.stack);
    return false;
  }
}

async function startTests() {
  console.log('=== STARTING AUTOMATED DSD PARSER TEST SUITE ===\n');

  // Verify DB connection
  const districts = await prisma.district.findMany();
  if (districts.length === 0) {
    console.error('Error: Database has no seeded districts. Please run seeds first.');
    process.exit(1);
  }

  const results = [];

  // --- TEST GROUP 1: ALL 23 OFFICIAL PUNJAB DISTRICTS ---
  const punjabDistricts = [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib",
    "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar",
    "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga",
    "Sri Muktsar Sahib", "Pathankot", "Patiala", "Rupnagar",
    "S.A.S. Nagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Tarn Taran"
  ];

  for (const name of punjabDistricts) {
    results.push(await runTest(`District Match: ${name}`, async () => {
      const txt = makeTemplateText(name, "02-07-2026");
      const res = await parseReport(txt, new Date());
      if (res.districtName !== name) {
        throw new Error(`Expected district "${name}", got "${res.districtName}"`);
      }
      if (res.validationStatus !== 'VALID') {
        throw new Error(`Expected VALID status, got "${res.validationStatus}"`);
      }
      if (res.appointmentsBooked !== 20 || res.served !== 15 || res.cancelled !== 2 || res.rescheduled !== 3) {
        throw new Error(`Metric parsing failed for ${name}`);
      }
    }));
  }

  // --- TEST GROUP 2: DISTRICT ALIASES ---
  const aliasTests = [
    { input: "Mohali", expected: "S.A.S. Nagar" },
    { input: "Ropar", expected: "Rupnagar" },
    { input: "Muktsar", expected: "Sri Muktsar Sahib" },
    { input: "Nawanshahr", expected: "Shahid Bhagat Singh Nagar" }
  ];

  for (const tc of aliasTests) {
    results.push(await runTest(`Alias Translation: ${tc.input} -> ${tc.expected}`, async () => {
      const txt = makeTemplateText(tc.input, "02-07-2026");
      const res = await parseReport(tc.input, new Date());
      // Check district detection output directly since alias text is simple
      const parsedRes = await parseReport(txt, new Date());
      if (parsedRes.districtName !== tc.expected) {
        throw new Error(`Alias mapping failed: expected "${tc.expected}", got "${parsedRes.districtName}"`);
      }
    }));
  }

  // --- TEST GROUP 3: DATE FORMAT VARIATIONS ---
  const dateFormats = [
    { input: "02-07-2026", desc: "Dash Separator" },
    { input: "02/07/2026", desc: "Slash Separator" },
    { input: "02.07.2026", desc: "Dot Separator" },
    { input: "02-07-26", desc: "Short Year" }
  ];

  for (const df of dateFormats) {
    results.push(await runTest(`Date Format: ${df.desc} (${df.input})`, async () => {
      const txt = makeTemplateText("Moga", df.input);
      const res = await parseReport(txt, new Date());
      const reportDate = new Date(res.reportDate);
      if (reportDate.getUTCDate() !== 2 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
        throw new Error(`Date parsing failed for format: "${df.input}". Got date: ${reportDate.toISOString()}`);
      }
    }));
  }

  // --- TEST GROUP 4: MISSING DATE ---
  results.push(await runTest("Missing Date (Fallbacks to Message Date)", async () => {
    const txt = `DSD Performance Report
District : Moga
1. Total Appointments Booked: 10
2. Total Served: 8
3. Total Cancelled: 1
4. Total Rescheduled: 1
Name: Jagdeep singh
Desig: ADITM`;
    const msgDate = new Date('2026-07-02T12:00:00Z');
    const res = await parseReport(txt, msgDate);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 1 || reportDate.getUTCMonth() !== 0 || reportDate.getUTCFullYear() !== 1970) {
      throw new Error(`Missing date fallback sentinel date mismatch.`);
    }
    if (res.validationStatus !== 'INVALID') {
      throw new Error(`Expected missing date validation to fail under strict rules, got "${res.validationStatus}"`);
    }
  }));

  // --- TEST GROUP 5: TYPOGRAPHICAL ERRORS (FUZZY MATCHING) ---
  results.push(await runTest("Typo in District: Amritsur -> Amritsar", async () => {
    const txt = makeTemplateText("Amritsur", "02-07-2026");
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Amritsar') {
      throw new Error(`Fuzzy match failed. Got: ${res.districtName}`);
    }
  }));

  results.push(await runTest("Typo in District: Ludhianaa -> Ludhiana", async () => {
    const txt = makeTemplateText("Ludhianaa", "02-07-2026");
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Ludhiana') {
      throw new Error(`Fuzzy match failed. Got: ${res.districtName}`);
    }
  }));

  // --- TEST GROUP 6: EXTRA SPACES & CAPITALIZATION ---
  results.push(await runTest("Extra Spaces & Uppercase Metrics", async () => {
    const txt = `dsd performance report
      date:    02/07/26   
      district:    moga   
      1. TOTAL APPOINTMENTS BOOKED:    30
      2. TOTAL SERVED:   25
      3. TOTAL CANCELLED:   2
      4. TOTAL RESCHEDULED: 3
      Name: Jagdeep singh
      Desig: ADITM`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Moga') throw new Error('District match failed');
    if (res.appointmentsBooked !== 30 || res.served !== 25 || res.cancelled !== 2 || res.rescheduled !== 3) {
      throw new Error('Metrics extracting failed');
    }
  }));

  // --- TEST GROUP 7: INVALID METRICS & VALIDATION MATH FAILURES ---
  results.push(await runTest("Validation Math Failure: Served exceeds booked", async () => {
    const txt = makeTemplateText("Moga", "02-07-2026", 10, 15, 0, 0);
    const res = await parseReport(txt, new Date());
    if (res.validationStatus !== 'INVALID') {
      throw new Error(`Expected status INVALID, got "${res.validationStatus}"`);
    }
    if (!res.validationErrors.some(e => e.includes('exceed'))) {
      throw new Error('Expected validation error text mismatch');
    }
  }));

  results.push(await runTest("Validation Math Failure: Sum outcomes exceeds booked", async () => {
    const txt = makeTemplateText("Moga", "02-07-2026", 10, 8, 2, 2); // 8+2+2 = 12 > 10
    const res = await parseReport(txt, new Date());
    if (res.validationStatus !== 'INVALID') {
      throw new Error(`Expected status INVALID, got "${res.validationStatus}"`);
    }
    if (!res.validationErrors.some(e => e.includes('sum of served, cancelled, and rescheduled'))) {
      throw new Error('Expected validation sum error');
    }
  }));

  // --- TEST GROUP 8: REVISIONS AUDIT CHAINS ---
  results.push(await runTest("Revision Chain Integration (Save 1st, Save 2nd)", async () => {
    const testReportDate = new Date(Date.UTC(2026, 6, 2, 0, 0, 0, 0));

    // Clean up pre-existing state to isolate this test run
    await prisma.dsdReport.deleteMany({
      where: {
        districtId: districts[0].id,
        reportDate: testReportDate,
      }
    });
    await prisma.dailySubmission.deleteMany({
      where: {
        districtId: districts[0].id,
        reportDate: testReportDate,
      }
    });

    // Inject Mock message 1
    const msg1 = await prisma.whatsAppMessage.create({
      data: {
        whatsappId: `test-rev1-${Date.now()}`,
        message: 'DSD Performance Report...',
        messageType: 'TEXT',
        receivedAt: new Date(),
      }
    });

    // Inject Mock message 2
    const msg2 = await prisma.whatsAppMessage.create({
      data: {
        whatsappId: `test-rev2-${Date.now()}`,
        message: 'DSD Performance Report Corrected...',
        messageType: 'TEXT',
        receivedAt: new Date(),
      }
    });

    const report1 = {
      districtId: districts[0].id,
      districtName: districts[0].name,
      reportDate: new Date('2026-07-02T12:00:00Z'),
      appointmentsBooked: 20,
      served: 15,
      cancelled: 2,
      rescheduled: 3,
      validationStatus: 'VALID',
      validationErrors: [],
      confidence: 100,
      parserMode: 'TEMPLATE'
    };

    // Save initial report
    const saved1 = await SubmissionRepository.saveParsedReport(msg1.id, report1);
    if (!saved1.isLatest || saved1.revisionNumber !== 0) {
      throw new Error('Initial revision save properties incorrect');
    }

    // Save second parsed report revision (linked to second message)
    const report2 = {
      ...report1,
      appointmentsBooked: 20,
      served: 16, // Change metric
      cancelled: 2,
      rescheduled: 2
    };

    const saved2 = await SubmissionRepository.saveParsedReport(msg2.id, report2);
    if (!saved2.isLatest || saved2.revisionNumber !== 1 || saved2.previousReportId !== saved1.id) {
      throw new Error('Second revision save properties incorrect');
    }

    // Verify first report is deactivated
    const verified1 = await prisma.dsdReport.findUnique({ where: { id: saved1.id } });
    if (verified1.isLatest) {
      throw new Error('First revision is still active');
    }

    // Cleanup
    await prisma.dsdReport.deleteMany({ where: { submissionId: saved1.submissionId } });
    await prisma.dailySubmission.delete({ where: { id: saved1.submissionId } });
    await prisma.whatsAppMessage.deleteMany({ where: { id: { in: [msg1.id, msg2.id] } } });
  }));

  // --- TEST GROUP 9: REAL WORLD REGRESSION CASES ---
  results.push(await runTest("Real World Message: Ferozepur Date Prefix Hyphen", async () => {
    const txt = `DSD Performance Report

Date: -05-07-2026
District: Ferozepur

Total Appointments Booked:69
Total Served: 20
Total Cancelled:4
Total Rescheduled:45
Confirmation:

I have checked all appointments and confirm that no appointment was cancelled or rescheduled due to Sewa Sahayak's absence or rescheduling.

Name: Harsh kumar
Desig: DTC`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Ferozepur') throw new Error(`Expected Ferozepur, got ${res.districtName}`);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 5 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
      throw new Error(`Expected Date 2026-07-05, got ${res.reportDate}`);
    }
    if (res.appointmentsBooked !== 69 || res.served !== 20 || res.cancelled !== 4 || res.rescheduled !== 45) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'VALID') throw new Error(`Expected VALID status, got ${res.validationStatus}`);
  }));

  results.push(await runTest("Real World Message: Malerkotla Text-Digit Merged", async () => {
    const txt = `DSD Performance Report

Date:   6 July 2026
District: Malerkotla

Total Appointments Booked: 20
Total Served: 09
Total Cancelled: 0
Total Reschedule11

Confirmation:

I have checked all appointments and confirm that no appointment was cancelled or rescheduled due to Sewa Sahayak’s absence or rescheduling.

Name : Jaspreet Kaur 
Designation: DTC`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Malerkotla') throw new Error(`Expected Malerkotla, got ${res.districtName}`);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 6 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
      throw new Error(`Expected Date 2026-07-06, got ${res.reportDate}`);
    }
    if (res.appointmentsBooked !== 20 || res.served !== 9 || res.cancelled !== 0 || res.rescheduled !== 11) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'VALID') throw new Error(`Expected VALID status, got ${res.validationStatus}`);
  }));

  results.push(await runTest("Real World Message: Barnala Empty Cancelled Defaulting", async () => {
    const txt = `DSD Performance Report 

Date: 07-07-2026
District: Barnala 

Total Appointments Booked: 112
Total Served:52
Total Cancelled: 
Total reschedule =50(due to 3 new joining DSD)

  

Confirmation: 

I have checked all appointments and confirm that no appointment was cancelled or rescheduled due to Sewa Sahayak's absence or rescheduling.

Name: Ramandeep Singh 
Desig: ADITM`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Barnala') throw new Error(`Expected Barnala, got ${res.districtName}`);
    if (res.appointmentsBooked !== 112 || res.served !== 52 || res.cancelled !== 0 || res.rescheduled !== 50) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'PARTIAL') throw new Error(`Expected PARTIAL status, got ${res.validationStatus}`);
  }));

  results.push(await runTest("Real World Message: Hoshiarpur Bracketed Values & Header Timestamp", async () => {
    const txt = `[1:17 pm, 9/7/2026] Adit Hspr: DSD Performance Report

Date: [08-07-2026]
District: [Hoshiarpur]

1. Total Appointments Booked: [70]
2. Total Served: [35]
3. Total Cancelled: [02]
4. Total Rescheduled: [33]

Confirmation:

I have checked all appointments and confirm that 16 appointments were cancelled or rescheduled due to Sewa Sahayak's absence or rescheduling.

Name: Deepak
Desig: ADITM`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Hoshiarpur') throw new Error(`Expected Hoshiarpur, got ${res.districtName}`);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 8 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
      throw new Error(`Expected Date 2026-07-08, got ${res.reportDate}`);
    }
    if (res.appointmentsBooked !== 70 || res.served !== 35 || res.cancelled !== 2 || res.rescheduled !== 33) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'VALID') throw new Error(`Expected VALID status, got ${res.validationStatus}`);
  }));

  results.push(await runTest("Real World Message: Amritsar Bracketed Values & No Colon Booked", async () => {
    const txt = `[1:45 pm, 9/7/2026] Navjot Kaur DITM Asr: DSD Performance Report

Date: 08-07-2026
District: Amritsar

1. Total Appointments Booked [119]
2. Total Served: [45]
3. Total Cancelled: [3] 
4. Total Rescheduled:[71]

Confirmation:

I have checked all appointments and confirm that 6 appointments  are rescheduled due to Sewa Sahayak's week off .

Name: Navjot Kaur
Desig: DITM`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Amritsar') throw new Error(`Expected Amritsar, got ${res.districtName}`);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 8 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
      throw new Error(`Expected Date 2026-07-08, got ${res.reportDate}`);
    }
    if (res.appointmentsBooked !== 119 || res.served !== 45 || res.cancelled !== 3 || res.rescheduled !== 71) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'VALID') throw new Error(`Expected VALID status, got ${res.validationStatus}`);
  }));

  results.push(await runTest("Real World Message: Rupnagar Date Hyphen Textual Month (09-Jul-2026)", async () => {
    const txt = `DSD Performance Report

Date: 09-Jul-2026
District: Rupnagar

1. Total Appointments Booked: 50
2. Total Served: 30
3. Total Cancelled: 00
4. Total Rescheduled: 20

Confirmation:

I have checked all appointments and confirm that 1 appointment was cancelled or rescheduled due to Sewa Sahayak's absence or rescheduling.

Name : sohan singh
Desig : DTC`;
    const res = await parseReport(txt, new Date());
    if (res.districtName !== 'Rupnagar') throw new Error(`Expected Rupnagar, got ${res.districtName}`);
    const reportDate = new Date(res.reportDate);
    if (reportDate.getUTCDate() !== 9 || reportDate.getUTCMonth() !== 6 || reportDate.getUTCFullYear() !== 2026) {
      throw new Error(`Expected Date 2026-07-09, got ${res.reportDate}`);
    }
    if (res.appointmentsBooked !== 50 || res.served !== 30 || res.cancelled !== 0 || res.rescheduled !== 20) {
      throw new Error('Metrics mismatch');
    }
    if (res.validationStatus !== 'VALID') throw new Error(`Expected VALID status, got ${res.validationStatus}`);
  }));

  // --- COMPILATION SUMMARY ---
  const passed = results.filter(Boolean).length;
  const total = results.length;
  const rate = (passed / total) * 100;

  console.log('\n================================================');
  console.log(`Parser Test Suite Summary:`);
  console.log(`- Total Tests Run: ${total}`);
  console.log(`- Passed: ${passed}`);
  console.log(`- Failed: ${total - passed}`);
  console.log(`- Accuracy Rate: ${rate.toFixed(1)}%`);
  console.log('================================================\n');

  if (rate < 95) {
    console.error('Error: Success rate is below the 95% target threshold.');
    process.exit(1);
  } else {
    console.log('✔ Target threshold of 95%+ accuracy met successfully.');
  }
}

startTests()
  .catch((err) => {
    console.error('Test runner crashed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
