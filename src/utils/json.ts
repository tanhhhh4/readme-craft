function extractCodeBlockContent(raw: string): string[] {
  const matches = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  return Array.from(matches, (match) => (match[1] ?? "").trim()).filter(Boolean);
}

function extractBalancedJsonObject(raw: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeQuoteCharacters(raw: string): string {
  return raw
    .replace(/[“”„‟「」『』＂]/g, "\"")
    .replace(/[‘’‚‛‹›〈〉《》＇]/g, "'");
}

function escapeInnerDoubleQuotes(raw: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (!inString) {
      if (char === "\"") {
        inString = true;
      }
      result += char;
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char !== "\"") {
      result += char;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < raw.length && /\s/.test(raw[nextIndex] ?? "")) {
      nextIndex += 1;
    }

    const nextChar = raw[nextIndex] ?? "";
    if (nextChar === "," || nextChar === "}" || nextChar === "]" || nextChar === ":") {
      inString = false;
      result += char;
      continue;
    }

    result += "\\\"";
  }

  return result;
}

function stripTrailingCommas(raw: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      result += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      result += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (nextIndex < raw.length && /\s/.test(raw[nextIndex] ?? "")) {
        nextIndex += 1;
      }

      const nextChar = raw[nextIndex] ?? "";
      if (nextChar === "}" || nextChar === "]") {
        continue;
      }
    }

    result += char;
  }

  return result;
}

function repairJson(raw: string): string {
  return stripTrailingCommas(escapeInnerDoubleQuotes(normalizeQuoteCharacters(raw)));
}

export function safeParseJson<T>(raw: string, source = "AI response"): T {
  const candidates = [...extractCodeBlockContent(raw)];
  const balanced = extractBalancedJsonObject(raw);
  if (balanced) {
    candidates.push(balanced);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  const attempts = candidates.length > 0 ? candidates : [trimmed];
  const errors: string[] = [];

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      errors.push(String(error));
    }

    const repaired = repairJson(candidate);
    if (repaired !== candidate) {
      try {
        return JSON.parse(repaired) as T;
      } catch (error) {
        errors.push(String(error));
      }
    }
  }

  throw new Error(
    `Failed to parse ${source} as JSON. Errors: ${errors.join(" | ")}\nRaw response:\n${raw}`
  );
}
