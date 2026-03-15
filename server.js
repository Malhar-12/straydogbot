'use strict';

const ADMIN_NUMBER = '917219373694';
const DRIVERS = [{ id: 1, name: 'Ravi Patil', phone: '919028331108' }];
const sessions = {};
const tickets  = {};

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
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
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
    const data = await res.json();
    return data.url || '';
  } catch { return ''; }
}

/* ── AIRTABLE ── */
const AT_URL = () => `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Complaints`;
const AT_HDR = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` });

async function atCreate(ref, data) {
  try {
    const res = await fetch(AT_URL(), {
      method: 'POST', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fldhXsOBPVr9cU3Ag: ref,
        fldQQfiLwONajehi3: data.incidentLabel || '',
        fldiQKewmVP94vd9b: data.name || '',
        fldKoc6nVRgfykSdv: data.phone || '',
        fldQ7EDVzXAWLfkiW: data.location || '',
        fldP4q0jO7PkNwn1q: data.altContact || '',
        fldsPeUvD4IjDhqKb: data.mediaUrl || '',
        fld3Sp2Fm5igA1nJN: 'Open',
      }}),
    });
    const json = await res.json();
    if (!res.ok) { console.error('[atCreate error]', JSON.stringify(json)); return null; }
    return json.id;
  } catch (e) { console.error('[atCreate exception]', e.message); return null; }
}

async function atClose(recordId, closingLocation, driverName, closingMediaUrl) {
  try {
    await fetch(`${AT_URL()}/${recordId}`, {
      method: 'PATCH', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fld3Sp2Fm5igA1nJN: 'Closed',
        fldYTCvu9DMb1XyTj: closingLocation || '',
        fld90MrPHsvnAvqtB: driverName || '',
        fldsPeUvD4IjDhqKb: closingMediaUrl || '',
      }}),
    });
  } catch (e) { console.error('[atClose exception]', e.message); }
}

function genRef() { return `SDB-${Date.now().toString(36).toUpperCase()}`; }

/* ── UPDATED INCIDENT TYPES (CLIENT REQUEST) ── */
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
  const m = text.match(/ASSIGN\s+(SDB-[A-Z0-9]+)\s+DRIVER:(\d+)\s+DATE:([^\s]+)\s+TIME:([^\s]+)/i);
  if (!m) {
    await sendWA(from,
`📋 *Admin Commands*

Assign a driver:
ASSIGN SDB-XXX DRIVER:1 DATE:25-Jan TIME:10:00AM

