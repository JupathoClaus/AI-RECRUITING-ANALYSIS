import { AiInterviewEvidenceService } from '../../evaluation/ai-interview-evidence.service';

const RESPONSE =
  'In my previous role I led a Kubernetes migration initiative that improved our process and delivered measurable results.';

describe('AiInterviewEvidenceService', () => {
  let svc: AiInterviewEvidenceService;
  beforeEach(() => {
    svc = new AiInterviewEvidenceService();
  });

  it('returns VERBATIM for exact substrings of the candidate response', () => {
    expect(svc.verify('led a Kubernetes migration initiative', RESPONSE)).toBe('VERBATIM');
  });

  it('returns SUPPORTED for close paraphrases', () => {
    expect(
      svc.verify(
        'Kubernetes migration initiative improved process delivered measurable results',
        RESPONSE,
      ),
    ).toBe('SUPPORTED');
  });

  it('returns INFERRED for partial overlap', () => {
    expect(svc.verify('Kubernetes migration and process experience', RESPONSE)).toBe('INFERRED');
  });

  it('returns UNVERIFIED for fabricated evidence', () => {
    expect(svc.verify('zzzxqy fabricated quantum kubernetes evidence phrase', RESPONSE)).toBe(
      'UNVERIFIED',
    );
  });

  it('returns UNVERIFIED for empty responses and INFERRED for empty quotes', () => {
    expect(svc.verify('any quote', '')).toBe('UNVERIFIED');
    expect(svc.verify('', RESPONSE)).toBe('INFERRED');
  });

  it('detects fabricated evidence across a set', () => {
    const checks = svc.verifyAll(
      [{ quote: 'led a Kubernetes migration' }, { quote: 'totally invented phrase xyzzy' }],
      RESPONSE,
    );
    expect(checks[0].verification).toBe('VERBATIM');
    expect(checks[1].verification).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence(checks)).toBe(true);
  });

  it('flags counter-evidence as UNVERIFIED (candidate explicitly denies the claimed skill)', () => {
    const response = 'I have never worked with Kubernetes; my experience is limited to Heroku.';
    const check = svc.verify(
      'extensive Kubernetes administration across production fleets',
      response,
    );
    expect(check).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence([{ quote: 'x', verification: check }])).toBe(true);
  });
});
