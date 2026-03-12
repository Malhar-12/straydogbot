/**
 * netlify/functions/webhook.js  — v5
 * ═══════════════════════════════════════════════════════
 *  VVCMC Stray Dog Complaint Bot
 *  WhatsApp Business API + Airtable
 *
 *  Airtable base:   appA01sdzDn5tNrNX
 *  Complaints table: tblMlEKbt0mD8FWXv  (Table 2)
 *  Sessions table:   tblFcqyOuTB6DR0pd  (Users Table)
 *
 *  ── CITIZEN FLOW ─────────────────────────────────────
 *  Hi → Language → Incident → Name → Location
 *  → Alt contact (optional/skip)
 *  → Photo/Video  *** MANDATORY ***
 *  → "Ticket registered" + saved to Airtable
 *  → Admin alerted immediately (+ photo forwarded)
 *  → All drivers get heads-up
 *
 *  ── ADMIN FLOW ───────────────────────────────────────
 *  ASSIGN SDB-XXX DRIVER:1 DATE:25-Jan TIME:10:00AM
 *  → Airtable updated (Status = Assigned)
 *  → Citizen notified (officer name, date, time)
 *  → Driver notified (full assignment details)
 *
 *  ── DRIVER FLOW ──────────────────────────────────────
 *  "ticket" → list of assigned open tickets
 *  → select one → send location → send photo/video (MANDATORY)
 *  → Status = Closed in Airtable
 *  → Citizen gets: closing message + driver's photo forwarded
 *  → Admin gets: closure report + same photo
 *  → COMPLAINT ENDS HERE — citizen session reset
 *
 *  ── ENV VARS (Netlify dashboard) ─────────────────────
 *  WA_PHONE_NUMBER_ID    Meta Developer Console
 *  WA_ACCESS_TOKEN       System User permanent token
 *  WA_VERIFY_TOKEN       any secret string
 *  AIRTABLE_API_KEY      Personal Access Token from airtable.com
 *  AIRTABLE_BASE_ID      appA01sdzDn5tNrNX
 *  AIRTABLE_TABLE_NAME   Table 2
 * ═══════════════════════════════════════════════════════
 */
'use strict';

/* ── CONFIG ── */
const ADMIN_NUMBER = '917219373694';   // 91 + number, no + sign

const DRIVERS = [
  { id: 1, name: 'Ravi Patil',  phone: '919028331108' },
  // Add more drivers below when needed:
  // { id: 2, name: 'Driver Name', phone: '91XXXXXXXXXX' },
];

/* ── IN-MEMORY SESSION + TICKET STORE ── */
const sessions = {};   // phone → session object
const tickets  = {};   // ref   → ticket object

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
}

/* ── WHATSAPP HELPERS ── */
async function sendWA(to, body) {
  if (!to || to.includes('X')) return; // skip unconfigured driver numbers
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    }
  );
  if (!res.ok) console.error('[sendWA error]', await res.text());
}

async function forwardMedia(to, mediaId, mediaType, caption) {
  if (!to || to.includes('X')) return;
  await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to,
        type: mediaType,
        [mediaType]: { id: mediaId, caption: caption || '' },
      }),
    }
  );
}

async function getMediaUrl(mediaId) {
  try {
    const res  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
    const data = await res.json();
    return data.url || '';
  } catch { return ''; }
}

/* ── AIRTABLE HELPERS ──
   Field IDs from your actual base (appA01sdzDn5tNrNX / tblMlEKbt0mD8FWXv)
   fldhXsOBPVr9cU3Ag  Complaint ID
   fldQQfiLwONajehi3  Complaint Type
   fldiQKewmVP94vd9b  Name
   fldKoc6nVRgfykSdv  Phone Number
   fldQ7EDVzXAWLfkiW  Address
   fldP4q0jO7PkNwn1q  Alternate Contact
   fldsPeUvD4IjDhqKb  Media URL
   fld3Sp2Fm5igA1nJN  Status
   fldYTCvu9DMb1XyTj  Location  (used for closing location)
   fld90MrPHsvnAvqtB  Landmark  (used for driver name / closed-by)
*/

const AT_URL = () =>
  `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Complaints`;