Drivers:
${DRIVERS.map(d => `${d.id}. ${d.name}  +${d.phone}`).join('\n')}`);
    return;
  }
  const [, ref, driverId, date, time] = m;
  const ticket = tickets[ref];
  if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found in memory.`); return; }
  const driver = DRIVERS.find(d => d.id === parseInt(driverId));
  if (!driver) { await sendWA(from, `⚠️ Driver ${driverId} not found.`); return; }

  ticket.status = 'Assigned'; ticket.driverName = driver.name;
  ticket.visitDate = date; ticket.visitTime = time;

  await sendWA(driver.phone,
`📋 *तुम्हाला काम सोपवले गेले आहे / Ticket Assigned*
🎫 Ref: ${ref}
🐕 *तक्रार:* ${ticket.data.incidentLabel}
👤 *तक्रारदार:* ${ticket.data.name}
📍 *ठिकाण:* ${ticket.data.location}
📞 *संपर्क:* +${ticket.data.phone}
📅 *भेटीची वेळ:* ${date} at ${time}

_काम झाल्यावर *ticket* टाइप करा._`);

  const citizenMsg = ticket.lang === 'mr'
    ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 Ticket: ${ref}\n\n👤 *अधिकारी:* ${driver.name}\n📅 *भेटीची तारीख:* ${date}\n⏰ *वेळ:* ${time}\n\n_ते येण्यापूर्वी फोन करतील._`
    : `👷 *Your complaint has been assigned to an officer!*\n🎫 Ticket: ${ref}\n\n👤 *Officer:* ${driver.name}\n📅 *Visit Date:* ${date}\n⏰ *Time:* ${time}\n\n_He will call before arriving._`;
  await sendWA(ticket.citizenPhone, citizenMsg);
  await sendWA(from, `✅ ${ref} → *${driver.name}* | ${date} at ${time}\nCitizen ✓ Driver ✓`);
}

/* ── DRIVER HANDLER ── */
async function handleDriver(from, msgObj, driver) {
  const text = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin = msgObj.type === 'location';
  const s = getSession(from);

  if (/^ticket$/i.test(text)) {
    const mine = Object.values(tickets).filter(t => t.status === 'Assigned' && t.driverName === driver.name);
    if (!mine.length) { await sendWA(from, `📋 तुमच्यासाठी सध्या कोणतेही ticket नाही.\n(No open tickets assigned to you right now.)`); return; }
    let list = `📋 *तुमचे Open Tickets / Your Open Tickets:*\n━━━━━━━━━\n`;
    mine.forEach((t, i) => { list += `${i+1}. ${t.ref}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,55)}\n   🐕 ${t.data.incidentLabel}\n\n`; });
    list += `_नंबर टाइप करा / Reply with number to select (e.g. 1)_`;
    s.step = 'driver_select'; s.openTickets = mine;
    await sendWA(from, list); return;
  }

  if (s.step === 'driver_select') {
    const num = parseInt(text);
    const selected = (!isNaN(num) && s.openTickets?.[num-1]) ? s.openTickets[num-1] : tickets[text.toUpperCase()];
    if (!selected) { await sendWA(from, `⚠️ सापडले नाही. *ticket* टाइप करा.\n(Not found. Type *ticket* to see list.)`); return; }
    s.step = 'driver_location'; s.activeTicket = selected.ref;
    await sendWA(from,
`✅ *Ticket निवडले / Selected:* ${selected.ref}
👤 ${selected.data.name}
📍 ${selected.data.location}
🐕 ${selected.data.incidentLabel}

Case बंद करण्यासाठी / To close this case:
1️⃣ तुमचे *location* पाठवा (WhatsApp pin किंवा Google Maps link)
2️⃣ काम झाल्याचा *फोटो किंवा व्हिडिओ* पाठवा *(अनिवार्य)*`);
    return;
  }

  if (s.step === 'driver_location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text);
    if (!loc) { await sendWA(from, `⚠️ WhatsApp location pin किंवा Google Maps link पाठवा.`); return; }
    s.closingLocation = loc; s.step = 'driver_photo';
    await sendWA(from, `✅ Location मिळाले!\n\nआता काम झाल्याचा *फोटो किंवा व्हिडिओ* पाठवा.`);
    return;
  }

  if (s.step === 'driver_photo') {
    if (!hasMedia) { await sendWA(from, `⚠️ Case बंद करण्यासाठी फोटो किंवा व्हिडिओ पाठवणे अनिवार्य आहे.`); return; }
    const ref = s.activeTicket; const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket सापडले नाही.`); return; }
    const mType = msgObj.image ? 'image' : 'video';
    const mId = msgObj.image?.id || msgObj.video?.id;
    const mUrl = await getMediaUrl(mId);
    const loc = s.closingLocation;

    if (ticket.atRecordId) await atClose(ticket.atRecordId, loc, driver.name, mUrl);
    ticket.status = 'Closed';

    /* ── CITIZEN closing message (CLIENT REQUEST — problem solved msg) ── */
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार सोडवली गेली आहे!*

🎫 Ticket: ${ref}
🐕 तक्रार: ${ticket.data.incidentLabel}
👷 *अधिकारी:* ${driver.name}
📍 *ठिकाण:* ${loc}

आमच्या टीमने तुमच्या परिसरातील समस्या सोडवली आहे.
_VVCMC सेवेत विश्वास ठेवल्याबद्दल धन्यवाद! 🙏_

नवीन तक्रारीसाठी *Hi* पाठवा.`
      : `✅ *Your complaint has been resolved!*

🎫 Ticket: ${ref}
🐕 Issue: ${ticket.data.incidentLabel}
👷 *Officer:* ${driver.name}
📍 *Resolved at:* ${loc}

