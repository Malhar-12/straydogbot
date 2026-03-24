'use strict';

/* ── CONFIG ── */
const GS_NUMBER  = '919820349477';
const DRIVERS = [
  { id: 1, name: 'Somnath Catcher', phone: '917218082442' },
  { id: 2, name: 'Mukesh Catcher',  phone: '919373246128' },
];

/* ── IN-MEMORY STORES (fast, no API delay) ── */
const sessions     = {}; // citizen conversation state
const tickets      = {}; // all tickets in memory
const pendingAssign = {}; // admin pending driver selection

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
}

/* ── TIME ── */
function nowIST() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

/* ── WHATSAPP ── */
async function sendWA(to, body) {
  if (!to || to.includes('X')) return;
  const res = await fetch(`https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) console.error('[sendWA error]', await res.text());
}

async function forwardMedia(to, mediaId, mediaType, caption) {
  if (!to || to.includes('X')) return;
  await fetch(`https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: mediaType, [mediaType]: { id: mediaId, caption: caption || '' } }),
  });
}

async function getMediaUrl(mediaId) {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
    const data = await res.json();
    return data.url || '';
  } catch { return ''; }
}

/* ── AIRTABLE (only for saving data — not for reading!) ── */
const AT_BASE = 'appIAa5QyApMtzlR8';
const AT_TABLE = 'tblLhgEATdVGkWhGo';
const AT_SETTINGS = 'tblWDeHIP7VMEgqo1';
const AT_URL = `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`;
const ST_URL = `https://api.airtable.com/v0/${AT_BASE}/${AT_SETTINGS}`;
const AT_HDR = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` });

const COUNTER_RECORD_ID = 'recBwmnV29BQbSI3f';
const TOKEN_RECORD_ID   = 'recfOnsA8Ce8XmTqI';

async function atCreate(ref, data) {
  try {
    const res = await fetch(AT_URL, {
      method: 'POST', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fldi3QMTASyf3FiH8: ref,
        fldgb6Ftq7qaRNoHe: 'Open',
        fldQmRhTECXhx75EX: data.lang === 'mr' ? 'मराठी' : 'English',
        fldNfZJ9MB5Ub7o0S: data.incidentLabel || '',
        fld8dumoEH3eCv8bg: data.name || '',
        fld9mitPsPU8y32PW: data.phone || '',
        fldE45zv9IER93A8Q: data.location || '',
        fldhrqYI58ioDB6xH: data.altContact || '',
        fld5idjsIpkMglZMV: data.mediaType || '',
        flddMQC528gDuo0AI: data.mediaUrl || '',
        fld1VlQL5WwOptowZ: new Date().toISOString().split('T')[0],
      }}),
    });
    const json = await res.json();
    if (!res.ok) { console.error('[atCreate error]', JSON.stringify(json)); return null; }
    return json.id;
  } catch (e) { console.error('[atCreate exception]', e.message); return null; }
}

async function atAssign(recordId, driverName, driverPhone) {
  try {
    await fetch(`${AT_URL}/${recordId}`, {
      method: 'PATCH', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fldgb6Ftq7qaRNoHe: 'Assigned',
        fldQ85dcRt82zeQGJ: driverName,
        fldTA01ZKdnd1Xwwq: driverPhone,
      }})
    });
  } catch(e) { console.error('[atAssign error]', e.message); }
}

async function atClose(recordId, closingLocation, driverName, closingMediaUrl) {
  try {
    await fetch(`${AT_URL}/${recordId}`, {
      method: 'PATCH', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fldgb6Ftq7qaRNoHe: 'Closed',
        fldQlVSiP3pltNJi1: driverName || '',
        fldlpGNuIN7BjnOHS: closingLocation || '',
        fld5LrgHULuF3hWxp: closingMediaUrl || '',
        fldsiGzl0zRrlDGsd: new Date().toISOString().split('T')[0],
      }}),
    });
  } catch (e) { console.error('[atClose exception]', e.message); }
}

/* ── TICKET COUNTER — read once on startup, then keep in memory ── */
let ticketCounter = 10; // safe default, will be updated from Airtable

async function loadCounter() {
  // Counter is loaded in startup() with timeout
  // This function kept for compatibility
}

async function saveCounter(val) {
  try {
    await fetch(`${ST_URL}/${COUNTER_RECORD_ID}`, {
      method: 'PATCH', headers: AT_HDR(),
      body: JSON.stringify({ fields: { fldThfAgPohMINbnH: String(val), fldBakW5veuT3uf2b: nowIST() } })
    });
  } catch(e) { console.error('[saveCounter error]', e.message); }
}

function genRef() {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const month = months[new Date().getMonth()];
  const num = String(ticketCounter).padStart(5, '0');
  const ref = `VVCMC-STRAY-${month}-${num}`;
  ticketCounter++;
  saveCounter(ticketCounter).catch(() => {}); // save async, don't wait
  return ref;
}

/* ── INCIDENT TYPES ── */
const INCIDENT = {
  mr: {
    '1': 'श्वानांचा उपद्रव',
    '2': 'एक चावणारा श्वान आहे',
    '3': 'पिसाळलेला श्वान आहे',
    '4': 'आमच्या क्षेत्र मधल्या श्वानांची नसबंदी करायची आहे',
    '5': 'इतर तक्रार',
  },
  en: {
    '1': 'Dog nuisance',
    '2': 'A dog is biting people',
    '3': 'There is a rabid dog',
    '4': 'Need to sterilize dogs in our area',
    '5': 'Other complaints',
  },
};

function parseLocation(text) {
  if (/maps\.google|goo\.gl|maps\.app|google\.com\/maps/i.test(text)) return text;
  if (text.length > 3) return text;
  return null;
}

/* ── ADMIN HANDLER ── */
async function handleAdmin(from, text) {

  // TOKEN UPDATE
  if (text.startsWith('UPDATE-TOKEN:')) {
    const newToken = text.replace('UPDATE-TOKEN:', '').trim();
    if (newToken.length > 50) {
      process.env.WA_ACCESS_TOKEN = newToken;
      // Save to Airtable async
      fetch(`${ST_URL}/${TOKEN_RECORD_ID}`, {
        method: 'PATCH', headers: AT_HDR(),
        body: JSON.stringify({ fields: { fldThfAgPohMINbnH: newToken, fldBakW5veuT3uf2b: nowIST() } })
      }).catch(() => {});
      await sendWA(from, '✅ Token updated! Bot is working now.');
    } else {
      await sendWA(from, '⚠️ Invalid token. Send: UPDATE-TOKEN:yourNewToken');
    }
    return;
  }

  // STEP 2 — Driver selection (1 or 2)
  if (/^[12]$/.test(text) && pendingAssign[from]) {
    const { ref } = pendingAssign[from];
    const ticket = tickets[ref];

    if (!ticket) {
      await sendWA(from, `⚠️ Ticket \`${ref}\` not found in memory.\nBot restart झाले असेल. कृपया ticket ref परत पाठवा.`);
      delete pendingAssign[from];
      return;
    }

    const driver = DRIVERS.find(d => d.id === parseInt(text));
    delete pendingAssign[from];

    ticket.status = 'Assigned';
    ticket.driverName = driver.name;

    // Notify driver
    await sendWA(driver.phone,
`📋 *तुम्हाला काम सोपवले गेले आहे!*
🎫 Ref: ${ref}
🐕 *तक्रार:* ${ticket.data.incidentLabel}
👤 *तक्रारदार:* ${ticket.data.name}
📍 *ठिकाण:* ${ticket.data.location}
📞 *संपर्क:* +${ticket.citizenPhone}
📞 *Alt:* ${ticket.data.altContact || 'N/A'}

_काम झाल्यावर *ticket* टाइप करा._`);

    // Notify citizen
    const citizenMsg = ticket.lang === 'mr'
      ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 ${ref}\n👤 *अधिकारी:* ${driver.name}\n\n_ते येण्यापूर्वी फोन करतील._`
      : `👷 *Your complaint has been assigned!*\n🎫 ${ref}\n👤 *Officer:* ${driver.name}\n\n_He will call before arriving._`;
    await sendWA(ticket.citizenPhone, citizenMsg);

    // Update Airtable async
    if (ticket.atRecordId) atAssign(ticket.atRecordId, driver.name, driver.phone).catch(() => {});

    await sendWA(from, `✅ *${ref}* → *${driver.name}*\nCitizen ✓  Driver ✓  Airtable ✓`);
    return;
  }

  // STEP 1 — Ticket ref received
  const refMatch = text.match(/^(VVCMC-STRAY-[A-Z]+-\d+|SDB-[A-Z0-9]+)$/i);
  if (refMatch) {
    const ref = refMatch[1].toUpperCase();
    const ticket = tickets[ref];

    if (!ticket) {
      await sendWA(from,
`⚠️ Ticket \`${ref}\` memory मध्ये सापडले नाही.

*कारण:* Bot restart झाल्यावर memory clear होते.

*Solution:* Complainer ला पुन्हा *Hi* पाठवायला सांगा — नवीन complaint file होईल!`);
      return;
    }

    pendingAssign[from] = { ref };
    await sendWA(from,
`📋 *Ticket:* ${ref}
🐕 ${ticket.data.incidentLabel}
👤 ${ticket.data.name}
📍 ${ticket.data.location}
🕐 ${ticket.data.incidentTime}

*Driver निवडा / Select driver:*
1️⃣  Somnath Catcher
2️⃣  Mukesh Catcher

_Reply with 1 or 2_`);
    return;
  }

  // Default — show open tickets from memory
  const openTickets = Object.values(tickets).filter(t => t.status === 'Open');

  if (openTickets.length === 0) {
    await sendWA(from,
`📋 *Admin Panel — VVCMC Bot*

सध्या memory मध्ये कोणतीही Open तक्रार नाही.

*Note:* Bot restart नंतर memory clear होते.
नवीन complaints आल्यावर येथे दिसतील.

*Drivers:*
${DRIVERS.map(d=>`${d.id}. ${d.name}  +${d.phone}`).join('\n')}`);
    return;
  }

  let msg = `📋 *Admin Panel — VVCMC Bot*\n\n*Open Tickets:*\n━━━━━━━━━━\n`;
  openTickets.forEach((t, i) => {
    msg += `${i+1}. *${t.ref}*\n   🐕 ${t.data.incidentLabel}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,40)}\n   🕐 ${t.data.incidentTime}\n\n`;
  });
  msg += `━━━━━━━━━━
👆 *वरील ticket ref copy करा आणि इथे paste करा!*
Example: \`${openTickets[0]?.ref || 'VVCMC-STRAY-MAR-00010'}\``;
  await sendWA(from, msg);
}

