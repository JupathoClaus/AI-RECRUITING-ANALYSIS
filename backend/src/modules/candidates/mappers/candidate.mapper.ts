export function mapCandidateToResponse(candidate: any, hasSensitivePermission = false) {
  const result: Record<string, any> = {
    id: candidate.id,
    firstName: candidate.firstName,
    middleName: candidate.middleName,
    lastName: candidate.lastName,
    displayName: `${candidate.firstName} ${candidate.lastName}`,
    city: candidate.city,
    stateOrProvince: candidate.stateOrProvince,
    countryCode: candidate.countryCode,
    headline: candidate.headline,
    currentJobTitle: candidate.currentJobTitle,
    currentEmployer: candidate.currentEmployer,
    totalExperienceYears: candidate.totalExperienceYears
      ? Number(candidate.totalExperienceYears)
      : null,
    preferredLocale: candidate.preferredLocale,
    status: candidate.status,
    source: candidate.source,
    skillSummary: (candidate.skills || []).slice(0, 5).map((s: any) => ({
      id: s.id,
      skillId: s.skillId,
      name: s.skill?.displayName,
      proficiencyLevel: s.proficiencyLevel,
    })),
    preferredInterviewLanguage:
      (candidate.languages || []).find((l: any) => l.preferredInterviewLanguage)?.languageCode ??
      null,
    screening: candidate.screeningSummary ?? null,
    companyProfile: (() => {
      const companyCandidate = (candidate.companyCandidates || [])[0];
      if (!companyCandidate) return undefined;
      const rating = Number(companyCandidate.rating);
      return { rating: Number.isFinite(rating) ? rating : 0 };
    })(),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    version: candidate.version,
  };

  if (hasSensitivePermission) {
    result.email = candidate.email;
    result.phone = candidate.phone;
  }

  return result;
}

export function mapCandidateToDetail(candidate: any, hasSensitivePermission = false) {
  const result: Record<string, any> = {
    id: candidate.id,
    firstName: candidate.firstName,
    middleName: candidate.middleName,
    lastName: candidate.lastName,
    displayName: `${candidate.firstName} ${candidate.lastName}`,
    city: candidate.city,
    stateOrProvince: candidate.stateOrProvince,
    countryCode: candidate.countryCode,
    postalCode: candidate.postalCode,
    headline: candidate.headline,
    summary: candidate.summary,
    currentJobTitle: candidate.currentJobTitle,
    currentEmployer: candidate.currentEmployer,
    totalExperienceYears: candidate.totalExperienceYears
      ? Number(candidate.totalExperienceYears)
      : null,
    preferredLocale: candidate.preferredLocale,
    timezone: candidate.timezone,
    status: candidate.status,
    source: candidate.source,
    sourceDetail: candidate.sourceDetail,
    linkedInUrl: candidate.linkedInUrl,
    portfolioUrl: candidate.portfolioUrl,
    personalWebsiteUrl: candidate.personalWebsiteUrl,
    willingToRelocate: candidate.willingToRelocate,
    remoteWorkPreference: candidate.remoteWorkPreference,
    noticePeriodDays: candidate.noticePeriodDays,
    availableFrom: candidate.availableFrom,
    lastProfileUpdatedAt: candidate.lastProfileUpdatedAt,
    version: candidate.version,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    skills: (candidate.skills || []).map((s: any) => ({
      id: s.id,
      skillId: s.skillId,
      name: s.skill?.displayName,
      type: s.skill?.type,
      proficiencyLevel: s.proficiencyLevel,
      yearsOfExperience: s.yearsOfExperience ? Number(s.yearsOfExperience) : null,
      verified: s.verified,
    })),
    employment: (candidate.employmentRecords || []).map((e: any) => ({
      id: e.id,
      type: e.type,
      companyName: e.companyName,
      jobTitle: e.jobTitle,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      currentlyWorking: e.currentlyWorking,
      description: e.description,
      sortOrder: e.sortOrder,
    })),
    education: (candidate.educationRecords || []).map((e: any) => ({
      id: e.id,
      institution: e.institution,
      level: e.level,
      fieldOfStudy: e.fieldOfStudy,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      grade: e.grade,
      sortOrder: e.sortOrder,
    })),
    certifications: (candidate.certifications || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      issuingOrganization: c.issuingOrganization,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      credentialId: c.credentialId,
    })),
    languages: (candidate.languages || []).map((l: any) => ({
      id: l.id,
      languageCode: l.languageCode,
      proficiency: l.proficiency,
      preferredInterviewLanguage: l.preferredInterviewLanguage,
    })),
    consents: (candidate.consents || []).map((c: any) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      policyVersion: c.policyVersion,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
      createdAt: c.createdAt,
    })),
    mergeStatus:
      candidate.status === 'MERGED'
        ? {
            mergedIntoCandidateId: candidate.mergedIntoCandidateId,
          }
        : null,
  };

  if (hasSensitivePermission) {
    result.email = candidate.email;
    result.phone = candidate.phone;
    result.alternatePhone = candidate.alternatePhone;
    result.dateOfBirth = candidate.dateOfBirth;
    result.salaryExpectationMin = candidate.salaryExpectationMin
      ? Number(candidate.salaryExpectationMin)
      : null;
    result.salaryExpectationMax = candidate.salaryExpectationMax
      ? Number(candidate.salaryExpectationMax)
      : null;
    result.salaryCurrency = candidate.salaryCurrency;
  }

  return result;
}
