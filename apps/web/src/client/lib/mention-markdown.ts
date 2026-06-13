import type { ProjectMemberProfile } from "../types/project";

const LEGACY_MENTION_PATTERN = /(^|[\s([{])@([A-Za-z0-9._|:-]+)/g;
const MENTION_LINK_PATTERN = /\[@([^\]\n]+)\]\(mention:([^)]+)\)/g;
const MENTION_SHORTCODE_PATTERN = /\[@\s+([^\]]*)\]/g;
const CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;
const MARKDOWN_SPECIAL_CHARS_PATTERN = /([\\`*_{}[\]()#+\-.!|>~])/g;

function isCodeSegment(segment: string): boolean {
  return (
    (segment.startsWith("```") && segment.endsWith("```")) ||
    (segment.startsWith("`") && segment.endsWith("`"))
  );
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(MARKDOWN_SPECIAL_CHARS_PATTERN, "\\$1");
}

function parseShortcodeAttributes(attrString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
  let match = regex.exec(attrString);
  while (match !== null) {
    const [, key, doubleQuoted, singleQuoted] = match;
    const value = doubleQuoted ?? singleQuoted;
    if (typeof value === "string") {
      attributes[key] = value;
    }
    match = regex.exec(attrString);
  }
  return attributes;
}

function escapeShortcodeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildMentionLink(displayName: string, id: string): string {
  return `[@${escapeMarkdownLabel(displayName)}](mention:${id})`;
}

export function convertLegacyMentionsToMentionLinks(
  body: string,
  mentionCandidates: ProjectMemberProfile[],
): string {
  if (body.length === 0 || mentionCandidates.length === 0) {
    return body;
  }

  const mentionDisplayNameById = new Map(
    mentionCandidates.map((candidate) => [candidate.id, candidate.displayName]),
  );

  return body
    .split(CODE_SEGMENT_PATTERN)
    .map((segment) => {
      if (isCodeSegment(segment)) {
        return segment;
      }
      return segment.replace(LEGACY_MENTION_PATTERN, (full, prefix, id) => {
        const displayName = mentionDisplayNameById.get(String(id));
        if (!displayName) {
          return full;
        }
        return `${String(prefix)}${buildMentionLink(displayName, String(id))}`;
      });
    })
    .join("");
}

export function insertMentionLinkAtTail(
  currentMarkdown: string,
  mention: { id: string; displayName: string },
): string {
  const current = currentMarkdown.replace(/\s+$/, "");
  const mentionLink = buildMentionLink(mention.displayName, mention.id);
  return current.length > 0 ? `${current} ${mentionLink} ` : `${mentionLink} `;
}

export function convertMentionLinksToTiptapShortcodes(
  markdown: string,
): string {
  return markdown.replace(MENTION_LINK_PATTERN, (_full, label, id) => {
    const escapedId = escapeShortcodeAttribute(String(id));
    const escapedLabel = escapeShortcodeAttribute(String(label));
    return `[@ id="${escapedId}" label="${escapedLabel}"]`;
  });
}

export function convertTiptapShortcodesToMentionLinks(
  markdown: string,
): string {
  return markdown.replace(MENTION_SHORTCODE_PATTERN, (full, attrsRaw) => {
    const attrs = parseShortcodeAttributes(String(attrsRaw));
    const id = attrs.id?.trim();
    if (!id) {
      return full;
    }
    const label = (attrs.label ?? attrs.id).trim();
    return buildMentionLink(label, id);
  });
}

export function extractMentionIdsFromText(text: string): Set<string> {
  const mentioned = new Set<string>();
  for (const match of text.matchAll(MENTION_LINK_PATTERN)) {
    const userId = match[2]?.trim();
    if (userId) {
      mentioned.add(userId);
    }
  }
  const textWithoutMentionLinks = text.replace(MENTION_LINK_PATTERN, " ");
  for (const match of textWithoutMentionLinks.matchAll(
    LEGACY_MENTION_PATTERN,
  )) {
    const userId = match[2]?.trim();
    if (userId) {
      mentioned.add(userId);
    }
  }
  return mentioned;
}