/* ── DRIVER HANDLER ── */
async function handleDriver(from, msgObj, driver) {
  const text     = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin    = msgObj.type === 'location';
  const s        = getSession(from);

  if (/^ticket$/i.test(text)) {
    const mine = Object.values(tickets).filter(t => t.status === 'Assigned' && t.driverName === driver.name);
    if (!mine.length) {
      await sendWA(from, `📋 तुमच्यासाठी सध्या कोणतेही ticket नाही.\n(No open tickets assigned to you.)`);
      return;
    }
    let list = `📋 *तुमचे Open Tickets:*\n━━━━━━━━━\n`;
    mine.forEach((t, i) => {
      list += `${i+1}. ${t.ref}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,50)}\n   🐕 ${t.data.incidentLabel}\n   🕐 ${t.data.incidentTime}\n\n`;
    });
    list += `_नंबर टाइप करा (e.g. 1)_`;
    s.step = 'driver_select'; s.openTickets = mine;
    await sendWA(from, list);
    return;
  }

  if (s.step === 'driver_select') {
    const num = parseInt(text);
    const selected = (!isNaN(num) && s.openTickets?.[num-1]) ? s.openTickets[num-1] : tickets[text.toUpperCase()];
    if (!selected) { await sendWA(from, `⚠️ सापडले नाही. *ticket* टाइप करा.`); return; }
    s.step = 'driver_location'; s.activeTicket = selected.ref;
    await sendWA(from,
`✅ *Ticket:* ${selected.ref}
👤 ${selected.data.name}
📍 ${selected.data.location}
🐕 ${selected.data.incidentLabel}
🕐 ${selected.data.incidentTime}

Case बंद करण्यासाठी:
1️⃣ *location* पाठवा (WhatsApp pin / Google Maps)
2️⃣ काम झाल्याचा *फोटो/व्हिडिओ* पाठवा *(अनिवार्य)*`);
    return;
  }

  if (s.step === 'driver_location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text);
    if (!loc) { await sendWA(from, `⚠️ WhatsApp location pin किंवा Google Maps link पाठवा.`); return; }
    s.closingLocation = loc; s.step = 'driver_photo';
    await sendWA(from, `✅ Location मिळाले!\nआता काम झाल्याचा *फोटो किंवा व्हिडिओ* पाठवा.`);
    return;
  }

  if (s.step === 'driver_photo') {
    if (!hasMedia) { await sendWA(from, `⚠️ फोटो किंवा व्हिडिओ पाठवणे अनिवार्य आहे.`); return; }
    const ref    = s.activeTicket;
    const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket सापडले नाही.`); return; }

    const mType    = msgObj.image ? 'image' : 'video';
    const mId      = msgObj.image?.id || msgObj.video?.id;
    const mUrl     = await getMediaUrl(mId);
    const loc      = s.closingLocation;
    const closedAt = nowIST();

    ticket.status = 'Closed';

    // Citizen closing message
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार सोडवली गेली आहे!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *अधिकारी:* ${driver.name}\n📍 *ठिकाण:* ${loc}\n🕐 *बंद:* ${closedAt}\n\nआमच्या टीमने समस्या सोडवली.\n_VVCMC सेवेत विश्वास ठेवल्याबद्दल धन्यवाद! 🙏_\n\nनवीन तक्रारीसाठी *Hi* पाठवा.`
      : `✅ *Your complaint has been resolved!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *Officer:* ${driver.name}\n📍 *Resolved at:* ${loc}\n🕐 *Closed at:* ${closedAt}\n\nOur team has addressed the problem.\n_Thank you for reporting to VVCMC! 🙏_\n\nSend *Hi* to file a new complaint.`;

    // Run in parallel for speed
    await Promise.all([
      sendWA(ticket.citizenPhone, citizenClose),
      sendWA(GS_NUMBER, `✅ *Case Closed*\n🎫 ${ref}\n👷 ${driver.name}\n📍 ${loc}\n🕐 ${closedAt}\n👤 ${ticket.data.name}`),
      mId ? forwardMedia(ticket.citizenPhone, mId, mType, ticket.lang === 'mr' ? '📸 काम पूर्ण झाल्याचा पुरावा' : '📸 Proof of work completed') : Promise.resolve(),
      ticket.atRecordId ? atClose(ticket.atRecordId, loc, driver.name, mUrl) : Promise.resolve(),
    ]);

    if (mId) forwardMedia(GS_NUMBER, mId, mType, `Closing proof — ${ref}`).catch(() => {});

    await sendWA(from,
`✅ *Case बंद केले!*
🎫 ${ref}
✓ तक्रारदाराला कळवले
✓ Malhar sir ला कळवले
✓ Airtable → Closed

_पुढील ticket साठी *ticket* टाइप करा._`);

    delete sessions[ticket.citizenPhone];
    s.step = 'driver_idle'; s.activeTicket = null; s.closingLocation = null;
    return;
  }

  await sendWA(from, `👋 नमस्कार ${driver.name}!\nतुमचे tickets पाहण्यासाठी *ticket* टाइप करा.`);
}

