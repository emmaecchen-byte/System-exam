import { randomInt } from 'crypto';

/** Fisher–Yates shuffle using cryptographically secure random indices. */
export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface QuestionOptionLike {
  key: string;
  [key: string]: unknown;
}

export function applyOptionKeyOrder(
  options: unknown,
  orderedKeys?: string[],
): unknown {
  if (!orderedKeys?.length || !Array.isArray(options)) return options;
  const byKey = new Map(
    (options as QuestionOptionLike[]).map((opt) => [opt.key, opt]),
  );
  return orderedKeys.map((key) => byKey.get(key)).filter(Boolean);
}

export function buildAttemptDisplayOrder(
  paperQuestions: Array<{
    questionId: string;
    sortOrder: number;
    questionSnapshotJson: unknown;
  }>,
  randomQuestionOrder: boolean,
  randomOptionOrder: boolean,
): {
  questionOrderJson: string[];
  optionOrdersJson: Record<string, string[]>;
} {
  const sorted = [...paperQuestions].sort((a, b) => a.sortOrder - b.sortOrder);
  const questionOrderJson = randomQuestionOrder
    ? shuffleArray(sorted.map((pq) => pq.questionId))
    : sorted.map((pq) => pq.questionId);

  const optionOrdersJson: Record<string, string[]> = {};
  if (randomOptionOrder) {
    for (const pq of sorted) {
      const snapshot = pq.questionSnapshotJson as { optionsJson?: unknown; type?: string };
      const options = snapshot.optionsJson;
      if (!Array.isArray(options) || options.length === 0) continue;
      const keys = (options as QuestionOptionLike[])
        .map((opt) => opt.key)
        .filter(Boolean);
      if (keys.length > 0) {
        optionOrdersJson[pq.questionId] = shuffleArray(keys);
      }
    }
  }

  return { questionOrderJson, optionOrdersJson };
}
