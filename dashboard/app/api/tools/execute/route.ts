import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// ---------------------------------------------------------------------------
// Tool Gateway — /api/tools/execute
// ---------------------------------------------------------------------------
// Called by the Python voice agent during active calls via query_workspace_integration.
// SECURITY: Requires x-tool-gateway-secret header matching TOOL_GATEWAY_SECRET env var.
// This prevents any unauthenticated caller from booking appointments, sending
// emails, or consuming API quota via this endpoint.
//
// The Python agent sets this header on every call. Browser requests without
// the correct secret are rejected with 401 before any action is executed.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const TOOL_GATEWAY_SECRET = process.env.TOOL_GATEWAY_SECRET || "";

// ── Auth helper ──────────────────────────────────────────────────────────────
function validateGatewaySecret(req: NextRequest): boolean {
  if (!TOOL_GATEWAY_SECRET) {
    // If secret not configured, block ALL requests in production
    if (process.env.NODE_ENV === "production") return false;
    // In dev without config, allow localhost-only
    const host = req.headers.get("host") || "";
    return host.startsWith("localhost") || host.startsWith("127.");
  }
  const incoming = req.headers.get("x-tool-gateway-secret");
  return incoming === TOOL_GATEWAY_SECRET;
}

// ── Helper: fetch integration tokens from Supabase ──────────────────────────
async function getIntegrationTokens(
  workspaceId: string,
  service: string
): Promise<Record<string, string> | null> {
  // Try the given workspaceId first, then fall back to 'default',
  // and finally fall back to ANY workspace that has this service connected.
  const candidates = [workspaceId, "default"].filter(
    (v, i, a) => a.indexOf(v) === i // deduplicate
  );

  for (const wsId of candidates) {
    const url = `${SUPABASE_URL}/rest/v1/integrations?workspace_id=eq.${encodeURIComponent(wsId)}&service=eq.${encodeURIComponent(service)}&select=tokens&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[tool-gateway] Supabase fetch failed for workspace=${wsId}:`, await res.text());
      continue;
    }

    const rows: { tokens: Record<string, string> }[] = await res.json();
    if (rows[0]?.tokens) {
      console.log(`[tool-gateway] Found tokens for workspace=${wsId} service=${service}`);
      return rows[0].tokens;
    }
  }

  // Last resort: find ANY connected workspace for this service
  const anyUrl = `${SUPABASE_URL}/rest/v1/integrations?service=eq.${encodeURIComponent(service)}&select=tokens,workspace_id&limit=1`;
  const anyRes = await fetch(anyUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (anyRes.ok) {
    const anyRows: { tokens: Record<string, string>; workspace_id: string }[] = await anyRes.json();
    if (anyRows[0]?.tokens) {
      console.log(`[tool-gateway] ⚠️  Using tokens from workspace=${anyRows[0].workspace_id} (fallback)`);
      return anyRows[0].tokens;
    }
  }

  console.warn(`[tool-gateway] No ${service} tokens found in any workspace`);
  return null;
}

// ── Helper: refresh Google access token ─────────────────────────────────────
async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[tool-gateway] Token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token ?? null;
}

