import { describe, expect, it } from 'vitest';
import { assertSafeRuntimeConfiguration, requireAuthoritativeBackend } from './runtime';

describe('runtime production guardrails', () => {
  it('allows demo mode without a backend', () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        mode: 'demo',
        apiUrl: null,
        realMoneyEnabled: false,
      }),
    ).not.toThrow();
  });

  it('rejects production mode without a backend', () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        mode: 'production',
        apiUrl: null,
        realMoneyEnabled: false,
      }),
    ).toThrow('Production mode requires VITE_API_URL.');
  });

  it('rejects insecure production APIs', () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        mode: 'production',
        apiUrl: 'http://example.com',
        realMoneyEnabled: false,
      }),
    ).toThrow('Production API must use HTTPS.');
  });

  it('allows an HTTPS authoritative backend', () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        mode: 'production',
        apiUrl: 'https://api.example.com',
        realMoneyEnabled: false,
      }),
    ).not.toThrow();
  });

  it('returns the authoritative backend only in production', () => {
    expect(
      requireAuthoritativeBackend({
        mode: 'production',
        apiUrl: 'https://api.example.com',
        realMoneyEnabled: false,
      }),
    ).toBe('https://api.example.com');
  });
});
