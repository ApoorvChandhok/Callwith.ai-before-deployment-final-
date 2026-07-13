import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Knowledge Base Upload — /api/knowledge-base/upload
// ---------------------------------------------------------------------------
// Accepts a file (PDF/DOCX/TXT), chunks the text, generates embeddings via
// Gemini gemini-embedding-001, and stores everything in Supabase pgvector.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

const CHUNK_SIZE = 400;    // characters per chunk
const CHUNK_OVERLAP = 50;  // overlap between chunks
const EMBEDDING_DIM = 768; // Gemini gemini-embedding-001 output dimension

// ── Text extraction helpers (reused from upload-rag) ─────────────────────────

function cleanExtractedText(raw: string): string {
  let text = raw
    .replace(/<[0-9A-Fa-f]{16,}>/g, "")
    .replace(/<</g, "").replace(/>>/g, "")
    .replace(/\bobj\b/gi, "").replace(/\bendobj\b/gi, "")
    .replace(/\bstream\b/gi, "").replace(/\bendstream\b/gi, "")
    .replace(/\bxref\b/gi, "").replace(/\btrailer\b/gi, "")
    .replace(/\bstartxref\b/gi, "")
    .replace(/\/Type\s*\/\w+/g, "")
    .replace(/\/Font[^}]*}/g, "")
    .replace(/\/[A-Z][a-zA-Z]+\s*=/g, "")
    .replace(/\d+ \d+ R/g, "")
    .replace(/\bPID[\s:]\S+/gi, "")
    .replace(/UUID[\s:]\S+/gi, "");

  text = text.replace(/[^a-zA-Z0-9\s.,;:!?\-/'()&%$@#+=<>*\n\r]/g, " ");

  const lines = text.split(/\n/);
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length < 3) return false;
    if (trimmed.length > 500) return false;
    if (/^\d+$/.test(trimmed)) return false;
    if (/^[a-zA-Z]\d{4,}$/.test(trimmed)) return false;
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (letterCount / trimmed.length < 0.3) return false;
    return true;
  });

  return cleaned
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Use pdf2json which doesn't have the test file issue
  const PDFParser = (await import("pdf2json")).default;
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      reject(new Error(errData.parserError || "PDF parsing failed"));
    });
    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      // Extract text from all pages
      let text = "";
      if (pdfData.Pages) {
        for (const page of pdfData.Pages) {
          if (page.Texts) {
            for (const item of page.Texts) {
              if (item.R) {
                for (const r of item.R) {
                  text += decodeURIComponent(r.T || "") + " ";
                }
              }
            }
            text += "\n";
          }
        }
      }
      resolve(text.trim());
    });
    pdfParser.parseBuffer(buffer);
  });
}

async function extractDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function extractText(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

// ── Text chunking ────────────────────────────────────────────────────────────

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at a sentence or word boundary
    if (end < text.length) {
      // Look for sentence boundary
      const sentenceEnd = text.lastIndexOf(".", end);
      const newlineEnd = text.lastIndexOf("\n", end);
      const breakAt = Math.max(sentenceEnd, newlineEnd);

      if (breakAt > start + chunkSize * 0.5) {
        end = breakAt + 1;
      } else {
        // Break at word boundary
        const spaceBefore = text.lastIndexOf(" ", end);
        if (spaceBefore > start + chunkSize * 0.5) {
          end = spaceBefore;
        }
      }
    } else {
      end = text.length;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 10) {
      chunks.push(chunk);
    }

    // Move start forward with overlap
    start = end - overlap;
    if (start <= (chunks.length > 0 ? text.indexOf(chunks[chunks.length - 1]) + chunks[chunks.length - 1].length : 0)) {
      start = end;
    }
  }

  return chunks;
}

// ── Gemini Embedding API ─────────────────────────────────────────────────────

interface EmbeddingResponse {
  embeddings: { values: number[] }[];
}

