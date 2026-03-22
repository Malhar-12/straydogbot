'use strict';

const GS_NUMBER = '919820349477';
const DRIVERS = [
  { id: 1, name: 'Somnath Catcher', phone: '917218082442' },
  { id: 2, name: 'Mukesh Catcher',  phone: '919373246128' },
];

const sessions = {};
const tickets  = {};
const pendingAssign = {}; // stores ref waiting for driver selection

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
}

function nowIST() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

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

const AT_BASE  = 'appIAa5QyApMtzlR8';
const AT_TABLE = 'tblLhgEATdVGkWhGo';
const AT_URL   = `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`;
const AT_HDR   = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` });

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

function genRef() { return `SDB-${Date.now().toString(36).toUpperCase()}`; }

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

/* ── GS / ADMIN HANDLER ── */
async function handleAdmin(from, text) {

  // STEP 2 — Admin selected a driver number (1 or 2)
  if (pendingAssign[from] && /^[12]$/.test(text)) {
    const { ref, date, time } = pendingAssign[from];
    const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found. Bot restart झाले असेल.`); delete pendingAssign[from]; return; }
    const driver = DRIVERS.find(d => d.id === parseInt(text));
    if (!driver) { await sendWA(from, `⚠️ Driver ${text} not found.`); return; }

    delete pendingAssign[from]; // clear pending

    ticket.status = 'Assigned';
    ticket.driverName = driver.name;
    ticket.visitDate = date;
    ticket.visitTime = time;

    // Notify ONLY the selected driver
    await sendWA(driver.phone,
`📋 *तुम्हाला काम सोपवले गेले आहे!*
🎫 Ref: ${ref}
🐕 *तक्रार:* ${ticket.data.incidentLabel}
👤 *तक्रारदार:* ${ticket.data.name}
📍 *ठिकाण:* ${ticket.data.location}
📞 *संपर्क:* +${ticket.data.phone}
📞 *Alt:* ${ticket.data.altContact || 'N/A'}
🕐 *वेळ:* ${ticket.data.incidentTime}
📅 *भेटीची वेळ:* ${date} at ${time}

_काम झाल्यावर *ticket* टाइप करा._`);

    // Notify citizen in their language
    const citizenMsg = ticket.lang === 'mr'
      ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 Ticket: ${ref}\n\n👤 *अधिकारी:* ${driver.name}\n📅 *भेटीची तारीख:* ${date}\n⏰ *वेळ:* ${time}\n\n_ते येण्यापूर्वी फोन करतील._`
      : `👷 *Your complaint has been assigned to an officer!*\n🎫 Ticket: ${ref}\n\n👤 *Officer:* ${driver.name}\n📅 *Visit Date:* ${date}\n⏰ *Time:* ${time}\n\n_He will call before arriving._`;
    await sendWA(ticket.citizenPhone, citizenMsg);

    await sendWA(from, `✅ *${ref}* → *${driver.name}*\n📅 ${date} ⏰ ${time}\nCitizen ✓  Driver ✓`);
    return;
  }

  // STEP 1 — Admin sends ASSIGN command
  const m = text.match(/ASSIGN\s+(SDB-[A-Z0-9]+)\s+DRIVER:(\d+)\s+DATE:([^\s]+)\s+TIME:([^\s]+)/i);
  if (m) {
    const [, ref, driverId, date, time] = m;
    const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found.`); return; }
    const driver = DRIVERS.find(d => d.id === parseInt(driverId));
    if (!driver) { await sendWA(from, `⚠️ Driver ${driverId} not found.`); return; }

    // Direct assign — no selection needed
    delete pendingAssign[from];
    ticket.status = 'Assigned';
    ticket.driverName = driver.name;
    ticket.visitDate = date;
    ticket.visitTime = time;

    await sendWA(driver.phone,
`📋 *तुम्हाला काम सोपवले गेले आहे!*
🎫 Ref: ${ref}
🐕 *तक्रार:* ${ticket.data.incidentLabel}
👤 *तक्रारदार:* ${ticket.data.name}
📍 *ठिकाण:* ${ticket.data.location}
📞 *संपर्क:* +${ticket.data.phone}
🕐 *वेळ:* ${ticket.data.incidentTime}
📅 *भेटीची वेळ:* ${date} at ${time}

_काम झाल्यावर *ticket* टाइप करा._`);

    const citizenMsg = ticket.lang === 'mr'
      ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 ${ref}\n👤 *अधिकारी:* ${driver.name}\n📅 ${date} ⏰ ${time}`
      : `👷 *Your complaint has been assigned!*\n🎫 ${ref}\n👤 *Officer:* ${driver.name}\n📅 ${date} ⏰ ${time}`;
    await sendWA(ticket.citizenPhone, citizenMsg);
    await sendWA(from, `✅ *${ref}* → *${driver.name}*\n📅 ${date} ⏰ ${time}\nCitizen ✓  Driver ✓`);
    return;
  }

  // STEP 1B — Admin sends just ticket ref to start selection
  const refOnly = text.match(/^(SDB-[A-Z0-9]+)$/i);
  if (refOnly) {
    const ref = refOnly[1].toUpperCase();
    const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found.`); return; }
    pendingAssign[from] = { ref, date: 'TBD', time: 'TBD' };
    await sendWA(from,
`📋 *Ticket:* ${ref}
🐕 ${ticket.data.incidentLabel}
👤 ${ticket.data.name}
📍 ${ticket.data.location}

*Driver निवडा / Select driver:*
1️⃣  Somnath Catcher
2️⃣  Mukesh Catcher

_Reply with 1 or 2_`);
    return;
  }

  // Default — show help with open tickets list
  const openTickets = Object.values(tickets).filter(t => t.status === 'Open');
  let msg = `📋 *Admin Panel — VVCMC Bot*\n\n`;

  if (openTickets.length > 0) {
    msg += `*Open Tickets:*\n━━━━━━━━━━\n`;
    openTickets.forEach((t, i) => {
      msg += `${i+1}. *${t.ref}*\n   🐕 ${t.data.incidentLabel}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,40)}\n   🕐 ${t.data.incidentTime}\n\n`;
    });
    msg += `_Ticket ref पाठवा to assign (e.g. ${openTickets[0].ref})_\n\n`;
  } else {
    msg += `✅ No open tickets right now!\n\n`;
  }

  msg += `*Manual assign:*\nASSIGN SDB-XXX DRIVER:1 DATE:16-Mar TIME:10:00AM\n\n*Drivers:*\n${DRIVERS.map(d=>`${d.id}. ${d.name}  +${d.phone}`).join('\n')}`;
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
    if (!mine.length) { await sendWA(from, `📋 तुमच्यासाठी सध्या कोणतेही ticket नाही.`); return; }
    let list = `📋 *तुमचे Open Tickets:*\n━━━━━━━━━\n`;
    mine.forEach((t, i) => {
      list += `${i+1}. ${t.ref}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,50)}\n   🐕 ${t.data.incidentLabel}\n   🕐 ${t.data.incidentTime}\n\n`;
    });
    list += `_नंबर टाइप करा (e.g. 1)_`;
    s.step = 'driver_select'; s.openTickets = mine;
    await sendWA(from, list); return;
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

    if (ticket.atRecordId) await atClose(ticket.atRecordId, loc, driver.name, mUrl);
    ticket.status = 'Closed';

    // Citizen closing message — language aware
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार सोडवली गेली आहे!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *अधिकारी:* ${driver.name}\n📍 *ठिकाण:* ${loc}\n🕐 *बंद:* ${closedAt}\n\nआमच्या टीमने समस्या सोडवली.\n_VVCMC सेवेत विश्वास ठेवल्याबद्दल धन्यवाद! 🙏_\n\nनवीन तक्रारीसाठी *Hi* पाठवा.`
      : `✅ *Your complaint has been resolved!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *Officer:* ${driver.name}\n📍 *Resolved at:* ${loc}\n🕐 *Closed at:* ${closedAt}\n\nOur team has addressed the problem.\n_Thank you for reporting to VVCMC! 🙏_\n\nSend *Hi* to file a new complaint.`;

    await sendWA(ticket.citizenPhone, citizenClose);
    if (mId) await forwardMedia(ticket.citizenPhone, mId, mType,
      ticket.lang === 'mr' ? '📸 काम पूर्ण झाल्याचा पुरावा' : '📸 Proof of work completed');

    // GS closing alert
    await sendWA(GS_NUMBER,
`✅ *Case Closed — VVCMC Bot*
🎫 ${ref}
🐕 ${ticket.data.incidentLabel}
👷 Closed by: ${driver.name}
📍 ${loc}
🕐 ${closedAt}
👤 ${ticket.data.name} (+${ticket.data.phone})`);
    if (mId) await forwardMedia(GS_NUMBER, mId, mType, `Closing proof — ${ref}`);

    // Driver confirmation
    await sendWA(from,
`✅ *Case बंद केले!*
🎫 ${ref}
✓ तक्रारदाराला कळवले
✓ Photo sent to citizen
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
    const mUrl  = await getMediaUrl(mId);
    s.data.mediaUrl = mUrl; s.data.mediaId = mId; s.data.mediaType = mType;

    const ref = genRef();
    const t   = { ref, status: 'Open', lang: s.lang, citizenPhone: from, data: { ...s.data }, atRecordId: null };
    tickets[ref] = t;
    const atId = await atCreate(ref, s.data);
    if (atId) t.atRecordId = atId;
    s.step = 'done'; s.ref = ref;

    await sendWA(from, s.lang === 'mr'
      ? `✅ *तुमची तक्रार नोंदवली गेली!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *तक्रार:* ${s.data.incidentLabel}\n📍 *ठिकाण:* ${s.data.location}\n🕐 *वेळ:* ${s.data.incidentTime}\n\nआमचा अधिकारी लवकरच संपर्क करेल.\n*धन्यवाद! VVCMC 🙏*`
      : `✅ *Your complaint has been registered!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *Issue:* ${s.data.incidentLabel}\n📍 *Location:* ${s.data.location}\n🕐 *Time:* ${s.data.incidentTime}\n\nOur officer will contact you shortly.\n*Thank you! VVCMC 🙏*`);

    const adminAlert = s.lang === 'mr'
      ? `🚨 *नवीन तक्रार — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *तक्रार:* ${s.data.incidentLabel}\n👤 *नाव:* ${s.data.name}\n📱 *Phone:* +${from}\n📍 *ठिकाण:* ${s.data.location}\n📞 *Alt:* ${s.data.altContact || 'N/A'}\n🕐 *वेळ:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Reply with ticket ref to assign:_\n*${ref}*`
      : `🚨 *New Complaint — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *Issue:* ${s.data.incidentLabel}\n👤 *Name:* ${s.data.name}\n📱 *Phone:* +${from}\n📍 *Location:* ${s.data.location}\n📞 *Alt Contact:* ${s.data.altContact || 'N/A'}\n🕐 *Time:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Reply with ticket ref to assign:_\n*${ref}*`;

    await sendWA(GS_NUMBER, adminAlert);
    if (mId) await forwardMedia(GS_NUMBER, mId, mType, s.lang === 'mr' ? `📸 पुरावा — ${ref}` : `📸 Evidence — ${ref}`);
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

