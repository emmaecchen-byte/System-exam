export interface AnswerOption {
  key: string;
  label?: string;
  text?: string;
}

export interface AnswerQuestionSnapshot {
  type: string;
  stem: string;
  optionsJson?: AnswerOption[];
  standardAnswerJson?: {
    key?: string;
    keys?: string[];
    answers?: string[];
    reference?: string;
    text?: string;
  };
  scoringRubric?: string;
}

function optionText(opt: AnswerOption): string {
  return opt.label ?? opt.text ?? opt.key;
}

export function formatAnswerContent(type: string, content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const answer = content as Record<string, unknown>;
  if (type === 'FILL_BLANK') {
    const answers = answer.answers as string[] | undefined;
    return Array.isArray(answers) ? answers.filter(Boolean).join(' | ') : '';
  }
  if (type === 'SHORT_ANSWER') return typeof answer.text === 'string' ? answer.text : '';
  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') return String(answer.key ?? '');
  if (type === 'MULTIPLE_CHOICE') {
    return Array.isArray(answer.keys) ? answer.keys.join(', ') : '';
  }
  return JSON.stringify(content);
}

export function formatStandardAnswerText(snapshot: AnswerQuestionSnapshot): string {
  const std = snapshot.standardAnswerJson;
  if (!std) return '';
  if (snapshot.type === 'FILL_BLANK' && Array.isArray(std.answers)) {
    return std.answers.join(' or ');
  }
  if (snapshot.type === 'SHORT_ANSWER') {
    return String(std.reference ?? std.text ?? '');
  }
  if (snapshot.type === 'MULTIPLE_CHOICE' && Array.isArray(std.keys)) {
    return std.keys.join(', ');
  }
  return String(std.key ?? '');
}

export function resolveChoiceLabels(
  snapshot: AnswerQuestionSnapshot,
  keyOrKeys: string,
): string {
  const options = snapshot.optionsJson ?? [];
  if (snapshot.type === 'MULTIPLE_CHOICE') {
    return keyOrKeys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((key) => {
        const opt = options.find((o) => o.key === key);
        return opt ? `${key}. ${optionText(opt)}` : key;
      })
      .join('; ');
  }
  const opt = options.find((o) => o.key === keyOrKeys);
  return opt ? `${keyOrKeys}. ${optionText(opt)}` : keyOrKeys;
}

export function formatAnswerForDisplay(
  snapshot: AnswerQuestionSnapshot,
  content: unknown,
): string {
  const raw = formatAnswerContent(snapshot.type, content);
  if (
    snapshot.type === 'SINGLE_CHOICE' ||
    snapshot.type === 'TRUE_FALSE' ||
    snapshot.type === 'MULTIPLE_CHOICE'
  ) {
    return raw ? resolveChoiceLabels(snapshot, raw) : '(No answer)';
  }
  return raw || '(No answer)';
}

export function formatCorrectAnswerForDisplay(snapshot: AnswerQuestionSnapshot): string {
  const raw = formatStandardAnswerText(snapshot);
  if (
    snapshot.type === 'SINGLE_CHOICE' ||
    snapshot.type === 'TRUE_FALSE' ||
    snapshot.type === 'MULTIPLE_CHOICE'
  ) {
    return raw ? resolveChoiceLabels(snapshot, raw) : '';
  }
  return raw;
}
