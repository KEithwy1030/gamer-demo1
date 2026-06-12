import { downloadLog, exportLog, getLog, isEnabled, isPanelRequested } from "./runtimeLog";

export function mountDevLogPanel(): () => void {
  if (!isEnabled() || !isPanelRequested() || typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }

  const existing = document.getElementById("gamer-dev-log-panel");
  if (existing) {
    return () => {
      existing.remove();
    };
  }

  const panel = document.createElement("aside");
  panel.id = "gamer-dev-log-panel";
  panel.setAttribute("aria-label", "Runtime debug log");
  Object.assign(panel.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "10050",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "8px",
    background: "rgba(8, 10, 14, 0.85)",
    color: "#e5e7eb",
    fontFamily: "monospace",
    fontSize: "12px",
    opacity: "0.6",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)"
  } satisfies Partial<CSSStyleDeclaration>);

  const countLabel = document.createElement("span");
  countLabel.textContent = formatCount();

  const copyButton = createButton("Copy");
  const downloadButton = createButton("Download");

  const refreshCount = () => {
    countLabel.textContent = formatCount();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(exportLog());
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1000);
    } catch {
      copyButton.textContent = "Copy!";
      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1000);
    }
  };

  const handleDownload = () => {
    downloadLog();
    refreshCount();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const isShortcut = event.key === "F12"
      || (event.key.toLowerCase() === "l" && event.ctrlKey && event.shiftKey);
    if (!isShortcut) {
      return;
    }

    event.preventDefault();
    handleDownload();
  };

  copyButton.addEventListener("click", () => {
    void handleCopy();
  });
  downloadButton.addEventListener("click", handleDownload);

  panel.append(countLabel, copyButton, downloadButton);
  document.body.append(panel);

  const intervalId = window.setInterval(refreshCount, 250);
  window.addEventListener("keydown", handleKeydown, true);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("keydown", handleKeydown, true);
    panel.remove();
  };
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(button.style, {
    border: "1px solid rgba(229, 231, 235, 0.25)",
    borderRadius: "6px",
    background: "rgba(17, 24, 39, 0.88)",
    color: "#f9fafb",
    fontFamily: "monospace",
    fontSize: "12px",
    padding: "4px 8px",
    cursor: "pointer"
  } satisfies Partial<CSSStyleDeclaration>);
  return button;
}

function formatCount(): string {
  return `log: ${getLog().length}/1000`;
}

