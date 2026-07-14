import { prisma } from '../../lib/prisma';

function levenshtein(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[len1][len2];
}

export interface DetectedDistrict {
  id: string;
  name: string;
  matchType: 'EXACT' | 'ALIAS' | 'FUZZY' | 'NONE';
  confidencePoints: number; // Max 40 points
}

export async function detectDistrict(inputText: string): Promise<DetectedDistrict> {
  const cleanInput = inputText.toLowerCase().replace(/[^a-z0-9\s\.\-]/g, ' ').trim();
  
  // 1. Fetch all active districts and aliases from SQLite
  const districts = await prisma.district.findMany({
    where: { isActive: true },
    include: { aliases: true }
  });

  // EXACT MATCH: Check if input explicitly contains the official name
  for (const d of districts) {
    const dNameLower = d.name.toLowerCase();
    if (cleanInput.includes(dNameLower)) {
      return { id: d.id, name: d.name, matchType: 'EXACT', confidencePoints: 40 };
    }
  }

  // ALIAS MATCH: Check if input contains database-seeded aliases
  for (const d of districts) {
    for (const a of d.aliases) {
      if (cleanInput.includes(a.alias.toLowerCase())) {
        return { id: d.id, name: d.name, matchType: 'ALIAS', confidencePoints: 30 };
      }
    }
  }

  // FUZZY MATCH: Tokenize input and compute Levenshtein distances
  const words = cleanInput.split(/\s+/);
  let bestDist = Infinity;
  let matchedDistrict: typeof districts[0] | null = null;

  for (const d of districts) {
    const dNameLower = d.name.toLowerCase();
    // Compare words against official name
    for (const w of words) {
      if (w.length < 3) continue;
      const dist = levenshtein(w, dNameLower);
      if (dist <= 2 && dist < bestDist) {
        bestDist = dist;
        matchedDistrict = d;
      }
    }

    // Compare words against aliases
    for (const a of d.aliases) {
      const aliasLower = a.alias.toLowerCase();
      for (const w of words) {
        if (w.length < 3) continue;
        const dist = levenshtein(w, aliasLower);
        if (dist <= 2 && dist < bestDist) {
          bestDist = dist;
          matchedDistrict = d;
        }
      }
    }
  }

  if (matchedDistrict && bestDist <= 2) {
    return {
      id: matchedDistrict.id,
      name: matchedDistrict.name,
      matchType: 'FUZZY',
      confidencePoints: 15
    };
  }

  return { id: '', name: 'Unknown', matchType: 'NONE', confidencePoints: 0 };
}
