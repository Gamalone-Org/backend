type CorsEnvInput = {
  NODE_ENV?: 'development' | 'test' | 'production';
  API_PUBLIC_URL?: string;
  CORS_ORIGINS?: string | string[];
};

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  try {
    return new globalThis.URL(trimmed).origin;
  } catch {
    return trimmed;
  }
};

const parseOrigins = (value?: string | string[]): string[] => {
  if (!value) {
    return [];
  }

  const entries = Array.isArray(value) ? value : String(value).split(',');

  return [...new Set(
    entries
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean)
  )];
};

export function getCorsAllowlist(input: CorsEnvInput = {}): string[] {
  const nodeEnv = input.NODE_ENV ?? 'development';
  const apiPublicUrl = input.API_PUBLIC_URL;
  const configuredOrigins = parseOrigins(input.CORS_ORIGINS ?? []);

  const origins = [...configuredOrigins];

  if (nodeEnv !== 'production') {
    origins.push('http://localhost:5000');
  }

  if (apiPublicUrl) {
    origins.push(normalizeOrigin(apiPublicUrl));
  }

  return [...new Set(origins.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function isAllowedOrigin(origin: string | undefined, input: CorsEnvInput = {}): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return true;
  }

  return getCorsAllowlist(input).includes(normalizedOrigin);
}