const AT_HDR = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
});

async function atCreate(ref, data) {
  try {
    const res = await fetch(AT_URL(), {
      method: 'POST',
      headers: AT_HDR(),
      body: JSON.stringify({
        fields: {
          fldhXsOBPVr9cU3Ag: ref,                          // Complaint ID
          fldQQfiLwONajehi3: data.incidentLabel || '',      // Complaint Type
          fldiQKewmVP94vd9b: data.name || '',               // Name
          fldKoc6nVRgfykSdv: data.phone || '',              // Phone Number
          fldQ7EDVzXAWLfkiW: data.location || '',           // Address
          fldP4q0jO7PkNwn1q: data.altContact || '',         // Alternate Contact
          fldsPeUvD4IjDhqKb: data.mediaUrl || '',           // Media URL (citizen photo)
          fld3Sp2Fm5igA1nJN: 'Open',                        // Status
          fldYTCvu9DMb1XyTj: '',                            // Location (closing — empty for now)
          fld90MrPHsvnAvqtB: '',                            // Landmark (driver name — empty for now)
        }
      }),
    });
    const json = await res.json();
    if (!res.ok) { console.error('[atCreate error]', JSON.stringify(json)); return null; }
    return json.id;  // Airtable record ID
  } catch (e) { console.error('[atCreate exception]', e.message); return null; }
}

async function atClose(recordId, closingLocation, driverName, closingMediaUrl) {
  try {
    await fetch(`${AT_URL()}/${recordId}`, {
      method: 'PATCH',
      headers: AT_HDR(),
      body: JSON.stringify({
        fields: {
          fld3Sp2Fm5igA1nJN: 'Closed',                   // Status → Closed
          fldYTCvu9DMb1XyTj: closingLocation || '',       // Location (where driver closed)
          fld90MrPHsvnAvqtB: driverName || '',            // Landmark (driver name)
          fldsPeUvD4IjDhqKb: closingMediaUrl || '',       // Media URL overwrite with closing photo
        }
      }),
    });
  } catch (e) { console.error('[atClose exception]', e.message); }
}

/* ── MISC HELPERS ── */
function genRef() { return `SDB-${Date.now().toString(36).toUpperCase()}`; }

const INCIDENT = {
  mr: { '1':'चावण्याची घटना','2':'आक्रमक टोळी','3':'जखमी कुत्रा','4':'सामान्य त्रास' },
  en: { '1':'Bite Incident','2':'Aggressive Pack','3':'Injured Dog','4':'General Nuisance' },
};

function parseLocation(text, msgObj) {
  if (msgObj?.type === 'location' && msgObj.location) {
    const l = msgObj.location;
    return `Pin: ${l.name || 'Location'} (${l.latitude}, ${l.longitude})`;
  }
  if (/maps\.google|goo\.gl|maps\.app|google\.com\/maps/i.test(text)) return text;
  if (text.length > 3) return text;
  return null;
}

