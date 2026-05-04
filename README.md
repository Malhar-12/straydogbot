# 🐾 Stray Dog Reporting Bot
### AI-Powered WhatsApp Solution for Smarter Cities & Faster Complaint Resolution

![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![Airtable](https://img.shields.io/badge/Airtable-18BFFF?style=for-the-badge&logo=airtable&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)

---

## 📌 About the Project

**Stray Dog Reporting Bot** is an AI-powered WhatsApp chatbot that enables citizens to report stray dog incidents directly from WhatsApp — no app download required. Reports are automatically logged and forwarded to the relevant local authorities for faster resolution.

> 🏙️ Built for smarter cities. Designed for every citizen.

---

## 🚨 Problem Statement

Stray dog incidents — bites, injuries, aggressive behavior — are common in urban and semi-urban areas. Citizens have no easy, accessible way to report these issues quickly. Existing portals are complex, slow, and require dedicated apps or website visits.

---

## ✅ Solution

A conversational WhatsApp bot that:
- Guides citizens step-by-step to file a complaint
- Captures location, photos/videos, and incident type
- Automatically logs reports to a centralized database
- Forwards complaints to authorities in real time

---

## 🧠 Features

| Feature | Description |
|---|---|
| 🐕 Report Dog Bite | File urgent bite incident reports with location |
| 🤕 Injured / Sick Dog | Report dogs needing medical attention |
| 😠 Aggressive Stray Dogs | Alert authorities about dangerous dog sightings |
| ❓ Other Issues | Report any other stray dog-related concerns |
| 📍 GPS Location Capture | Pinpoint exact location of the incident |
| 📸 Media Handling | Upload photos and videos as evidence |
| 🤖 AI Conversations | Smart, context-aware responses via OpenAI & Claude API |
| 📊 Centralized Logging | All reports tracked in Airtable dashboard |
| ⚡ Real-time Forwarding | Instant notification to authorities via webhooks |

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js (JavaScript)** | Backend logic & server |
| **WhatsApp Cloud API (Meta)** | Chat interface — no app needed |
| **OpenAI API** | Smart AI responses |
| **Claude API (Anthropic)** | Advanced conversational AI |
| **Airtable** | Database & complaint tracking |
| **AWS / VPS (Render)** | Cloud hosting & scaling |
| **Location APIs** | GPS location capture |
| **REST APIs & Webhooks** | Real-time communication with authorities |
| **Media Handling** | Image/video processing & storage |

---

## 🔄 How It Works

```
Citizen sends WhatsApp message
        ↓
Bot greets & presents complaint categories
        ↓
Citizen selects issue type
        ↓
Bot collects location + media evidence
        ↓
AI validates & structures the complaint
        ↓
Report logged in Airtable database
        ↓
Authorities notified via webhook in real time
```

---

## 📱 Complaint Categories

1. 🩸 **Report Dog Bite** — Emergency incident with location & victim details
2. 🏥 **Injured or Sick Dog** — Animal welfare complaint
3. ⚠️ **Aggressive Stray Dogs** — Public safety alert
4. 📝 **Other Issue** — General stray dog concerns

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Meta Developer Account (WhatsApp Business API access)
- Airtable Account
- OpenAI API Key
- Anthropic (Claude) API Key
- Render / AWS account for deployment

### Installation

```bash
# Clone the repository
git clone https://github.com/khushi-urkude/stray-dog-reporting-bot.git

# Navigate to project directory
cd stray-dog-reporting-bot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your API keys in .env

# Start the server
npm start
```

### Environment Variables

```env
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=your_webhook_verify_token
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_airtable_base_id
```

---

## 📊 Impact

- ✅ Zero app downloads required — works on any phone with WhatsApp
- ✅ Accessible to all citizens regardless of tech literacy
- ✅ Faster complaint resolution through real-time authority notification
- ✅ Centralized data helps authorities identify high-incident zones
- ✅ AI-powered conversations reduce human error in complaint filing

---

## 👩‍💻 Developer

**Khushi Urkude**
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/khushi-urkude-838629250/)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

> *"Technology should solve real problems for real people. This bot does exactly that."* 🐾
