import type { ExamQuestion } from '@/api/candidate';

export type PaletteStatus = 'unvisited' | 'answered' | 'marked' | 'answered-marked';

export function blankCountFromStem(stem: string): number {
  const matches = stem.match(/_{3,}|\[\s*blank\s*\]|\{\{\s*\d+\s*\}\}/gi);
  return Math.max(1, matches?.length ?? 1);
}

export function isAnswerFilled(type: string, content: Record<string, unknown> | null | undefined): boolean {
  if (!content) return false;
  if (type === 'MULTIPLE_CHOICE') {
    return Array.isArray(content.keys) && content.keys.length > 0;
  }
  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
    return typeof content.key === 'string' && content.key.length > 0;
  }
  if (type === 'FILL_BLANK') {
    const answers = content.answers as string[] | undefined;
    return Array.isArray(answers) && answers.some((a) => a.trim().length > 0);
  }
  if (type === 'SHORT_ANSWER') {
    return typeof content.text === 'string' && content.text.trim().length > 0;
  }
  return false;
}

export function paletteStatus(
  visited: boolean,
  answered: boolean,
  marked: boolean,
): PaletteStatus {
  if (answered && marked) return 'answered-marked';
  if (marked) return 'marked';
  if (answered) return 'answered';
  if (!visited) return 'unvisited';
  return 'unvisited';
}

export function buildDefaultAnswer(type: string, stem: string): Record<string, unknown> {
  if (type === 'MULTIPLE_CHOICE') return { keys: [] };
  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') return { key: '' };
  if (type === 'FILL_BLANK') {
    return { answers: Array.from({ length: blankCountFromStem(stem) }, () => '') };
  }
  return { text: '' };
}

export function initAnswerState(questions: ExamQuestion[]) {
  const answers: Record<string, Record<string, unknown>> = {};
  const marked: Record<string, boolean> = {};
  const visited = new Set<number>();

  questions.forEach((q, index) => {
    answers[q.id] = (q.answerContent as Record<string, unknown> | null) ?? buildDefaultAnswer(q.type, q.stem);
    marked[q.id] = q.markedForReview;
    if (q.answered || q.answerContent) visited.add(index);
  });

  return { answers, marked, visited };
}

export function buildSavePayload(
  questions: ExamQuestion[],
  answers: Record<string, Record<string, unknown>>,
  marked: Record<string, boolean>,
) {
  return questions.map((q) => ({
    questionId: q.id,
    answerContent: answers[q.id] ?? buildDefaultAnswer(q.type, q.stem),
    markedForReview: marked[q.id] ?? false,
  }));
}

export function countAnswered(
  questions: ExamQuestion[],
  answers: Record<string, Record<string, unknown>>,
): number {
  return questions.filter((q) => isAnswerFilled(q.type, answers[q.id])).length;
}
