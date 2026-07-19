import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Define paths relative to the root project
const DATA_DIR = path.join(process.cwd(), "..", "data");
const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");

// Detect content type from file extension or buffer
function detectContentType(filename: string, buffer?: Buffer): string {
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
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "audio/mp4";
  }

  // Default to WAV for backward compatibility
  return "audio/wav";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 1. Try to serve the local recording from the python agent
  const filePath = path.join(RECORDINGS_DIR, filename);

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const range = request.headers.get("range");

    // Read first few bytes to detect actual format
    const fd = fs.openSync(filePath, "r");
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);
    const contentType = detectContentType(filename, headerBuf);

    console.log(`[Recordings] Serving local file: ${filename}, detected: ${contentType}`);

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
  // Get credentials from root .env manually
  const envPath = path.join(process.cwd(), "..", ".env");
  let authId = process.env.VOBIZ_AUTH_ID;
  let authToken = process.env.VOBIZ_AUTH_TOKEN;
  
  if (fs.existsSync(envPath) && (!authId || !authToken)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach(line => {
      const [key, ...values] = line.split("=");
      if (key === "VOBIZ_AUTH_ID") authId = values.join("=").trim().replace(/\r/g, "");
      if (key === "VOBIZ_AUTH_TOKEN") authToken = values.join("=").trim().replace(/\r/g, "");
    });
  }

  if (authId && authToken) {
    const headers = {
      "X-Auth-ID": authId,
      "X-Auth-Token": authToken,
      "Accept": "application/json"
    };

    try {
      const callUuid = filename.replace(/\.wav$/, "");
      console.log(`[Recordings] Looking up recording for call: ${callUuid}`);

      // Step 1: Search recordings list — the file name is the SIP call UUID,
      // but Vobiz recordings have their own UUID. Match by call_uuid field.
      let recordingUuid: string | null = null;
      let recordingMeta: any = null;
      let offset = 0;
      let found = false;

      for (let page = 0; page < 20 && !found; page++) {
        const listUrl = `https://api.vobiz.ai/api/v1/Account/${authId}/Recording/?limit=100&offset=${offset}`;
        const listRes = await fetch(listUrl, { headers });
        if (!listRes.ok) break;

        const listJson = await listRes.json();
        const items = listJson?.objects ?? listJson?.data ?? listJson?.results ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          if (item.call_uuid === callUuid || item.sip_call_id === callUuid) {
            recordingUuid = item.uuid || item.id;
            recordingMeta = item;
            found = true;
            break;
          }
        }
        offset += items.length;
      }

      if (recordingUuid) {
        console.log(`[Recordings] Found recording UUID: ${recordingUuid} for call ${callUuid}`);

        // Step 2: Try to get the recording detail which may have a direct URL
        const detailUrl = `https://api.vobiz.ai/api/v1/Account/${authId}/Recording/${recordingUuid}/`;
        const detailRes = await fetch(detailUrl, { headers });
        let audioUrl: string | null = null;

        if (detailRes.ok) {
          const detail = await detailRes.json();
          audioUrl = detail.url || detail.recording_url || detail.audio_url || detail.file_url || detail.download_url || detail.media_url;
          console.log(`[Recordings] Detail audio URL: ${audioUrl || "none"}`);
        }

        // Step 3: If no direct URL, try media.vobiz.ai with different extensions
        const extensions = [".wav", ".mp3", ".ogg", ".m4a"];
        for (const ext of extensions) {
          if (audioUrl) break;
          const tryUrl = `https://media.vobiz.ai/v1/Account/${authId}/Recording/${recordingUuid}${ext}`;
          console.log(`[Recordings] Trying: ${tryUrl}`);
          try {
            const tryRes = await fetch(tryUrl, {
              method: "HEAD",
              headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken }
            });
            if (tryRes.ok) {
              audioUrl = tryUrl;
              console.log(`[Recordings] ✅ Found at: ${audioUrl}`);
            }
          } catch {}
        }

        // Fallback to .wav if nothing worked
        if (!audioUrl) {
          audioUrl = `https://media.vobiz.ai/v1/Account/${authId}/Recording/${recordingUuid}.wav`;
        }

        console.log(`[Recordings] Fetching audio from: ${audioUrl}`);
        const audioRes = await fetch(audioUrl, {
          headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken }
        });

        if (audioRes.ok) {
          const arrayBuffer = await audioRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Detect content type from response header OR from buffer magic bytes
          let contentType = audioRes.headers.get("content-type") || "";
          if (!contentType.includes("audio")) {
            // Vobiz might return wrong content-type — detect from buffer
            contentType = detectContentType(filename, buffer);
            console.log(`[Recordings] Vobiz returned non-audio content-type, detected: ${contentType}`);
          }

          console.log(`[Recordings] ✅ Got ${buffer.length} bytes, content-type: ${contentType}`);

          // Save locally for future requests
          try {
            const saveDir = path.join(process.cwd(), "..", "data", "recordings");
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
            fs.writeFileSync(path.join(saveDir, filename), buffer);
            console.log(`[Recordings] Saved locally: ${filename}`);
          } catch (saveErr) {
            console.warn(`[Recordings] Could not save locally:`, saveErr);
          }

          return new NextResponse(buffer, {
            headers: {
              "Content-Type": contentType,
              "Content-Length": buffer.length.toString(),
              "Accept-Ranges": "bytes",
            }
          });
        } else {
          const errText = await audioRes.text().catch(() => "");
          console.error(`[Recordings] Audio fetch failed: ${audioRes.status} ${errText.substring(0, 200)}`);
        }
      } else {
        console.error(`[Recordings] No recording found matching call UUID: ${callUuid}`);
      }
    } catch (e) {
      console.error("[Recordings] Failed to proxy recording from Vobiz", e);
    }
  } else {
    console.error("[Recordings] Missing VOBIZ_AUTH_ID or VOBIZ_AUTH_TOKEN");
  }

  return new NextResponse("Recording not found locally or on Vobiz", { status: 404 });
}