/* ── ADMIN HANDLER ── */
async function handleAdmin(from, text) {
  const m = text.match(/ASSIGN\s+(SDB-[A-Z0-9]+)\s+DRIVER:(\d+)\s+DATE:([^\s]+)\s+TIME:([^\s]+)/i);
  if (!m) {
    await sendWA(from,
`📋 *Admin Commands*

Assign a driver:
ASSIGN SDB-XXX DRIVER:1 DATE:25-Jan TIME:10:00AM

Drivers:
${DRIVERS.map(d => `${d.id}. ${d.name}  +${d.phone}`).join('\n')}`
    );
    return;
  }

  const [, ref, driverId, date, time] = m;
  const ticket = tickets[ref];
  if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found in memory. Was the bot restarted?`); return; }

  const driver = DRIVERS.find(d => d.id === parseInt(driverId));
  if (!driver) { await sendWA(from, `⚠️ Driver ${driverId} not found.`); return; }

  ticket.status     = 'Assigned';
  ticket.driverName = driver.name;
  ticket.visitDate  = date;
  ticket.visitTime  = time;

  // Notify driver
  await sendWA(driver.phone,
`📋 *Ticket Assigned to You*
🎫 Ref: ${ref}
🐕 *Incident:* ${ticket.data.incidentLabel}
👤 *Complainant:* ${ticket.data.name}
📍 *Location:* ${ticket.data.location}
📞 *Contact:* +${ticket.data.phone}
📞 *Alt Contact:* ${ticket.data.altContact || 'N/A'}
📅 *Your Visit:* ${date} at ${time}

_When you reach the site, type *ticket* to see your open tickets._`
  );

  // Notify citizen
  const citizenMsg = ticket.lang === 'mr'
    ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 Ticket: ${ref}\n\n👤 *अधिकारी:* ${driver.name}\n📅 *भेटीची तारीख:* ${date}\n⏰ *वेळ:* ${time}\n\n_तो येण्यापूर्वी फोन करेल._`
    : `👷 *Your complaint has been assigned!*\n🎫 Ticket: ${ref}\n\n👤 *Officer:* ${driver.name}\n📅 *Visit Date:* ${date}\n⏰ *Time:* ${time}\n\n_He will call you before he comes._`;
  await sendWA(ticket.citizenPhone, citizenMsg);

  await sendWA(from, `✅ ${ref} → *${driver.name}*\nVisit: ${date} at ${time}\nCitizen ✓  Driver ✓`);
}

/* ── DRIVER HANDLER ── */
async function handleDriver(from, msgObj, driver) {
  const text     = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin    = msgObj.type === 'location';
  const s        = getSession(from);

  /* "ticket" → show list */
  if (/^ticket$/i.test(text)) {
    const mine = Object.values(tickets).filter(
      t => t.status === 'Assigned' && t.driverName === driver.name
    );
    if (!mine.length) {
      await sendWA(from, `📋 No open tickets assigned to you right now.`);
      return;
    }
    let list = `📋 *Your Open Tickets:*\n━━━━━━━━━━━━━\n`;
    mine.forEach((t, i) => {
      list += `${i + 1}. ${t.ref}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0, 55)}\n   🐕 ${t.data.incidentLabel}\n\n`;
    });
    list += `_Reply with the number (e.g. 1) to select._`;
    s.step        = 'driver_select';
    s.openTickets = mine;
    await sendWA(from, list);
    return;
  }

  /* Select ticket */
  if (s.step === 'driver_select') {
    const num      = parseInt(text);
    const selected = (!isNaN(num) && s.openTickets?.[num - 1])
      ? s.openTickets[num - 1]
      : tickets[text.toUpperCase()];
    if (!selected) {
      await sendWA(from, `⚠️ Not found. Type *ticket* to see the list again.`);
      return;
    }
    s.step         = 'driver_location';
    s.activeTicket = selected.ref;
    await sendWA(from,
`✅ *Ticket Selected:* ${selected.ref}
👤 ${selected.data.name}
📍 ${selected.data.location}
🐕 ${selected.data.incidentLabel}

To *close this case* do both steps:
1️⃣ Send your *current location* (WhatsApp 📎 pin or Google Maps link)
2️⃣ Send a *photo or video* as closing proof *(mandatory)*`
    );
    return;
  }

  /* Location */
  if (s.step === 'driver_location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: ${msgObj.location.name || 'Site'} (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text, null);
    if (!loc) {
      await sendWA(from, `⚠️ Send your *current location* — WhatsApp 📎 pin or Google Maps link.`);
      return;
    }
    s.closingLocation = loc;
    s.step            = 'driver_photo';
    await sendWA(from, `✅ Location received!\n\nNow send the *closing photo or video* to complete the case.`);
    return;
  }

  /* ══ CLOSING PHOTO — complaint ends here ══ */
  if (s.step === 'driver_photo') {
    if (!hasMedia) {
      await sendWA(from, `⚠️ Please send a *photo or video*.\nThis is required to close the case and notify the citizen.`);
      return;
    }

    const ref    = s.activeTicket;
    const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket not found.`); return; }

    const mType  = msgObj.image ? 'image' : 'video';
    const mId    = msgObj.image?.id || msgObj.video?.id;
    const mUrl   = await getMediaUrl(mId);
    const loc    = s.closingLocation;

    // ── 1. Update Airtable → Closed ──
    if (ticket.atRecordId) {
      await atClose(ticket.atRecordId, loc, driver.name, mUrl);
    }

    // ── 2. Mark ticket closed in memory ──
    ticket.status   = 'Closed';
    ticket.closedBy = driver.name;

    // ── 3. Notify CITIZEN — complaint is resolved ──
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार निकाली काढली गेली!*\n\n🎫 Ticket: ${ref}\n👷 *अधिकारी:* ${driver.name}\n📍 *ठिकाण:* ${loc}\n\n*तुमची तक्रार पूर्णपणे बंद झाली आहे.*\nधन्यवाद! 🙏`
      : `✅ *Your complaint has been resolved and closed!*\n\n🎫 Ticket: ${ref}\n👷 *Officer:* ${driver.name}\n📍 *Resolved at:* ${loc}\n\n*Your complaint is now fully closed.*\nThank you for reporting! 🙏`;

    await sendWA(ticket.citizenPhone, citizenClose);
    // Forward driver's closing photo to citizen as proof
    if (mId) await forwardMedia(ticket.citizenPhone, mId, mType, 'Closing proof from officer');

    // ── 4. Notify ADMIN ──
    await sendWA(ADMIN_NUMBER,
`✅ *Case Closed*
🎫 ${ref}
👷 Closed by: ${driver.name}
📍 Location: ${loc}
👤 Complainant: ${ticket.data.name}
📸 Closing ${mType} attached`
    );
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `Closing proof — ${ref}`);

    // ── 5. Confirm to DRIVER ──
    await sendWA(from,
`✅ *Case closed successfully!*
🎫 ${ref}

• Citizen notified ✓
• Closing photo sent to citizen ✓
• Admin notified ✓
• Airtable updated → Closed ✓

_Type *ticket* to see your next open ticket._`
    );

    // ── 6. Reset citizen's session so they can file a new complaint ──
    delete sessions[ticket.citizenPhone];

    // Reset driver session
    s.step            = 'driver_idle';
    s.activeTicket    = null;
    s.closingLocation = null;
    return;
  }

  // Driver idle — show help
  await sendWA(from, `👋 Hello ${driver.name}!\nType *ticket* to see your assigned open tickets.`);
}

