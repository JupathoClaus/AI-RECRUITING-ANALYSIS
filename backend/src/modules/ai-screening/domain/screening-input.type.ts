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
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredExperience: string;
  preferredExperience: string;
  requiredEducation: string;
  preferredEducation: string;
  requiredCertifications: string[];
  preferredCertifications: string[];
  resumeText: string;
  screeningQuestions: ScreeningQuestionAnswer[];
  promptVersion?: string;
}