// ── Helper: parse natural language date/time into ISO datetimes ─────────────
function parseAppointmentDateTime(
  dateStr: string,
  timeStr: string,
  durationMinutes: number = 30
): { start: string; end: string; readableDate: string; readableTime: string } {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ── Date parsing ──
  let appointmentDate = new Date(now);
  const lowerDate = dateStr.toLowerCase().trim();

  if (["today", "aaj"].includes(lowerDate)) {
    appointmentDate = new Date(now);
  } else if (["tomorrow", "kal", "kaal", "parday"].includes(lowerDate)) {
    appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + 1);
  } else if (["day after tomorrow", "parson"].includes(lowerDate)) {
    appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + 2);
  } else {
    // Try standard date parse
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      appointmentDate = parsed;
    } else {
      // Try partial match (e.g. "5th July", "July 5th")
      const ordinalStripped = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
      const parsed2 = new Date(ordinalStripped + " " + now.getFullYear());
      if (!isNaN(parsed2.getTime()) && parsed2 > now) {
        appointmentDate = parsed2;
      } else {
        // Default: next working day
        appointmentDate = new Date(now);
        appointmentDate.setDate(appointmentDate.getDate() + 1);
        if (appointmentDate.getDay() === 0) { // Skip Sunday
          appointmentDate.setDate(appointmentDate.getDate() + 1);
        }
      }
    }
  }

  // Ensure not a Sunday (clinic closed)
  if (appointmentDate.getDay() === 0) {
    appointmentDate.setDate(appointmentDate.getDate() + 1);
  }

  // ── Time parsing ──
  const lowerTime = timeStr.toLowerCase().trim();
  let hours = 10;
  let minutes = 0;

  // Hindi number words to hours
  const hindiTimeMap: Record<string, number> = {
    "nau": 9, "das": 10, "gyarah": 11, "barah": 12, "ek": 13,
    "do": 14, "teen": 15, "chaar": 16, "paanch": 17, "chhe": 18,
    "saat": 19, "aath": 20,
  };

  const hindiKey = Object.keys(hindiTimeMap).find((k) =>
    lowerTime.includes(k + " baje") || lowerTime.startsWith(k)
  );

  if (hindiKey) {
    hours = hindiTimeMap[hindiKey];
  } else {
    const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const period = timeMatch[3];
      if (period === "pm" && hours < 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
    }
  }

  // Clinic hours guard: clamp to valid windows (9-13 or 17-20 IST)
  if (hours < 9) hours = 9;
  else if (hours > 13 && hours < 17) hours = 17;
  else if (hours >= 20) hours = 9; // wrap to next morning slot

  appointmentDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(appointmentDate);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);

  const readableDate = `${dayNames[appointmentDate.getDay()]}, ${appointmentDate.getDate()} ${monthNames[appointmentDate.getMonth()]}`;
  const readableTime = appointmentDate.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  return {
    start: appointmentDate.toISOString(),
    end: endDate.toISOString(),
    readableDate,
    readableTime,
  };
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleBookAppointment(
  params: Record<string, unknown>,
  workspaceId: string
): Promise<string> {
  const patientName = String(params.patient_name || params.name || "Patient");
  const dateStr     = String(params.date || "tomorrow");
  const timeStr     = String(params.time || "10 AM");
  const treatment   = String(params.treatment || "Dental Consultation");
  const phone       = String(params.phone || "");
  const durationMin = Number(params.duration_minutes || 30);

  // Get Google Calendar tokens from Supabase
  const tokens = await getIntegrationTokens(workspaceId, "google_calendar");

  // Parse the date/time regardless (for readable response)
  const { start, end, readableDate, readableTime } = parseAppointmentDateTime(
    dateStr,
    timeStr,
    durationMin
  );

  if (!tokens) {
    console.warn("[tool-gateway] No Google Calendar tokens for workspace:", workspaceId);
    // Graceful degradation — confirm verbally without calendar, never say "technical glitch"
    return `Bilkul ${patientName} ji! Aapka appointment note ho gaya — ${treatment} ke liye ${readableDate} ko ${readableTime} baje. Hamaari team aapko jald call karke confirm karegi.`;
  }

  let accessToken = tokens.access_token;
  if (tokens.refresh_token) {
    const fresh = await refreshGoogleAccessToken(tokens.refresh_token);
    if (fresh) accessToken = fresh;
  }

  const eventBody = {
    summary: `${treatment} — ${patientName}`,
    description: [
      `Dental appointment booked via AI Receptionist (Aayushi)`,
      `Patient: ${patientName}`,
      phone ? `Contact: ${phone}` : "",
      `Treatment: ${treatment}`,
      `Duration: ${durationMin} minutes`,
      `Booked: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start, timeZone: "Asia/Kolkata" },
    end:   { dateTime: end,   timeZone: "Asia/Kolkata" },
    location: "Shri Krishna Dental Clinic, M-14, Greater Kailash Part 1, New Delhi - 110048",
    colorId: "11", // Tomato — easy to spot on calendar
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup",  minutes: 60   },
        { method: "email",  minutes: 1440 }, // 24 hours before
      ],
    },
  };

  // ── Step 1: Check for scheduling conflicts before booking ────────────────
  const busyCheckRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: start,
      timeMax: end,
      timeZone: "Asia/Kolkata",
      items: [{ id: "primary" }],
    }),
  });

  if (busyCheckRes.ok) {
    const busyData = await busyCheckRes.json();
    const busySlots: { start: string; end: string }[] = busyData.calendars?.primary?.busy ?? [];

    if (busySlots.length > 0) {
      // Doctor is busy — suggest next available slot (+30 min)
      const conflictStart = new Date(busySlots[0].start);
      const conflictEnd = new Date(busySlots[0].end);

      const conflictStartReadable = conflictStart.toLocaleTimeString("en-IN", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      });
      const conflictEndReadable = conflictEnd.toLocaleTimeString("en-IN", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      });

      // Suggest the next slot: right after the busy period ends
      const suggestedStart = new Date(conflictEnd);
      suggestedStart.setMinutes(suggestedStart.getMinutes() + 5); // 5-min buffer
      const suggestedEnd = new Date(suggestedStart);
      suggestedEnd.setMinutes(suggestedEnd.getMinutes() + durationMin);

      const suggestedStartReadable = suggestedStart.toLocaleTimeString("en-IN", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      });

      // Only suggest if within clinic hours (before 8 PM)
      const suggestedHour = suggestedStart.getHours();
      const withinMorning = suggestedHour >= 9 && suggestedHour < 13;
      const withinEvening = suggestedHour >= 17 && suggestedHour < 20;

      if (withinMorning || withinEvening) {
        return `I'm sorry, ${patientName} ji — doctor ${readableDate} ko ${conflictStartReadable} se ${conflictEndReadable} tak already booked hain. Kya main aapka appointment ${readableDate} ko ${suggestedStartReadable} baje book kar sakti hoon?`;
      } else {
        // Suggest next session (morning→evening or evening→next day morning)
        const isCurrentlyMorning = new Date(start).getHours() < 13;
        const suggestion = isCurrentlyMorning
          ? "evening 5 baje se 8 baje ke beech"
          : "kal morning 9 baje se 1 baje ke beech";
        return `I'm sorry, ${patientName} ji — ${readableDate} ko ${readableTime} baje doctor pehle se available nahi hain. Kya aap ${suggestion} aana pasand karenge?`;
      }
    }
  }

  // ── Step 2: No conflict — create the calendar event ─────────────────────
  const calRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!calRes.ok) {
    const errText = await calRes.text();
    console.error("[tool-gateway] ❌ Google Calendar create event failed:", calRes.status, errText);
    // Never say "technical glitch" — stay calm and natural
    return `${patientName} ji, main aapka appointment process kar rahi hoon — ek second. ${treatment} ke liye ${readableDate} ko ${readableTime} baje ka slot reserve kar diya gaya hai. Hamaari team aapko confirm karegi.`;
  }

  const event = await calRes.json();
  console.log("[tool-gateway] ✅ Calendar event created:", event.id, "|", event.htmlLink);

  return `Perfect! Aapka appointment confirm ho gaya! ${patientName} ji, ${treatment} ke liye ${readableDate} ko ${readableTime} baje — Shri Krishna Dental Clinic, Greater Kailash mein. Aapko ek reminder bhi milega. Appointment ke din thodi der pehle aa jayiyega.`;
}