Our team has addressed the problem in your area.
_Thank you for reporting to VVCMC! 🙏_

Send *Hi* to file a new complaint.`;

    await sendWA(ticket.citizenPhone, citizenClose);
    if (mId) await forwardMedia(ticket.citizenPhone, mId, mType, '📸 काम पूर्ण झाल्याचा पुरावा / Proof of work done');

    await sendWA(ADMIN_NUMBER,
`✅ *Case Closed — VVCMC Bot*
🎫 ${ref}
🐕 ${ticket.data.incidentLabel}
👷 Closed by: ${driver.name}
📍 Location: ${loc}
👤 Complainant: ${ticket.data.name}`);
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `Closing proof — ${ref}`);

    await sendWA(from,
`✅ *Case यशस्वीरित्या बंद केले! / Case closed successfully!*
🎫 ${ref}

✓ तक्रारदाराला कळवले / Citizen notified
✓ फोटो तक्रारदाराला पाठवला / Photo sent to citizen
✓ Admin ला कळवले
✓ Airtable updated → Closed

_पुढील ticket साठी *ticket* टाइप करा._`);

    delete sessions[ticket.citizenPhone];
    s.step = 'driver_idle'; s.activeTicket = null; s.closingLocation = null;
    return;
  }

  await sendWA(from, `👋 नमस्कार ${driver.name}!\nतुमचे assigned tickets पाहण्यासाठी *ticket* टाइप करा.`);
}

/* ── CITIZEN HANDLER ── */
async function handleCitizen(from, msgObj) {
  const text = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin = msgObj.type === 'location';
  const s = getSession(from);

  if (s.step === 'greet') {
    if (!/^(hi|hello|hey|hii|helo|start|नमस्कार|नमस्ते|हाय)$/i.test(text)) {
      await sendWA(from, `👋 तक्रार नोंदवण्यासाठी *Hi* पाठवा.\n\n(Send *Hi* to register a stray dog complaint.)`); return;
    }
    s.step = 'lang';
    await sendWA(from,
`🙏 *नमस्कार! / Hello!*
VVCMC भटके श्वान तक्रार बॉटमध्ये आपले स्वागत आहे!
(Welcome to VVCMC Stray Dog Complaint Bot!)

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
      await sendWA(from, s.lang === 'mr' ? `⚠️ कृपया 1 ते 5 मधील एक क्रमांक पाठवा.` : `⚠️ Please reply with a number from 1 to 5.`); return;
    }
    s.data.incidentLabel = INCIDENT[s.lang][text];
    s.step = 'name';
    await sendWA(from, s.lang === 'mr' ? `तुमचे *पूर्ण नाव* सांगा:` : `Please share your *full name*:`);
    return;
  }

  if (s.step === 'name') {
    if (text.length < 2) { await sendWA(from, `⚠️ कृपया पूर्ण नाव टाका.`); return; }
    s.data.name = text; s.data.phone = from;
    s.step = 'location';
    await sendWA(from, s.lang === 'mr'
      ? `धन्यवाद ${text}! 🙏\n\n📍 घटना *कुठे घडली*?\n• पत्ता टाइप करा\n• Google Maps link पाठवा\n• WhatsApp 📎 Location Pin पाठवा`
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
      ? `📸 घटनेचा *फोटो किंवा व्हिडिओ* पाठवा.\n⚠️ *हे अनिवार्य आहे — फोटोशिवाय तक्रार नोंदवली जाणार नाही.*`
      : `📸 Send a *photo or video* of the incident.\n⚠️ *This is mandatory — complaint cannot be registered without it.*`);
    return;
  }

  if (s.step === 'photo') {
    if (!hasMedia) {
      await sendWA(from, s.lang === 'mr'
        ? `⚠️ फोटो किंवा व्हिडिओ पाठवणे अनिवार्य आहे. कृपया पाठवा.`
        : `⚠️ Photo or video is mandatory. Please send one to register your complaint.`); return;
    }
    const mType = msgObj.image ? 'image' : 'video';
    const mId = msgObj.image?.id || msgObj.video?.id;
    const mUrl = await getMediaUrl(mId);
    s.data.mediaUrl = mUrl; s.data.mediaId = mId; s.data.mediaType = mType;

    const ref = genRef();
    const t = { ref, status: 'Open', lang: s.lang, citizenPhone: from, data: { ...s.data }, atRecordId: null };
    tickets[ref] = t;
    const atId = await atCreate(ref, s.data);
    if (atId) t.atRecordId = atId;
    s.step = 'done'; s.ref = ref;

    await sendWA(from, s.lang === 'mr'
      ? `✅ *तुमची तक्रार यशस्वीरित्या नोंदवली गेली!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *तक्रार:* ${s.data.incidentLabel}\n📍 *ठिकाण:* ${s.data.location}\n\nआमचा अधिकारी लवकरच संपर्क करेल व समस्या सोडवेल.\nसमस्या सोडवल्यावर तुम्हाला आपोआप सूचना मिळेल.\n\n*धन्यवाद! VVCMC 🙏*`
      : `✅ *Your complaint has been registered successfully!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *Issue:* ${s.data.incidentLabel}\n📍 *Location:* ${s.data.location}\n\nOur officer will contact you shortly and resolve the issue.\nYou will be automatically notified once resolved.\n\n*Thank you! VVCMC 🙏*`);

    await sendWA(ADMIN_NUMBER,
`🚨 *नवीन तक्रार — VVCMC Bot*

🎫 *Ref:* ${ref}
🐕 *तक्रार:* ${s.data.incidentLabel}
👤 *नाव:* ${s.data.name}
📱 *Phone:* +${from}
📍 *ठिकाण:* ${s.data.location}
📞 *Alt Contact:* ${s.data.altContact || 'N/A'}
━━━━━━━━━━━━━━━
_Driver assign करा:_
ASSIGN ${ref} DRIVER:1 DATE:15-Mar TIME:10:00AM

Drivers:
${DRIVERS.map(d=>`  ${d.id}. ${d.name}`).join('\n')}`);
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `📸 पुरावा — ${ref}`);

    for (const drv of DRIVERS) {
      await sendWA(drv.phone,
`📢 *नवीन तक्रार आली आहे*
🎫 ${ref}
🐕 ${s.data.incidentLabel}
📍 ${s.data.location}
👤 ${s.data.name}
_Admin लवकरच assign करेल._`);
    }
    return;
  }

  if (s.step === 'done') {
    if (/^(new|नवीन|hi|hello|start|हाय)$/i.test(text)) {
      delete sessions[from];
      await sendWA(from, s.lang === 'mr' ? `नवीन तक्रारीसाठी *Hi* पाठवा. 🙏` : `Send *Hi* to file a new complaint. 🙏`); return;
    }
    await sendWA(from, s.lang === 'mr'
      ? `तुमची तक्रार नोंदवली आहे. 🎫 \`${s.ref}\`\nसमस्या सोडवल्यावर तुम्हाला आपोआप सूचना मिळेल.\nनवीन तक्रारीसाठी *"नवीन"* किंवा *"Hi"* टाइप करा.`
      : `Your complaint is registered. 🎫 \`${s.ref}\`\nYou will be notified once resolved.\nType *"new"* or *"Hi"* to file another complaint.`);
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
    res.writeHead(200); res.end('✅ VVCMC Stray Dog Bot is running! 🐕'); return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      try {
        const data = JSON.parse(body);
        const msgObj = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!msgObj) return;
        const from = msgObj.from;
        const driver = DRIVERS.find(d => d.phone === from);
        if      (from === ADMIN_NUMBER) await handleAdmin(from, (msgObj.text?.body || '').trim());
        else if (driver)                await handleDriver(from, msgObj, driver);
        else                            await handleCitizen(from, msgObj);
      } catch (err) { console.error('[handler error]', err.message); }
    });
    return;
  }
  res.writeHead(405); res.end('Method Not Allowed');
}).listen(PORT, () => console.log(`✅ VVCMC Bot running on port ${PORT}`));
