import type { KnowledgeSection } from "./types.js";

interface HeadingState {
  level: number;
  title: string;
}

const markdownHeadingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function splitMarkdownSections(content: string): KnowledgeSection[] {
  const sections: KnowledgeSection[] = [];
  const headingStack: HeadingState[] = [];
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];
  let ordinal = 0;

  for (const line of content.split(/\r?\n/)) {
    const heading = markdownHeadingPattern.exec(line);

    if (heading) {
      pushSection();
      const level = heading[1]?.length ?? 1;
      const title = normalizeHeadingTitle(heading[2] ?? "");

      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }

      headingStack.push({ level, title });
      currentHeadingPath = headingStack.map((entry) => entry.title);
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  pushSection();

  if (sections.length === 0) {
    return [{ text: "", headingPath: [], ordinal: 0 }];
  }

  return sections;

  function pushSection(): void {
    const text = currentLines.join("\n").trim();
    if (!text) {
      currentLines = [];
      return;
    }

    sections.push({
      text,
      headingPath: currentHeadingPath,
      ordinal,
    });
    ordinal += 1;
    currentLines = [];
  }
}

export function sectionFromText(content: string): KnowledgeSection[] {
  return [
    {
      text: content.trim(),
      headingPath: [],
      ordinal: 0,
    },
  ];
}

function normalizeHeadingTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}
