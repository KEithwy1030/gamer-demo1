const SEVERITY_RANK = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);

export function createAgentPlayerSummary({
  runId,
  scenario,
  artifactDir,
  appUrl,
  serverUrl = null,
  serverPort = null,
  clientPort = null
}) {
  return {
    script: "agent-player",
    version: 1,
    runId,
    scenario,
    artifactDir,
    appUrl,
    serverUrl,
    serverPort,
    clientPort,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: "fail",
    failureScope: null,
    maxSeverity: null,
    checkpoints: [],
    findings: [],
    observations: [],
    artifacts: {},
    browser: {
      consoleMessages: [],
      pageErrors: [],
      failedRequests: []
    },
    cleanup: {
      launcherPid: null,
      browserClosed: false,
      killedPids: []
    }
  };
}

export function classifyOutcome(summary) {
  const derivedFindings = [];
  for (const checkpoint of summary.checkpoints ?? []) {
    if (checkpoint.status === "fail") {
      derivedFindings.push({
        severity: checkpoint.severity ?? "P1",
        scope: checkpoint.scope ?? "game",
        title: checkpoint.label,
        detail: `Checkpoint ${checkpoint.id} failed.`,
        checkpointId: checkpoint.id,
        evidence: checkpoint.evidence ?? {}
      });
    }
  }

  const findings = [...(summary.findings ?? []), ...derivedFindings]
    .filter((finding) => SEVERITY_RANK.has(finding.severity));

  if (findings.length === 0) {
    return {
      result: "pass",
      failureScope: null,
      maxSeverity: null
    };
  }

  findings.sort((left, right) => {
    const severityDelta = SEVERITY_RANK.get(left.severity) - SEVERITY_RANK.get(right.severity);
    if (severityDelta !== 0) return severityDelta;
    if (left.scope === right.scope) return 0;
    return left.scope === "tool" ? -1 : 1;
  });

  const leading = findings[0];
  return {
    result: "fail",
    failureScope: leading.scope,
    maxSeverity: leading.severity
  };
}

export function applyOutcome(summary) {
  const outcome = classifyOutcome(summary);
  summary.result = outcome.result;
  summary.failureScope = outcome.failureScope;
  summary.maxSeverity = outcome.maxSeverity;
  return outcome;
}

export function toMarkdownReport(summary) {
  const outcome = classifyOutcome(summary);
  const lines = [
    "# Agent Player Report",
    "",
    `runId: ${summary.runId}`,
    `scenario: ${summary.scenario}`,
    `result: ${outcome.result}`,
    `failureScope: ${outcome.failureScope ?? "none"}`,
    `maxSeverity: ${outcome.maxSeverity ?? "none"}`,
    `artifactDir: ${summary.artifactDir}`,
    `appUrl: ${summary.appUrl}`,
    "",
    "## Checkpoints",
    ""
  ];

  for (const checkpoint of summary.checkpoints ?? []) {
    lines.push(
      `- ${checkpoint.status.toUpperCase()} ${checkpoint.id}: ${checkpoint.label}`
    );
  }
  if ((summary.checkpoints ?? []).length === 0) {
    lines.push("- none");
  }

  lines.push("", "## Findings", "");
  for (const finding of summary.findings ?? []) {
    lines.push(
      `- ${finding.severity} ${finding.scope}: ${finding.title}`,
      `  ${finding.detail}`
    );
  }
  if ((summary.findings ?? []).length === 0) {
    lines.push("- none");
  }

  lines.push("", "## Artifacts", "");
  for (const [name, artifactPath] of Object.entries(summary.artifacts ?? {})) {
    lines.push(`- ${name}: ${artifactPath}`);
  }
  if (Object.keys(summary.artifacts ?? {}).length === 0) {
    lines.push("- none");
  }

  return `${lines.join("\n")}\n`;
}
