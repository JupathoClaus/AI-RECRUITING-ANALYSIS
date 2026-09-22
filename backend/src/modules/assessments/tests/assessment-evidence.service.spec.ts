import { AssessmentEvidenceService } from '../ai/assessment-evidence.service';

const RESPONSE =
  'I would first verify DNS resolution with dig, then check routing tables and firewall rules before restarting services.';

describe('AssessmentEvidenceService', () => {
  let svc: AssessmentEvidenceService;
  beforeEach(() => {
    svc = new AssessmentEvidenceService();
  });

  it('returns VERBATIM for exact quotes', () => {
    expect(svc.verify('verify DNS resolution with dig', RESPONSE)).toBe('VERBATIM');
  });

  it('returns SUPPORTED for close paraphrases', () => {
    expect(
      svc.verify(
        'verify DNS resolution dig check routing tables firewall rules restarting services',
        RESPONSE,
      ),
    ).toBe('SUPPORTED');
  });

  it('returns INFERRED for partial overlap', () => {
    expect(
      svc.verify(
        'DNS resolution troubleshooting with routing tables and firewall experience',
        RESPONSE,
      ),
    ).toBe('INFERRED');
  });

  it('returns UNVERIFIED for fabricated evidence', () => {
    expect(svc.verify('zzzxqy fabricated kubernetes quantum evidence phrase', RESPONSE)).toBe(
      'UNVERIFIED',
    );
  });

  it('returns UNVERIFIED for empty responses and INFERRED for empty quotes', () => {
    expect(svc.verify('any quote', '')).toBe('UNVERIFIED');
    expect(svc.verify('', RESPONSE)).toBe('INFERRED');
  });

  it('detects fabricated evidence across a set', () => {
    const checks = svc.verifyAll(
      [{ quote: 'verify DNS resolution' }, { quote: 'totally invented phrase xyzzy' }],
      RESPONSE,
    );
    expect(checks[0].verification).toBe('VERBATIM');
    expect(checks[1].verification).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence(checks)).toBe(true);
  });

  it('flags counter-evidence as UNVERIFIED (candidate explicitly denies the claimed skill)', () => {
    const response =
      'I have never administered Linux at scale; my experience is limited to Windows server environments.';
    const claim = 'extensive Linux administration experience across production fleets';
    const check = svc.verify(claim, response);
    expect(check).toBe('UNVERIFIED');
    expect(svc.hasFabricatedEvidence([{ quote: claim, verification: check }])).toBe(true);
  });
});
