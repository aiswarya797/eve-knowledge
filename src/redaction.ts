export interface SecretFinding {
  label: string;
  index: number;
  preview: string;
}

export class KnowledgeRedactionError extends Error {
  constructor(
    readonly level: "warning" | "error",
    readonly path: string,
    readonly findings: SecretFinding[],
  ) {
    super(`Possible secret detected (${findings.map((finding) => finding.label).join(", ")}).`);
    this.name = "KnowledgeRedactionError";
  }
}

const secretPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "openai_api_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "anthropic_api_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { label: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    label: "env_secret_assignment",
    pattern: /\b[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*=\s*["']?[^"'\s]{8,}/g,
  },
];

export function detectSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const { label, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      findings.push({
        label,
        index: match.index ?? 0,
        preview: maskSecret(match[0] ?? ""),
      });
    }
  }

  return findings;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
