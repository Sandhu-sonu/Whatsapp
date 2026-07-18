import { detectDistrict } from './districtDetector';

// Configurable Metric Keyword Registry (Preserved for backwards compatibility)
export const metricRegistry: Record<string, string[]> = {
  appointmentsBooked: ['appointments booked', 'total appointments booked', 'booked', 'appointment', 'booking'],
  served: ['served', 'service delivered', 'completed', 'delivered', 'service done'],
  cancelled: ['cancelled', 'canceled', 'cancel'],
  rescheduled: ['rescheduled', 're-scheduled', 'reschedule'],
};

export interface ParserResult {
  districtId: string;
  districtName: string;
  reportDate: Date;
  appointmentsBooked: number;
  served: number;
  cancelled: number;
  rescheduled: number;
  officerName: string | null;
  designation: string | null;
  validationStatus: 'VALID' | 'PARTIAL' | 'INVALID';
  validationErrors: string[];
  confidence: number;
  parserMode: 'TEMPLATE' | 'REGEX' | 'KEYWORD' | 'MANUAL';
  extraMetrics: Record<string, any>;
  processingDurationMs?: number;
  rawExtractedJson?: string;
}

// Helper to parse date parts
function parseDateParts(dayStr: string, monthStrOrNum: string, yearStr?: string, receivedAt?: Date): Date | null {
  const day = parseInt(dayStr, 10);
  if (day < 1 || day > 31) return null;

  let month = -1;
  const monthNamesMap: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };

  if (isNaN(Number(monthStrOrNum))) {
    const mStr = monthStrOrNum.toLowerCase();
    if (monthNamesMap[mStr] !== undefined) {
      month = monthNamesMap[mStr];
    } else {
      return null;
    }
  } else {
    month = parseInt(monthStrOrNum, 10) - 1;
    if (month < 0 || month > 11) return null;
  }

  let year = receivedAt ? receivedAt.getFullYear() : new Date().getFullYear();
  if (yearStr) {
    year = parseInt(yearStr, 10);
    if (year < 100) year += 2000;
  }

  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

// Helper to parse date string candidate
function tryParseDateStr(str: string, receivedAt: Date, trace: Record<string, string>): Date | null {
  const s = str.replace(/[\[\]\(\)\*]/g, '').trim();

  // Pattern 1: DD-MM-YYYY (allow missing separator before 4-digit year, like 07-072026 or 07-07-2026)
  const match1 = s.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-]?(\d{4})\b/);
  if (match1) {
    const d = parseDateParts(match1[1], match1[2], match1[3], receivedAt);
    if (d) {
      trace.datePattern = `parsed complete date pattern (DD-MM-YYYY): "${match1[0]}"`;
      return d;
    }
  }

  // Pattern 2: DD-MM-YY (2-digit year)
  const match2 = s.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2})\b/);
  if (match2) {
    const d = parseDateParts(match2[1], match2[2], match2[3], receivedAt);
    if (d) {
      trace.datePattern = `parsed short year pattern (DD-MM-YY): "${match2[0]}"`;
      return d;
    }
  }

  // Pattern 3: DD Month YYYY (e.g. 7 july 2026 or 7-july-2026)
  const match3 = s.match(/(\d{1,2})[\s\/\.\-]+([a-z]{3,9})[\s\/\.\-]+(\d{2,4})/i);
  if (match3) {
    const d = parseDateParts(match3[1], match3[2], match3[3], receivedAt);
    if (d) {
      trace.datePattern = `parsed textual month with year pattern: "${match3[0]}"`;
      return d;
    }
  }

  // Pattern 3b: Month DD YYYY (e.g. july 7 2026 or july-7-2026)
  const match3b = s.match(/([a-z]{3,9})[\s\/\.\-]+(\d{1,2})[\s\/\.\-]+(\d{2,4})/i);
  if (match3b) {
    const d = parseDateParts(match3b[2], match3b[1], match3b[3], receivedAt);
    if (d) {
      trace.datePattern = `parsed Month DD YYYY pattern: "${match3b[0]}"`;
      return d;
    }
  }

  // Pattern 4: DD Month (no year - unambiguous)
  const match4 = s.match(/\b(\d{1,2})[\s\/\.\-]+([a-z]{3,9})\b/i);
  if (match4) {
    const d = parseDateParts(match4[1], match4[2], undefined, receivedAt);
    if (d) {
      trace.datePattern = `inferred year for unambiguous textual month: "${match4[0]}"`;
      return d;
    }
  }

  // Pattern 4b: Month DD (no year - unambiguous)
  const match4b = s.match(/\b([a-z]{3,9})[\s\/\.\-]+(\d{1,2})\b/i);
  if (match4b) {
    const d = parseDateParts(match4b[2], match4b[1], undefined, receivedAt);
    if (d) {
      trace.datePattern = `inferred year for unambiguous textual month: "${match4b[0]}"`;
      return d;
    }
  }

  return null;
}

