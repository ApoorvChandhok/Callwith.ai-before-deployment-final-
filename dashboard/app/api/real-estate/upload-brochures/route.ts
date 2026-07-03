import { NextRequest, NextResponse } from "next/server";

const MAX_CHARS_PER_BROCHURE = 3000; // Keep summaries compact for system prompt

// ── Text extractor for PDFs (multi-strategy) ─────────────────────────────────
async function extractPdf(buffer: Buffer): Promise<string> {
  // Strategy 1: Try pdf-parse (works on most Node versions)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    if (data.text && data.text.trim().length > 0) {
      return data.text;
    }
  } catch (e: any) {
    console.warn("[upload-brochures] pdf-parse failed, trying fallback:", e.message);
  }

  // Strategy 2: Fallback — extract readable text streams from PDF buffer
  // This handles most PDFs by finding text between BT/ET markers and raw text streams
  try {
    const text = extractTextFromPdfBuffer(buffer);
    if (text.trim().length > 0) return text;
  } catch (e: any) {
    console.warn("[upload-brochures] fallback extraction failed:", e.message);
  }

  return "";
}

function extractTextFromPdfBuffer(buffer: Buffer): string {
  const str = buffer.toString("latin1");

  // Extract text from BT ... ET (text blocks) in content streams
  const textBlocks: string[] = [];
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
  let match;

  while ((match = tjRegex.exec(str)) !== null) {
    const raw = match[1];
    if (raw.trim()) textBlocks.push(raw);
  }

  while ((match = tjArrayRegex.exec(str)) !== null) {
    const segment = match[1];
    const innerRegex = /\(([^)]*)\)/g;
    let inner;
    const parts: string[] = [];
    while ((inner = innerRegex.exec(segment)) !== null) {
      if (inner[1]) parts.push(inner[1]);
    }
    if (parts.length) textBlocks.push(parts.join(""));
  }

  if (textBlocks.length > 0) {
    return textBlocks.join("\n");
  }

  // Last resort: extract readable text but filter out PDF structure noise
  const readable = str.match(/[ -~\n]{4,}/g);
  if (!readable) return "";

  const noise = [
    /^%PDF-/,
    /^xref$/,
    /^startxref$/,
    /^endobj$/,
    /^obj$/,
    /^endstream$/,
    /^stream$/,
    /^trailer$/,
    /^<<.*>>$/,
    /^\d+ \d+ obj/,
    /^<\// ,
    /^0000000/,
    /^endobj/,
    /^\s*$/,
  ];

  const filtered = readable
    .join("\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length < 4) return false;
      return !noise.some((pattern) => pattern.test(trimmed));
    });

  return filtered.join("\n");
}

// ── POST /api/real-estate/upload-brochures ────────────────────────────────────
// Accepts FormData with:
//   - files: multiple PDF files
//   - names: JSON array of project names (one per file)
// Returns extracted text content for each brochure.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const namesRaw = formData.get("names") as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const names: string[] = namesRaw ? JSON.parse(namesRaw) : [];

    const brochures = await Promise.all(
      files.map(async (file, index) => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (ext !== "pdf") {
          return {
            name: names[index] || file.name.replace(/\.pdf$/i, ""),
            fileName: file.name,
            content: "",
            charCount: 0,
            error: `Unsupported file type: .${ext}. Only PDF files are accepted.`,
          };
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let rawText = "";

        try {
          rawText = await extractPdf(buffer);
        } catch (err: any) {
          return {
            name: names[index] || file.name.replace(/\.pdf$/i, ""),
            fileName: file.name,
            content: "",
            charCount: 0,
            error: `Failed to extract text: ${err.message}`,
          };
        }

        // Clean up whitespace
        rawText = rawText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

        // Truncate to max chars
        let content = rawText;
        let truncated = false;
        if (content.length > MAX_CHARS_PER_BROCHURE) {
          content = content.substring(0, MAX_CHARS_PER_BROCHURE);
          truncated = true;
        }

        return {
          name: names[index] || file.name.replace(/\.pdf$/i, ""),
          fileName: file.name,
          content,
          charCount: content.length,
          totalChars: rawText.length,
          truncated,
        };
      })
    );

    return NextResponse.json({ success: true, brochures });
  } catch (err: any) {
    console.error("[Real Estate Upload Brochures]", err);
    return NextResponse.json(
      { error: err.message || "Failed to process brochures" },
      { status: 500 }
    );
  }
}
