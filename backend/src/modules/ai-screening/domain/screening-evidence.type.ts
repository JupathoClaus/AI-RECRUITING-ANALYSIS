import { ScreeningSourceCategory } from './screening-source-category.enum';

export interface ScreeningEvidenceItem {
  criterion: string;
  sourceCategory: ScreeningSourceCategory;
  sourceText: string;
  assessment: string;
  score?: number;
  weight?: number;
  isRequired?: boolean;
}
