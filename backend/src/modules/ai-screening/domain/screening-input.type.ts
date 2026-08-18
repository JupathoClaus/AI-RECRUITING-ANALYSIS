import { ScreeningCriterion } from './screening-criterion.type';
import { ExperienceDurationResult } from '../services/experience-duration.service';

export interface ScreeningQuestionAnswer {
  question: string;
  answer: string;
  isRequired: boolean;
}

export interface ScreeningInput {
  applicationId: string;
  candidateId: string;
  jobId: string;
  companyId: string;
  jobTitle: string;
  /** Full job description text */
  jobDescription: string;
  /** Responsibilities section from the job posting */
  jobResponsibilities: string;
  /** Qualifications / requirements section */
  jobQualifications: string;
  /** Enum label for the seniority level expected (e.g. "Senior", "Mid-level") */
  experienceLevel: string;
  requiredSkills: string[];
  preferredSkills: string[];
  /** Human-readable experience requirements, e.g. "Minimum 5 years in backend engineering" */
  requiredExperience: string;
  preferredExperience: string;
  /** Human-readable education requirements, e.g. "Bachelor's in Computer Science or equivalent" */
  requiredEducation: string;
  preferredEducation: string;
  requiredCertifications: string[];
  preferredCertifications: string[];
  resumeText: string;
  screeningQuestions: ScreeningQuestionAnswer[];
  promptVersion?: string;

  /**
   * Structured job criteria built by CriterionBuilderService.
   * Present when using the Qwen provider for criterion-level reasoning.
   * Legacy providers (mock, openai, deepseek) ignore this field.
   */
  criteria?: ScreeningCriterion[];

  /**
   * Deterministic employment-duration estimate computed by
   * ExperienceDurationService from the resume's date ranges.
   * Present for the Qwen provider; the model is shown it as context and
   * the backend uses it to cap FULLY_MET claims on experience criteria.
   */
  experienceDuration?: ExperienceDurationResult;
}
