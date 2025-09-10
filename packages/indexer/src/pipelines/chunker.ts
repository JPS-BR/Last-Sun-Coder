export type CodeChunk = {
  path: string;
  lang?: string;
  start_line: number;
  end_line: number;
  content: string;
};

function detectLang(filePath: string): string | undefined {
  const ext = filePath.toLowerCase().split(".").pop();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "java":
    case "cs":
    case "cpp":
    case "c":
    case "go":
    case "rs":
    case "php":
    case "rb":
    case "kt":
    case "swift":
    case "sql":
    case "md":
    case "json":
    case "yaml":
    case "yml":
      return ext;
    default:
      return undefined;
  }
}

export function chunkByLines(
  path: string,
  content: string,
  linesPerChunk = 200,
  overlap = 20
): CodeChunk[] {
  const lang = detectLang(path);
  const norm = content.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  const out: CodeChunk[] = [];

  const step = Math.max(1, linesPerChunk - overlap);
  let i = 0;

  while (i < lines.length) {
    const start = i + 1;
    const end = Math.min(i + linesPerChunk, lines.length);
    out.push({
      path,
      lang,
      start_line: start,
      end_line: end,
      content: lines.slice(i, end).join("\n"),
    });
    if (end === lines.length) break;
    i += step;
  }

  // Se o último chunk ficou muito pequeno, mescla com o anterior
  if (out.length > 1) {
    const last = out[out.length - 1];
    const lastLen = last.end_line - last.start_line + 1;
    if (lastLen < Math.ceil(linesPerChunk / 3)) {
      const prev = out[out.length - 2];
      prev.end_line = lines.length;
      prev.content = lines.slice(prev.start_line - 1, lines.length).join("\n");
      out.pop();
    }
  }

  return out;
}
