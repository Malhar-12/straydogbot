'use strict';
const http = require('http');

const ADMIN_NUMBER = '917219373694';
const DRIVERS = [{ id: 1, name: 'Ravi Patil', phone: '919028331108' }];
const sessions = {};
const tickets  = {};

function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
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
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
    const data = await res.json();
    return data.url || '';
  } catch { return ''; }
}

const AT_URL = () => `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Complaints`;
const AT_HDR = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` });

async function atCreate(ref, data) {
  try {
    const res = await fetch(AT_URL(), {
      method: 'POST', headers: AT_HDR(),
      body: JSON.stringify({ fields: {
        fldhXsOBPVr9cU3Ag: ref, fldQQfiLwONajehi3: data.incidentLabel || '',
        fldiQKewmVP94vd9b: data.name || '', fldKoc6nVRgfykSdv: data.phone || '',
        fldQ7EDVzXAWLfkiW: data.location || '', fldP4q0jO7PkNwn1q: data.altContact || '',
        fldsPeUvD4IjDhqKb: data.mediaUrl || '', fld3Sp2Fm5igA1nJN: 'Open',
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
        fld3Sp2Fm5igA1nJN: 'Closed', fldYTCvu9DMb1XyTj: closingLocation || '',
        fld90MrPHsvnAvqtB: driverName || '', fldsPeUvD4IjDhqKb: closingMediaUrl || '',
      }}),
    });
  } catch (e) { console.error('[atClose exception]', e.message); }
}

function genRef() { return `SDB-${Date.now().toString(36).toUpperCase()}`; }
const INCIDENT = {
  mr: { '1':'चावण्याची घटना','2':'आक्रमक टोळी','3':'जखमी कुत्रा','4':'सामान्य त्रास' },
  en: { '1':'Bite Incident','2':'Aggressive Pack','3':'Injured Dog','4':'General Nuisance' },
};
function parseLocation(text) {
  if (/maps\.google|goo\.gl|maps\.app|google\.com\/maps/i.test(text)) return text;
  if (text.length > 3) return text;
  return null;
}

async function handleAdmin(from, text) {
  const m = text.match(/ASSIGN\s+(SDB-[A-Z0-9]+)\s+DRIVER:(\d+)\s+DATE:([^\s]+)\s+TIME:([^\s]+)/i);
  if (!m) {
    await sendWA(from, `📋 *Admin Commands*\n\nAssign a driver:\nASSIGN SDB-XXX DRIVER:1 DATE:25-Jan TIME:10:00AM\n\nDrivers:\n${DRIVERS.map(d=>`${d.id}. ${d.name}  +${d.phone}`).join('\n')}`);
    return;
  }
  const [, ref, driverId, date, time] = m;
  const ticket = tickets[ref];
  if (!ticket) { await sendWA(from, `⚠️ Ticket \`${ref}\` not found.`); return; }
  const driver = DRIVERS.find(d => d.id === parseInt(driverId));
  if (!driver) { await sendWA(from, `⚠️ Driver ${driverId} not found.`); return; }
  ticket.status = 'Assigned'; ticket.driverName = driver.name; ticket.visitDate = date; ticket.visitTime = time;
  await sendWA(driver.phone, `📋 *Ticket Assigned to You*\n🎫 Ref: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👤 ${ticket.data.name}\n📍 ${ticket.data.location}\n📞 +${ticket.data.phone}\n📅 ${date} at ${time}\n\n_Type *ticket* to see your tickets._`);
  const citizenMsg = ticket.lang === 'mr'
    ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 ${ref}\n👤 *अधिकारी:* ${driver.name}\n📅 ${date} ⏰ ${time}`
    : `👷 *Your complaint has been assigned!*\n🎫 ${ref}\n👤 *Officer:* ${driver.name}\n📅 ${date} ⏰ ${time}`;
  await sendWA(ticket.citizenPhone, citizenMsg);
  await sendWA(from, `✅ ${ref} → *${driver.name}* | ${date} at ${time}`);
}

async function handleDriver(from, msgObj, driver) {
  const text = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin = msgObj.type === 'location';
  const s = getSession(from);

  if (/^ticket$/i.test(text)) {
    const mine = Object.values(tickets).filter(t => t.status === 'Assigned' && t.driverName === driver.name);
    if (!mine.length) { await sendWA(from, `📋 No open tickets assigned to you.`); return; }
    let list = `📋 *Your Open Tickets:*\n━━━━━━━━━\n`;
    mine.forEach((t, i) => { list += `${i+1}. ${t.ref}\n   👤 ${t.data.name}\n   📍 ${t.data.location.slice(0,55)}\n\n`; });
    list += `_Reply with the number to select._`;
    s.step = 'driver_select'; s.openTickets = mine;
    await sendWA(from, list); return;
  }
  if (s.step === 'driver_select') {
    const num = parseInt(text);
    const selected = (!isNaN(num) && s.openTickets?.[num-1]) ? s.openTickets[num-1] : tickets[text.toUpperCase()];
    if (!selected) { await sendWA(from, `⚠️ Not found. Type *ticket* to see list.`); return; }
    s.step = 'driver_location'; s.activeTicket = selected.ref;
    await sendWA(from, `✅ *Ticket:* ${selected.ref}\n👤 ${selected.data.name}\n📍 ${selected.data.location}\n\n1️⃣ Send your *location*\n2️⃣ Send *closing photo*`);
    return;
  }
  if (s.step === 'driver_location') {
    const loc = (isPin && msgObj.location) ? `Pin: (${msgObj.location.latitude}, ${msgObj.location.longitude})` : parseLocation(text);
    if (!loc) { await sendWA(from, `⚠️ Send your location pin or Google Maps link.`); return; }
    s.closingLocation = loc; s.step = 'driver_photo';
    await sendWA(from, `✅ Location received! Now send the *closing photo/video*.`);
    return;
  }
  if (s.step === 'driver_photo') {
    if (!hasMedia) { await sendWA(from, `⚠️ Please send a photo or video to close the case.`); return; }
    const ref = s.activeTicket; const ticket = tickets[ref];
    if (!ticket) { await sendWA(from, `⚠️ Ticket not found.`); return; }
    const mType = msgObj.image ? 'image' : 'video';
    const mId = msgObj.image?.id || msgObj.video?.id;
    const mUrl = await getMediaUrl(mId);
    const loc = s.closingLocation;
    if (ticket.atRecordId) await atClose(ticket.atRecordId, loc, driver.name, mUrl);
    ticket.status = 'Closed';
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार निकाली काढली गेली!*\n🎫 ${ref}\n👷 ${driver.name}\n📍 ${loc}\nधन्यवाद! 🙏`
      : `✅ *Your complaint has been resolved!*\n🎫 ${ref}\n👷 ${driver.name}\n📍 ${loc}\nThank you! 🙏`;
    await sendWA(ticket.citizenPhone, citizenClose);
    if (mId) await forwardMedia(ticket.citizenPhone, mId, mType, 'Closing proof from officer');
    await sendWA(ADMIN_NUMBER, `✅ *Case Closed*\n🎫 ${ref}\n👷 ${driver.name}\n📍 ${loc}`);
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `Closing proof — ${ref}`);
    await sendWA(from, `✅ Case closed! 🎫 ${ref}\nCitizen ✓ Admin ✓ Airtable ✓`);
    delete sessions[ticket.citizenPhone];
    s.step = 'driver_idle'; s.activeTicket = null; s.closingLocation = null;
    return;
  }
  await sendWA(from, `👋 Hello ${driver.name}! Type *ticket* to see your tickets.`);
}

