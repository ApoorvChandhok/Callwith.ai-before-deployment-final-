import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Define paths relative to the root project
const DATA_DIR = path.join(process.cwd(), "..", "data");
const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");

// Minimum valid audio file size in bytes (WAV header alone is 44 bytes, real audio is > 1KB)
const MIN_AUDIO_SIZE = 500;

// Detect content type from file extension or buffer.
// Returns null if the buffer is NOT recognized as audio.
function detectContentType(filename: string, buffer?: Buffer): string | null {
  const ext = path.extname(filename).toLowerCase();

  // Check by extension first
  if (ext === ".mp3" || ext === ".mpeg") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".m4a" || ext === ".aac") return "audio/mp4";
  if (ext === ".webm") return "audio/webm";

  // Check by magic bytes if buffer provided
  if (buffer && buffer.length >= 4) {
    // MP3: starts with ID3 tag or 0xFF 0xFB/0xF3/0xF2
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "audio/mpeg"; // ID3
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return "audio/mpeg"; // MP3 sync
    // WAV: starts with RIFF
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "audio/wav";
    // OGG: starts with OggS
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "audio/ogg";
    // FLAC: starts with fLaC
    if (buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43) return "audio/flac";
    // M4A/AAC: starts with ftyp
    if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "audio/mp4";
  }

  // Return null — caller must not assume audio
  return null;
}

/** Check if a buffer contains actual audio data by validating magic bytes and minimum size */
function isAudioBuffer(buffer: Buffer): boolean {
  if (buffer.length < MIN_AUDIO_SIZE) return false;
  const detected = detectContentType("", buffer);
  return detected !== null;
}

/** Load Vobiz credentials from env or root .env file */
function loadVobizCredentials(): { authId: string | null; authToken: string | null } {
  let authId = process.env.VOBIZ_AUTH_ID;
  let authToken = process.env.VOBIZ_AUTH_TOKEN;

  if (!authId || !authToken) {
    const envPath = path.join(process.cwd(), "..", ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach(line => {
        const [key, ...values] = line.split("=");
        if (key === "VOBIZ_AUTH_ID") authId = values.join("=").trim().replace(/\r/g, "");
        if (key === "VOBIZ_AUTH_TOKEN") authToken = values.join("=").trim().replace(/\r/g, "");
      });
    }
  }

  return { authId: authId || null, authToken: authToken || null };
}

/**
 * Search Vobiz recordings by SIP call UUID OR recording UUID.
 * Returns { recordingUuid, meta } or null.
 */
async function findVobizRecording(
  inputUuid: string,
  authId: string,
  headers: Record<string, string>
): Promise<{ recordingUuid: string; meta: any } | null> {
  let offset = 0;

  for (let page = 0; page < 20; page++) {
    const listUrl = `https://api.vobiz.ai/api/v1/Account/${authId}/Recording/?limit=100&offset=${offset}`;
    const listRes = await fetch(listUrl, { headers });
    if (!listRes.ok) break;

    const listJson = await listRes.json();
    const items = listJson?.objects ?? listJson?.data ?? listJson?.results ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      // Match by call_uuid, sip_call_id, OR by the recording's own uuid/id
      const matchesCallUuid = item.call_uuid === inputUuid || item.sip_call_id === inputUuid;
      const matchesRecordingUuid = item.uuid === inputUuid || item.id === inputUuid || item.recording_id === inputUuid;

      if (matchesCallUuid || matchesRecordingUuid) {
        const recordingUuid = item.uuid || item.id || item.recording_id;
        console.log(`[Recordings] Found recording UUID: ${recordingUuid} for input: ${inputUuid} (matched by: ${matchesCallUuid ? 'call_uuid/sip_call_id' : 'recording_uuid'})`);
        return { recordingUuid, meta: item };
      }
    }

    offset += items.length;
    if (items.length < 100) break;
  }

  return null;
}

/** Try to download audio from Vobiz using various URL patterns */
async function downloadFromVobiz(
  recordingUuid: string,
  authId: string,
  authToken: string,
  headers: Record<string, string>
): Promise<{ buffer: Buffer; contentType: string } | null> {
  // Step 1: Try to get recording detail for a direct URL
  try {
    const detailUrl = `https://api.vobiz.ai/api/v1/Account/${authId}/Recording/${recordingUuid}/`;
    const detailRes = await fetch(detailUrl, { headers });

    if (detailRes.ok) {
      const detail = await detailRes.json();
      const audioUrl = detail.url || detail.recording_url || detail.audio_url || detail.file_url || detail.download_url || detail.media_url;
      console.log(`[Recordings] Detail audio URL: ${audioUrl || "none"}`);

      if (audioUrl) {
        const result = await tryDownloadAudio(audioUrl, authId, authToken);
        if (result) return result;
      }
    }
  } catch (e) {
    console.warn(`[Recordings] Detail fetch failed:`, e);
  }

  // Step 2: Try media.vobiz.ai with different extensions
  const extensions = [".wav", ".mp3", ".ogg", ".m4a"];
  for (const ext of extensions) {
    const tryUrl = `https://media.vobiz.ai/v1/Account/${authId}/Recording/${recordingUuid}${ext}`;
    console.log(`[Recordings] Trying: ${tryUrl}`);
    try {
      const tryRes = await fetch(tryUrl, {
        method: "HEAD",
        headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken }
      });
      if (tryRes.ok) {
        const result = await tryDownloadAudio(tryUrl, authId, authToken);
        if (result) return result;
      }
    } catch {}
  }

  return null;
}

