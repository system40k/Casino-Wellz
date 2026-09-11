export type RuntimeMode = 'demo' | 'production';

export interface RuntimeConfig {
  mode: RuntimeMode;
  apiUrl: string | null;
  realMoneyEnabled: boolean;
}

const normalizeMode = (value: string | undefined): RuntimeMode =>
  value?.toLowerCase() === 'production' ? 'production' : 'demo';

const normalizeApiUrl = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const runtimeConfig: RuntimeConfig = {
  mode: normalizeMode(import.meta.env.VITE_RUNTIME_MODE),
  apiUrl: normalizeApiUrl(import.meta.env.VITE_API_URL),
  realMoneyEnabled: import.meta.env.VITE_REAL_MONEY_ENABLED === 'true',
};

/**
 * Production mode must fail closed. Real-money operation is not allowed unless
 * a backend API is explicitly configured over HTTPS (localhost is allowed for
 * local development only).
 */
export function assertSafeRuntimeConfiguration(config = runtimeConfig): void {
  if (config.mode !== 'production') return;

  if (!config.apiUrl) {
    throw new Error('Production mode requires VITE_API_URL.');
  }

  const url = new URL(config.apiUrl, window.location.origin);
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('Production API must use HTTPS.');
  }

  if (!config.realMoneyEnabled) {
    // This is intentionally valid: production UI can be deployed while money
    // movement remains disabled until backend controls are complete.
    return;
  }
}

export function requireAuthoritativeBackend(config = runtimeConfig): string {
  assertSafeRuntimeConfiguration(config);

  if (config.mode !== 'production' || !config.apiUrl) {
    throw new Error('Authoritative backend is only available in production mode.');
  }

  return config.apiUrl;
}
