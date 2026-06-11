export interface SubjectiveGradeInput {
  type: 'FILL_BLANK' | 'SHORT_ANSWER';
  standardAnswerJson?: {
    answers?: string[];
    reference?: string;
    text?: string;
    keywords?: string[];
  };
  scoringRubric?: string;
  candidateAnswer: {
    answers?: string[];
    text?: string;
  };
  maxScore: number;
}

export interface SubjectiveGradeResult {
  gradable: boolean;
  score: number;
  matchedKeywords: string[];
  requiredKeywords: string[];
  matchRatio: number;
  rationale: string;
  autoApproved: boolean;
}

const AI_COMMENT_PREFIX = '[AI] ';

export function aiReviewComment(rationale: string): string {
  return `${AI_COMMENT_PREFIX}${rationale}`;
}

export function isAiGradedComment(comment: string | null | undefined): boolean {
  return Boolean(comment?.startsWith(AI_COMMENT_PREFIX));
}

/** Split rubric / reference text into keyword tokens for matching. */
export function extractKeywords(...sources: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  const add = (raw: string) => {
    const token = raw.trim();
    if (!token) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    const minLen = /[\u4e00-\u9fff]/.test(token) ? 1 : 2;
    if (token.length < minLen) return;
    seen.add(key);
    keywords.push(token);
  };

  for (const source of sources) {
    if (!source?.trim()) continue;
    const parts = source.split(/[,，;；|｜/\n\r]+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.length <= 80 && !/[.!?。！？]/.test(trimmed)) {
        add(trimmed);
        continue;
      }
      for (const chunk of trimmed.split(/[.!?。！？、]+/)) {
        add(chunk);
      }
    }
  }

  if (keywords.length === 0) {
    for (const source of sources) {
      if (!source?.trim()) continue;
      const words = source.match(/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/g) ?? [];
      for (const word of words) add(word);
    }
  }

  return keywords.slice(0, 40);
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。．.!！?？;；:：'"“”‘’\-_]/g, '');
}

function containsKeyword(haystack: string, keyword: string): boolean {
  const normalizedHay = normalizeForMatch(haystack);
  const normalizedNeedle = normalizeForMatch(keyword);
  if (!normalizedNeedle) return false;
  return normalizedHay.includes(normalizedNeedle);
}

function gradeFillBlank(input: SubjectiveGradeInput): SubjectiveGradeResult {
  const expected = input.standardAnswerJson?.answers ?? [];
  const actual = input.candidateAnswer.answers ?? [];

  if (!expected.length) {
    return {
      gradable: false,
      score: 0,
      matchedKeywords: [],
      requiredKeywords: [],
      matchRatio: 0,
      rationale: 'No reference answers configured for auto-grading.',
      autoApproved: false,
    };
  }

  let matched = 0;
  const matchedLabels: string[] = [];

  for (let i = 0; i < expected.length; i += 1) {
    const ref = expected[i]?.trim() ?? '';
    const cand = (actual[i] ?? '').trim();
    if (!ref) continue;
    const refKeywords = extractKeywords(ref);
    const ok =
      (cand && containsKeyword(cand, ref)) ||
      refKeywords.some((kw) => cand && containsKeyword(cand, kw)) ||
      (cand && containsKeyword(ref, cand));
    if (ok) {
      matched += 1;
      matchedLabels.push(ref);
    }
  }

  const ratio = matched / expected.length;
  const score = Math.round(input.maxScore * ratio * 100) / 100;
  const autoApproved = matched === expected.length;

  return {
    gradable: true,
    score,
    matchedKeywords: matchedLabels,
    requiredKeywords: expected,
    matchRatio: ratio,
    rationale: autoApproved
      ? `All ${expected.length} blank(s) matched the answer key.`
      : `Matched ${matched} of ${expected.length} blank(s) via keyword / text comparison.`,
    autoApproved,
  };
}

function gradeShortAnswer(input: SubjectiveGradeInput): SubjectiveGradeResult {
  const reference =
    input.standardAnswerJson?.reference ??
    input.standardAnswerJson?.text ??
    '';
  const rubric = input.scoringRubric ?? '';
  const explicitKeywords = input.standardAnswerJson?.keywords ?? [];
  const requiredKeywords =
    explicitKeywords.length > 0
      ? explicitKeywords
      : extractKeywords(rubric, reference);

  const candidateText = (input.candidateAnswer.text ?? '').trim();

  if (!requiredKeywords.length) {
    return {
      gradable: false,
      score: 0,
      matchedKeywords: [],
      requiredKeywords: [],
      matchRatio: 0,
      rationale: 'No keywords or reference answer available for AI grading.',
      autoApproved: false,
    };
  }

  if (!candidateText) {
    return {
      gradable: true,
      score: 0,
      matchedKeywords: [],
      requiredKeywords,
      matchRatio: 0,
      rationale: 'No written response submitted.',
      autoApproved: true,
    };
  }

  const matched = requiredKeywords.filter((kw) => containsKeyword(candidateText, kw));
  const ratio = matched.length / requiredKeywords.length;
  const score = Math.round(input.maxScore * ratio * 100) / 100;
  const autoApproved = matched.length === requiredKeywords.length;

  return {
    gradable: true,
    score,
    matchedKeywords: matched,
    requiredKeywords,
    matchRatio: ratio,
    rationale: autoApproved
      ? `All ${requiredKeywords.length} keyword(s) found in the response.`
      : `Found ${matched.length} of ${requiredKeywords.length} keyword(s): ${matched.join(', ') || 'none'}.`,
    autoApproved,
  };
}

export function gradeSubjectiveAnswer(input: SubjectiveGradeInput): SubjectiveGradeResult {
  if (input.type === 'FILL_BLANK') return gradeFillBlank(input);
  return gradeShortAnswer(input);
}
