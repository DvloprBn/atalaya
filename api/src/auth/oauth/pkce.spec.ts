import { challengeFor, newVerifier } from './pkce.js';

describe('PKCE (RFC 7636)', () => {
  it('coincide con el vector oficial del Apéndice B del RFC', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('el verifier tiene 43 caracteres base64url y es distinto cada vez', () => {
    const a = newVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newVerifier()).not.toBe(a);
  });

  it('el challenge no revela el verifier (43 caracteres distintos)', () => {
    const verifier = newVerifier();
    expect(challengeFor(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challengeFor(verifier)).not.toBe(verifier);
  });
});