/** Download audio from a URL and validate it's actual audio */
async function tryDownloadAudio(
  audioUrl: string,
  authId: string,
  authToken: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const audioRes = await fetch(audioUrl, {
      headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken }
    });

    if (!audioRes.ok) {
      console.warn(`[Recordings] Audio fetch from ${audioUrl} failed with status: ${audioRes.status}`);
      return null;
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[Recordings] Got ${buffer.length} bytes from ${audioUrl}`);

    // Validate the content is actually audio
    if (!isAudioBuffer(buffer)) {
      // Log first 200 chars of response for debugging (may be JSON/HTML error)
      const preview = buffer.toString("utf-8", 0, Math.min(200, buffer.length));
      console.error(`[Recordings] Response from ${audioUrl} is not valid audio. Preview: ${preview.substring(0, 100)}`);
      return null;
    }

    // Detect content type from magic bytes (authoritative) or response header
    let contentType = detectContentType("", buffer);
    if (!contentType) {
      // Fallback to response header
      const headerContentType = audioRes.headers.get("content-type") || "";
      if (headerContentType.includes("audio")) {
        contentType = headerContentType.split(";")[0].trim();
      } else {
        // Last resort: use extension-based detection
        contentType = detectContentType(audioUrl) || "application/octet-stream";
      }
    }

    console.log(`[Recordings] ✅ Valid audio: ${buffer.length} bytes, type: ${contentType}`);
    return { buffer, contentType };
  } catch (e) {
    console.error(`[Recordings] Download error from ${audioUrl}:`, e);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 1. Try to serve the local recording
  const filePath = path.join(RECORDINGS_DIR, filename);

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const range = request.headers.get("range");

    // Validate the local file is actually audio
    const headerBuf = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    const contentType = detectContentType(filename, headerBuf) || detectContentType(filename);

    if (!contentType) {
      console.error(`[Recordings] Local file is not valid audio: ${filename}`);
      return new NextResponse("File exists but is not valid audio", { status: 422 });
    }

    console.log(`[Recordings] Serving local file: ${filename}, type: ${contentType}`);

    // Support range requests for seeking
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end }) as any;

      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
        },
      });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Accept-Ranges": "bytes",
      },
    });
  }

  // 2. If not found locally, proxy it from the Vobiz API
  const { authId, authToken } = loadVobizCredentials();

  if (!authId || !authToken) {
    console.error("[Recordings] Missing VOBIZ_AUTH_ID or VOBIZ_AUTH_TOKEN");
    return new NextResponse("Recording not found and Vobiz credentials not configured", { status: 404 });
  }

  const headers = {
    "X-Auth-ID": authId,
    "X-Auth-Token": authToken,
    "Accept": "application/json"
  };

  try {
    const inputUuid = filename.replace(/\.\w+$/, ""); // Strip any extension (e.g., .wav)
    console.log(`[Recordings] Looking up recording for: ${inputUuid}`);

    // Search for the recording on Vobiz (matches both call UUID and recording UUID)
    const found = await findVobizRecording(inputUuid, authId, headers);

    if (found) {
      const result = await downloadFromVobiz(found.recordingUuid, authId, authToken, headers);

      if (result) {
        // Save locally for future requests
        try {
          if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
          fs.writeFileSync(path.join(RECORDINGS_DIR, filename), result.buffer);
          console.log(`[Recordings] Saved locally: ${filename}`);
        } catch (saveErr) {
          console.warn(`[Recordings] Could not save locally:`, saveErr);
        }

        return new NextResponse(result.buffer, {
          headers: {
            "Content-Type": result.contentType,
            "Content-Length": result.buffer.length.toString(),
            "Accept-Ranges": "bytes",
          }
        });
      } else {
        console.error(`[Recordings] Found recording ${found.recordingUuid} but could not download valid audio`);
      }
    } else {
      console.error(`[Recordings] No recording found for UUID: ${inputUuid}`);
    }
  } catch (e) {
    console.error("[Recordings] Failed to proxy recording from Vobiz", e);
  }

  return new NextResponse("Recording not found locally or on Vobiz", { status: 404 });
}
