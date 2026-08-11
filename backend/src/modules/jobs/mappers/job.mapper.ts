export function toJobResponse(job: Record<string, unknown>) {
  const { deletedAt, companyId, ...safe } = job;
  return safe;
}

export function toJobListResponse(job: Record<string, unknown>) {
  return {
    id: job.id,
    jobCode: job.jobCode,
    title: job.title,
    slug: job.slug,
    department: job.department || null,
    location: job.location || null,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceLevel: job.experienceLevel,
    status: job.status,
    visibility: job.visibility,
    approvalStatus: job.approvalStatus,
    publicationStatus: job.publicationStatus,
    numberOfOpenings: job.numberOfOpenings,
    salaryCurrency: job.salaryCurrency,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryVisible: job.salaryVisible,
    applicationDeadline: job.applicationDeadline,
    owner: job.ownerMembership
      ? {
          id: (job.ownerMembership as Record<string, unknown>).id,
          user: (job.ownerMembership as Record<string, unknown>).user,
        }
      : null,
    collaboratorCount: Array.isArray(job.collaborators)
      ? (job.collaborators as unknown[]).length
      : 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    publishedAt: job.publishedAt,
    applicantCount: 0,
  };
}

export function toPublicJobResponse(job: Record<string, unknown>) {
  return {
    id: job.id,
    jobCode: job.jobCode,
    title: job.title,
    slug: job.slug,
    department: job.department || null,
    location: job.location || null,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceLevel: job.experienceLevel,
    description: job.description,
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    benefits: job.benefits,
    salaryCurrency: job.salaryCurrency,
    salaryMin: (job as Record<string, unknown>).salaryVisible ? job.salaryMin : undefined,
    salaryMax: (job as Record<string, unknown>).salaryVisible ? job.salaryMax : undefined,
    applicationDeadline: job.applicationDeadline,
    expectedStartDate: job.expectedStartDate,
    numberOfOpenings: job.numberOfOpenings,
    createdAt: job.createdAt,
    publishedAt: job.publishedAt,
    accessibility: job.accessibilityConfig
      ? {
          accommodationsSupported: (job.accessibilityConfig as Record<string, unknown>)
            .accommodationsSupported,
          remoteAccommodationAvailable: (job.accessibilityConfig as Record<string, unknown>)
            .remoteAccommodationAvailable,
          signLanguageInterpreterAvailable: (job.accessibilityConfig as Record<string, unknown>)
            .signLanguageInterpreterAvailable,
          alternativeInterviewFormatAvailable: (job.accessibilityConfig as Record<string, unknown>)
            .alternativeInterviewFormatAvailable,
          screenReaderCompatibleAssessmentRequired: (
            job.accessibilityConfig as Record<string, unknown>
          ).screenReaderCompatibleAssessmentRequired,
        }
      : null,
  };
}
