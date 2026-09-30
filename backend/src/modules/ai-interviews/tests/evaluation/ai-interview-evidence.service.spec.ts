import { AiInterviewEvidenceService } from '../../evaluation/ai-interview-evidence.service';

const SEGMENTS = [
  {
    segmentIndex: 0,
    textRaw: 'I led a Kubernetes migration initiative',
    textNormalized: 'i led a kubernetes migration initiative',
    startSeconds: 10,
    endSeconds: 20,
  },
  {
    segmentIndex: 1,
    textRaw: 'that improved our process and delivered measurable results',
    textNormalized: 'that improved our process and delivered measurable results',
    startSeconds: 20,
    endSeconds: 30,
  },
  {
    segmentIndex: 2,
    textRaw: 'I also do manual testing of the mobile application',
    textNormalized: 'i also do manual testing of the mobile application',
    startSeconds: 40,
    endSeconds: 50,
  },
];

describe('AiInterviewEvidenceService', () => {
  let svc: AiInterviewEvidenceService;
  beforeEach(() => {
    svc = new AiInterviewEvidenceService();
  });

  it('returns VERBATIM for a quote contained in a single candidate turn with excerpt + segment refs', () => {
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'led a Kubernetes migration initiative' }],
      SEGMENTS,
      'transcript-1',
    );
    expect(check.verification).toBe('VERBATIM');
    expect(check.excerpt).toBe('I led a Kubernetes migration initiative');
    expect(check.transcriptId).toBe('transcript-1');
    expect(check.segmentIndexes).toEqual([0]);
    expect(check.startSeconds).toBe(10);
    expect(check.endSeconds).toBe(20);
  });

  it('grounds a quote spanning multiple adjacent candidate turns to all touched segments', () => {
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'migration initiative that improved our process' }],
      SEGMENTS,
      'transcript-1',
    );
    expect(check.verification).toBe('VERBATIM');
    expect(check.segmentIndexes).toEqual([0, 1]);
    expect(check.excerpt).toContain('Kubernetes migration');
    expect(check.excerpt).toContain('delivered measurable results');
    expect(check.startSeconds).toBe(10);
    expect(check.endSeconds).toBe(30);
  });

  it('returns SUPPORTED with a real excerpt for a close paraphrase', () => {
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'improved our process and delivered measurable outcomes' }],
      SEGMENTS,
      'transcript-1',
    );
    expect(check.verification).toBe('SUPPORTED');
    expect(check.segmentIndexes).toEqual([1]);
    expect(check.excerpt).toBe('that improved our process and delivered measurable results');
    expect(check.startSeconds).toBe(20);
    expect(check.endSeconds).toBe(30);
  });

  it('returns INFERRED for partial overlap', () => {
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'Kubernetes migration and process experience' }],
      SEGMENTS,
      null,
    );
    expect(check.verification).toBe('INFERRED');
    expect(check.segmentIndexes).toEqual([0]);
    expect(check.excerpt).toBe('I led a Kubernetes migration initiative');
  });

  it('returns UNVERIFIED with no excerpt for fabricated evidence', () => {
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'zzzxqy fabricated quantum kubernetes evidence phrase' }],
      SEGMENTS,
      null,
    );
    expect(check.verification).toBe('UNVERIFIED');
    expect(check.excerpt).toBeNull();
    expect(check.segmentIndexes).toEqual([]);
    expect(check.startSeconds).toBeNull();
  });

  it('returns UNVERIFIED when there are no candidate segments and INFERRED for empty quotes', () => {
    expect(svc.verifyAgainstSegments([{ quote: 'any quote' }], [], 't')[0].verification).toBe(
      'UNVERIFIED',
    );
    expect(svc.verifyAgainstSegments([{ quote: '' }], SEGMENTS, 't')[0].verification).toBe(
      'INFERRED',
    );
  });

  it('detects fabricated evidence across a set', () => {
    const checks = svc.verifyAgainstSegments(
      [{ quote: 'led a Kubernetes migration' }, { quote: 'totally invented phrase xyzzy' }],
      [SEGMENTS[0]],
      'transcript-1',
    );
    expect(checks[0].verification).toBe('VERBATIM');
    expect(checks[1].verification).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence(checks)).toBe(true);
  });

  it('flags counter-evidence as UNVERIFIED (candidate explicitly denies the claimed skill)', () => {
    const denial = [
      {
        segmentIndex: 3,
        textRaw: 'I have never worked with Kubernetes; my experience is limited to Heroku.',
        textNormalized: 'i have never worked with kubernetes; my experience is limited to heroku.',
        startSeconds: 60,
        endSeconds: 70,
      },
    ];
    const [check] = svc.verifyAgainstSegments(
      [{ quote: 'extensive Kubernetes administration across production fleets' }],
      denial,
      null,
    );
    expect(check.verification).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence([check])).toBe(true);
  });
});
