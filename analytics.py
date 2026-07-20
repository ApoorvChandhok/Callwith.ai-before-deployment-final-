import os
import json
import logging
import datetime
import urllib.request
import urllib.error
from groq import Groq

logger = logging.getLogger("analytics")

DATA_DIR = "data"
LEADS_FILE = os.path.join(DATA_DIR, "leads.csv")
LOGS_FILE = os.path.join(DATA_DIR, "call_logs.json")

# Supabase config
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

def save_lead_csv(name: str, phone: str, city: str, email: str = "", status: str = "contact_captured", intent: str = "", business_id: str = None, business_type: str = "Inbound"):
    """Save lead to local CSV and immediately sync to Supabase."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        write_header = not os.path.exists(LEADS_FILE)
        with open(LEADS_FILE, "a", encoding="utf-8") as f:
            if write_header:
                f.write("Timestamp,Name,Phone,City,Email,Status,Intent\n")
            timestamp = datetime.datetime.now().isoformat()
            f.write(f'"{timestamp}","{name}","{phone}","{city}","{email}","{status}","{intent}"\n')
        logger.info(f"[ANALYTICS] Lead saved to CSV — status={status!r}, intent={intent!r}.")
    except Exception as e:
        logger.error(f"[ANALYTICS] Failed to save lead to CSV: {e}")

    # ── Immediate Supabase sync (runs in a background thread — never blocks the call) ──
    import threading
    def _sync():
        try:
            upsert_lead_from_call(
                phone=phone,
                name=name,
                email=email,
                city=city,
                caller_intent=intent,
                summary=f"Contact captured — status: {status}",
                business_id=business_id,
                business_type=business_type,
            )
        except Exception as e:
            logger.warning(f"[ANALYTICS] Supabase sync for {phone!r} failed (non-fatal): {e}")
    threading.Thread(target=_sync, daemon=True).start()


def upsert_lead_from_call(phone: str, name: str = "", email: str = "", city: str = "",
                          sentiment: str = "", caller_intent: str = "",
                          summary: str = "", business_id: str = None,
                          business_type: str = "", campaign_id: str = "") -> str | None:
    """
    Auto-CRM: Upsert lead after every call.
    - If phone exists → update call_count, append note
    - If phone is new → create lead with "AI Agent" source
    - business_type: "real_estate", "car_dealership", "inbound", etc.
    - campaign_id: used to auto-detect business_type if not provided
    Returns: lead_id (uuid) if successful, None otherwise.
    """
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        logger.info("[CRM] Supabase not configured — skipping upsert")
        return None

    if not business_id:
        business_id = "11111111-1111-1111-1111-111111111111"  # Default workspace (RapidX)

    # Auto-detect business_type from campaign_id prefix if not provided
    if not business_type and campaign_id:
        if campaign_id.startswith("re_"):
            business_type = "Real Estate"
        elif campaign_id.startswith("cd_"):
            business_type = "Car Dealership"
        elif campaign_id.startswith("wf_"):
            business_type = "Workflow"
        else:
            business_type = "Outbound Campaign"

    clean_phone = phone.replace(" ", "").replace("+", "").strip()
    if not clean_phone:
        logger.warning("[CRM] Empty phone — skipping upsert")
        return None

    now = datetime.datetime.utcnow().isoformat() + "Z"

    # Check if lead exists
    fetch_url = f"{_SUPABASE_URL}/rest/v1/leads?phone=eq.{clean_phone}&business_id=eq.{business_id}&select=id,call_count,notes"
    fetch_req = urllib.request.Request(
        fetch_url,
        headers={
            "apikey": _SUPABASE_KEY,
            "Authorization": f"Bearer {_SUPABASE_KEY}",
            "Accept": "application/json",
        },
    )

    existing_lead = None
    try:
        with urllib.request.urlopen(fetch_req, timeout=5) as resp:
            rows = json.loads(resp.read().decode())
            if rows:
                existing_lead = rows[0]
    except Exception as e:
        logger.debug(f"[CRM] Lead fetch failed: {e}")

    if existing_lead:
        # UPDATE existing lead
        existing_notes = existing_lead.get("notes") or []
        if isinstance(existing_notes, str):
            try:
                existing_notes = json.loads(existing_notes)
            except:
                existing_notes = []

        new_note = {
            "text": f"Call completed: {summary}" if summary else f"Call completed — sentiment: {sentiment}",
            "timestamp": now,
        }
        existing_notes.append(new_note)

        # Keep only last 10 notes
        existing_notes = existing_notes[-10:]

        patch = {
            "call_count": (existing_lead.get("call_count") or 0) + 1,
            "sentiment": sentiment or None,
            "caller_intent": caller_intent or None,
            "notes": existing_notes,
            "last_activity_at": now,
        }
        if business_type:
            patch["business_type"] = business_type
        if name:
            patch["name"] = name
        if email:
            patch["email"] = email

        patch_body = json.dumps(patch).encode()
        patch_url = f"{_SUPABASE_URL}/rest/v1/leads?id=eq.{existing_lead['id']}"
        patch_req = urllib.request.Request(
            patch_url, data=patch_body, method="PATCH",
            headers={
                "apikey": _SUPABASE_KEY,
                "Authorization": f"Bearer {_SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(patch_req, timeout=5):
                logger.info(f"[CRM] ✅ Lead updated — {name or clean_phone} (call #{(existing_lead.get('call_count') or 0) + 1})")
                return existing_lead['id']
        except Exception as e:
            logger.error(f"[CRM] Lead update failed: {e}")
            return existing_lead['id']  # Return ID even if update failed
    else:
        # CREATE new lead
        row = {
            "business_id": business_id,
            "name": name or None,
            "phone": clean_phone,
            "email": email or None,
            "city": city or None,
            "status": "New",
            "priority": "Medium",
            "source": "AI Agent",
            "business_type": business_type or "Unknown",
            "caller_intent": caller_intent or None,
            "sentiment": sentiment or None,
            "call_count": 1,
            "notes": [{"text": f"First call: {summary}" if summary else f"First call — sentiment: {sentiment}", "timestamp": now}],
            "last_activity_at": now,
        }
        insert_body = json.dumps(row).encode()
        insert_url = f"{_SUPABASE_URL}/rest/v1/leads"
        insert_req = urllib.request.Request(
            insert_url, data=insert_body, method="POST",
            headers={
                "apikey": _SUPABASE_KEY,
                "Authorization": f"Bearer {_SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(insert_req, timeout=5) as resp:
                logger.info(f"[CRM] ✅ New lead created — {name or clean_phone} (AI Agent source)")
                # For POST with return=minimal, we need to fetch the lead_id
                # Query by phone to get the id
                fetch_new_url = f"{_SUPABASE_URL}/rest/v1/leads?phone=eq.{clean_phone}&business_id=eq.{business_id}&select=id&order=created_at.desc&limit=1"
                fetch_new_req = urllib.request.Request(
                    fetch_new_url,
                    headers={
                        "apikey": _SUPABASE_KEY,
                        "Authorization": f"Bearer {_SUPABASE_KEY}",
                        "Accept": "application/json",
                    },
                )
                try:
                    with urllib.request.urlopen(fetch_new_req, timeout=5) as fetch_resp:
                        rows = json.loads(fetch_resp.read().decode())
                        if rows:
                            return rows[0]['id']
                except Exception:
                    pass
                return None
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            # If business_type column doesn't exist, retry without it
            if "business_type" in body and "column" in body.lower():
                logger.warning("[CRM] business_type column missing — retrying without it")
                row.pop("business_type", None)
                retry_body = json.dumps(row).encode()
                retry_req = urllib.request.Request(
                    insert_url, data=retry_body, method="POST",
                    headers={
                        "apikey": _SUPABASE_KEY,
                        "Authorization": f"Bearer {_SUPABASE_KEY}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Prefer": "return=minimal",
                    },
                )
                try:
                    with urllib.request.urlopen(retry_req, timeout=5):
                        logger.info(f"[CRM] ✅ New lead created (without business_type) — {name or clean_phone}")
                except Exception as e2:
                    logger.error(f"[CRM] Lead creation failed on retry: {e2}")
            else:
                logger.error(f"[CRM] Lead creation failed: HTTP {e.code} — {body[:200]}")
                return None
        except Exception as e:
            logger.error(f"[CRM] Lead creation failed: {e}")
            return None


def sync_call_log_to_supabase(
    phone_number: str,
    direction: str,
    transcript: str,
    summary: str,
    sentiment: str,
    caller_intent: str,
    campaign_id: str = "",
    room_name: str = "",
    business_id: str = None,
    duration: int = 0,
    audio_url: str = None,
    lead_id: str = None,
):
    """
    Upsert call log into Supabase public.call_logs table.
    Uses Service Role Key — bypasses RLS.
    Runs synchronously so the log is persisted before the process exits.
    """
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        logger.debug("[CALL_LOG] Supabase not configured — skipping call log sync")
        return

    if not business_id:
        business_id = "11111111-1111-1111-1111-111111111111"  # Default workspace

    now = datetime.datetime.utcnow().isoformat() + "Z"

    # Transcript stored as jsonb array of message objects (or plain text fallback)
    transcript_payload = [{"text": transcript}] if transcript else []

    # Word-count based duration estimate if not provided
    if not duration and transcript:
        word_count = len(transcript.split())
        duration = max(10, int(word_count / 2.5))

    row = {
        "business_id":   business_id,
        "direction":     direction if direction in ("inbound", "outbound") else "inbound",
        "from_number":   phone_number if direction == "inbound" else None,
        "to_number":     phone_number if direction == "outbound" else None,
        "status":        "Completed" if transcript.strip() else "No Answer",
        "duration":      duration,
        "transcript":    transcript_payload,
        "audio_url":     audio_url,
        "summary":       summary,
        "sentiment":     sentiment or "Neutral",
        "caller_intent": caller_intent or "",
        "campaign_id":   campaign_id or None,
        "room_name":     room_name or None,
        "lead_id":       lead_id or None,
        "created_at":    now,
    }

    body = json.dumps(row).encode()
    req = urllib.request.Request(
        f"{_SUPABASE_URL}/rest/v1/call_logs",
        data=body,
        method="POST",
        headers={
            "apikey":        _SUPABASE_KEY,
            "Authorization": f"Bearer {_SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "Prefer":        "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8):
            logger.info(f"[CALL_LOG] ✅ Synced to Supabase — {direction} {phone_number!r}, sentiment={sentiment!r}")
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", errors="replace")
        # Column missing (migration not yet applied) — log but don't crash
        if "column" in body_err.lower():
            logger.warning(f"[CALL_LOG] Schema mismatch (run migration): {body_err[:200]}")
        else:
            logger.error(f"[CALL_LOG] Supabase insert failed: HTTP {e.code} — {body_err[:200]}")
    except Exception as e:
        logger.error(f"[CALL_LOG] Supabase call log sync failed: {e}")



async def analyze_and_save_call(
    phone_number: str,
    direction: str,
    chat_messages: list,
    campaign_id: str = "",       # ties this call to a BulkDialer / Workflow campaign
    lead_row_index: int = -1,    # row number in the original leads spreadsheet
    lead_email: str = "",        # lead's email address (for workflow engine)
    workflow_run_id: str = "",   # set when triggered by the Workflow engine
    room_name: str = "",         # LiveKit room name (used for workflow webhook)
):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Build transcript — skip system messages (avoids hitting token limits with large prompts)
        transcript = []
        for msg in chat_messages:
            if isinstance(msg, dict):
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
            else:
                role = getattr(msg, "role", "unknown")
                content = getattr(msg, "content", "")
                
            if hasattr(role, "value"):
                role = role.value
            role_str = str(role).lower()
            
            if role_str == "system" or role_str.endswith(".system"):
                continue  # exclude system prompt from transcript
            
            if isinstance(content, list):
                extracted = []
                for c in content:
                    if isinstance(c, str):
                        extracted.append(c)
                    elif hasattr(c, "text"):
                        extracted.append(c.text)
                    elif isinstance(c, dict) and "text" in c:
                        extracted.append(c["text"])
                    else:
                        extracted.append(str(c))
                content = " ".join(extracted)
                
            if content and str(content).strip():
                transcript.append(f"{role_str}: {content}")
            
        full_transcript = "\n".join(transcript)
        
        # Detect campaign type by campaign ID prefix
        is_real_estate = campaign_id.startswith("re_")
        is_car_dealership = campaign_id.startswith("cd_")

        # Skip analysis if no real conversation happened
        if not full_transcript.strip():
            analysis = {"summary": "No conversation recorded.", "sentiment": "Neutral", "caller_intent": "Unknown"}
        else:
            # Use llama-3.1-8b-instant: higher rate limits (20K TPM) vs 70b model (12K TPM)
            client = Groq(api_key=os.getenv("GROQ_API_KEY"))

            if is_real_estate:
                prompt = (
                    "Analyze the following real estate sales call transcript. Provide a JSON response with exactly these keys:\n"
                    "- \"summary\": A 1-2 sentence summary of the call.\n"
                    "- \"sentiment\": Positive, Neutral, or Negative.\n"
                    "- \"caller_intent\": What the caller was asking about or wanted.\n"
                    "- \"user_info\": A JSON object containing extracted details about the user (e.g., 'name', 'phone', 'email', 'city', etc.).\n"
                    "- \"interested_projects\": An array of project names the caller showed interest in (from the brochure catalog). If none mentioned, use [].\n"
                    "- \"email_status\": Whether a brochure was successfully sent — use 'sent', 'failed', or 'not_requested'.\n"
                    "- \"property_requirements\": A JSON object with keys 'budget', 'location', 'property_type', 'bedrooms' based on what the caller mentioned. If not mentioned, use null for each.\n"
                    "- \"brochure_sent\": The name of the specific project brochure that was emailed to the caller, or empty string if none.\n\n"
                    f"Transcript:\n{full_transcript}"
                )
            elif is_car_dealership:
                prompt = (
                    "Analyze the following car dealership sales call transcript. Provide a JSON response with exactly these keys:\n"
                    "- \"summary\": A 1-2 sentence summary of the call.\n"
                    "- \"sentiment\": Positive, Neutral, or Negative.\n"
                    "- \"caller_intent\": What the caller was asking about or wanted.\n"
                    "- \"user_info\": A JSON object with 'name', 'phone', 'email' if mentioned.\n"
                    "- \"interested_cars\": An array of car models the caller showed interest in. If none, use [].\n"
                    "- \"test_drive_booked\": true if caller agreed to book a test drive, false otherwise.\n"
                    "- \"car_requirements\": A JSON object with 'budget', 'car_type' (SUV/sedan/hatchback), 'brand', 'new_or_used' based on what caller mentioned. If not mentioned, use null for each.\n"
                    "- \"call_outcome\": One of 'test_drive_booked', 'interested', 'not_interested', 'callback_requested', 'no_answer'.\n\n"
                    f"Transcript:\n{full_transcript}"
                )
            else:
                prompt = (
                    "Analyze the following call transcript. Provide a JSON response with exactly these keys:\n"
                    "- \"summary\": A 1-2 sentence summary of the call.\n"
                    "- \"sentiment\": Positive, Neutral, or Negative.\n"
                    "- \"caller_intent\": What the caller was asking about or wanted.\n"
                    "- \"user_info\": A JSON object containing extracted details about the user (e.g., 'name', 'phone', 'purpose', 'appointment_details', 'city', 'email', etc.). Include all relevant info discussed in the call. If not mentioned, leave null.\n\n"
                    f"Transcript:\n{full_transcript}"
                )
            
            response = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
                response_format={"type": "json_object"}
            )
            analysis = json.loads(response.choices[0].message.content)
        
        # Append to call_logs.json
        logs = []
        if os.path.exists(LOGS_FILE):
            try:
                with open(LOGS_FILE, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except Exception:
                pass
                
        log_entry = {
            "timestamp": datetime.datetime.now().isoformat(),
            "phone_number": phone_number,
            "direction": direction,
            "summary": analysis.get("summary", "No summary available"),
            "sentiment": analysis.get("sentiment", "Neutral"),
            "caller_intent": analysis.get("caller_intent", "Unknown"),
            "user_info": analysis.get("user_info", {}),
            "transcript": full_transcript,
            # Campaign tracking fields
            "campaign_id": campaign_id,
            "lead_row_index": lead_row_index,
        }
        
        logs.append(log_entry)
        
        with open(LOGS_FILE, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2)
            
        logger.info("[ANALYTICS] Call log and sentiment saved.")

        # ── Auto-CRM: Upsert lead BEFORE syncing call log (so we get lead_id) ──
        lead_id = None
        try:
            user_info = analysis.get("user_info", {}) or {}
            lead_id = upsert_lead_from_call(
                phone=phone_number,
                name=user_info.get("name", "") or "",
                email=lead_email or user_info.get("email", "") or "",
                city=user_info.get("city", "") or "",
                sentiment=analysis.get("sentiment", ""),
                caller_intent=analysis.get("caller_intent", ""),
                summary=analysis.get("summary", ""),
                business_id=None,  # Will default to workspace 1
                campaign_id=campaign_id,
            )
        except Exception as crm_err:
            logger.warning(f"[ANALYTICS] CRM upsert failed (non-fatal): {crm_err}")

        # ── Sync Call Log to Supabase ──────────────────────────────────────────
        sync_call_log_to_supabase(
            phone_number=phone_number,
            direction=direction,
            transcript=full_transcript,
            summary=analysis.get("summary", ""),
            sentiment=analysis.get("sentiment", "Neutral"),
            caller_intent=analysis.get("caller_intent", "Unknown"),
            campaign_id=campaign_id,
            room_name=room_name,
            lead_id=lead_id,
        )

        # ── Campaign result file (BulkDialer report) ─────────────────────────
        # Write per-lead result so the dashboard can poll for live progress
        # and generate the downloadable report at campaign end.
        if campaign_id:
            campaign_file = os.path.join(DATA_DIR, f"campaign_{campaign_id}.json")
            campaign_results = []
            if os.path.exists(campaign_file):
                try:
                    with open(campaign_file, "r", encoding="utf-8") as f:
                        campaign_results = json.load(f)
                except Exception:
                    pass

            # Determine call status
            if not full_transcript.strip():
                call_status = "No Answer"
            else:
                call_status = "Called"

            result_entry = {
                "row_index":    lead_row_index,
                "phone_number": phone_number,
                "lead_email":   lead_email,
                "status":       call_status,
                "remarks":      analysis.get("summary", ""),
                "sentiment":    analysis.get("sentiment", "Neutral"),
                "intent":       analysis.get("caller_intent", "Unknown"),
                "timestamp":    datetime.datetime.now().isoformat(),
            }

            # Add real estate-specific fields if this is a real estate campaign
            if is_real_estate:
                result_entry["email_status"] = analysis.get("email_status", "not_requested")
                result_entry["interested_projects"] = analysis.get("interested_projects", [])
                result_entry["property_requirements"] = analysis.get("property_requirements", {})
                result_entry["brochure_sent"] = analysis.get("brochure_sent", "")

            # Upsert: replace existing "Connected" entry for this row, or append
            existing_idx = None
            for idx, entry in enumerate(campaign_results):
                if entry.get("row_index") == lead_row_index and entry.get("status") == "Connected":
                    existing_idx = idx
                    break

            if existing_idx is not None:
                campaign_results[existing_idx] = result_entry
                logger.info(f"[ANALYTICS] Campaign result updated (row {lead_row_index}, was 'Connected' → '{call_status}')")
            else:
                campaign_results.append(result_entry)
                logger.info(f"[ANALYTICS] Campaign result appended (row {lead_row_index}, status '{call_status}')")

            with open(campaign_file, "w", encoding="utf-8") as f:
                json.dump(campaign_results, f, indent=2)

        # ── Workflow engine webhook ───────────────────────────────────────────
        # When this call was triggered by the Workflow engine, notify it that
        # the call has completed so it can proceed to the next workflow node.
        if workflow_run_id and room_name:
            try:
                import urllib.request as _req
                dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")
                webhook_payload = json.dumps({
                    "roomName":     room_name,
                    "campaignId":   workflow_run_id,
                    "phoneNumber":  phone_number,
                    "summary":      analysis.get("summary", ""),
                    "sentiment":    analysis.get("sentiment", "Neutral"),
                    "callerIntent": analysis.get("caller_intent", "Unknown"),
                    "status":       "completed" if full_transcript.strip() else "no_answer",
                }).encode()
                webhook_req = _req.Request(
                    f"{dashboard_url}/api/workflow/call-completed",
                    data=webhook_payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                _req.urlopen(webhook_req, timeout=10)
                logger.info(f"[ANALYTICS] Workflow webhook fired for run {workflow_run_id}")
            except Exception as wb_err:
                logger.warning(f"[ANALYTICS] Workflow webhook failed (non-fatal): {wb_err}")

        # ── Workflow Execution Engine: fire call_completed event ──────────────
        # This notifies the workflow engine so any active workflow with a
        # "call_completed" trigger will execute automatically for this call.
        try:
            import urllib.request as _req
            dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")
            # Extract lead name from analysis if available
            user_info = analysis.get("user_info", {}) or {}
            lead_name = user_info.get("name", "") or ""
            lead_email_val = lead_email or user_info.get("email", "") or ""
            event_payload = json.dumps({
                "eventType": "call_completed",
                "payload": {
                    "phone": phone_number,
                    "name": lead_name,
                    "email": lead_email_val,
                    "direction": direction,
                    "sentiment": analysis.get("sentiment", "Neutral").lower(),
                    "summary": analysis.get("summary", ""),
                    "transcript": full_transcript[:3000],  # truncate for payload size
                    "caller_intent": analysis.get("caller_intent", ""),
                    "campaign_id": campaign_id,
                    "workflow_run_id": workflow_run_id,
                }
            }).encode()
            wf_req = _req.Request(
                f"{dashboard_url}/api/workflow/trigger",
                data=event_payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            _req.urlopen(wf_req, timeout=10)
            logger.info(f"[ANALYTICS] call_completed event fired to workflow engine for {phone_number}")
        except Exception as wf_err:
            logger.warning(f"[ANALYTICS] Workflow trigger failed (non-fatal): {wf_err}")

    except Exception as e:
        logger.error(f"[ANALYTICS] Failed to analyze/save call log: {e}")

