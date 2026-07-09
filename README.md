# callwith.ai 📞

**AI Voice Calling Agent that makes sales calls, talks naturally in Hindi, and closes deals — all automatically.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-green.svg)
![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

---

## 🎯 What is callwith.ai?

callwith.ai is an AI-powered voice calling platform that can be configured for **any business** that makes phone calls to customers. It's not just for cars or real estate — it's a universal AI sales agent.

**One-liner:** "AI that calls, talks, and converts — all automatically."

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Voice Agent** | Makes outbound calls, talks naturally, handles objections |
| 🗣️ **Hindi + English** | Speaks natural Hinglish like a real Delhi person |
| 📞 **Outbound Calling** | Upload CSV, AI calls everyone automatically |
| 📥 **Inbound Receptionist** | Answers incoming calls, books appointments |
| 📊 **Lead Capture** | Saves name, phone, email, requirements during call |
| 📅 **Appointment Booking** | Books test drives, site visits into calendar |
| 🎭 **Sentiment Analysis** | Understands if customer is happy, angry, or interested |
| 💬 **Objection Handling** | Responds to "too expensive", "not now", "competitor is better" |
| 📱 **Real-time Dashboard** | Monitor live calls, view results, download reports |
| 🔄 **Human Transfer** | Instant transfer to real agent when needed |

---

## 🏢 Use Cases

| Industry | How it's used |
|----------|---------------|
| 🚗 **Car Dealerships** | Car sales, test drive booking, inventory recommendations |
| 🏠 **Real Estate** | Property inquiries, site visit booking, lead capture |
| 🏥 **Healthcare** | Appointment booking, clinic receptionist, patient follow-up |
| 📚 **Education** | Course inquiries, admission calls, student counseling |
| 🛡️ **Insurance** | Policy renewals, claim follow-up, new policy sales |
| 🏦 **Banking** | Loan offers, credit card sales, account opening |
| 🏨 **Hospitality** | Hotel bookings, restaurant reservations |
| 💼 **Recruitment** | Candidate screening, interview scheduling |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      callwith.ai                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Dashboard  │    │   Python    │    │   SIP/PSTN  │     │
│  │  (Next.js)   │◄──►│   Agents   │◄──►│   Trunk     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Supabase   │    │  Google     │    │  LiveKit    │     │
│  │  (Database) │    │  Gemini     │    │  (Telephony)│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                          │                                  │
│                          ▼                                  │
│                   ┌─────────────┐                           │
│                   │  Sarvam AI  │                           │
│                   │  (TTS)      │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **AI Brain** | Google Gemini | Understands conversation, responds intelligently |
| **Voice Engine** | Sarvam AI | Speaks natural Indian languages with human-like voice |
| **STT** | Deepgram | Speech-to-Text with Hindi support |
| **Phone System** | LiveKit + SIP | Makes and receives actual phone calls |
| **Dashboard** | Next.js 15 | Web interface to manage campaigns, view results |
| **Database** | Supabase | Multi-tenant data storage, auth, RLS |
| **LLM Fallback** | Groq (Llama 3.3) | Backup LLM if Gemini is unavailable |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- API Keys: LiveKit, Deepgram, Sarvam, Google Gemini

### 1. Clone the repository
```bash
git clone https://github.com/ApoorvChandhok/callwith.ai.git
cd callwith.ai
```

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3. Install dashboard dependencies
```bash
cd dashboard
npm install
```

### 4. Configure environment
```bash
# Copy and edit the .env file
cp .env.example .env
```

Required environment variables:
```env
# LiveKit
LIVEKIT_URL=wss://your-livekit-url
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Deepgram (STT)
DEEPGRAM_API_KEY=your-deepgram-key

# Sarvam (TTS)
SARVAM_API_KEY=your-sarvam-key
SARVAM_VOICE=neha
SARVAM_PACE=1.25

# Google Gemini (LLM)
GEMINI_API_KEY=your-gemini-key

# SIP Trunk (for making calls)
VOBIZ_SIP_TRUNK_ID=your-trunk-id
VOBIZ_SIP_DOMAIN=your-sip-domain
```

### 5. Start the agents
```bash
# Start both inbound and outbound agents
python run.py

# Or start individually
python agent_inbound.py   # Port 8082
python agent_outbound.py  # Port 8081
```

### 6. Start the dashboard
```bash
cd dashboard
npm run dev
```

Visit `http://localhost:3000` to access the dashboard.

---

## 📁 Project Structure

```
callwith.ai/
├── agent_inbound.py          # Inbound call handler
├── agent_outbound.py         # Outbound call handler
├── analytics.py              # Call analysis & lead capture
├── workspace_config_loader.py # Multi-tenant config loader
├── run.py                    # Start both agents
│
├── data/
│   ├── agent_config.json     # Agent persona & settings
│   ├── car_inventory_*.md    # Car dealership knowledge base
│   └── call_logs.json        # Call transcripts & analytics
│
├── dashboard/                # Next.js dashboard
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── car-dealership/  # Car sales campaign
│   │   │   ├── real-estate/     # Property sales campaign
│   │   │   ├── leads/           # Lead management CRM
│   │   │   ├── logs/            # Call logs & analytics
│   │   │   └── integrations/    # Gmail, Calendar, WhatsApp
│   │   └── api/                 # Backend API routes
│   ├── components/              # React components
│   └── lib/                     # Utilities & helpers
│
├── supabase/                 # Database migrations
└── requirements.txt          # Python dependencies
```

---

## 🎯 Car Dealership Mode

The car dealership mode includes:

- **62+ cars** in knowledge base (new + pre-owned)
- **5 brands**: Maruti, Honda, Skoda, Mahindra, Toyota
- **Budget ranges**: ₹3 Lakh to ₹1 Crore+
- **Comparison engine**: Creta vs Seltos, City vs Verna, etc.
- **Test drive booking**: Confirms date, time, dealership location
- **EMI calculator**: Instant EMI estimates

---

## 🏠 Real Estate Mode

The real estate mode includes:

- **Property listings** for Gurgaon & West Delhi
- **Budget ranges**: ₹35 Lakh to ₹3 Crore+
- **Site visit booking**: Confirms date, time, location
- **Brochure sharing**: Auto-sends PDF via email
- **Lead capture**: Name, phone, budget, area preference

---

## 📊 Dashboard Features

| Feature | Description |
|---------|-------------|
| 📈 **Analytics** | Call volume, sentiment, conversion rates |
| 👥 **Lead Management** | CRM with status tracking, notes, tags |
| 📞 **Call Logs** | Transcripts, summaries, recordings |
| 🔄 **Campaign Runner** | Upload CSV, auto-dial, track progress |
| ⚙️ **Agent Config** | Customize prompts, voices, knowledge base |
| 🔗 **Integrations** | Gmail, Google Calendar, WhatsApp |
| 📥 **Export** | Download leads as CSV with enriched data |

---

## 🔧 Configuration

### Agent Persona
Edit `data/agent_config.json` to customize:
- Agent name & personality
- System prompt & conversation flow
- Voice settings (Sarvam TTS)
- LLM model & temperature
- Transfer number for human handoff

### Knowledge Base
Upload your own knowledge base:
- Car inventory (CSV/MD)
- Property listings (CSV/MD)
- Product catalog (PDF/TXT)
- FAQ documents (TXT)

---

## 🌐 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dispatch` | POST | Make an outbound call |
| `/api/car-dealership/start-campaign` | POST | Start car sales campaign |
| `/api/real-estate/start-campaign` | POST | Start property sales campaign |
| `/api/campaign/results` | GET | Get campaign results |
| `/api/real-estate/download-results` | POST | Download enriched CSV |
| `/api/tools/execute` | POST | Execute agent tools (calendar, etc.) |

---

## 📱 Instagram & Marketing

**Brand:** callwith.ai

**Bio:**
```
🤖 AI Voice Agent that makes sales calls
📞 Calls, talks, closes — all automatically
🎯 Hindi + English | 24/7 Available
💼 90% cheaper than human sales teams
🌐 callwith.ai
```

**Content Ideas:**
- Product demo reels (car dealership, real estate)
- Customer testimonial videos
- Feature highlights (Hindi voice, objection handling)
- Behind-the-scenes of AI development

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact

**Apoorv Chandhok** - [@apoorvchandhok](https://instagram.com/apoorvchandhok)

**Project Link:** [https://github.com/ApoorvChandhok/callwith.ai](https://github.com/ApoorvChandhok/callwith.ai)

---

## ⭐ Star History

If you found this project helpful, please give it a ⭐ on GitHub!