/* ── CITIZEN HANDLER ── */
async function handleCitizen(from, msgObj) {
  const text     = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin    = msgObj.type === 'location';
  const s        = getSession(from);

  /* GREET */
  if (s.step === 'greet') {
    if (!/^(hi|hello|hey|hii|helo|start|नमस्कार|नमस्ते|हाय)$/i.test(text)) {
      await sendWA(from,
        `👋 *नमस्कार!*\nतक्रार नोंदवण्यासाठी *Hi* पाठवा.\n\n(Send *Hi* to register a stray dog complaint.)`
      );
      return;
    }
    s.step = 'lang';
    await sendWA(from,
`🙏 *नमस्कार! / Hello!*

भाषा निवडा / Choose language:
1️⃣  मराठी
2️⃣  English`
    );
    return;
  }

  /* LANGUAGE */
  if (s.step === 'lang') {
    if      (text === '1' || /marathi|मराठी/i.test(text)) s.lang = 'mr';
    else if (text === '2' || /english/i.test(text))        s.lang = 'en';
    else { await sendWA(from, `⚠️ Reply *1* for मराठी or *2* for English.`); return; }
    s.step = 'incident';
    await sendWA(from, s.lang === 'mr'
      ? `🐕 *घटनेचा प्रकार निवडा:*\n\n1️⃣  चावण्याची घटना\n2️⃣  आक्रमक टोळी\n3️⃣  जखमी कुत्रा\n4️⃣  सामान्य त्रास`
      : `🐕 *Select the type of incident:*\n\n1️⃣  Bite Incident\n2️⃣  Aggressive Pack\n3️⃣  Injured Dog\n4️⃣  General Nuisance`
    );
    return;
  }

  /* INCIDENT */
  if (s.step === 'incident') {
    if (!['1','2','3','4'].includes(text)) {
      await sendWA(from, s.lang === 'mr' ? `⚠️ कृपया 1, 2, 3 किंवा 4 पाठवा.` : `⚠️ Please reply 1, 2, 3, or 4.`);
      return;
    }
    s.data.incidentLabel = INCIDENT[s.lang][text];
    s.step = 'name';
    await sendWA(from, s.lang === 'mr' ? `तुमचे *पूर्ण नाव* सांगा:` : `Please share your *full name*:`);
    return;
  }

  /* NAME */
  if (s.step === 'name') {
    if (text.length < 2) {
      await sendWA(from, s.lang === 'mr' ? `⚠️ पूर्ण नाव टाका.` : `⚠️ Please enter your full name.`);
      return;
    }
    s.data.name  = text;
    s.data.phone = from;
    s.step = 'location';
    await sendWA(from, s.lang === 'mr'
      ? `धन्यवाद ${text}!\n\n📍 घटना *कुठे घडली*?\n• पत्ता टाइप करा\n• Google Maps link पाठवा\n• WhatsApp 📎 Location Pin पाठवा`
      : `Thank you ${text}!\n\n📍 *Where did the incident happen?*\n• Type the address / landmark\n• Paste a Google Maps link\n• Drop a 📎 Location Pin`
    );
    return;
  }

  /* LOCATION */
  if (s.step === 'location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: ${msgObj.location.name || 'Location'} (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text, null);
    if (!loc) {
      await sendWA(from, s.lang === 'mr'
        ? `⚠️ पत्ता टाइप करा, Google Maps link किंवा Location Pin पाठवा.`
        : `⚠️ Type the address, paste a Google Maps link, or drop a Location Pin.`
      );
      return;
    }
    s.data.location = loc;
    s.step = 'altContact';
    await sendWA(from, s.lang === 'mr'
      ? `📞 *पर्यायी संपर्क नंबर* असल्यास द्या.\nनसल्यास *"skip"* टाइप करा.`
      : `📞 Share an *alternate contact number* (optional).\nType *"skip"* if you don't have one.`
    );
    return;
  }

  /* ALT CONTACT */
  if (s.step === 'altContact') {
    if (text.toLowerCase() === 'skip') {
      s.data.altContact = '';
    } else {
      if (text.replace(/\D/g, '').length < 8) {
        await sendWA(from, s.lang === 'mr'
          ? `⚠️ योग्य नंबर द्या किंवा *"skip"* टाइप करा.`
          : `⚠️ Enter a valid number or type *"skip"*.`
        );
        return;
      }
      s.data.altContact = text;
    }
    s.step = 'photo';
    await sendWA(from, s.lang === 'mr'
      ? `📸 घटनेचा *फोटो किंवा व्हिडिओ* पाठवा.\n⚠️ *हे अनिवार्य आहे — फोटोशिवाय तक्रार नोंदवली जाणार नाही.*`
      : `📸 Send a *photo or video* of the incident.\n⚠️ *This is mandatory — complaint cannot be registered without it.*`
    );
    return;
  }

  /* PHOTO — MANDATORY */
  if (s.step === 'photo') {
    if (!hasMedia) {
      await sendWA(from, s.lang === 'mr'
        ? `⚠️ फोटो किंवा व्हिडिओ पाठवणे अनिवार्य आहे. कृपया पाठवा.`
        : `⚠️ Photo or video is mandatory. Please send one to register your complaint.`
      );
      return;
    }

    const mType = msgObj.image ? 'image' : 'video';
    const mId   = msgObj.image?.id || msgObj.video?.id;
    const mUrl  = await getMediaUrl(mId);
    s.data.mediaUrl  = mUrl;
    s.data.mediaId   = mId;
    s.data.mediaType = mType;

    // Create ticket
    const ref = genRef();
    const t   = {
      ref,
      status:       'Open',
      lang:         s.lang,
      citizenPhone: from,
      data:         { ...s.data },
      atRecordId:   null,
    };
    tickets[ref] = t;

    // Save to Airtable
    const atId = await atCreate(ref, s.data);
    if (atId) t.atRecordId = atId;

    // Mark session as done
    s.step  = 'done';
    s.ref   = ref;

    // Thank citizen
    await sendWA(from, s.lang === 'mr'
      ? `✅ *तक्रार यशस्वीरित्या नोंदवली!*\n\n🎫 *Ticket:* ${ref}\n\nआमचा अधिकारी लवकरच संपर्क करेल.\nतुम्हाला तक्रार बंद झाल्यावर आपोआप कळवले जाईल.\n\n*धन्यवाद! 🙏*`
      : `✅ *Complaint registered successfully!*\n\n🎫 *Ticket:* ${ref}\n\nOur officer will contact you shortly.\nYou will be automatically notified once your complaint is resolved.\n\n*Thank you! 🙏*`
    );

    // Alert admin + forward citizen's photo
    await sendWA(ADMIN_NUMBER,
`🚨 *New Complaint — VVCMC Bot*

🎫 *Ref:* ${ref}
🐕 *Incident:* ${s.data.incidentLabel}
👤 *Name:* ${s.data.name}
📱 *Phone:* +${from}
📍 *Location:* ${s.data.location}
📞 *Alt Contact:* ${s.data.altContact || 'N/A'}
📸 *Media:* ✅ ${mType}
━━━━━━━━━━━━━━━
_Assign a driver:_
ASSIGN ${ref} DRIVER:1 DATE:25-Jan TIME:10:00AM

Drivers:
${DRIVERS.map(d => `  ${d.id}. ${d.name}`).join('\n')}`
    );
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `📸 Evidence — ${ref}`);

    // Heads-up to all drivers
    for (const drv of DRIVERS) {
      await sendWA(drv.phone,
`📢 *New Complaint — Heads Up*
🎫 Ref: ${ref}
🐕 ${s.data.incidentLabel}
📍 ${s.data.location}
👤 ${s.data.name}

_Admin will assign one of you shortly._`
      );
    }
    return;
  }

  /* DONE — complaint already submitted */
  if (s.step === 'done') {
    // If citizen gets a resolution message and wants to file a new one
    if (/^(new|नवीन|hi|hello|start)$/i.test(text)) {
      delete sessions[from];
      await sendWA(from, s.lang === 'mr'
        ? `🙏 नवीन तक्रार नोंदवण्यासाठी *Hi* पाठवा.`
        : `🙏 Send *Hi* to file a new complaint.`
      );
      return;
    }
    await sendWA(from, s.lang === 'mr'
      ? `तुमची तक्रार नोंदवली आहे. 🎫 ${s.ref}\nतक्रार निकाली झाल्यावर तुम्हाला आपोआप कळवले जाईल.\nनवीन तक्रारीसाठी *"नवीन"* टाइप करा.`
      : `Your complaint is registered. 🎫 ${s.ref}\nYou will be automatically notified once it is resolved.\nType *"new"* to file another complaint.`
    );
    return;
  }

  await sendWA(from, `👋 Send *Hi* to start.`);
}