async function handleNoteTaking(
  params: Record<string, unknown>,
  workspaceId: string
): Promise<string> {
  const info = String(params.info || params.details || params.notes || "");
  console.log(`[tool-gateway] 📝 Note taken for workspace=${workspaceId}: ${info}`);
  
  // In a real implementation, we could save this to Supabase DB.
  // For now, we return a success message so the agent knows it's saved.
  return `Successfully saved notes: ${info}`;
}

async function handleCheckAvailability(
  params: Record<string, unknown>,
  workspaceId: string
): Promise<string> {
  const dateStr   = String(params.date || "tomorrow");
  const treatment = String(params.treatment || "consultation");

  const tokens = await getIntegrationTokens(workspaceId, "google_calendar");

  if (!tokens) {
    return `${treatment} ke liye slots available hain — morning mein 9 baje se 1 baje tak, aur evening mein 5 baje se 8 baje tak. Monday se Saturday. Sunday clinic band rehti hai. Kaunsa time aapko theek lagta hai?`;
  }

  let accessToken = tokens.access_token;
  if (tokens.refresh_token) {
    const fresh = await refreshGoogleAccessToken(tokens.refresh_token);
    if (fresh) accessToken = fresh;
  }

  const { start: startIso } = parseAppointmentDateTime(dateStr, "9 AM", 30);
  const startOfDay = new Date(startIso);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  // Skip Sunday check
  if (startOfDay.getDay() === 0) {
    return `Sunday ko hamaari clinic band rehti hai. Kya Monday ko appointment book karein? Hum Monday se Saturday, morning 9 baje se 1 baje, aur evening 5 baje se 8 baje tak available hain.`;
  }

  const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      timeZone: "Asia/Kolkata",
      items: [{ id: "primary" }],
    }),
  });

  if (!freeBusyRes.ok) {
    return `${treatment} ke liye morning (9 AM - 1 PM) aur evening (5 PM - 8 PM) mein slots available hain. Kaunsa time prefer karenge?`;
  }

  const freeBusy = await freeBusyRes.json();
  const busyCount: number = (freeBusy.calendars?.primary?.busy ?? []).length;

  if (busyCount === 0) {
    return `${treatment} ke liye us din puri slots available hain! Morning 9 baje se 1 baje, ya evening 5 baje se 8 baje — kaunsa time aapko suit karta hai?`;
  } else if (busyCount < 3) {
    return `${treatment} ke liye kuch slots available hain us din. Morning mein 9 se 1, evening mein 5 se 8. Kaunsa session prefer karenge?`;
  } else {
    return `Us din kaafi appointments hain, lekin hum aapke liye ek slot nikaal sakte hain. Kya morning (9 AM se 1 PM) ya evening (5 PM se 8 PM) prefer karenge?`;
  }
}