async function handleCitizen(from, msgObj) {
  const text = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin = msgObj.type === 'location';
  const s = getSession(from);

  if (s.step === 'greet') {
    if (!/^(hi|hello|hey|hii|helo|start|नमस्कार|नमस्ते|हाय)$/i.test(text)) {
      await sendWA(from, `👋 Send *Hi* to register a stray dog complaint.\n\nतक्रारीसाठी *Hi* पाठवा.`); return;
    }
    s.step = 'lang';
    await sendWA(from, `🙏 *नमस्कार! / Hello!*\n\nभाषा निवडा / Choose language:\n1️⃣  मराठी\n2️⃣  English`);
    return;
  }
  if (s.step === 'lang') {
    if      (text === '1' || /marathi|मराठी/i.test(text)) s.lang = 'mr';
    else if (text === '2' || /english/i.test(text))        s.lang = 'en';
    else { await sendWA(from, `⚠️ Reply *1* for मराठी or *2* for English.`); return; }
    s.step = 'incident';
    await sendWA(from, s.lang === 'mr'
      ? `🐕 *घटनेचा प्रकार निवडा:*\n\n1️⃣  चावण्याची घटना\n2️⃣  आक्रमक टोळी\n3️⃣  जखमी कुत्रा\n4️⃣  सामान्य त्रास`
      : `🐕 *Select incident type:*\n\n1️⃣  Bite Incident\n2️⃣  Aggressive Pack\n3️⃣  Injured Dog\n4️⃣  General Nuisance`);
    return;
  }
  if (s.step === 'incident') {
    if (!['1','2','3','4'].includes(text)) { await sendWA(from, `⚠️ Reply 1, 2, 3, or 4.`); return; }
    s.data.incidentLabel = INCIDENT[s.lang][text]; s.step = 'name';
    await sendWA(from, s.lang === 'mr' ? `तुमचे *पूर्ण नाव* सांगा:` : `Please share your *full name*:`);
    return;
  }
  if (s.step === 'name') {
    if (text.length < 2) { await sendWA(from, `⚠️ Enter your full name.`); return; }
    s.data.name = text; s.data.phone = from; s.step = 'location';
    await sendWA(from, s.lang === 'mr'
      ? `धन्यवाद ${text}!\n\n📍 घटना *कुठे घडली*?\n• पत्ता टाइप करा\n• Google Maps link\n• 📎 Location Pin`
      : `Thank you ${text}!\n\n📍 *Where did it happen?*\n• Type address\n• Google Maps link\n• 📎 Location Pin`);
    return;
  }
  if (s.step === 'location') {
    const loc = (isPin && msgObj.location)
      ? `Pin: (${msgObj.location.latitude}, ${msgObj.location.longitude})`
      : parseLocation(text);
    if (!loc) { await sendWA(from, `⚠️ Type address, Google Maps link, or drop a Location Pin.`); return; }
    s.data.location = loc; s.step = 'altContact';
    await sendWA(from, s.lang === 'mr'
      ? `📞 *पर्यायी नंबर* द्या किंवा *"skip"* करा.`
      : `📞 Share *alternate contact* or type *"skip"*.`);
    return;
  }
  if (s.step === 'altContact') {
    if (text.toLowerCase() === 'skip') { s.data.altContact = ''; }
    else {
      if (text.replace(/\D/g,'').length < 8) { await sendWA(from, `⚠️ Enter valid number or type *"skip"*.`); return; }
      s.data.altContact = text;
    }
    s.step = 'photo';
    await sendWA(from, s.lang === 'mr'
      ? `📸 घटनेचा *फोटो किंवा व्हिडिओ* पाठवा. ⚠️ *अनिवार्य आहे.*`
      : `📸 Send a *photo or video* of the incident. ⚠️ *Mandatory.*`);
    return;
  }
  if (s.step === 'photo') {
    if (!hasMedia) { await sendWA(from, `⚠️ Photo/video is mandatory. Please send one.`); return; }
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
      ? `✅ *तक्रार नोंदवली!*\n\n🎫 *Ticket:* ${ref}\n\nआमचा अधिकारी लवकरच संपर्क करेल.\n*धन्यवाद! 🙏*`
      : `✅ *Complaint registered!*\n\n🎫 *Ticket:* ${ref}\n\nOur officer will contact you shortly.\n*Thank you! 🙏*`);
    await sendWA(ADMIN_NUMBER,
`🚨 *New Complaint — VVCMC*
🎫 *Ref:* ${ref}
🐕 ${s.data.incidentLabel}
👤 ${s.data.name}
📱 +${from}
📍 ${s.data.location}
📞 Alt: ${s.data.altContact || 'N/A'}
━━━━━━━
ASSIGN ${ref} DRIVER:1 DATE:25-Jan TIME:10:00AM
${DRIVERS.map(d=>`${d.id}. ${d.name}`).join('\n')}`);
    if (mId) await forwardMedia(ADMIN_NUMBER, mId, mType, `📸 Evidence — ${ref}`);
    for (const drv of DRIVERS) {
      await sendWA(drv.phone, `📢 *New Complaint*\n🎫 ${ref}\n🐕 ${s.data.incidentLabel}\n📍 ${s.data.location}\n👤 ${s.data.name}\n_Admin will assign shortly._`);
    }
    return;
  }
  if (s.step === 'done') {
    if (/^(new|नवीन|hi|hello|start)$/i.test(text)) { delete sessions[from]; await sendWA(from, `Send *Hi* to file a new complaint.`); return; }
    await sendWA(from, `Your complaint 🎫 ${s.ref} is registered. Type *"new"* for another complaint.`);
    return;
  }
  await sendWA(from, `👋 Send *Hi* to start.`);
}

const PORT = process.env.PORT || 3000;
const server = require('http').createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) { res.writeHead(200); res.end(challenge); return; }
    res.writeHead(200); res.end('VVCMC Stray Dog Bot is running! 🐕'); return;
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
});
server.listen(PORT, () => console.log(`✅ VVCMC Bot running on port ${PORT}`));
