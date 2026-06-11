import { QuestionType } from '@prisma/client';
import { ExtractedImportRow, mapQuestionType } from './question-import-layout';

export interface PdfSectionContext {
  typeRaw: string;
  pointsEach: number;
  categoryRaw: string;
  tagsRaw: string;
}

const DEFAULT_POINTS = 1;

const SECTION_LINE_RE =
  /^\s*\d+\.\s*Section\s+\d+:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/i;

const QUESTION_LINE_RE = /^Question\s+(\d+)\s*:\s*(.*)$/i;
const HAS_QUESTION_RE = /Question\s+\d+\s*:/i;

const OPTION_LINE_RE = /^-\s*([A-Z])\)\s*(.+)$/i;

const CORRECT_ANSWER_RE = /^Correct\s+Answer:\s*(.+)$/i;

const POINTS_EACH_RE = /(\d+(?:\.\d+)?)\s*points?\s*each/i;

/** Normalize PDF / markdown text for parsing. */
export function normalizePdfExamText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferTypeRawFromSection(sectionTitle: string): string {
  return sectionTitle
    .replace(/\s*questions?\s*$/i, '')
    .replace(/\s*items?\s*$/i, '')
    .trim();
}

function parsePointsFromSectionMeta(meta: string | undefined): number {
  if (!meta) return DEFAULT_POINTS;
  const match = meta.match(POINTS_EACH_RE);
  if (match) return Number(match[1]);
  const fallback = meta.match(/(\d+(?:\.\d+)?)\s*points?/i);
  return fallback ? Number(fallback[1]) : DEFAULT_POINTS;
}

function parseSectionLine(line: string): PdfSectionContext | null {
  const match = line.match(SECTION_LINE_RE);
  if (!match) return null;
  const title = match[1].trim();
  const meta = match[2]?.trim();
  const typeRaw = inferTypeRawFromSection(title);
  return {
    typeRaw,
    pointsEach: parsePointsFromSectionMeta(meta),
    categoryRaw: '',
    tagsRaw: title.replace(/\s+/g, ' ').trim(),
  };
}

function splitQuestionBlocks(text: string): string[] {
  const byDivider = text.split(/\n-{3,}\n/).map((p) => p.trim()).filter(Boolean);
  if (byDivider.length > 1) return byDivider;

  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (QUESTION_LINE_RE.test(line.trim()) && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n').trim());
  return blocks.filter(Boolean);
}

function parseQuestionBlock(
  block: string,
  context: PdfSectionContext,
): { fields: ExtractedImportRow; row: number; context: PdfSectionContext } | null {
  let workingContext = context;
  const lines = block.split('\n').map((l) => l.trim());

  const contentLines: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const section = parseSectionLine(line);
    if (section) {
      workingContext = section;
      continue;
    }
    contentLines.push(line);
  }

  if (!contentLines.length) return null;

  const qMatch = contentLines[0].match(QUESTION_LINE_RE);
  if (!qMatch) return null;

  const row = Number(qMatch[1]) || 0;
  let stem = qMatch[2].trim();
  const options: Array<{ key: string; label: string }> = [];
  let answerRaw = '';

  for (let i = 1; i < contentLines.length; i++) {
    const line = contentLines[i];
    const optMatch = line.match(OPTION_LINE_RE);
    if (optMatch) {
      options.push({ key: optMatch[1].toUpperCase(), label: optMatch[2].trim() });
      continue;
    }

    const ansMatch = line.match(CORRECT_ANSWER_RE);
    if (ansMatch) {
      answerRaw = ansMatch[1].trim();
      continue;
    }

    if (!options.length && !answerRaw) {
      stem = stem ? `${stem} ${line}`.trim() : line;
    }
  }

  if (!stem) return null;

  const typeRaw = workingContext.typeRaw || 'Single Choice';
  const mappedType = mapQuestionType(typeRaw);
  const optionsRaw =
    options.length > 0
      ? options.map((o) => o.label).join('|')
      : mappedType === QuestionType.TRUE_FALSE
        ? 'True|False'
        : '';

  return {
    row,
    context: workingContext,
    fields: {
      typeRaw,
      categoryRaw: workingContext.categoryRaw,
      stem,
      optionsRaw,
      answerRaw,
      pointsRaw: workingContext.pointsEach,
      explanation: undefined,
      difficultyRaw: 'Medium',
      tagsRaw: workingContext.tagsRaw,
      scoringRubric: undefined,
    },
  };
}

interface ChineseSectionContext extends PdfSectionContext {
  answerSection: 'choice' | 'trueFalse' | 'short' | 'case' | 'none';
  answerIndex: number;
}

