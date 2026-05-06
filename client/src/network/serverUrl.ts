const DEFAULT_SERVER_PORT = "3000";

export function resolveServerUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL?.trim();
  if (explicit) {
    return explicit;
  }

  if (typeof window === "undefined") {
    return `http://localhost:${DEFAULT_SERVER_PORT}`;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
}