/* ── CITIZEN HANDLER ── */
async function handleCitizen(from, msgObj) {
  const text     = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin    = msgObj.type === 'location';
  const s        = getSession(from);

  if (s.step === 'greet') {
    if (!/^(hi|hello|hey|hii|helo|start|नमस्कार|नमस्ते|हाय)$/i.test(text)) {
      await sendWA(from, `👋 तक्रार नोंदवण्यासाठी *Hi* पाठवा.\n(Send *Hi* to register a stray dog complaint.)`); return;
    }
    s.step = 'lang';
    await sendWA(from,
`🙏 *नमस्कार! / Hello!*
VVCMC भटके श्वान तक्रार बॉटमध्ये आपले स्वागत आहे!
Welcome to VVCMC Stray Dog Complaint Bot!

भाषा निवडा / Choose language:
1️⃣  मराठी
2️⃣  English`);
    return;
  }

  if (s.step === 'lang') {
    if      (text === '1' || /marathi|मराठी/i.test(text)) s.lang = 'mr';
    else if (text === '2' || /english/i.test(text))        s.lang = 'en';
    else { await sendWA(from, `⚠️ Reply *1* for मराठी or *2* for English.`); return; }
    s.step = 'incident';
    await sendWA(from, s.lang === 'mr'
      ? `🐕 *तक्रारीचा प्रकार निवडा:*\n\n1️⃣  श्वानांचा उपद्रव\n2️⃣  एक चावणारा श्वान आहे\n3️⃣  पिसाळलेला श्वान आहे\n4️⃣  आमच्या क्षेत्र मधल्या श्वानांची नसबंदी करायची आहे\n5️⃣  इतर तक्रार`
      : `🐕 *Select the type of complaint:*\n\n1️⃣  Dog nuisance\n2️⃣  A dog is biting people\n3️⃣  There is a rabid dog\n4️⃣  Need to sterilize dogs in our area\n5️⃣  Other complaints`);
    return;
  }

  if (s.step === 'incident') {
    if (!['1','2','3','4','5'].includes(text)) {
      await sendWA(from, s.lang === 'mr' ? `⚠️ 1 ते 5 मधील क्रमांक पाठवा.` : `⚠️ Reply with a number from 1 to 5.`); return;
    }
    s.data.incidentLabel = INCIDENT[s.lang][text];
    s.data.incidentTime  = nowIST();
    s.step = 'name';
    await sendWA(from, s.lang === 'mr' ? `तुमचे *पूर्ण नाव* सांगा:` : `Please share your *full name*:`);
    return;
  }

  if (s.step === 'name') {
    if (text.length < 2) { await sendWA(from, `⚠️ पूर्ण नाव टाका.`); return; }
    s.data.name = text; s.data.phone = from; s.step = 'location';
    await sendWA(from, s.lang === 'mr'
      ? `धन्यवाद ${text}! 🙏\n\n📍 *ठिकाण* सांगा:\n• पत्ता टाइप करा\n• Google Maps link पाठवा\n• WhatsApp 📎 Location Pin पाठवा`
      : `Thank you ${text}! 🙏\n\n📍 *Where did the incident happen?*\n• Type the address / landmark\n• Paste a Google Maps link\n• Drop a 📎 Location Pin`);
    return;
  }

  if (s.step === 'location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text);
    if (!loc) {
      await sendWA(from, s.lang === 'mr'
        ? `⚠️ पत्ता टाइप करा, Google Maps link किंवा Location Pin पाठवा.`
        : `⚠️ Type the address, paste a Google Maps link, or drop a Location Pin.`); return;
    }
    s.data.location = loc; s.step = 'altContact';
    await sendWA(from, s.lang === 'mr'
      ? `📞 *पर्यायी संपर्क नंबर* असल्यास द्या.\nनसल्यास *"skip"* टाइप करा.`
      : `📞 Share an *alternate contact number* (optional).\nType *"skip"* if none.`);
    return;
  }

  if (s.step === 'altContact') {
    if (text.toLowerCase() === 'skip') { s.data.altContact = ''; }
    else {
      if (text.replace(/\D/g,'').length < 8) {
        await sendWA(from, s.lang === 'mr' ? `⚠️ योग्य नंबर द्या किंवा *"skip"* टाइप करा.` : `⚠️ Enter a valid number or type *"skip"*.`); return;
      }
      s.data.altContact = text;
    }
    s.step = 'photo';
    await sendWA(from, s.lang === 'mr'
      ? `📸 परिसराचा *फोटो किंवा व्हिडिओ* पाठवा.\n⚠️ *हे अनिवार्य आहे — फोटोशिवाय तक्रार नोंदवली जाणार नाही.*`
      : `📸 Send a *photo or video* of the incident.\n⚠️ *This is mandatory — complaint cannot be registered without it.*`);
    return;
  }

  if (s.step === 'photo') {
    if (!hasMedia) {
      await sendWA(from, s.lang === 'mr'
        ? `⚠️ फोटो किंवा व्हिडिओ पाठवणे अनिवार्य आहे.`
        : `⚠️ Photo or video is mandatory. Please send one.`); return;
    }

    const mType = msgObj.image ? 'image' : 'video';
    const mId   = msgObj.image?.id || msgObj.video?.id;
    s.data.mediaId = mId; s.data.mediaType = mType;

    // Generate ticket ref IMMEDIATELY
    const ref = genRef();
    const t = {
      ref, status: 'Open', lang: s.lang,
      citizenPhone: from, atRecordId: null,
      data: { ...s.data }
    };
    tickets[ref] = t;
    s.step = 'done'; s.ref = ref;

    // Build messages
    const citizenConfirm = s.lang === 'mr'
      ? `✅ *तुमची तक्रार नोंदवली गेली!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *तक्रार:* ${s.data.incidentLabel}\n📍 *ठिकाण:* ${s.data.location}\n🕐 *वेळ:* ${s.data.incidentTime}\n\nआमचा अधिकारी लवकरच संपर्क करेल.\n*धन्यवाद! VVCMC 🙏*`
      : `✅ *Your complaint has been registered!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *Issue:* ${s.data.incidentLabel}\n📍 *Location:* ${s.data.location}\n🕐 *Time:* ${s.data.incidentTime}\n\nOur officer will contact you shortly.\n*Thank you! VVCMC 🙏*`;

    const adminAlert = s.lang === 'mr'
      ? `🚨 *नवीन तक्रार — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *तक्रार:* ${s.data.incidentLabel}\n👤 *नाव:* ${s.data.name}\n📱 *तक्रारदार Phone:* +${from}\n📍 *ठिकाण:* ${s.data.location}\n📞 *Alt Contact:* ${s.data.altContact || 'N/A'}\n🕐 *वेळ:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Ticket number पाठवा to assign:_\n*${ref}*`
      : `🚨 *New Complaint — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *Issue:* ${s.data.incidentLabel}\n👤 *Name:* ${s.data.name}\n📱 *Complainant Phone:* +${from}\n📍 *Location:* ${s.data.location}\n📞 *Alt Contact:* ${s.data.altContact || 'N/A'}\n🕐 *Time:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Reply with ticket number to assign:_\n*${ref}*`;

    // STEP 1: Send citizen confirmation and admin alert IMMEDIATELY (no waiting!)
    await Promise.all([
      sendWA(from, citizenConfirm),
      sendWA(GS_NUMBER, adminAlert),
    ]);

    // STEP 2: Do media + Airtable IN BACKGROUND (don't make citizen wait!)
    Promise.all([
      mId ? forwardMedia(GS_NUMBER, mId, mType, s.lang === 'mr' ? `📸 पुरावा — ${ref}` : `📸 Evidence — ${ref}`) : Promise.resolve(),
      getMediaUrl(mId).then(mUrl => {
        t.data.mediaUrl = mUrl;
        return atCreate(ref, { ...s.data, mediaUrl: mUrl }).then(atId => { if (atId) t.atRecordId = atId; });
      }),
    ]).catch(e => console.error('[background error]', e.message));
    return;
  }

  if (s.step === 'done') {
    if (/^(new|नवीन|hi|hello|start|हाय)$/i.test(text)) {
      delete sessions[from];
      await sendWA(from, s.lang === 'mr' ? `नवीन तक्रारीसाठी *Hi* पाठवा. 🙏` : `Send *Hi* to file a new complaint. 🙏`); return;
    }
    await sendWA(from, s.lang === 'mr'
      ? `तुमची तक्रार नोंदवली आहे. 🎫 \`${s.ref}\`\nसमस्या सोडवल्यावर सूचना मिळेल.\nनवीन तक्रारीसाठी *"Hi"* टाइप करा.`
      : `Your complaint is registered. 🎫 \`${s.ref}\`\nYou will be notified once resolved.\nType *"Hi"* to file another complaint.`);
    return;
  }

  await sendWA(from, `👋 तक्रार नोंदवण्यासाठी *Hi* पाठवा.\n(Send *Hi* to start.)`);
}

