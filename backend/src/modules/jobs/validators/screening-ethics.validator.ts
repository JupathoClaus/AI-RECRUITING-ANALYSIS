import { BadRequestException, Injectable } from '@nestjs/common';
import { JobScreeningConfiguration } from '@prisma/client';
import { CreateScreeningQuestionDto } from '../dto/create-screening-question.dto';

export interface ValidationWarning {
  field: string;
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  requiresHumanReview: boolean;
}

const protectedCriteriaPatterns = [
  { keywords: ['race', 'racial', 'ethnic', 'ethnicity'], category: 'race/ethnicity' },
  { keywords: ['religion', 'religious', 'creed', 'faith', 'spiritual'], category: 'religion' },
  {
    keywords: [
      'gender',
      'sex',
      'male',
      'female',
      'man',
      'woman',
      'transgender',
      'non-binary',
      'nonbinary',
    ],
    category: 'gender',
  },
  {
    keywords: ['pregnancy', 'pregnant', 'maternity', 'parental leave', 'family status'],
    category: 'pregnancy/family',
  },
  {
    keywords: ['marital', 'married', 'single', 'divorced', 'widowed', 'spouse'],
    category: 'marital status',
  },
  { keywords: ['age', 'too old', 'too young', 'young', 'old'], category: 'age' },
  {
    keywords: ['disability', 'disabled', 'handicap', 'impaired', 'blind', 'deaf'],
    category: 'disability',
  },
  {
    keywords: ['facial', 'attractiveness', 'handsome', 'beautiful', 'ugly', 'looks'],
    category: 'physical appearance',
  },
  { keywords: ['voice', 'accent', 'dialect', 'pronunciation'], category: 'voice/accent' },
  {
    keywords: ['medical', 'health', 'illness', 'disease', 'condition', 'genetic', 'dna'],
    category: 'medical information',
  },
  { keywords: ['height', 'weight', 'bmi', 'body'], category: 'physical characteristics' },
  {
    keywords: ['sexual', 'orientation', 'lgbt', 'lgbtq', 'gay', 'lesbian'],
    category: 'sexual orientation',
  },
  { keywords: ['political', 'party', 'affiliation', 'opinion'], category: 'political opinion' },
  { keywords: ['union', 'membership', 'trade union', 'labor union'], category: 'union membership' },
  { keywords: ['veteran', 'military service', 'military discharge'], category: 'veteran status' },
  {
    keywords: ['social class', 'caste', 'socioeconomic', 'economic status', 'poverty'],
    category: 'social class',
  },
  {
    keywords: ['address', 'neighborhood', 'zip code', 'postal code', 'live in', 'reside'],
    category: 'residential location',
  },
  {
    keywords: ['photo', 'picture', 'headshot', 'selfie', 'image of you', 'upload your photo'],
    category: 'photo requirement',
  },
];

const positiveDisabilityPatterns = [
  {
    keywords: ['reasonable accommodation', 'accommodation needed', 'accessibility requirement'],
    category: 'reasonable accommodation',
  },
  {
    keywords: ['minimum age', 'at least', 'minimum requirement', 'legally required'],
    category: 'lawful minimum age',
  },
];

@Injectable()
export class ScreeningEthicsValidator {
  validateProhibitedCriteria(questions: CreateScreeningQuestionDto[]): ValidationResult {
    const warnings: ValidationWarning[] = [];

    for (const question of questions) {
      const lowerQuestion = question.question.toLowerCase();

      for (const pattern of protectedCriteriaPatterns) {
        for (const keyword of pattern.keywords) {
          if (lowerQuestion.includes(keyword)) {
            const isExempt =
              pattern.category === 'disability' &&
              positiveDisabilityPatterns.some((p) =>
                p.keywords.some((k) => lowerQuestion.includes(k)),
              );

            if (isExempt) continue;

            const isAgeExempt =
              pattern.category === 'age' &&
              (lowerQuestion.includes('minimum age') ||
                lowerQuestion.includes('at least') ||
                lowerQuestion.includes('legally required'));

            if (isAgeExempt) continue;

            const diagnosisContext =
              lowerQuestion.includes('accommodation') ||
              lowerQuestion.includes('support') ||
              lowerQuestion.includes('accessibility');

            if (diagnosisContext && pattern.category === 'disability') {
              warnings.push({
                field: `question: "${question.question.substring(0, 50)}..."`,
                message: `Question references "${keyword}" which may relate to disability accommodations. Ensure this is framed as an accommodation request, not a screening criterion.`,
                keyword: pattern.category,
              });
              continue;
            }

            warnings.push({
              field: `question: "${question.question.substring(0, 50)}..."`,
              message: `Question may contain prohibited criteria related to ${pattern.category}. Keyword found: "${keyword}".`,
              keyword: pattern.category,
            });
          }
        }
      }

      const optionsText = question.options ? question.options.join(' ').toLowerCase() : '';

      for (const pattern of protectedCriteriaPatterns) {
        for (const keyword of pattern.keywords) {
          if (optionsText.includes(keyword)) {
            warnings.push({
              field: `options for question: "${question.question.substring(0, 50)}..."`,
              message: `Options may contain prohibited criteria related to ${pattern.category}. Keyword found: "${keyword}".`,
              keyword: pattern.category,
            });
          }
        }
      }
    }

    const requiresHumanReview = warnings.length > 0;

    const hasClearViolation = this.hasClearViolation(questions, warnings);

    if (hasClearViolation) {
      throw new BadRequestException('JOB_SCREENING_CRITERIA_PROHIBITED');
    }

    return {
      valid: !hasClearViolation,
      warnings,
      requiresHumanReview,
    };
  }

  validateWeights(config: JobScreeningConfiguration): void {
    const weights = [
      config.cvWeight,
      config.screeningQuestionWeight,
      config.skillsWeight,
      config.experienceWeight,
      config.educationWeight,
      config.assessmentWeight,
    ].filter((w): w is NonNullable<typeof w> => w !== null && w !== undefined);

    if (weights.length === 0) return;

    const sum = weights.reduce((acc, w) => acc + Number(w), 0);

    if (Math.abs(sum - 1.0) > 0.01) {
      throw new BadRequestException('JOB_SCREENING_WEIGHT_INVALID');
    }
  }

  private hasClearViolation(
    questions: CreateScreeningQuestionDto[],
    warnings: ValidationWarning[],
  ): boolean {
    const highSeverityCategories = [
      'race/ethnicity',
      'religion',
      'gender',
      'sexual orientation',
      'marital status',
    ];

    for (const warning of warnings) {
      if (highSeverityCategories.includes(warning.keyword)) {
        const question = questions.find((q) => warning.field.includes(q.question.substring(0, 50)));
        if (question?.disqualifying) {
          return true;
        }
      }
    }

    return false;
  }
}