// Helper to extract numbers from a candidate line
function extractNumberFromLine(line: string, keywords: RegExp): number | null {
  // 1. Remove list prefix if present (e.g. "1. ", "4.  ", "2) ")
  const clean = line.replace(/^\s*\d+[\.\)\s\-]+\s*/, '').trim();

  // 2. Try to capture a number immediately following or embedded in the keyword/label
  // e.g. "Reschedule13" or "Rescheduled: 13" or "reschedule =50"
  const exactPattern = new RegExp(keywords.source + '\\s*[\\:\\-\\=\\s]?\\s*\\[?\\(?(\\d+)\\)?\\]?', 'i');
  const match = clean.match(exactPattern);
  if (match && match[1] !== undefined) {
    return parseInt(match[1], 10);
  }

  // 3. Fallback: Find the first digit sequence on the line after stripping list prefix
  const firstNum = clean.match(/(\d+)/);
  if (firstNum) {
    return parseInt(firstNum[1], 10);
  }

  return null;
}

// Helper to extract a metric value using candidate-based line matching
function extractMetricCandidate(lines: string[], keywords: RegExp, metricKey: string, trace: Record<string, string>): number | null {
  for (const line of lines) {
    if (keywords.test(line)) {
      const val = extractNumberFromLine(line, keywords);
      if (val !== null) {
        trace[metricKey] = `Parsed value ${val} from candidate line: "${line}"`;
        return val;
      }
    }
  }
  trace[metricKey] = `Metric label matched but no valid numbers extracted. Defaulted to null.`;
  return null;
}

