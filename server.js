'use strict';

/* ── CONFIG ── */
const GS_NUMBER  = '919820349477';
const DRIVERS = [
  { id: 1, name: 'Somnath Catcher', phone: '917218082442' },
  { id: 2, name: 'Mukesh Catcher',  phone: '919373246128' },
];

/* ── AIRTABLE CONFIG ── */
const AT_BASE      = 'appIAa5QyApMtzlR8';
const AT_COMPLAINTS = 'tblLhgEATdVGkWhGo';
const AT_SETTINGS   = 'tblWDeHIP7VMEgqo1';
const AT_HDR = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` });
const AT_URL = `https://api.airtable.com/v0/${AT_BASE}/${AT_COMPLAINTS}`;
const ST_URL = `https://api.airtable.com/v0/${AT_BASE}/${AT_SETTINGS}`;

/* ── SETTINGS IDs ── */
const TOKEN_RECORD_ID   = 'recfOnsA8Ce8XmTqI';
const COUNTER_RECORD_ID = 'recBwmnV29BQbSI3f';

/* ── AIRTABLE SETTINGS HELPERS ── */
async function getSetting(recordId) {
  try {
    const r = await fetch(`${ST_URL}/${recordId}`, { headers: AT_HDR() });
    const d = await r.json();
    return d.fields?.fldThfAgPohMINbnH || null;
  } catch { return null; }
}

async function setSetting(recordId, value) {
  try {
    await fetch(`${ST_URL}/${recordId}`, {
      method: 'PATCH', headers: AT_HDR(),
      body: JSON.stringify({ fields: { fldThfAgPohMINbnH: String(value), fldBakW5veuT3uf2b: nowIST() } })
    });
  } catch(e) { console.error('[setSetting error]', e.message); }
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
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
    const data = await res.json();
    return data.url || '';
  } catch { return ''; }
}

/* ── AIRTABLE TICKET HELPERS ── */
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

/* ── LOAD TICKET FROM AIRTABLE ── */
async function loadTicketFromAirtable(ref) {
  try {
    const encodedRef = encodeURIComponent(ref);
    const r = await fetch(`${AT_URL}?filterByFormula=SEARCH(%22${encodedRef}%22%2C%7BRef%7D)&pageSize=1`, {
      headers: AT_HDR()
    });
    const d = await r.json();
    if (d.records && d.records.length > 0) {
      const rec = d.records[0];
      const f = rec.fields;
      return {
        ref,
        status: f.fldgb6Ftq7qaRNoHe?.name || 'Open',
        lang: f.fldQmRhTECXhx75EX === 'मराठी' ? 'mr' : 'en',
        citizenPhone: f.fld9mitPsPU8y32PW || '',
        driverName: f.fldQ85dcRt82zeQGJ || '',
        atRecordId: rec.id,
        data: {
          incidentLabel: f.fldNfZJ9MB5Ub7o0S || '',
          name: f.fld8dumoEH3eCv8bg || '',
          phone: f.fld9mitPsPU8y32PW || '',
          location: f.fldE45zv9IER93A8Q || '',
          altContact: f.fldhrqYI58ioDB6xH || '',
          mediaUrl: f.flddMQC528gDuo0AI || '',
          mediaType: f.fld5idjsIpkMglZMV || '',
          incidentTime: f.fld1VlQL5WwOptowZ || '',
        }
      };
    }
  } catch(e) { console.error('[loadTicket error]', e.message); }
  return null;
}

/* ── TICKET NUMBER — persistent via Airtable ── */
let ticketCounter = 4;

