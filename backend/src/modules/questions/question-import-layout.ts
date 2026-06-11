import ExcelJS from 'exceljs';
import { QuestionType } from '@prisma/client';

export type ImportLayoutFormat =
  | 'headers-type-first'
  | 'headers-stem-first'
  | 'headers-legacy'
  | 'positional-type-first'
  | 'positional-stem-first';

export interface ImportColumnLayout {
  format: ImportLayoutFormat;
  dataStartRow: number;
  typeCol?: number;
  categoryCol?: number;
  stemCol?: number;
  optionsCol?: number;
  optionCols: number[];
  answerCol?: number;
  pointsCol?: number;
  explanationCol?: number;
  difficultyCol?: number;
  tagsCol?: number;
  scoringRubricCol?: number;
}

const HEADER_ALIASES: Record<string, keyof Omit<ImportColumnLayout, 'format' | 'dataStartRow' | 'optionCols'>> = {
  type: 'typeCol',
  questiontype: 'typeCol',
  question_type: 'typeCol',
  题型: 'typeCol',
  类型: 'typeCol',

  category: 'categoryCol',
  分类: 'categoryCol',
  类别: 'categoryCol',

  stem: 'stemCol',
  question: 'stemCol',
  题干: 'stemCol',
  题目: 'stemCol',

  options: 'optionsCol',
  option: 'optionsCol',
  选项: 'optionsCol',

  answer: 'answerCol',
  correctanswer: 'answerCol',
  standardanswer: 'answerCol',
  standard_answer: 'answerCol',
  正确答案: 'answerCol',
  答案: 'answerCol',

  points: 'pointsCol',
  point: 'pointsCol',
  score: 'pointsCol',
  分值: 'pointsCol',
  分数: 'pointsCol',

  explanation: 'explanationCol',
  解析: 'explanationCol',

  difficulty: 'difficultyCol',
  难度: 'difficultyCol',

  tags: 'tagsCol',
  标签: 'tagsCol',

  scoringrubric: 'scoringRubricCol',
  scoring_rubric: 'scoringRubricCol',
  rubric: 'scoringRubricCol',
};

const OPTION_LETTER_RE = /^option\s*([a-z])$/i;

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/\s/g, '');
}

export function detectImportLayouts(sheet: ExcelJS.Worksheet): ImportColumnLayout[] {
  const headerRow = sheet.getRow(1);
  const headerCells: Array<{ col: number; norm: string; raw: string }> = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellValueToString(cell.value);
    headerCells.push({ col: colNumber, norm: normalizeHeader(raw), raw });
  });

  const hasHeaderKeywords = headerCells.some(
    (h) => HEADER_ALIASES[h.norm] || OPTION_LETTER_RE.test(h.raw.trim()),
  );

  if (hasHeaderKeywords) {
    const fromHeaders = buildLayoutFromHeaders(headerCells);
    return dedupeLayouts([fromHeaders, buildSyntheticTypeFirstLayout()]);
  }

  return dedupeLayouts([detectPositionalLayout(sheet), buildSyntheticTypeFirstLayout()]);
}

export function detectImportLayout(sheet: ExcelJS.Worksheet): ImportColumnLayout {
  return detectImportLayouts(sheet)[0];
}

function buildSyntheticTypeFirstLayout(): ImportColumnLayout {
  return {
    format: 'headers-type-first',
    dataStartRow: 2,
    typeCol: 1,
    categoryCol: 2,
    stemCol: 3,
    optionsCol: 4,
    answerCol: 5,
    pointsCol: 6,
    explanationCol: 7,
    difficultyCol: 8,
    tagsCol: 9,
    optionCols: [],
  };
}