export async function parseReport(messageText: string, messageReceivedAt: Date): Promise<ParserResult> {
  const startTime = Date.now();
  const trace: Record<string, string> = {};

  // 1. NORMALIZE TEXT & LINES
  const cleanMsg = messageText
    .replace(/[\r\n]+/g, '\n') // Normalize line endings
    .replace(/[\u200B\uFEFF\u200C\u200D]/g, '') // Remove invisible control/zero-width characters
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');

  const lines = cleanMsg.split('\n');

  // 2. IDENTIFY DSD REPORT
  const lowerText = cleanMsg.toLowerCase();
  const dsdKeywords = ['dsd', 'performance', 'report', 'booked', 'served'];
  const matchCount = dsdKeywords.filter(kw => lowerText.includes(kw)).length;
  if (matchCount < 2) {
    trace.dsdReport = `Skipped: Message text matched only ${matchCount} DSD indicator keywords.`;
  } else {
    trace.dsdReport = `Identified: Message text matched ${matchCount} DSD indicator keywords.`;
  }

  // 3. EXTRACT REPORT DATE (CANDIDATE-BASED)
  let reportDate: Date | null = null;
  let dateTrace = 'Defaulted to Epoch (1970-01-01)';
  let dateMatched = false;

  const dateLabelRegex = /(?:^|[^a-zA-Z])(?:date|dt)(?:[^a-zA-Z]|$)/i;
  const dateCandidates: string[] = [];

  for (const line of lines) {
    if (dateLabelRegex.test(line)) {
      const parts = line.split(/(?:date|dt)/i);
      if (parts.length > 1) {
        const val = parts.slice(1).join(' ').replace(/^[\s\:\-\=\.\*]+/, '').trim();
        if (val) {
          dateCandidates.push(val);
        }
      }
    }
  }

  // Fallback: Add all lines of the message
  dateCandidates.push(...lines);

  for (const cand of dateCandidates) {
    const parsed = tryParseDateStr(cand, messageReceivedAt, trace);
    if (parsed) {
      reportDate = parsed;
      dateMatched = true;
      dateTrace = `Parsed report date from candidate "${cand}": ${trace.datePattern || ''}`;
      break;
    }
  }

  if (!dateMatched) {
    reportDate = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0));
    dateTrace = 'Could not parse date (Epoch fallback)';
  }
  trace.date = dateTrace;

  // 4. FUZZY DISTRICT MATCHING (CANDIDATE-BASED)
  const districtLabelRegex = /(?:^|[^a-zA-Z])(?:district|dirstrict|distrct|dis\s*bhutrict|dist)(?:[^a-zA-Z]|$)/i;
  const districtCandidates: string[] = [];
  let distTrace = 'Not matched';
  let districtMatch: any = { id: '', name: 'Unknown', matchType: 'NONE', confidencePoints: 0 };

  for (const line of lines) {
    if (districtLabelRegex.test(line)) {
      const parts = line.split(/(?:district|dirstrict|distrct|dis\s*bhutrict|dist)/i);
      if (parts.length > 1) {
        const val = parts.slice(1).join(' ').replace(/^[\s\:\-\=\.\*\[\]\(\)]+/, '').trim();
        if (val) {
          districtCandidates.push(val);
        }
      }
    }
  }

  for (const cand of districtCandidates) {
    const cleanedCandidate = cand.replace(/[\[\]\(\)\*]/g, '').replace(/[\.\,\-\_]+$/, '').trim();
    if (cleanedCandidate) {
      const detection = await detectDistrict(cleanedCandidate);
      if (detection.id) {
        districtMatch = detection;
        distTrace = `Resolved via candidate "${cleanedCandidate}" (${detection.matchType} match: "${detection.name}")`;
        break;
      }
    }
  }

  // Fallback: Scan entire message for exact District names/aliases (no Levenshtein)
  if (!districtMatch.id) {
    const { prisma } = require('../../lib/prisma');
    const districts = await prisma.district.findMany({
      where: { isActive: true },
      include: { aliases: true }
    });

    const cleanInput = cleanMsg.toLowerCase();
    let foundDistrict: any = null;
    let matchType: 'EXACT' | 'ALIAS' = 'EXACT';

    for (const d of districts) {
      if (cleanInput.includes(d.name.toLowerCase())) {
        foundDistrict = d;
        matchType = 'EXACT';
        break;
      }
      for (const a of d.aliases) {
        if (cleanInput.includes(a.alias.toLowerCase())) {
          foundDistrict = d;
          matchType = 'ALIAS';
          break;
        }
      }
    }

    if (foundDistrict) {
      districtMatch = {
        id: foundDistrict.id,
        name: foundDistrict.name,
        matchType,
        confidencePoints: matchType === 'EXACT' ? 40 : 30
      };
      distTrace = `Matched exact/alias in message text: "${foundDistrict.name}"`;
    } else {
      distTrace = `Could not resolve district candidate or text aliases`;
    }
  }
  trace.district = distTrace;

  // 5. EXTRACT METRICS (CANDIDATE-BASED)
  const appointmentsBooked = extractMetricCandidate(
    lines,
    /(?:appointments?\s*booked|booking|booked|total\s+appointments)/i,
    'booked',
    trace
  );
  const served = extractMetricCandidate(
    lines,
    /(?:service\s+delivered|completed|served)/i,
    'served',
    trace
  );
  const cancelled = extractMetricCandidate(
    lines,
    /(?:cancelled|canceled|cancel)/i,
    'cancelled',
    trace
  );
  const rescheduled = extractMetricCandidate(
    lines,
    /(?:rescheduled|reschedule|re-scheduled)/i,
    'rescheduled',
    trace
  );

  // 6. EXTRACT OFFICER DETAILS (CANDIDATE-BASED)
  let officerName: string | null = null;
  let designation: string | null = null;

  for (const line of lines) {
    const nMatch = line.match(/^\*?\s*(?:name|officer)\s*[\:\-\=\s]+\s*(.*)$/i);
    if (nMatch) {
      officerName = nMatch[1].replace(/[\*\_]/g, '').trim() || null;
      trace.officerName = `Parsed "${officerName}" from line: "${line}"`;
    }
    const dMatch = line.match(/^\*?\s*(?:designation|desig|des)\s*[\:\-\=\s]+\s*(.*)$/i);
    if (dMatch) {
      designation = dMatch[1].replace(/[\*\_]/g, '').trim() || null;
      trace.designation = `Parsed "${designation}" from line: "${line}"`;
    }
  }

  if (!officerName) trace.officerName = 'Not found (Defaulted to null)';
  if (!designation) trace.designation = 'Not found (Defaulted to null)';

  // 7. PRESERVE UNPARSED TEXT
  const unparsedLines: string[] = [];
  for (const line of lines) {
    const isDate = /^\*?\s*(?:report\s+)?(?:date|dt)\b/i.test(line);
    const isDistrict = /^\*?\s*(?:dis\s*bhutrict|dirstrict|distrct|district|dist)\b/i.test(line);
    const isBooked = /(?:appointments?\s*booked|booking|booked|total\s+appointments)/i.test(line);
    const isServed = /(?:service\s+delivered|completed|served)/i.test(line);
    const isCancelled = /(?:cancelled|canceled|cancel)/i.test(line);
    const isRescheduled = /(?:rescheduled|reschedule|re-scheduled)/i.test(line);
    const isName = /^\*?\s*(?:name|officer)\b/i.test(line);
    const isDesig = /^\*?\s*(?:designation|desig|des)\b/i.test(line);

    const isHeaderNoise = /dsd\s+performance\s+report/i.test(line) || /dsd\s+report/i.test(line);
    const isConfirmationHeader = /^confirmation\b/i.test(line) || /^confirm\b/i.test(line);
    const isConfirmationText = /i\s+have\s+checked/i.test(line) || /confirm\s+that/i.test(line) || /sewa\s+sahayak/i.test(line);

    if (!isDate && !isDistrict && !isBooked && !isServed && !isCancelled && !isRescheduled && !isName && !isDesig && !isHeaderNoise && !isConfirmationHeader && !isConfirmationText) {
      unparsedLines.push(line);
    }
  }
  const remainingText = unparsedLines.join('\n').trim() || null;
  trace.unparsedText = remainingText ? `Captured ${unparsedLines.length} unparsed lines` : 'No unparsed text lines remaining';

  // 8. CALCULATE CONFIDENCE
  let confidence = 0;
  if (dateMatched) confidence += 30;
  if (districtMatch.id) confidence += 25;
  if (appointmentsBooked !== null) confidence += 15;
  if (served !== null) confidence += 15;
  if (cancelled !== null) confidence += 5;
  if (rescheduled !== null) confidence += 5;
  if (officerName !== null) confidence += 3;
  if (designation !== null) confidence += 2;

  // 9. VALIDATION PIPELINE
  const errors: string[] = [];
  if (!dateMatched) errors.push('Missing report date from WhatsApp message text');
  if (!districtMatch.id) errors.push('District could not be resolved from message');
  if (appointmentsBooked === null) errors.push('Missing appointments booked metric');
  if (served === null) errors.push('Missing served appointments metric');

  const finalBooked = appointmentsBooked ?? 0;
  const finalServed = served ?? 0;
  const finalCancelled = cancelled ?? 0;
  const finalRescheduled = rescheduled ?? 0;

  if (cancelled === null) errors.push('Missing cancelled appointments metric (Defaulted to 0)');
  if (rescheduled === null) errors.push('Missing rescheduled appointments metric (Defaulted to 0)');
  if (!officerName) errors.push('Missing officer name (Defaulted to null)');
  if (!designation) errors.push('Missing officer designation (Defaulted to null)');

  let hasMathErrors = false;
  if (finalServed > finalBooked) {
    errors.push('Served appointments exceed total booked appointments');
    hasMathErrors = true;
  }
  if (finalCancelled > finalBooked) {
    errors.push('Cancelled appointments exceed total booked appointments');
    hasMathErrors = true;
  }
  if (finalRescheduled > finalBooked) {
    errors.push('Rescheduled appointments exceed total booked appointments');
    hasMathErrors = true;
  }
  if (finalBooked < (finalServed + finalCancelled + finalRescheduled)) {
    errors.push('Booked appointments count is less than the sum of served, cancelled, and rescheduled outcomes');
    hasMathErrors = true;
  }

  let validationStatus: 'VALID' | 'PARTIAL' | 'INVALID' = 'VALID';
  const hasMandatoryErrors = !dateMatched || !districtMatch.id || appointmentsBooked === null || served === null;
  const hasWarnings = errors.length > 0;

  if (hasMandatoryErrors || hasMathErrors) {
    validationStatus = 'INVALID';
  } else if (hasWarnings) {
    validationStatus = 'PARTIAL';
  }

  const parserMode = (appointmentsBooked !== null && served !== null && cancelled !== null && rescheduled !== null) ? 'TEMPLATE' : 'REGEX';
  const processingDurationMs = Date.now() - startTime;
  const rawExtractedJson = JSON.stringify(trace);

  return {
    districtId: districtMatch.id,
    districtName: districtMatch.name,
    reportDate: reportDate!,
    appointmentsBooked: finalBooked,
    served: finalServed,
    cancelled: finalCancelled,
    rescheduled: finalRescheduled,
    officerName,
    designation,
    validationStatus,
    validationErrors: errors,
    confidence,
    parserMode,
    extraMetrics: {
      officerName,
      designation,
      trace,
      remainingText
    },
    processingDurationMs,
    rawExtractedJson,
  };
}