async function getNextTicketNumber() {
  try {
    const val = await getSetting(COUNTER_RECORD_ID);
    if (val) ticketCounter = parseInt(val) || 4;
  } catch {}
  const now = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const month = months[now.getMonth()];
  const num = String(ticketCounter).padStart(5, '0');
  const ref = `VVCMC-STRAY-${month}-${num}`;
  ticketCounter++;
  await setSetting(COUNTER_RECORD_ID, ticketCounter);
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

/* ── IN-MEMORY SESSION STORE (citizen flow only — short lived) ── */
const sessions = {};
function getSession(from) {
  if (!sessions[from]) sessions[from] = { step: 'greet', lang: null, data: {} };
  return sessions[from];
}

/* ── PENDING ASSIGN — stored in Airtable Settings ── */
async function savePendingAssign(adminPhone, ref) {
  try {
    // Check if record exists first
    const r = await fetch(`${ST_URL}`, { headers: AT_HDR() });
    const d = await r.json();
    const existing = d.records?.find(rec => rec.fields?.fldqtgQkeRJVmnyPi === `PENDING_${adminPhone}`);
    if (existing) {
      await fetch(`${ST_URL}/${existing.id}`, {
        method: 'PATCH', headers: AT_HDR(),
        body: JSON.stringify({ fields: { fldThfAgPohMINbnH: ref, fldBakW5veuT3uf2b: nowIST() } })
      });
    } else {
      await fetch(ST_URL, {
        method: 'POST', headers: AT_HDR(),
        body: JSON.stringify({ fields: { fldqtgQkeRJVmnyPi: `PENDING_${adminPhone}`, fldThfAgPohMINbnH: ref, fldBakW5veuT3uf2b: nowIST() } })
      });
    }
  } catch(e) { console.error('[savePending error]', e.message); }
}

async function loadPendingAssign(adminPhone) {
  try {
    const r = await fetch(`${ST_URL}`, { headers: AT_HDR() });
    const d = await r.json();
    const rec = d.records?.find(r => r.fields?.fldqtgQkeRJVmnyPi === `PENDING_${adminPhone}`);
    return rec?.fields?.fldThfAgPohMINbnH || null;
  } catch { return null; }
}

async function clearPendingAssign(adminPhone) {
  try {
    const r = await fetch(`${ST_URL}`, { headers: AT_HDR() });
    const d = await r.json();
    const rec = d.records?.find(r => r.fields?.fldqtgQkeRJVmnyPi === `PENDING_${adminPhone}`);
    if (rec) {
      await fetch(`${ST_URL}/${rec.id}`, {
        method: 'PATCH', headers: AT_HDR(),
        body: JSON.stringify({ fields: { fldThfAgPohMINbnH: '' } })
      });
    }
  } catch {}
}

/* ── GS / ADMIN HANDLER ── */
async function handleAdmin(from, text) {

  // TOKEN UPDATE COMMAND
  if (text.startsWith('UPDATE-TOKEN:')) {
    const newToken = text.replace('UPDATE-TOKEN:', '').trim();
    if (newToken.length > 50) {
      process.env.WA_ACCESS_TOKEN = newToken;
      await setSetting(TOKEN_RECORD_ID, newToken);
      await sendWA(from, '✅ Token updated successfully! Bot will now work properly.');
      console.log('✅ Token updated via WhatsApp!');
    } else {
      await sendWA(from, '⚠️ Invalid token. Send: UPDATE-TOKEN:yourNewTokenHere');
    }
    return;
  }

  // STEP 2 — Admin selected driver 1 or 2
  if (/^[12]$/.test(text)) {
    // Load pending ref from Airtable
    const ref = await loadPendingAssign(from);
    if (!ref) {
      // No pending — show open tickets
      await showOpenTickets(from);
      return;
    }

    // Load ticket from Airtable
    let ticket = await loadTicketFromAirtable(ref);
    if (!ticket) {
      await sendWA(from, `⚠️ Ticket \`${ref}\` not found. Please send the ticket ref again.`);
      await clearPendingAssign(from);
      return;
    }

    const driver = DRIVERS.find(d => d.id === parseInt(text));
    if (!driver) { await sendWA(from, `⚠️ Invalid. Reply *1* for Somnath or *2* for Mukesh.`); return; }

    await clearPendingAssign(from);

    // Update Airtable
    if (ticket.atRecordId) await atAssign(ticket.atRecordId, driver.name, driver.phone);

    // Notify ONLY selected driver
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
      ? `👷 *तुमची तक्रार अधिकाऱ्याला दिली गेली!*\n🎫 Ticket: ${ref}\n👤 *अधिकारी:* ${driver.name}\n\n_ते येण्यापूर्वी फोन करतील._`
      : `👷 *Your complaint has been assigned to an officer!*\n🎫 Ticket: ${ref}\n👤 *Officer:* ${driver.name}\n\n_He will call before arriving._`;
    await sendWA(ticket.citizenPhone, citizenMsg);

    await sendWA(from, `✅ *${ref}* → *${driver.name}*\nCitizen ✓  Driver ✓  Airtable ✓`);
    return;
  }

  // STEP 1 — Admin sends ticket ref
  const refMatch = text.match(/^(VVCMC-STRAY-[A-Z]+-\d+|SDB-[A-Z0-9]+)$/i);
  if (refMatch) {
    const ref = refMatch[1].toUpperCase();
    const ticket = await loadTicketFromAirtable(ref);
    if (!ticket) {
      await sendWA(from, `⚠️ Ticket \`${ref}\` not found in Airtable.`);
      return;
    }
    await savePendingAssign(from, ref);
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

  // Default — show open tickets
  await showOpenTickets(from);
}

async function showOpenTickets(from) {
  try {
    const r = await fetch(`${AT_URL}?fields[]=fldi3QMTASyf3FiH8&fields[]=fldNfZJ9MB5Ub7o0S&fields[]=fld8dumoEH3eCv8bg&fields[]=fldE45zv9IER93A8Q&fields[]=fldgb6Ftq7qaRNoHe&fields[]=fld1VlQL5WwOptowZ&sort[0][field]=fldi3QMTASyf3FiH8&sort[0][direction]=desc`, {
      headers: AT_HDR()
    });
    const d = await r.json();
    const open = d.records?.filter(rec => {
      const status = rec.fields?.fldgb6Ftq7qaRNoHe?.name || rec.fields?.fldgb6Ftq7qaRNoHe;
      return status === 'Open';
    }) || [];

    if (open.length === 0) {
      await sendWA(from, `📋 *Admin Panel — VVCMC Bot*\n\n✅ सध्या कोणतीही Open तक्रार नाही!\n(No open tickets right now!)`);
      return;
    }

    let msg = `📋 *Admin Panel — VVCMC Bot*\n\n*Open Tickets:*\n━━━━━━━━━━\n`;
    open.slice(0, 10).forEach((rec, i) => {
      const f = rec.fields;
      msg += `${i+1}. *${f.fldi3QMTASyf3FiH8}*\n   🐕 ${f.fldNfZJ9MB5Ub7o0S || ''}\n   👤 ${f.fld8dumoEH3eCv8bg || ''}\n   📍 ${(f.fldE45zv9IER93A8Q || '').slice(0,40)}\n\n`;
    });
    msg += `_Ticket ref पाठवा to assign_\n_e.g. ${open[0]?.fields?.fldi3QMTASyf3FiH8}_`;
    await sendWA(from, msg);
  } catch(e) {
    console.error('[showOpenTickets error]', e.message);
    await sendWA(from, `📋 *Admin Panel — VVCMC Bot*\n\nDrivers:\n${DRIVERS.map(d=>`${d.id}. ${d.name}  +${d.phone}`).join('\n')}`);
  }
}

/* ── DRIVER HANDLER ── */
async function handleDriver(from, msgObj, driver) {
  const text     = (msgObj.text?.body || '').trim();
  const hasMedia = !!(msgObj.image || msgObj.video);
  const isPin    = msgObj.type === 'location';
  const s        = getSession(from);

  if (/^ticket$/i.test(text)) {
    // Load assigned tickets from Airtable
    try {
      const r = await fetch(`${AT_URL}?fields[]=fldi3QMTASyf3FiH8&fields[]=fldNfZJ9MB5Ub7o0S&fields[]=fld8dumoEH3eCv8bg&fields[]=fldE45zv9IER93A8Q&fields[]=fldQ85dcRt82zeQGJ&fields[]=fldgb6Ftq7qaRNoHe&fields[]=fld9mitPsPU8y32PW`, {
        headers: AT_HDR()
      });
      const d = await r.json();
      const mine = d.records?.filter(rec => {
        const status = rec.fields?.fldgb6Ftq7qaRNoHe?.name || rec.fields?.fldgb6Ftq7qaRNoHe;
        return status === 'Assigned' && rec.fields?.fldQ85dcRt82zeQGJ === driver.name;
      }) || [];

      if (!mine.length) { await sendWA(from, `📋 तुमच्यासाठी सध्या कोणतेही ticket नाही.\n(No open tickets assigned to you.)`); return; }

      let list = `📋 *तुमचे Open Tickets:*\n━━━━━━━━━\n`;
      mine.forEach((rec, i) => {
        const f = rec.fields;
        list += `${i+1}. ${f.fldi3QMTASyf3FiH8}\n   👤 ${f.fld8dumoEH3eCv8bg || ''}\n   📍 ${(f.fldE45zv9IER93A8Q || '').slice(0,50)}\n   🐕 ${f.fldNfZJ9MB5Ub7o0S || ''}\n\n`;
      });
      list += `_नंबर टाइप करा (e.g. 1)_`;
      s.step = 'driver_select';
      s.openTicketRefs = mine.map(r => r.fields.fldi3QMTASyf3FiH8);
      await sendWA(from, list);
    } catch(e) {
      console.error('[driver ticket error]', e.message);
      await sendWA(from, `⚠️ Error loading tickets. Try again.`);
    }
    return;
  }

  if (s.step === 'driver_select') {
    const num = parseInt(text);
    const ref = s.openTicketRefs?.[num-1];
    if (!ref) { await sendWA(from, `⚠️ सापडले नाही. *ticket* टाइप करा.`); return; }
    // Load from Airtable
    const ticket = await loadTicketFromAirtable(ref);
    if (!ticket) { await sendWA(from, `⚠️ Ticket not found.`); return; }
    s.step = 'driver_location';
    s.activeRef = ref;
    s.activeTicket = ticket;
    await sendWA(from,
`✅ *Ticket:* ${ref}
👤 ${ticket.data.name}
📍 ${ticket.data.location}
🐕 ${ticket.data.incidentLabel}

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
    const ref    = s.activeRef;
    let ticket = s.activeTicket;
    if (!ticket) ticket = await loadTicketFromAirtable(ref);
    if (!ticket) { await sendWA(from, `⚠️ Ticket not found.`); return; }

    const mType    = msgObj.image ? 'image' : 'video';
    const mId      = msgObj.image?.id || msgObj.video?.id;
    const mUrl     = await getMediaUrl(mId);
    const loc      = s.closingLocation;
    const closedAt = nowIST();

    if (ticket.atRecordId) await atClose(ticket.atRecordId, loc, driver.name, mUrl);

    // Citizen closing message
    const citizenClose = ticket.lang === 'mr'
      ? `✅ *तुमची तक्रार सोडवली गेली आहे!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *अधिकारी:* ${driver.name}\n📍 *ठिकाण:* ${loc}\n🕐 *बंद:* ${closedAt}\n\nआमच्या टीमने समस्या सोडवली.\n_VVCMC सेवेत विश्वास ठेवल्याबद्दल धन्यवाद! 🙏_\n\nनवीन तक्रारीसाठी *Hi* पाठवा.`
      : `✅ *Your complaint has been resolved!*\n\n🎫 Ticket: ${ref}\n🐕 ${ticket.data.incidentLabel}\n👷 *Officer:* ${driver.name}\n📍 *Resolved at:* ${loc}\n🕐 *Closed at:* ${closedAt}\n\nOur team has addressed the problem.\n_Thank you for reporting to VVCMC! 🙏_\n\nSend *Hi* to file a new complaint.`;

    await sendWA(ticket.citizenPhone, citizenClose);
    if (mId) await forwardMedia(ticket.citizenPhone, mId, mType, ticket.lang === 'mr' ? '📸 काम पूर्ण झाल्याचा पुरावा' : '📸 Proof of work completed');

    await sendWA(GS_NUMBER,
`✅ *Case Closed — VVCMC Bot*
🎫 ${ref}
🐕 ${ticket.data.incidentLabel}
👷 Closed by: ${driver.name}
📍 ${loc}
🕐 ${closedAt}
👤 ${ticket.data.name} (+${ticket.citizenPhone})`);
    if (mId) await forwardMedia(GS_NUMBER, mId, mType, `Closing proof — ${ref}`);

    await sendWA(from,
`✅ *Case बंद केले!*
🎫 ${ref}
✓ तक्रारदाराला कळवले
✓ Photo sent to citizen
✓ Malhar sir ला कळवले
✓ Airtable → Closed

_पुढील ticket साठी *ticket* टाइप करा._`);

    delete sessions[ticket.citizenPhone];
    s.step = 'driver_idle'; s.activeRef = null; s.activeTicket = null; s.closingLocation = null;
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
    s.data.lang = s.lang;

    // Get ticket number first (needed for messages)
    const ref = await getNextTicketNumber();
    s.step = 'done'; s.ref = ref;

    // Send citizen confirmation IMMEDIATELY — don't wait for Airtable
    const citizenConfirm = s.lang === 'mr'
      ? `✅ *तुमची तक्रार नोंदवली गेली!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *तक्रार:* ${s.data.incidentLabel}\n📍 *ठिकाण:* ${s.data.location}\n🕐 *वेळ:* ${s.data.incidentTime}\n\nआमचा अधिकारी लवकरच संपर्क करेल.\n*धन्यवाद! VVCMC 🙏*`
      : `✅ *Your complaint has been registered!*\n\n🎫 *Ticket:* \`${ref}\`\n🐕 *Issue:* ${s.data.incidentLabel}\n📍 *Location:* ${s.data.location}\n🕐 *Time:* ${s.data.incidentTime}\n\nOur officer will contact you shortly.\n*Thank you! VVCMC 🙏*`;

    const adminAlert = s.lang === 'mr'
      ? `🚨 *नवीन तक्रार — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *तक्रार:* ${s.data.incidentLabel}\n👤 *नाव:* ${s.data.name}\n📱 *Phone:* +${from}\n📍 *ठिकाण:* ${s.data.location}\n📞 *Alt:* ${s.data.altContact || 'N/A'}\n🕐 *वेळ:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Reply with ticket ref to assign:_\n*${ref}*`
      : `🚨 *New Complaint — VVCMC Bot*\n\n🎫 *Ref:* ${ref}\n🐕 *Issue:* ${s.data.incidentLabel}\n👤 *Name:* ${s.data.name}\n📱 *Phone:* +${from}\n📍 *Location:* ${s.data.location}\n📞 *Alt Contact:* ${s.data.altContact || 'N/A'}\n🕐 *Time:* ${s.data.incidentTime}\n━━━━━━━━━━\n_Reply with ticket ref to assign:_\n*${ref}*`;

    // Run all 4 things in PARALLEL — much faster!
    await Promise.all([
      sendWA(from, citizenConfirm),
      sendWA(GS_NUMBER, adminAlert),
      atCreate(ref, s.data),
      mId ? forwardMedia(GS_NUMBER, mId, mType, s.lang === 'mr' ? `📸 पुरावा — ${ref}` : `📸 Evidence — ${ref}`) : Promise.resolve(),
    ]);
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
async function refreshToken() {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${process.env.WA_ACCESS_TOKEN}`
    );
    const data = await res.json();
    if (data.access_token) {
      process.env.WA_ACCESS_TOKEN = data.access_token;
      await setSetting(TOKEN_RECORD_ID, data.access_token);
      console.log('✅ Token auto-refreshed!');
    }
  } catch(e) { console.error('[refreshToken error]', e.message); }
}

/* ── STARTUP ── */
async function startup() {
  // Load token from Airtable
  const token = await getSetting(TOKEN_RECORD_ID);
  if (token && token.length > 50 && !token.includes('PASTE')) {
    process.env.WA_ACCESS_TOKEN = token;
    console.log('✅ Token loaded from Airtable!');
  }
  // Refresh token immediately
  await refreshToken();
  // Auto refresh every 45 days
  setInterval(refreshToken, 45 * 24 * 60 * 60 * 1000);
  console.log('✅ Bot ready! Auto token refresh every 45 days.');
}
setTimeout(startup, 3000);

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
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Privacy Policy - VVCMC</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#1a6b3a}</style></head><body><h1>Privacy Policy</h1><p>Last updated: March 23, 2026</p><p>This Privacy Policy applies to the <strong>VVCMC Stray Dog Complaint Bot</strong> operated by Vasai Virar City Municipal Corporation.</p><h2>Information We Collect</h2><ul><li>WhatsApp phone number</li><li>Name and location of incident</li><li>Photos/videos submitted with complaints</li><li>Complaint history and status</li></ul><h2>How We Use Your Information</h2><ul><li>Register and track your complaint</li><li>Assign municipal officers</li><li>Notify you about complaint status</li></ul><h2>Contact</h2><p>VVCMC, Vasai Virar, Maharashtra. Email: vvcmc@vasaivirar.gov.in</p></body></html>`);
      return;
    }
    if (url.pathname === '/deletion') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Data Deletion - VVCMC</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#c0392b}</style></head><body><h1>Data Deletion Request</h1><p>To request deletion of your data, contact us:</p><ul><li>Email: vvcmc@vasaivirar.gov.in</li><li>WhatsApp: Send "DELETE MY DATA" to our bot</li></ul><p>We will process your request within 30 days.</p></body></html>`);
      return;
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
        else if (driver)       await handleDriver(from, msgObj, driver);
        else                   await handleCitizen(from, msgObj);
      } catch (err) { console.error('[handler error]', err.message, err.stack); }
    });
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('VVCMC Stray Dog Bot is running! OK');
}).listen(PORT, () => console.log(`✅ VVCMC Bot running on port ${PORT}`));