/* ── NETLIFY MAIN HANDLER ── */
exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json' };

  /* GET — webhook verification by Meta */
  if (event.httpMethod === 'GET') {
    const p = event.queryStringParameters || {};
    if (p['hub.mode'] === 'subscribe' && p['hub.verify_token'] === process.env.WA_VERIFY_TOKEN)
      return { statusCode: 200, body: p['hub.challenge'] };
    return { statusCode: 403, body: 'Forbidden' };
  }

  /* POST — incoming WhatsApp message */
  if (event.httpMethod === 'POST') {
    let body;
    try   { body = JSON.parse(event.body); }
    catch { return { statusCode: 200, headers: h, body: '{"ok":true}' }; }

    const msgObj = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msgObj) return { statusCode: 200, headers: h, body: '{"ok":true}' };

    const from = msgObj.from;
    try {
      const driver = DRIVERS.find(d => d.phone === from);
      if (from === ADMIN_NUMBER)  await handleAdmin(from, (msgObj.text?.body || '').trim());
      else if (driver)            await handleDriver(from, msgObj, driver);
      else                        await handleCitizen(from, msgObj);
    } catch (err) {
      console.error('[handler error]', err.message, err.stack);
    }

    return { statusCode: 200, headers: h, body: '{"ok":true}' };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