interface ChineseAnswerKey {
  choice: Map<number, string>;
  trueFalse: Map<number, string>;
  shortAnswer: string;
  caseStudy: string;
}

const CHINESE_SECTION_RE = /^[一二三四五六七八九十]+、(.+)$/;
const CHINESE_QUESTION_RE = /^(\d+)\.\s+(.+)$/;
const CHINESE_OPTION_RE = /^([A-D])[.、]\s*(.+)$/;
const PAGE_MARKER_RE = /^--\s*\d+\s+of\s+\d+\s*--$/;

function collapseInlineWhitespace(text: string): string {
  return text.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

export type AnswerKeyLayout =
  | 'chinese_reference_section'
  | 'english_trailing_section'
  | null;

/** Detect a separate answer-key section bundled with exam questions in the same file. */
export function detectAnswerKeyLayout(text: string): AnswerKeyLayout {
  const normalized = normalizePdfExamText(text);
  if (/参考答案/.test(normalized)) return 'chinese_reference_section';

  const trailingMarkers = [
    /\n\s*Answer\s+Key\s*(?:\n|$)/i,
    /\n\s*Section\s+\d+\s*:\s*Answer(?:\s+Key)?\s*(?:\n|$)/i,
    /\n-{3,}\s*\n\s*Answers?\s*(?:\n|$)/i,
  ];
  if (trailingMarkers.some((pattern) => pattern.test(normalized))) {
    return 'english_trailing_section';
  }

  return null;
}

function isChineseIqcExam(text: string): boolean {
  return /[一二三四五六七八九十]+、/.test(text) && /参考答案/.test(text);
}

function splitBodyBeforeAnswerKey(text: string, layout: AnswerKeyLayout): string {
  if (!layout) return text;

  if (layout === 'chinese_reference_section') {
    const idx = text.search(/参考答案/);
    return idx >= 0 ? text.slice(0, idx) : text;
  }

  const normalized = normalizePdfExamText(text);
  const markers = [
    /\n\s*Answer\s+Key\s*(?:\n|$)/i,
    /\n\s*Section\s+\d+\s*:\s*Answer(?:\s+Key)?\s*(?:\n|$)/i,
    /\n-{3,}\s*\n\s*Answers?\s*(?:\n|$)/i,
  ];
  for (const pattern of markers) {
    const match = normalized.match(pattern);
    if (match?.index !== undefined) {
      return normalized.slice(0, match.index);
    }
  }

  return text;
}

function inferChineseTypeRaw(sectionTitle: string): string {
  const title = sectionTitle.trim();
  if (/选择题/.test(title)) return '选择题';
  if (/判断题/.test(title)) return '判断题';
  if (/简答题/.test(title)) return '简答题';
  if (/案例/.test(title)) return '案例分析题';
  return title;
}

function inferChineseAnswerSection(sectionTitle: string): ChineseSectionContext['answerSection'] {
  if (/选择题/.test(sectionTitle)) return 'choice';
  if (/判断题/.test(sectionTitle)) return 'trueFalse';
  if (/简答题/.test(sectionTitle)) return 'short';
  if (/案例/.test(sectionTitle)) return 'case';
  return 'none';
}

function parseChineseSectionPoints(sectionTitle: string): number {
  const eachMatch = sectionTitle.match(/每题\s*(\d+(?:\.\d+)?)\s*分/);
  if (eachMatch) return Number(eachMatch[1]);
  const totalMatch = sectionTitle.match(/（\s*(\d+(?:\.\d+)?)\s*分\s*）/);
  if (totalMatch) return Number(totalMatch[1]);
  return DEFAULT_POINTS;
}

function parseChineseSectionLine(line: string): ChineseSectionContext | null {
  const match = line.match(CHINESE_SECTION_RE);
  if (!match) return null;
  const title = match[1].trim();
  const typeRaw = inferChineseTypeRaw(title);
  return {
    typeRaw,
    pointsEach: parseChineseSectionPoints(title),
    categoryRaw: '',
    tagsRaw: title.replace(/\s+/g, ' ').trim(),
    answerSection: inferChineseAnswerSection(title),
    answerIndex: 0,
  };
}

function normalizeTrueFalseAnswer(raw: string): string {
  const value = raw.trim();
  if (/^[√✓对是T]$/i.test(value)) return 'T';
  if (/^[×✗错否F]$/i.test(value)) return 'F';
  return value.toUpperCase();
}

function parseChineseAnswerSection(text: string): ChineseAnswerKey {
  const choice = new Map<number, string>();
  const trueFalse = new Map<number, string>();
  let shortAnswer = '';
  let caseStudy = '';
  let mode: ChineseSectionContext['answerSection'] = 'none';
  let pendingNums: number[] = [];

  const lines = text
    .split('\n')
    .map((line) => collapseInlineWhitespace(line))
    .filter((line) => line && !PAGE_MARKER_RE.test(line));

  for (const line of lines) {
    if (line === '参考答案' || line.startsWith('参考答案')) continue;
    if (/^一、/.test(line) && /选择题/.test(line)) {
      mode = 'choice';
      pendingNums = [];
      continue;
    }
    if (/^二、/.test(line) && /判断题/.test(line)) {
      mode = 'trueFalse';
      pendingNums = [];
      continue;
    }
    if (/^三、/.test(line) && /简答题/.test(line)) {
      mode = 'short';
      continue;
    }
    if (/^四、/.test(line) && /案例/.test(line)) {
      mode = 'case';
      continue;
    }

    if (mode === 'choice' || mode === 'trueFalse') {
      const nums = line.match(/\d+/g);
      const answers =
        mode === 'choice'
          ? line.match(/[A-D]/gi)
          : line.match(/[√×✓✗]/g);

      if (nums && !answers) {
        pendingNums = nums.map(Number);
        continue;
      }

      if (answers && pendingNums.length) {
        const map = mode === 'choice' ? choice : trueFalse;
        answers.forEach((answer, index) => {
          const key = pendingNums[index];
          if (key === undefined) return;
          map.set(
            key,
            mode === 'choice' ? answer.toUpperCase() : normalizeTrueFalseAnswer(answer),
          );
        });
        pendingNums = [];
      }
      continue;
    }

    if (mode === 'short') {
      shortAnswer = shortAnswer ? `${shortAnswer}\n${line}` : line;
      continue;
    }

    if (mode === 'case') {
      caseStudy = caseStudy ? `${caseStudy}\n${line}` : line;
    }
  }

  return { choice, trueFalse, shortAnswer: shortAnswer.trim(), caseStudy: caseStudy.trim() };
}

function resolveChineseAnswer(
  context: ChineseSectionContext,
  row: number,
  answers: ChineseAnswerKey,
): string {
  switch (context.answerSection) {
    case 'choice':
      return answers.choice.get(row) ?? '';
    case 'trueFalse':
      return answers.trueFalse.get(context.answerIndex) ?? '';
    case 'short':
      return answers.shortAnswer;
    case 'case':
      return answers.caseStudy;
    default:
      return '';
  }
}

function flushChineseQuestion(
  row: number,
  stem: string,
  options: string[],
  context: ChineseSectionContext,
  answers: ChineseAnswerKey,
): { row: number; fields: ExtractedImportRow } | null {
  const trimmedStem = collapseInlineWhitespace(stem);
  if (!trimmedStem) return null;

  const mappedType = mapQuestionType(context.typeRaw);
  const optionsRaw =
    options.length > 0
      ? options.join('|')
      : mappedType === QuestionType.TRUE_FALSE
        ? 'True|False'
        : '';

  return {
    row,
    fields: {
      typeRaw: context.typeRaw,
      categoryRaw: context.categoryRaw,
      stem: trimmedStem,
      optionsRaw,
      answerRaw: resolveChineseAnswer(context, row, answers),
      pointsRaw: context.pointsEach,
      explanation: undefined,
      difficultyRaw: 'Medium',
      tagsRaw: context.tagsRaw,
      scoringRubric:
        context.answerSection === 'short' || context.answerSection === 'case'
          ? resolveChineseAnswer(context, row, answers)
          : undefined,
    },
  };
}

function parseChineseIqcExamText(
  text: string,
  parseOptions?: { voidAnswerKey?: boolean },
): Array<{ row: number; fields: ExtractedImportRow }> {
  const normalized = collapseInlineWhitespace(normalizePdfExamText(text));
  if (!normalized) return [];

  const voidAnswerKey = parseOptions?.voidAnswerKey ?? false;
  const answerIdx = normalized.search(/参考答案/);
  const body = answerIdx >= 0 ? normalized.slice(0, answerIdx) : normalized;
  const answers =
    voidAnswerKey || answerIdx < 0
      ? null
      : parseChineseAnswerSection(normalized.slice(answerIdx));
  const emptyAnswers: ChineseAnswerKey = {
    choice: new Map(),
    trueFalse: new Map(),
    shortAnswer: '',
    caseStudy: '',
  };
  const answerKey = answers ?? emptyAnswers;

  let context: ChineseSectionContext = {
    typeRaw: '选择题',
    pointsEach: DEFAULT_POINTS,
    categoryRaw: '',
    tagsRaw: '',
    answerSection: 'choice',
    answerIndex: 0,
  };

  const results: Array<{ row: number; fields: ExtractedImportRow }> = [];
  let row = 0;
  let stem = '';
  let options: string[] = [];

  const flushCurrent = () => {
    if (!stem) return;
    const parsed = flushChineseQuestion(row || results.length + 1, stem, options, context, answerKey);
    if (parsed) results.push(parsed);
    stem = '';
    options = [];
  };

  for (const rawLine of body.split('\n')) {
    const line = collapseInlineWhitespace(rawLine);
    if (!line || PAGE_MARKER_RE.test(line)) continue;
    if (/^IQC\s/.test(line) || /^考试时间/.test(line) || /^（原材料/.test(line)) continue;

    const section = parseChineseSectionLine(line);
    if (section) {
      flushCurrent();
      context = { ...section, answerIndex: 0 };
      if (section.answerSection === 'case') row = 0;
      continue;
    }

    const questionMatch = line.match(CHINESE_QUESTION_RE);
    if (questionMatch) {
      flushCurrent();
      row = Number(questionMatch[1]) || results.length + 1;
      if (context.answerSection === 'trueFalse') context.answerIndex += 1;
      else if (context.answerSection === 'choice') context = { ...context, answerIndex: row };
      stem = questionMatch[2].trim();
      continue;
    }

    const optionMatch = line.match(CHINESE_OPTION_RE);
    if (optionMatch && stem) {
      options.push(optionMatch[2].trim());
      continue;
    }

    if (stem || context.answerSection === 'case') {
      if (!row) row = results.length + 1;
      stem = stem ? `${stem} ${line}`.trim() : line;
    }
  }

  flushCurrent();
  return results;
}

function parseEnglishPdfExamText(
  text: string,
  parseOptions?: { voidAnswerKey?: boolean },
): Array<{ row: number; fields: ExtractedImportRow }> {
  const layout = parseOptions?.voidAnswerKey ? detectAnswerKeyLayout(text) : null;
  const normalized = normalizePdfExamText(
    layout === 'english_trailing_section' ? splitBodyBeforeAnswerKey(text, layout) : text,
  );
  if (!normalized) return [];

  let context: PdfSectionContext = {
    typeRaw: 'Single Choice',
    pointsEach: DEFAULT_POINTS,
    categoryRaw: '',
    tagsRaw: '',
  };

  const blocks = splitQuestionBlocks(normalized);
  const results: Array<{ row: number; fields: ExtractedImportRow }> = [];

  for (const block of blocks) {
    const firstLine = block.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const sectionOnly = parseSectionLine(firstLine);
    if (sectionOnly && !HAS_QUESTION_RE.test(block)) {
      context = sectionOnly;
      continue;
    }

    const parsed = parseQuestionBlock(block, context);
    if (!parsed) continue;
    context = parsed.context;
    results.push({ row: parsed.row || results.length + 1, fields: parsed.fields });
  }

  return results;
}

export interface PdfExamParseResult {
  rows: Array<{ row: number; fields: ExtractedImportRow }>;
  answerKeyDetected: boolean;
  answerKeyVoided: boolean;
  answerKeyLayout: AnswerKeyLayout;
}

/**
 * Parse exam-question PDF text (English template or Chinese IQC-style papers).
 * Bundled answer keys are merged into questions for AI auto-grading (not exposed to candidates).
 */
export function parsePdfExamText(text: string): PdfExamParseResult {
  const answerKeyLayout = detectAnswerKeyLayout(text);
  const answerKeyDetected = answerKeyLayout !== null;
  const splitTrailingEnglishKey = answerKeyLayout === 'english_trailing_section';

  const english = parseEnglishPdfExamText(text, { voidAnswerKey: splitTrailingEnglishKey });
  if (english.length) {
    return {
      rows: english,
      answerKeyDetected,
      answerKeyVoided: false,
      answerKeyLayout,
    };
  }

  if (isChineseIqcExam(text)) {
    const rows = parseChineseIqcExamText(text, { voidAnswerKey: false });
    return {
      rows,
      answerKeyDetected,
      answerKeyVoided: false,
      answerKeyLayout: answerKeyLayout ?? 'chinese_reference_section',
    };
  }

  return {
    rows: [],
    answerKeyDetected: false,
    answerKeyVoided: false,
    answerKeyLayout: null,
  };
}
