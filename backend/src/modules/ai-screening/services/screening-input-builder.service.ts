import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScreeningInput, ScreeningQuestionAnswer } from '../domain/screening-input.type';
import { redactResumeText } from '../utils/resume-redaction';
import { CompletedExtraction } from './resume-text-loader.service';

export interface ApplicationData {
  id: string;
  companyId: string;
  job: {
    id: string;
    title: string;
    description: string;
    qualifications: string | null;
    updatedAt: Date;
    skills: Array<{
      skill: { displayName: string };
      importance: string;
    }>;
    screeningQuestions: Array<{
      id: string;
      question: string;
      required: boolean;
    }>;
  };
  candidate: {
    id: string;
  };
  screeningAnswers: Array<{
    questionId: string;
    question: { question: string; required: boolean };
    textAnswer: string | null;
  }>;
}

@Injectable()
export class ScreeningInputBuilderService {
  private readonly maxResumeChars: number;

  constructor(configService: ConfigService) {
    this.maxResumeChars = configService.get<number>('aiScreening.maxResumeChars') || 15000;
  }

  build(
    application: ApplicationData,
    resumeTextData: CompletedExtraction,
    promptVersion: string = 'v1',
  ): ScreeningInput {
    const requiredSkills: string[] = [];
    const preferredSkills: string[] = [];

    for (const js of application.job.skills) {
      if (js.importance === 'REQUIRED' || js.importance === 'PREFERRED') {
        const bucket = js.importance === 'REQUIRED' ? requiredSkills : preferredSkills;
        bucket.push(js.skill.displayName);
      }
    }

    const screeningQuestions: ScreeningQuestionAnswer[] = [];
    const answerMap = new Map(application.screeningAnswers.map((a) => [a.questionId, a]));
    for (const q of application.job.screeningQuestions) {
      const answer = answerMap.get(q.id);
      screeningQuestions.push({
        question: q.question,
        answer: answer?.textAnswer ?? '',
        isRequired: q.required,
      });
    }

    const redacted = redactResumeText(resumeTextData.parsedText);

    const truncatedResume =
      redacted.length > this.maxResumeChars
        ? redacted.slice(0, this.maxResumeChars) + '\n... [resume truncated]'
        : redacted;

    return Object.freeze({
      applicationId: application.id,
      candidateId: application.candidate.id,
      jobId: application.job.id,
      companyId: application.companyId,
      jobTitle: application.job.title,
      jobDescription: application.job.description || application.job.qualifications || '',
      requiredSkills,
      preferredSkills,
      requiredExperience: '',
      preferredExperience: '',
      requiredEducation: '',
      preferredEducation: '',
      requiredCertifications: [],
      preferredCertifications: [],
      resumeText: truncatedResume,
      screeningQuestions,
      promptVersion,
    });
  }
}
