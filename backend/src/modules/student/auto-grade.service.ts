import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, ExamStatus, PassResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';

const OBJECTIVE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);
const SUBJECTIVE_TYPES = new Set(['FILL_BLANK', 'SHORT_ANSWER']);

interface QuestionSnapshot {
  type: string;
  standardAnswerJson?: {
    key?: string;
    keys?: string[];
    answers?: string[];
    reference?: string;
  };
}

interface CandidateAnswer {
  key?: string;
  keys?: string[];
  answers?: string[];
  text?: string;
}

export interface AutoGradeResult {
  attemptId: string;
  examId: string;
  objectiveScore: number;
  hasSubjective: boolean;
  status: AttemptStatus;
  statusLabel: 'completed' | 'pending_manual';
  result: PassResult;
  gradedObjectiveCount: number;
  subjectiveCount: number;
  idempotent: boolean;
}

@Injectable()
export class AutoGradeService {
  constructor(private prisma: PrismaService) {}

  isObjectiveType(type: string): boolean {
    return OBJECTIVE_TYPES.has(type);
  }

  isSubjectiveType(type: string): boolean {
    return SUBJECTIVE_TYPES.has(type);
  }

  /** All-or-nothing: full points only when exactly correct. */
  isCorrect(
    questionType: string,
    standardAnswer: QuestionSnapshot['standardAnswerJson'],
    candidateAnswer: unknown,
  ): boolean {
    if (!standardAnswer) return false;
    const answer = (candidateAnswer ?? {}) as CandidateAnswer;

    if (questionType === 'SINGLE_CHOICE' || questionType === 'TRUE_FALSE') {
      return Boolean(answer.key) && answer.key === standardAnswer.key;
    }

    if (questionType === 'MULTIPLE_CHOICE') {
      const expected = [...(standardAnswer.keys ?? [])].sort().join(',');
      const actual = [...(answer.keys ?? [])].sort().join(',');
      return expected.length > 0 && expected === actual;
    }

    return false;
  }

  scoreObjective(
    questionType: string,
    standardAnswer: QuestionSnapshot['standardAnswerJson'],
    candidateAnswer: unknown,
    maxScore: number,
  ): number {
    return this.isCorrect(questionType, standardAnswer, candidateAnswer) ? maxScore : 0;
  }

  /**
   * Auto-grade an attempt's objective questions. Idempotent: safe to call multiple times.
   */
  async autoGradeAttempt(attemptId: string, examId?: string): Promise<AutoGradeResult> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { paper: { include: { paperQuestions: true } } } },
        answerRecords: true,
        scoreRecord: true,
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (examId && attempt.examId !== examId) {
      throw new NotFoundException('Attempt does not belong to this exam');
    }

    const existing = attempt.scoreRecord;
    if (existing && (attempt.status === 'GRADING' || attempt.status === 'COMPLETED')) {
      return this.buildResultFromExisting(attempt, true);
    }

    if (attempt.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'Attempt must be submitted before auto-grading (expected status SUBMITTED)',
      );
    }

    const scoreMap = new Map(
      attempt.exam.paper.paperQuestions.map((pq) => [pq.questionId, Number(pq.score)]),
    );

    let objectiveScore = 0;
    let hasSubjective = false;
    let gradedObjectiveCount = 0;
    let subjectiveCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const record of attempt.answerRecords) {
        const snapshot = record.questionSnapshotJson as unknown as QuestionSnapshot;
        const qType = snapshot.type;
        const maxScore = scoreMap.get(record.questionId) ?? 0;

        if (this.isSubjectiveType(qType)) {
          hasSubjective = true;
          subjectiveCount += 1;
          await tx.answerRecord.update({
            where: { id: record.id },
            data: {
              autoScore: null,
              finalScore: null,
              reviewStatus: 'PENDING',
            },
          });
          continue;
        }

        if (!this.isObjectiveType(qType)) {
          continue;
        }

        const autoScore = this.scoreObjective(
          qType,
          snapshot.standardAnswerJson,
          record.answerContentJson,
          maxScore,
        );
        objectiveScore += autoScore;
        gradedObjectiveCount += 1;

        await tx.answerRecord.update({
          where: { id: record.id },
          data: {
            autoScore,
            finalScore: autoScore,
            reviewStatus: 'APPROVED',
          },
        });
      }

      const status: AttemptStatus = hasSubjective ? 'GRADING' : 'COMPLETED';
      const passScore = Number(attempt.exam.passScore);
      const result: PassResult = hasSubjective
        ? 'PENDING'
        : objectiveScore >= passScore
          ? 'PASS'
          : 'FAIL';

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { status },
      });

      const publishResults = !hasSubjective && result !== 'PENDING';
      await tx.scoreRecord.upsert({
        where: { attemptId },
        create: {
          attemptId,
          userId: attempt.userId,
          objectiveScore,
          subjectiveScore: 0,
          totalScore: objectiveScore,
          passScore: attempt.exam.passScore,
          result,
          ...(publishResults ? { publishedAt: new Date(), reviewedAt: new Date() } : {}),
        },
        update: {
          objectiveScore,
          subjectiveScore: 0,
          totalScore: objectiveScore,
          result,
          ...(publishResults ? { publishedAt: new Date(), reviewedAt: new Date() } : {}),
        },
      });

      const examStatus: ExamStatus = hasSubjective ? 'PENDING_GRADING' : 'COMPLETED';
      await tx.exam.update({
        where: { id: attempt.examId },
        data: { status: examStatus },
      });
    });

    return {
      attemptId,
      examId: attempt.examId,
      objectiveScore,
      hasSubjective,
      status: hasSubjective ? 'GRADING' : 'COMPLETED',
      statusLabel: hasSubjective ? 'pending_manual' : 'completed',
      result: hasSubjective
        ? 'PENDING'
        : objectiveScore >= Number(attempt.exam.passScore)
          ? 'PASS'
          : 'FAIL',
      gradedObjectiveCount,
      subjectiveCount,
      idempotent: false,
    };
  }

  private buildResultFromExisting(
    attempt: Prisma.ExamAttemptGetPayload<{
      include: { exam: true; scoreRecord: true; answerRecords: true };
    }>,
    idempotent: boolean,
  ): AutoGradeResult {
    const score = attempt.scoreRecord!;
    const subjectiveCount = attempt.answerRecords.filter((r) =>
      this.isSubjectiveType((r.questionSnapshotJson as unknown as QuestionSnapshot).type),
    ).length;
    const gradedObjectiveCount = attempt.answerRecords.filter((r) =>
      this.isObjectiveType((r.questionSnapshotJson as unknown as QuestionSnapshot).type),
    ).length;

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      objectiveScore: Number(score.objectiveScore),
      hasSubjective: subjectiveCount > 0,
      status: attempt.status,
      statusLabel: attempt.status === 'GRADING' ? 'pending_manual' : 'completed',
      result: score.result,
      gradedObjectiveCount,
      subjectiveCount,
      idempotent,
    };
  }
}
