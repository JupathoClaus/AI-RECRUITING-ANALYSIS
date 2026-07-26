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
  resumeText: string;
}

export function buildScreeningInput(params: {
  applicationId: string;
  candidateId: string;
  jobId: string;
  companyId: string;
  job: { title: string; description: string; qualifications?: string | null };
  requiredSkills: string[];
  preferredSkills: string[];
  requiredExperience: string;
  preferredExperience: string;
  requiredEducation: string;
  resumeText: string;
}): ScreeningInput {
  return {
    applicationId: params.applicationId,
    candidateId: params.candidateId,
    jobId: params.jobId,
    companyId: params.companyId,
    jobTitle: params.job.title,
    jobDescription: params.job.description,
    requiredSkills: params.requiredSkills,
    preferredSkills: params.preferredSkills,
    requiredExperience: params.requiredExperience,
    preferredExperience: params.preferredExperience,
    requiredEducation: params.requiredEducation,
    resumeText: params.resumeText,
  };
}