async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured — cannot generate embeddings");
  }

  const allEmbeddings: number[][] = [];

  // Batch up to 20 chunks per request
  const BATCH_SIZE = 20;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const requests = batch.map((text) => ({
      model: `models/gemini-embedding-001`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini embedding failed (${res.status}): ${errText}`);
    }

    const data: EmbeddingResponse = await res.json();
    allEmbeddings.push(...data.embeddings.map((e) => e.values));
  }

  return allEmbeddings;
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function supabaseInsert(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert into ${table} failed: ${err}`);
  }

  const data = await res.json();
  // Supabase REST returns an array for inserts — return the first element
  return Array.isArray(data) ? data[0] : data;
}

async function supabaseUpsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert into ${table} failed: ${err}`);
  }
}

async function supabaseUpdate(table: string, match: Record<string, unknown>, update: Record<string, unknown>): Promise<void> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(match)) {
    params.set(k, `eq.${v}`);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase update on ${table} failed: ${err}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const businessId = formData.get("businessId") as string;
    const mode = (formData.get("mode") as string) || "inbound";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    if (!["inbound", "outbound"].includes(mode)) {
      return NextResponse.json({ error: "mode must be 'inbound' or 'outbound'" }, { status: 400 });
    }

    const allowedExts = ["pdf", "docx", "doc", "txt", "csv", "md"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}. Please upload PDF, DOCX, DOC, TXT, or CSV.` },
        { status: 400 }
      );
    }

    // 1. Read and extract text
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawText = "";
    if (ext === "pdf") {
      rawText = await extractPdf(buffer);
    } else if (ext === "docx" || ext === "doc") {
      rawText = await extractDocx(buffer);
    } else {
      rawText = extractText(buffer);
    }

    rawText = cleanExtractedText(rawText);

    if (rawText.length < 10) {
      return NextResponse.json(
        { error: "File contains too little text to process" },
        { status: 400 }
      );
    }

    // 2. Create document record (status: processing)
    const docRecord = await supabaseInsert("knowledge_base_documents", {
      business_id: businessId,
      mode,
      file_name: file.name,
      file_type: ext,
      total_chars: rawText.length,
      status: "processing",
    }) as { id: string };

    const documentId = docRecord.id;

    try {
      // 3. Chunk the text
      const chunks = chunkText(rawText);
      console.log(`[KB Upload] Chunked ${rawText.length} chars into ${chunks.length} chunks`);

      // 4. Generate embeddings
      const embeddings = await embedChunks(chunks);
      console.log(`[KB Upload] Generated ${embeddings.length} embeddings`);

      // 5. Store chunks with embeddings
      const chunkRows = chunks.map((content, index) => ({
        document_id: documentId,
        business_id: businessId,
        mode,
        chunk_index: index,
        content,
        token_count: Math.ceil(content.split(/\s+/).length * 1.3), // rough token estimate
        embedding: `[${embeddings[index].join(",")}]`,
      }));

      // Batch insert chunks (max 50 per request)
      const BATCH_INSERT = 50;
      for (let i = 0; i < chunkRows.length; i += BATCH_INSERT) {
        await supabaseUpsert("knowledge_base_chunks", chunkRows.slice(i, i + BATCH_INSERT));
      }

      // 6. Update document status to ready
      await supabaseUpdate("knowledge_base_documents", { id: documentId }, {
        status: "ready",
        chunk_count: chunks.length,
      });

      console.log(`[KB Upload] ✅ Document ${documentId} ready — ${chunks.length} chunks stored`);

      return NextResponse.json({
        success: true,
        documentId,
        fileName: file.name,
        charCount: rawText.length,
        chunkCount: chunks.length,
      });
    } catch (err: unknown) {
      // Mark document as error
      const errorMessage = err instanceof Error ? err.message : String(err);
      await supabaseUpdate("knowledge_base_documents", { id: documentId }, {
        status: "error",
        error_message: errorMessage,
      });
      throw err;
    }
  } catch (err: unknown) {
    console.error("[KB Upload]", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to process file";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
