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
    responsibilities: string | null;
    qualifications: string | null;
    experienceLevel: string;
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
    educationRequirements: Array<{
      level: string;
      fieldOfStudy: string | null;
      importance: string;
      notes: string | null;
    }>;
    experienceRequirements: Array<{
      title: string | null;
      domain: string | null;
      minimumYears: number | { toNumber(): number };
      maximumYears: number | { toNumber(): number } | null;
      importance: string;
      description: string | null;
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

const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  ENTRY: 'Entry-level (0–1 years)',
  JUNIOR: 'Junior (1–3 years)',
  MID: 'Mid-level (3–5 years)',
  SENIOR: 'Senior (5–8 years)',
  LEAD: 'Lead / Principal (8+ years)',
  MANAGER: 'Manager',
  DIRECTOR: 'Director',
  EXECUTIVE: 'Executive / C-level',
  NOT_SPECIFIED: 'Not specified',
};

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  NONE: 'No formal education required',
  SECONDARY: 'Secondary / High School',
  CERTIFICATE: 'Certificate',
  DIPLOMA: 'Diploma',
  ASSOCIATE: "Associate's degree",
  BACHELORS: "Bachelor's degree",
  MASTERS: "Master's degree",
  DOCTORATE: 'Doctorate / PhD',
  PROFESSIONAL: 'Professional degree (MD, JD, etc.)',
  OTHER: 'Other',
};

function toNumber(v: number | { toNumber(): number }): number {
  return typeof v === 'number' ? v : v.toNumber();
}

function formatExperienceRequirements(
  reqs: ApplicationData['job']['experienceRequirements'],
): string {
  if (!reqs || reqs.length === 0) return '';
  return reqs
    .map((r) => {
      const min = toNumber(r.minimumYears);
      const max = r.maximumYears != null ? toNumber(r.maximumYears) : null;
      const years = max != null ? `${min}–${max} years` : `${min}+ years`;
      const domain = r.domain ? ` in ${r.domain}` : '';
      const title = r.title ? ` as ${r.title}` : '';
      const note = r.description ? ` (${r.description})` : '';
      return `${years}${domain}${title}${note} [${r.importance}]`;
    })
    .join('; ');
}

function formatEducationRequirements(
  reqs: ApplicationData['job']['educationRequirements'],
): string {
  if (!reqs || reqs.length === 0) return '';
  return reqs
    .map((r) => {
      const level = EDUCATION_LEVEL_LABELS[r.level] || r.level;
      const field = r.fieldOfStudy ? ` in ${r.fieldOfStudy}` : '';
      const note = r.notes ? ` — ${r.notes}` : '';
      return `${level}${field}${note} [${r.importance}]`;
    })
    .join('; ');
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
    const job = application.job;

    // ── Skills ─────────────────────────────────────────────────────────────
    const requiredSkills: string[] = [];
    const preferredSkills: string[] = [];
    for (const js of job.skills) {
      if (js.importance === 'REQUIRED') requiredSkills.push(js.skill.displayName);
      else if (js.importance === 'PREFERRED') preferredSkills.push(js.skill.displayName);
    }

    // ── Experience requirements ─────────────────────────────────────────────
    const allExpReqs = job.experienceRequirements ?? [];
    const requiredExpReqs = allExpReqs.filter((r) => r.importance === 'REQUIRED');
    const preferredExpReqs = allExpReqs.filter((r) => r.importance !== 'REQUIRED');
    const requiredExperience =
      formatExperienceRequirements(requiredExpReqs) ||
      EXPERIENCE_LEVEL_LABELS[job.experienceLevel] ||
      '';
    const preferredExperience = formatExperienceRequirements(preferredExpReqs);

    // ── Education requirements ──────────────────────────────────────────────
    const allEduReqs = job.educationRequirements ?? [];
    const requiredEduReqs = allEduReqs.filter((r) => r.importance === 'REQUIRED');
    const preferredEduReqs = allEduReqs.filter((r) => r.importance !== 'REQUIRED');
    const requiredEducation = formatEducationRequirements(requiredEduReqs);
    const preferredEducation = formatEducationRequirements(preferredEduReqs);

    // ── Screening Q&A ───────────────────────────────────────────────────────
    const screeningQuestions: ScreeningQuestionAnswer[] = [];
    const answerMap = new Map(application.screeningAnswers.map((a) => [a.questionId, a]));
    for (const q of job.screeningQuestions) {
      const answer = answerMap.get(q.id);
      screeningQuestions.push({
        question: q.question,
        answer: answer?.textAnswer ?? '',
        isRequired: q.required,
      });
    }

    // ── Resume text ─────────────────────────────────────────────────────────
    const redacted = redactResumeText(resumeTextData.parsedText);
    const truncatedResume =
      redacted.length > this.maxResumeChars
        ? redacted.slice(0, this.maxResumeChars) + '\n... [resume truncated]'
        : redacted;

    return Object.freeze({
      applicationId: application.id,
      candidateId: application.candidate.id,
      jobId: job.id,
      companyId: application.companyId,
      jobTitle: job.title,
      jobDescription: job.description || '',
      jobResponsibilities: job.responsibilities || '',
      jobQualifications: job.qualifications || '',
      experienceLevel: EXPERIENCE_LEVEL_LABELS[job.experienceLevel] || job.experienceLevel,
      requiredSkills,
      preferredSkills,
      requiredExperience,
      preferredExperience,
      requiredEducation,
      preferredEducation,
      requiredCertifications: [],
      preferredCertifications: [],
      resumeText: truncatedResume,
      screeningQuestions,
      promptVersion,
    });
  }
}