/* ── TOKEN AUTO REFRESH ── */
/* ── STARTUP — runs once when server starts ── */
async function startup() {
  console.log('✅ VVCMC Bot starting...');

  // Load token from Airtable (1 call only)
  try {
    const r = await fetch(`${ST_URL}/${TOKEN_RECORD_ID}`, {
      headers: AT_HDR(),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    const token = d.fields?.fldThfAgPohMINbnH;
    if (token && token.length > 50 && !token.includes('PASTE')) {
      process.env.WA_ACCESS_TOKEN = token;
      console.log('✅ Token loaded from Airtable!');
    }
  } catch(e) { console.log('⚠️ Using env token:', e.message); }

  // Load ticket counter from Airtable (1 call only)
  try {
    const r = await fetch(`${ST_URL}/${COUNTER_RECORD_ID}`, {
      headers: AT_HDR(),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    const val = parseInt(d.fields?.fldThfAgPohMINbnH);
    if (val && val > ticketCounter) {
      ticketCounter = val;
      console.log(`✅ Counter: ${ticketCounter}`);
    }
  } catch(e) { console.log('⚠️ Using default counter:', e.message); }

  console.log('✅ Bot ready!');
  // NO token refresh on startup — token is managed manually via UPDATE-TOKEN command
}

// Start after 2 seconds
setTimeout(startup, 2000);

/* ── HTTP SERVER ── */
const PORT = process.env.PORT || 3000;
require('http').createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) { res.writeHead(200); res.end(challenge); return; }
    if (url.pathname === '/privacy') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Privacy Policy - VVCMC</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#1a6b3a}</style></head><body><h1>Privacy Policy</h1><p>Last updated: March 23, 2026</p><p>This Privacy Policy applies to the <strong>VVCMC Stray Dog Complaint Bot</strong> operated by Vasai Virar City Municipal Corporation.</p><h2>Information We Collect</h2><ul><li>WhatsApp phone number</li><li>Name and location of incident</li><li>Photos/videos submitted</li></ul><h2>How We Use Your Information</h2><ul><li>Register and track complaints</li><li>Assign municipal officers</li><li>Notify you about status</li></ul><h2>Contact</h2><p>VVCMC, Vasai Virar, Maharashtra</p></body></html>`);
      return;
    }
    if (url.pathname === '/deletion') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Data Deletion - VVCMC</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#c0392b}</style></head><body><h1>Data Deletion Request</h1><p>To request deletion of your data, contact: vvcmc@vasaivirar.gov.in</p><p>We will process your request within 30 days.</p></body></html>`);
      return;
    }
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('VVCMC Stray Dog Bot is running! OK');
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      try {
        const data   = JSON.parse(body);
        const msgObj = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!msgObj) return;
        const from   = msgObj.from;
        const driver = DRIVERS.find(d => d.phone === from);
        const isAdmin = from === GS_NUMBER;
        if      (isAdmin)  await handleAdmin(from, (msgObj.text?.body || '').trim());
        else if (driver)   await handleDriver(from, msgObj, driver);
        else               await handleCitizen(from, msgObj);
      } catch (err) { console.error('[handler error]', err.message, err.stack); }
    });
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end('VVCMC Stray Dog Bot is running! OK');
}).listen(PORT, () => console.log(`✅ VVCMC Bot running on port ${PORT}`));