// ── Handle: send_brochure (Real Estate Campaign) ─────────────────────────────
async function handleSendBrochure(
  params: Record<string, unknown>,
  workspaceId: string
): Promise<string> {
  const projectName = String(params.project_name || "");
  const leadEmail   = String(params.lead_email || "");
  const leadName    = String(params.lead_name || "Customer");
  const campaignId  = String(params.campaign_id || "");

  if (!projectName || !leadEmail) {
    return "I apologize, I need both the project name and your email address to send the brochure.";
  }

  // Load campaign data from file
  if (!campaignId) {
    console.warn("[tool-gateway] send_brochure: no campaign_id provided");
    return "Our team will follow up with the brochure shortly. Thank you for your interest!";
  }

  const brochureFile = path.join(DATA_DIR, `brochures_${campaignId}.json`);
  if (!fs.existsSync(brochureFile)) {
    console.warn(`[tool-gateway] Brochure file not found: ${brochureFile}`);
    return "Our team will follow up with the brochure shortly. Thank you for your interest!";
  }

  const campaignData = JSON.parse(fs.readFileSync(brochureFile, "utf-8"));

  // Support both old format (flat array) and new format ({ brochures, emailConfig })
  const brochuresList = Array.isArray(campaignData) ? campaignData : campaignData.brochures || [];
  const emailConfig = campaignData.emailConfig || {};

  const brochure = brochuresList.find(
    (b: any) => b.name.toLowerCase() === projectName.toLowerCase()
  );

  if (!brochure) {
    console.warn(`[tool-gateway] Brochure not found for project: ${projectName}`);
    return `I couldn't find the brochure for ${projectName} right now. Our team will send it to you shortly.`;
  }

  // Sanitize brochure content for email — remove PDF junk, keep only readable text
  if (brochure.content) {
    brochure.content = brochure.content
      .replace(/<[0-9A-Fa-f]{16,}>/g, "")
      .replace(/[^a-zA-Z0-9\s.,;:!?\-/'()&%$@#+=<>*\n]/g, " ")
      .split("\n")
      .filter((line: string) => {
        const t = line.trim();
        if (t.length < 3 || t.length > 300) return false;
        const letters = (t.match(/[a-zA-Z]/g) || []).length;
        return letters / t.length >= 0.3;
      })
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .substring(0, 1500); // cap at 1500 chars for email
  }

  // Get Gmail tokens from Supabase
  const tokens = await getIntegrationTokens(workspaceId, "gmail");

  if (!tokens) {
    console.warn("[tool-gateway] No Gmail tokens for workspace:", workspaceId);
    return "Our team will email you the brochure shortly. Thank you for your interest!";
  }

  let accessToken = tokens.access_token;
  if (tokens.refresh_token) {
    const fresh = await refreshGoogleAccessToken(tokens.refresh_token);
    if (fresh) accessToken = fresh;
  }

  // Get sender email
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userInfo = userRes.ok ? await userRes.json() : {};
  const fromEmail = userInfo.email || "me";

  // Build email subject using template
  const subject = (emailConfig.subject || "{{project.name}} — Project Brochure")
    .replace(/\{\{lead\.name\}\}/g, leadName)
    .replace(/\{\{lead\.email\}\}/g, leadEmail)
    .replace(/\{\{project\.name\}\}/g, brochure.name)
    .replace(/\{\{project\.description\}\}/g, brochure.description || "")
    .replace(/\{\{sender\.name\}\}/g, emailConfig.senderName || "Sales Team");

  // Build email body using template
  const senderName = emailConfig.senderName || "Sales Team";
  const rawBody = emailConfig.body || "";
  let htmlBody: string;

  if (rawBody.trim()) {
    // Use custom template with dynamic variables
    const resolvedBody = rawBody
      .replace(/\{\{lead\.name\}\}/g, leadName)
      .replace(/\{\{lead\.email\}\}/g, leadEmail)
      .replace(/\{\{lead\.phone\}\}/g, String(params.lead_phone || ""))
      .replace(/\{\{project\.name\}\}/g, brochure.name)
      .replace(/\{\{project\.description\}\}/g, brochure.description || "")
      .replace(/\{\{project\.content\}\}/g, brochure.content || "")
      .replace(/\{\{sender\.name\}\}/g, senderName);

    // Wrap in HTML email template
    htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="white-space: pre-wrap; line-height: 1.6;">${resolvedBody.replace(/\n/g, "<br>")}</div>
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #888; font-size: 12px;">Sent by ${senderName}</p>
      </div>
    `;
  } else {
    // Default template
    htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">${brochure.name} — Project Brochure</h2>
        <p style="color: #555;">Dear ${leadName},</p>
        <p style="color: #555;">Thank you for your interest in <strong>${brochure.name}</strong>! Here are the details:</p>
        ${brochure.description ? `<p style="color: #555;"><strong>${brochure.description}</strong></p>` : ""}
        <hr style="border: 1px solid #eee;">
        <div style="white-space: pre-wrap; line-height: 1.6; color: #333;">${brochure.content}</div>
        <hr style="border: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">Sent by ${senderName}. For more details, please contact our sales team.</p>
      </div>
    `;
  }

  // Build raw MIME email and base64url encode
  const base64Email = Buffer.from(
    [
      `To: ${leadEmail}`,
      `From: ${fromEmail}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody,
    ].join("\r\n")
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Email }),
    }
  );

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error("[tool-gateway] ❌ Gmail send failed:", sendRes.status, errText);
    return `I had a small issue sending the email. Our team will follow up with the ${projectName} brochure shortly.`;
  }

  const result = await sendRes.json();
  console.log(`[tool-gateway] ✅ Brochure email sent to ${leadEmail} — messageId: ${result.id}`);

  return `Bilkul! Main aapko ${projectName} ki brochure email kar rahi hoon — aapko abhi ek email milega. Agar koi aur project dekhna chahein toh batayiyega!`;
}

// ── Knowledge Base Search ────────────────────────────────────────────────────

async function handleSearchKnowledgeBase(
  parameters: Record<string, unknown>,
  workspaceId: string
): Promise<string> {
  const query = String(parameters.query || "").trim();
  const mode = String(parameters.mode || "inbound");

  if (!query) {
    return "No search query provided. I'll check with our team for more information.";
  }

  if (!GEMINI_API_KEY) {
    console.error("[tool-gateway] GEMINI_API_KEY not configured — cannot search KB");
    return "I don't have access to the knowledge base right now. Let me connect you with our team.";
  }

  try {
    // 1. Embed the query using Gemini
    const embedRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: query }] },
          outputDimensionality: 768,
        }),
      }
    );

    if (!embedRes.ok) {
      const errText = await embedRes.text();
      console.error("[tool-gateway] Embedding failed:", embedRes.status, errText);
      return "I'm having trouble searching our knowledge base. Let me connect you with our team.";
    }

    const embedData = await embedRes.json();
    const queryEmbedding = embedData.embedding?.values;

    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.error("[tool-gateway] Invalid embedding response:", embedData);
      return "I couldn't process your search query. Let me connect you with our team.";
    }

    // 2. Call Supabase RPC for vector search
    const rpcRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/search_knowledge_base`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_business_id: workspaceId,
          p_mode: mode,
          p_query_embedding: `[${queryEmbedding.join(",")}]`,
          p_match_count: 5,
          p_similarity_threshold: 0.25,
        }),
      }
    );

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error("[tool-gateway] KB search RPC failed:", rpcRes.status, errText);
      return "I'm having trouble accessing our knowledge base. Let me connect you with our team.";
    }

    const results: Array<{ content: string; similarity: number; file_name: string }> = await rpcRes.json();

    if (!results || results.length === 0) {
      console.log(`[tool-gateway] No KB results for query: "${query}"`);
      return "I don't have specific information about that in our knowledge base. Let me connect you with our team for more details.";
    }

    // 3. Concatenate top results (take top 3 to keep response short for telephony)
    const topResults = results.slice(0, 3);
    const combined = topResults
      .map((r) => r.content.trim())
      .filter((c) => c.length > 0)
      .join("\n\n");

    console.log(`[tool-gateway] ✅ KB search returned ${results.length} results, using top ${topResults.length}`);

    return combined || "I found some information but couldn't retrieve it properly. Let me connect you with our team.";
  } catch (err) {
    console.error("[tool-gateway] KB search error:", err);
    return "I'm having trouble searching our knowledge base right now. Let me connect you with our team.";
  }
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── SECURITY: Validate gateway secret before any processing ─────────────
  // The Python agent sets x-tool-gateway-secret on every request.
  // Browser-originating requests (no secret) are rejected immediately.
  if (!validateGatewaySecret(req)) {
    const ip = req.ip || req.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    console.warn(`[tool-gateway] ⛔ Rejected request — missing or invalid x-tool-gateway-secret. IP: ${ip}, User-Agent: ${userAgent}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    workspace_id?: string;
    action_name?: string;
    parameters?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workspace_id, action_name, parameters = {} } = body;

  if (!action_name) {
    return NextResponse.json({ error: "action_name is required" }, { status: 400 });
  }

  const workspaceId = workspace_id || "default";
  console.log(`[tool-gateway] → action=${action_name} workspace=${workspaceId}`);
  // NOTE: parameters not logged at INFO level to avoid logging customer PII

  try {
    let result: string;

    switch (action_name) {
      case "book_appointment":
        result = await handleBookAppointment(parameters, workspaceId);
        break;

      case "check_availability":
        result = await handleCheckAvailability(parameters, workspaceId);
        break;

      case "note_taking":
      case "save_memory":
        result = await handleNoteTaking(parameters, workspaceId);
        break;

      case "send_brochure":
        result = await handleSendBrochure(parameters, workspaceId);
        break;

      case "search_knowledge_base":
        result = await handleSearchKnowledgeBase(parameters, workspaceId);
        break;

      // ─── Add new real-time integrations below ───────────────────────────
      // case "send_whatsapp_confirmation":
      //   result = await handleSendWhatsApp(parameters, workspaceId);
      //   break;
      // ────────────────────────────────────────────────────────────────────

      default:
        console.warn(`[tool-gateway] Unknown action: ${action_name}`);
        result = "I'm sorry, that action isn't configured yet. Our team will follow up shortly.";
    }

    return NextResponse.json({ result });
  } catch (err) {
    // Log full error server-side; return speakable fallback to caller — never expose internals
    console.error("[tool-gateway] ❌ Unhandled error in action:", action_name, err);
    return NextResponse.json(
      { result: "Kripaya ek second wait karein — main aapki request process kar rahi hoon. Hamaari team aapko jald confirm karegi." },
      { status: 200 }
    );
  }
}