/* ── HTTP SERVER ── */
const PORT = process.env.PORT || 3000;
require('http').createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) { res.writeHead(200); res.end(challenge); return; }
    if (url.pathname === '/data-deletion') {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Data Deletion - VVCMC Stray Dog Bot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}h1{color:#1a6b3a}h2{color:#333;margin-top:30px}.box{background:#f5f5f5;border-radius:8px;padding:20px;margin:20px 0}</style></head><body><h1>User Data Deletion Request</h1><p>Last updated: March 17, 2026</p><p>VVCMC Stray Dog Complaint Bot respects your privacy and your right to have your data deleted.</p><h2>What Data We Store</h2><ul><li>Your WhatsApp phone number</li><li>Your name</li><li>Complaint location</li><li>Photos/videos submitted with complaints</li><li>Date and time of complaints</li></ul><h2>How to Request Data Deletion</h2><div class="box"><p>To request deletion of your data, please contact us:</p><ul><li>Email: vvcmc@vasaivirar.gov.in</li><li>Include your WhatsApp number and request for data deletion</li><li>We will process your request within 30 days</li></ul></div><h2>What Happens After Deletion</h2><ul><li>All your personal information will be permanently deleted</li><li>Complaint records linked to your number will be anonymized</li><li>You will receive a confirmation once deletion is complete</li></ul><h2>Contact</h2><p>Vasai Virar City Municipal Corporation<br>Website: https://straydogbot.onrender.com<br>Email: vvcmc@vasaivirar.gov.in</p></body></html>`;
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
    }
    if (url.pathname === '/data-deletion') {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Data Deletion - VVCMC Stray Dog Bot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}h1{color:#1a6b3a}h2{color:#333;margin-top:30px}.box{background:#f5f5f5;padding:20px;border-radius:8px;margin:20px 0}</style></head><body><h1>Data Deletion Request</h1><p>Last updated: March 17, 2026</p><p>If you would like to request deletion of your personal data collected by the <strong>VVCMC Stray Dog Complaint Bot</strong>, please follow the steps below.</p><h2>What Data We Store</h2><ul><li>Your WhatsApp phone number</li><li>Your name</li><li>Complaint location</li><li>Photos/videos submitted with complaints</li><li>Date and time of complaints</li></ul><h2>How to Request Data Deletion</h2><div class="box"><p>Send an email to <strong>vvcmc@vasaivirar.gov.in</strong> with:</p><ul><li>Subject: <strong>Data Deletion Request - VVCMC Bot</strong></li><li>Your WhatsApp phone number</li><li>Your name</li></ul><p>We will process your request within <strong>30 days</strong> and confirm deletion via email.</p></div><h2>Automatic Data Deletion</h2><p>Complaint records older than 2 years are automatically deleted from our system.</p><h2>Contact Us</h2><p>For any queries regarding data deletion:</p><ul><li>Email: vvcmc@vasaivirar.gov.in</li><li>Website: <a href="https://straydogbot.onrender.com">https://straydogbot.onrender.com</a></li></ul><p><em>Vasai Virar City Municipal Corporation</em></p></body></html>`;
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
    }
    if (url.pathname === '/delete') {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Data Deletion - VVCMC Stray Dog Bot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}h1{color:#1a6b3a}h2{color:#333;margin-top:30px}.box{background:#f5f5f5;padding:20px;border-radius:8px;margin:20px 0}</style></head><body><h1>User Data Deletion Request</h1><p>Last updated: March 17, 2026</p><p>As a user of the <strong>VVCMC Stray Dog Complaint Bot</strong>, you have the right to request deletion of your personal data.</p><h2>What Data We Store</h2><ul><li>Your WhatsApp phone number</li><li>Your name</li><li>Complaint location</li><li>Photos/videos submitted with complaints</li><li>Complaint history</li></ul><h2>How to Request Data Deletion</h2><div class="box"><p>To request deletion of your data, please contact us via:</p><ul><li><strong>Email:</strong> vvcmc@vasaivirar.gov.in</li><li><strong>WhatsApp:</strong> Send "DELETE MY DATA" to our bot number</li><li><strong>Visit:</strong> VVCMC Office, Vasai Virar, Maharashtra</li></ul><p>Please include your WhatsApp number in your request. We will process your request within <strong>30 days</strong>.</p></div><h2>What Happens After Deletion</h2><ul><li>All your personal information will be permanently deleted</li><li>Complaint records will be anonymized</li><li>You will receive a confirmation once deletion is complete</li></ul><h2>Contact Us</h2><p>Email: vvcmc@vasaivirar.gov.in</p><p>Website: <a href="https://straydogbot.onrender.com">https://straydogbot.onrender.com</a></p></body></html>`;
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
    }
    if (url.pathname === '/deletion') {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Data Deletion - VVCMC Stray Dog Bot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}h1{color:#c0392b}h2{color:#333;margin-top:30px}.box{background:#f9f9f9;border:1px solid #ddd;padding:20px;border-radius:8px;margin:20px 0}</style></head><body><h1>Data Deletion Request</h1><p>Last updated: March 17, 2026</p><p>As a user of the <strong>VVCMC Stray Dog Complaint Bot</strong>, you have the right to request deletion of your personal data.</p><h2>What Data We Store</h2><ul><li>Your WhatsApp phone number</li><li>Your name</li><li>Complaint location</li><li>Photos/videos submitted with complaints</li><li>Complaint history and status</li></ul><h2>How to Request Data Deletion</h2><div class="box"><p>To request deletion of your data, please contact us using one of the following methods:</p><ul><li><strong>Email:</strong> vvcmc@vasaivirar.gov.in</li><li><strong>WhatsApp:</strong> Send "DELETE MY DATA" to our bot number</li><li><strong>In person:</strong> Visit VVCMC office, Vasai Virar, Maharashtra</li></ul><p>Please include your WhatsApp phone number in your request so we can identify your records.</p></div><h2>What Happens After Your Request</h2><ul><li>We will process your request within 30 days</li><li>All your personal data will be permanently deleted from our systems</li><li>You will receive a confirmation once deletion is complete</li><li>Note: Some data may be retained for legal/regulatory compliance</li></ul><h2>Contact Us</h2><p>VVCMC - Vasai Virar City Municipal Corporation<br>Website: <a href="https://straydogbot.onrender.com">https://straydogbot.onrender.com</a><br>Email: vvcmc@vasaivirar.gov.in</p><p><em>Effective: March 17, 2026</em></p></body></html>`;
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
    }
    if (url.pathname === '/privacy') {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Privacy Policy - VVCMC Stray Dog Bot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}h1{color:#1a6b3a}h2{color:#333;margin-top:30px}</style></head><body><h1>Privacy Policy</h1><p>Last updated: March 17, 2026</p><p>This Privacy Policy applies to the <strong>VVCMC Stray Dog Complaint Bot</strong> operated by Vasai Virar City Municipal Corporation (VVCMC).</p><h2>Information We Collect</h2><ul><li>Your WhatsApp phone number</li><li>Your name</li><li>Incident location</li><li>Alternate contact number (optional)</li><li>Photos or videos of the incident</li><li>Date and time of complaint</li></ul><h2>How We Use Your Information</h2><ul><li>Register and track your complaint</li><li>Assign municipal officers</li><li>Notify you about complaint status</li></ul><h2>Data Storage</h2><p>Complaint data is stored securely and retained as required by municipal regulations.</p><h2>Data Sharing</h2><p>We do not sell your data. We share only with assigned municipal officers or as required by law.</p><h2>Third Party Services</h2><p>WhatsApp Business API (Meta) and Airtable are used for messaging and data storage.</p><h2>Contact Us</h2><p>Email: vvcmc@vasaivirar.gov.in | Website: https://straydogbot.onrender.com</p><p><em>Effective: March 17, 2026</em></p></body></html>`;
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); return;
    }
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('VVCMC Stray Dog Bot is running! OK'); return;
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
        if      (from === GS_NUMBER) await handleAdmin(from, (msgObj.text?.body || '').trim());
        else if (driver)             await handleDriver(from, msgObj, driver);
        else                         await handleCitizen(from, msgObj);
      } catch (err) { console.error('[handler error]', err.message); }
    });
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('VVCMC Stray Dog Bot is running! OK');
}).listen(PORT, () => console.log(`✅ VVCMC Bot running on port ${PORT}`));