function dedupeLayouts(layouts: ImportColumnLayout[]): ImportColumnLayout[] {
  const seen = new Set<string>();
  return layouts.filter((layout) => {
    const key = JSON.stringify({
      typeCol: layout.typeCol,
      categoryCol: layout.categoryCol,
      stemCol: layout.stemCol,
      optionsCol: layout.optionsCol,
      optionCols: layout.optionCols,
      answerCol: layout.answerCol,
      pointsCol: layout.pointsCol,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectLayoutForRow(
  row: ExcelJS.Row,
  layouts: ImportColumnLayout[],
): ImportColumnLayout {
  let best = layouts[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const layout of layouts) {
    const fields = extractRowFields(row, layout);
    const score = scoreExtractedFields(fields);
    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }
  }

  return best;
}

function scoreExtractedFields(fields: ExtractedImportRow): number {
  let score = 0;

  if (mapQuestionType(fields.typeRaw)) score += 20;
  else if (inferQuestionType(fields.typeRaw, fields.optionsRaw, 0)) score += 8;

  if (fields.stem && !looksLikeType(fields.stem)) score += 10;
  if (looksLikeType(fields.stem)) score -= 15;

  if (fields.categoryRaw && !mapQuestionType(fields.categoryRaw)) score += 4;
  if (mapQuestionType(fields.categoryRaw)) score -= 8;

  const points = Number(fields.pointsRaw);
  if (points > 0 && points <= 100) score += 5;
  if (fields.answerRaw) score += 3;
  if (fields.optionsRaw) score += 2;

  return score;
}

function buildLayoutFromHeaders(headerCells: Array<{ col: number; norm: string; raw: string }>): ImportColumnLayout {
  const layout: ImportColumnLayout = {
    format: 'headers-type-first',
    dataStartRow: 2,
    optionCols: [],
  };

  for (const header of headerCells) {
    const optionMatch = header.raw.trim().match(OPTION_LETTER_RE);
    if (optionMatch) {
      layout.optionCols.push(header.col);
      continue;
    }

    const field = HEADER_ALIASES[header.norm];
    if (field) {
      layout[field] = header.col;
    }
  }

  layout.optionCols.sort((a, b) => a - b);

  if (layout.typeCol && layout.stemCol && layout.stemCol < layout.typeCol) {
    layout.format = 'headers-stem-first';
  } else if (layout.typeCol && normalizeHeader(headerCells.find((h) => h.col === layout.typeCol)?.raw) === 'questiontype') {
    layout.format = headerCells.some((h) => h.norm === 'stem' && layout.stemCol && h.col < (layout.typeCol ?? 999))
      ? 'headers-stem-first'
      : 'headers-type-first';
  } else if (layout.stemCol === 2 && layout.typeCol === 1) {
    layout.format = 'headers-legacy';
  } else {
    layout.format = 'headers-type-first';
  }

  return layout;
}

function detectPositionalLayout(sheet: ExcelJS.Worksheet): ImportColumnLayout {
  const row = sheet.getRow(1);
  const col1 = cellValueToString(row.getCell(1).value);
  const col2 = cellValueToString(row.getCell(2).value);

  if (looksLikeType(col1)) {
    return {
      format: 'positional-type-first',
      dataStartRow: 1,
      typeCol: 1,
      categoryCol: 2,
      stemCol: 3,
      optionsCol: 4,
      answerCol: 5,
      pointsCol: 6,
      explanationCol: 7,
      difficultyCol: 8,
      tagsCol: 9,
      optionCols: [],
    };
  }

  if (looksLikeType(col2)) {
    return {
      format: 'positional-stem-first',
      dataStartRow: 1,
      stemCol: 1,
      typeCol: 2,
      optionCols: [3, 4, 5, 6],
      answerCol: 7,
      pointsCol: 8,
      explanationCol: 9,
      difficultyCol: 10,
      tagsCol: 11,
    };
  }

  return {
    format: 'positional-type-first',
    dataStartRow: 2,
    typeCol: 1,
    categoryCol: 2,
    stemCol: 3,
    optionsCol: 4,
    answerCol: 5,
    pointsCol: 6,
    explanationCol: 7,
    difficultyCol: 8,
    tagsCol: 9,
    optionCols: [],
  };
}

export function looksLikeType(value: string): boolean {
  const key = value.trim().toLowerCase();
  return [
    'single choice',
    'single_choice',
    'multiple choice',
    'multiple_choice',
    'true/false',
    'true_false',
    'fill-in-blank',
    'fill in blank',
    'fill_blank',
    'short answer',
    'short_answer',
    '单选题',
    '多选题',
    '判断题',
    '填空题',
    '简答题',
  ].includes(key);
}

export interface ExtractedImportRow {
  typeRaw: string;
  categoryRaw: string;
  stem: string;
  optionsRaw: string;
  answerRaw: string;
  pointsRaw: unknown;
  explanation?: string;
  difficultyRaw: string;
  tagsRaw: string;
  scoringRubric?: string;
}

export function extractRowFields(row: ExcelJS.Row, layout: ImportColumnLayout): ExtractedImportRow {
  const get = (col?: number) => (col ? cellValueToString(row.getCell(col).value) : '');
  const getRaw = (col?: number) => (col ? row.getCell(col).value : undefined);

  let optionsRaw = get(layout.optionsCol);
  if (!optionsRaw && layout.optionCols.length > 0) {
    optionsRaw = layout.optionCols
      .map((col) => cellValueToString(row.getCell(col).value))
      .filter(Boolean)
      .join('|');
  }

  return {
    typeRaw: get(layout.typeCol),
    categoryRaw: get(layout.categoryCol),
    stem: get(layout.stemCol),
    optionsRaw,
    answerRaw: get(layout.answerCol),
    pointsRaw: getRaw(layout.pointsCol),
    explanation: get(layout.explanationCol) || undefined,
    difficultyRaw: get(layout.difficultyCol) || 'Medium',
    tagsRaw: get(layout.tagsCol),
    scoringRubric: get(layout.scoringRubricCol) || undefined,
  };
}

export function cellValueToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellValueToString((value as { result: ExcelJS.CellValue }).result);
  }
  return String(value).trim();
}

export function inferQuestionType(typeRaw: string, optionsRaw: string, optionColCount: number): QuestionType | undefined {
  const mapped = mapQuestionType(typeRaw);
  if (mapped) return mapped;
  if (optionColCount >= 2 || optionsRaw.includes('|')) {
    return QuestionType.SINGLE_CHOICE;
  }
  return undefined;
}

export function mapQuestionType(typeRaw: string): QuestionType | undefined {
  const TYPE_MAP: Record<string, QuestionType> = {
    single_choice: QuestionType.SINGLE_CHOICE,
    singlechoice: QuestionType.SINGLE_CHOICE,
    'single choice': QuestionType.SINGLE_CHOICE,
    multiple_choice: QuestionType.MULTIPLE_CHOICE,
    multiplechoice: QuestionType.MULTIPLE_CHOICE,
    'multiple choice': QuestionType.MULTIPLE_CHOICE,
    true_false: QuestionType.TRUE_FALSE,
    truefalse: QuestionType.TRUE_FALSE,
    'true/false': QuestionType.TRUE_FALSE,
    fill_blank: QuestionType.FILL_BLANK,
    fillblank: QuestionType.FILL_BLANK,
    'fill-in-blank': QuestionType.FILL_BLANK,
    'fill in blank': QuestionType.FILL_BLANK,
    'fill in the blank': QuestionType.FILL_BLANK,
    short_answer: QuestionType.SHORT_ANSWER,
    shortanswer: QuestionType.SHORT_ANSWER,
    'short answer': QuestionType.SHORT_ANSWER,
    单选题: QuestionType.SINGLE_CHOICE,
    多选题: QuestionType.MULTIPLE_CHOICE,
    判断题: QuestionType.TRUE_FALSE,
    填空题: QuestionType.FILL_BLANK,
    简答题: QuestionType.SHORT_ANSWER,
    案例分析题: QuestionType.SHORT_ANSWER,
    案例分析: QuestionType.SHORT_ANSWER,
  };

  const key = typeRaw.trim().toLowerCase();
  const compact = key.replace(/[_\s]+/g, ' ').replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim();
  return (
    TYPE_MAP[key] ??
    TYPE_MAP[key.replace(/[_\s]+/g, ' ')] ??
    TYPE_MAP[key.replace(/\s/g, '')] ??
    TYPE_MAP[compact] ??
    TYPE_MAP[compact.replace(/\s/g, '')]
  );
}

export function layoutFormatLabel(format: ImportLayoutFormat): string {
  switch (format) {
    case 'headers-stem-first':
      return 'Stem-first columns (Stem, Question Type, Option A–D, …)';
    case 'headers-type-first':
      return 'Standard columns (Type, Category, Stem, Options, …)';
    case 'headers-legacy':
      return 'Legacy columns (question_type, stem, options, …)';
    case 'positional-stem-first':
      return 'Stem-first without header row';
    default:
      return 'Standard column order';
  }
}
