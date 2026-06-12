import { Injectable, Logger } from '@nestjs/common';
import {
  extractKeywords,
  SubjectiveGradeResult,
} from '../../common/utils/keyword-grade.util';
import { getDeepSeekConfig, isDeepSeekConfigured } from '../../config/deepseek.config';

export interface DeepSeekGradeInput {
  questionStem: string;
  maxScore: number;
  referenceAnswer?: string;
  scoringRubric?: string;
  keywords?: string[];
  candidateAnswer: string;
}

interface DeepSeekGradeResponse {
  score?: number;
  matchedKeywords?: string[];
  rationale?: string;
  isCorrect?: boolean;
}

@Injectable()
export class DeepSeekGradingService {
  private readonly logger = new Logger(DeepSeekGradingService.name);

  isConfigured(): boolean {
    return isDeepSeekConfigured();
  }

  async gradeShortAnswer(input: DeepSeekGradeInput): Promise<SubjectiveGradeResult | null> {
    if (!this.isConfigured()) return null;

    const config = getDeepSeekConfig();
    const keywords =
      input.keywords && input.keywords.length > 0
        ? input.keywords
        : extractKeywords(input.scoringRubric, input.referenceAnswer);

    const candidateText = input.candidateAnswer.trim();
    if (!candidateText) {
      return {
        gradable: true,
        score: 0,
        matchedKeywords: [],
        requiredKeywords: keywords,
        matchRatio: 0,
        rationale: 'No written response submitted.',
        autoApproved: true,
      };
    }

    if (!keywords.length && !input.referenceAnswer?.trim() && !input.scoringRubric?.trim()) {
      return null;
    }

    const prompt = this.buildPrompt(input, keywords);
    const url = `${config.baseUrl}/v1/chat/completions`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You grade exam short-answer responses. Detect required keywords/concepts in the student answer. ' +
                'Score from 0 to maxScore (inclusive). Full credit when all required keywords are present and the answer is substantively correct. ' +
                'Partial credit proportional to matched keywords when appropriate. Reply with JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`DeepSeek API error ${response.status}: ${body.slice(0, 300)}`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn('DeepSeek returned empty completion content');
        return null;
      }

      return this.parseGradeResponse(content, input.maxScore, keywords);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`DeepSeek grading failed: ${message}`);
      return null;
    }
  }

  private buildPrompt(input: DeepSeekGradeInput, keywords: string[]): string {
    return [
      `Question: ${input.questionStem || '(not provided)'}`,
      `Maximum score: ${input.maxScore}`,
      input.referenceAnswer ? `Reference answer: ${input.referenceAnswer}` : null,
      input.scoringRubric ? `Scoring rubric: ${input.scoringRubric}` : null,
      keywords.length ? `Required keywords (must detect in response): ${keywords.join(', ')}` : null,
      `Student answer: ${input.candidateAnswer}`,
      '',
      'Return JSON with keys: score (number), matchedKeywords (string[]), isCorrect (boolean), rationale (string, one sentence).',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseGradeResponse(
    content: string,
    maxScore: number,
    requiredKeywords: string[],
  ): SubjectiveGradeResult | null {
    const parsed = this.extractJson(content);
    if (!parsed) return null;

    const rawScore = Number(parsed.score);
    const score = Number.isFinite(rawScore)
      ? Math.round(Math.min(maxScore, Math.max(0, rawScore)) * 100) / 100
      : 0;
    const matchedKeywords = Array.isArray(parsed.matchedKeywords)
      ? parsed.matchedKeywords.filter((k): k is string => typeof k === 'string')
      : [];
    const rationale =
      typeof parsed.rationale === 'string' && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : parsed.isCorrect
          ? 'Response meets grading criteria.'
          : 'Response does not fully meet grading criteria.';
    const matchRatio =
      requiredKeywords.length > 0 ? matchedKeywords.length / requiredKeywords.length : score / maxScore || 0;
    const autoApproved =
      typeof parsed.isCorrect === 'boolean'
        ? parsed.isCorrect
        : requiredKeywords.length > 0
          ? matchedKeywords.length === requiredKeywords.length
          : score >= maxScore;

    return {
      gradable: true,
      score,
      matchedKeywords,
      requiredKeywords,
      matchRatio: Math.min(1, matchRatio),
      rationale,
      autoApproved,
    };
  }

  private extractJson(content: string): DeepSeekGradeResponse | null {
    const trimmed = content.trim();
    try {
      return JSON.parse(trimmed) as DeepSeekGradeResponse;
    } catch {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced?.[1]) {
        try {
          return JSON.parse(fenced[1].trim()) as DeepSeekGradeResponse;
        } catch {
          return null;
        }
      }
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1)) as DeepSeekGradeResponse;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
