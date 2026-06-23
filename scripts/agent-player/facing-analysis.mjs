const STATES_TO_IGNORE = new Set(["HURT", "DIE"]);

export function analyzeFacingSamples(samples, options = {}) {
  const expectedCardinal = options.expectedCardinal ?? "right";
  const expectedFlipX = Boolean(options.expectedFlipX);
  const initialGraceMs = Number(options.initialGraceMs ?? 250);
  const minSamples = Number(options.minSamples ?? 8);
  const minCoveredMs = Number(options.minCoveredMs ?? 0);
  const forbiddenFramesByAnimKey = normalizeForbiddenFramesByAnimKey(options.forbiddenFramesByAnimKey);

  const considered = [];
  const violations = [];
  const cardinals = [];
  const animKeys = [];
  const frameNamesByAnimKey = new Map();
  let previousCardinal = null;
  let previousFlipX = null;
  let cardinalTransitions = 0;
  let flipTransitions = 0;

  for (const sample of Array.isArray(samples) ? samples : []) {
    const elapsedMs = Number(sample?.elapsedMs ?? 0);
    const self = sample?.self ?? null;
    if (
      !self
      || elapsedMs < initialGraceMs
      || STATES_TO_IGNORE.has(self.state)
      || self.actionLocked === true
      || String(self.animKey ?? "").includes("-attack")
    ) {
      continue;
    }

    const normalized = {
      elapsedMs,
      cardinal: self.cardinal ?? null,
      flipX: typeof self.flipX === "boolean" ? self.flipX : null,
      state: self.state ?? null,
      animKey: self.animKey ?? null,
      frameName: self.frameName == null ? null : String(self.frameName),
      x: typeof self.x === "number" ? Number(self.x.toFixed(2)) : null,
      y: typeof self.y === "number" ? Number(self.y.toFixed(2)) : null
    };
    considered.push(normalized);

    if (normalized.cardinal && !cardinals.includes(normalized.cardinal)) {
      cardinals.push(normalized.cardinal);
    }
    if (normalized.animKey && !animKeys.includes(normalized.animKey)) {
      animKeys.push(normalized.animKey);
    }
    if (normalized.animKey && normalized.frameName !== null) {
      const frameNames = frameNamesByAnimKey.get(normalized.animKey) ?? new Set();
      frameNames.add(normalized.frameName);
      frameNamesByAnimKey.set(normalized.animKey, frameNames);
    }
    if (previousCardinal !== null && normalized.cardinal !== previousCardinal) {
      cardinalTransitions += 1;
    }
    if (previousFlipX !== null && normalized.flipX !== previousFlipX) {
      flipTransitions += 1;
    }
    previousCardinal = normalized.cardinal;
    previousFlipX = normalized.flipX;

    const reasons = [];
    if (normalized.cardinal !== expectedCardinal) {
      reasons.push(`cardinal=${normalized.cardinal}`);
    }
    if (normalized.flipX !== expectedFlipX) {
      reasons.push(`flipX=${normalized.flipX}`);
    }
    const forbiddenFrames = normalized.animKey ? forbiddenFramesByAnimKey.get(normalized.animKey) : null;
    if (forbiddenFrames?.has(normalized.frameName)) {
      reasons.push(`frameName=${normalized.frameName} forbidden for ${normalized.animKey}`);
    }
    if (reasons.length > 0) {
      violations.push({
        elapsedMs: normalized.elapsedMs,
        reasons,
        sample: normalized
      });
    }
  }

  cardinals.sort();
  animKeys.sort();

  const firstConsideredMs = considered[0]?.elapsedMs ?? null;
  const lastConsideredMs = considered.at(-1)?.elapsedMs ?? null;
  const coveredMs = firstConsideredMs !== null && lastConsideredMs !== null
    ? Math.max(0, lastConsideredMs - firstConsideredMs)
    : 0;

  const sampleCountViolation = considered.length < minSamples
    ? [{
        elapsedMs: null,
        reasons: [`consideredSamples=${considered.length}<${minSamples}`],
        sample: null
      }]
    : [];
  const coverageViolation = coveredMs < minCoveredMs
    ? [{
        elapsedMs: null,
        reasons: [`coveredMs=${coveredMs}<${minCoveredMs}`],
        sample: null
      }]
    : [];
  const samplingViolations = [...sampleCountViolation, ...coverageViolation];

  return {
    pass: violations.length === 0 && samplingViolations.length === 0,
    expectedCardinal,
    expectedFlipX,
    initialGraceMs,
    minSamples,
    minCoveredMs,
    totalSamples: Array.isArray(samples) ? samples.length : 0,
    consideredSamples: considered.length,
    firstConsideredMs,
    lastConsideredMs,
    coveredMs,
    uniqueCardinals: cardinals,
    animKeys,
    frameNamesByAnimKey: Object.fromEntries(
      [...frameNamesByAnimKey.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([animKey, frameNames]) => [animKey, [...frameNames].sort()])
    ),
    cardinalTransitions,
    flipTransitions,
    violations: [...samplingViolations, ...violations]
  };
}

function normalizeForbiddenFramesByAnimKey(input) {
  const result = new Map();
  if (!input || typeof input !== "object") return result;
  for (const [animKey, frames] of Object.entries(input)) {
    if (!animKey || !Array.isArray(frames)) continue;
    result.set(animKey, new Set(frames.map((frame) => String(frame))));
  }
  return result;
}
