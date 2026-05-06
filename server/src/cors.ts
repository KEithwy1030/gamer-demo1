export type CorsOrigin = boolean | string[] | ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function createCorsOriginResolver(
  configuredOrigins: string[] | boolean,
  allowLoopbackOrigins: boolean
): CorsOrigin {
  if (!allowLoopbackOrigins) {
    return configuredOrigins;
  }

  if (configuredOrigins === true) {
    return allowLoopbackOrigin;
  }

  const exactOrigins = new Set(Array.isArray(configuredOrigins) ? configuredOrigins : []);
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (exactOrigins.has(origin) || allowLoopbackOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

export function allowLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
