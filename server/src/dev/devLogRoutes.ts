import { Router } from "express";
import type { Request, Response } from "express";
import { DevLogService, isValidDevLogEntry, type DevLogEntry } from "./devLog.js";

interface AppendLogBody {
  entries?: unknown;
}

export function createDevLogRouter(devLogService: DevLogService): Router {
  const router = Router();

  router.post("/append", async (request: Request, response: Response) => {
    const entries = parseEntries(request.body as AppendLogBody);
    if (!entries) {
      response.status(400).json({ message: "entries must be a non-empty array of valid log entries." });
      return;
    }

    try {
      await devLogService.appendEntries(entries);
      response.status(204).end();
    } catch (error) {
      console.warn("[devlog] append request failed", error);
      response.status(500).json({ message: "Failed to append dev log batch." });
    }
  });

  return router;
}

function parseEntries(body: AppendLogBody): DevLogEntry[] | null {
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return null;
  }

  if (!body.entries.every((entry) => isValidDevLogEntry(entry))) {
    return null;
  }

  return body.entries;
}
