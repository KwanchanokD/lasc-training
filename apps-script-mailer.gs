/**
 * ตัวส่งอีเมลของ "ระบบลงทะเบียนอบรม · ฝึกปฏิบัติ · ใบรับรอง — PSU:LASC"
 * ------------------------------------------------------------------
 * ระบบเป็นเว็บแบบไม่มีเซิร์ฟเวอร์ จึงส่งอีเมลเองไม่ได้ สคริปต์นี้ส่งอีเมลจากบัญชี Google ของหน่วยงานให้
 *
 *   type = 'registration'  เรียกอัตโนมัติหลังลงทะเบียนสำเร็จ
 *        → อีเมลยืนยันถึงผู้ลงทะเบียน + อีเมลแจ้งลงทะเบียนใหม่ถึงแอดมิน (ADMIN_RECIPIENTS)
 *   type = 'test'          ปุ่ม "ส่งอีเมลทดสอบ" ในแท็บตั้งค่า (เฉพาะเจ้าหน้าที่)
 *
 * กันการใช้สคริปต์ส่งอีเมลมั่ว:
 *   - ทุกคำขอต้องแนบ Firebase ID token · สคริปต์อ่านข้อมูลการลงทะเบียนจากฐานข้อมูลด้วย token นั้น
 *     (ฐานข้อมูลตรวจลายเซ็น token ให้ และอ่านได้เฉพาะเจ้าของรายการหรือเจ้าหน้าที่)
 *   - เนื้อหาอีเมลสร้างจากข้อมูลในฐานข้อมูลเท่านั้น ไม่ใช้ข้อความที่เบราว์เซอร์ส่งมา
 *   - ผู้เรียนลงทะเบียนเอง → ส่งถึงอีเมลบัญชีที่เข้าสู่ระบบเท่านั้น · ผู้รับฝั่งแอดมินกำหนดตายตัวในสคริปต์
 *   - แต่ละรายการส่งอัตโนมัติได้ครั้งเดียว (ส่งซ้ำได้เฉพาะเจ้าหน้าที่) และจำกัดจำนวนต่อชั่วโมง
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ~5 นาที) — ดูละเอียดใน README.md หัวข้อ "ตั้งค่าอีเมลแจ้งเตือน"
 *   1. https://script.google.com → New project → วางโค้ดนี้ทับทั้งหมด
 *   2. แก้ค่าในส่วน "ค่าที่ต้องแก้" ด้านล่าง
 *   3. เลือกฟังก์ชัน authorize → Run → อนุญาตสิทธิ์ (ส่งอีเมล + เชื่อมต่อภายนอก)
 *   4. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone
 *   5. คัดลอก Web app URL (ลงท้าย /exec) → ระบบอบรม แท็บ "ตั้งค่า" → ช่อง Mailer URL → บันทึก → กด "ส่งอีเมลทดสอบ"
 *
 * แก้โค้ดภายหลัง: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL เดิมใช้ต่อได้)
 * โควตา: Gmail ทั่วไป ~100 ฉบับ/วัน · Google Workspace ~1,500 ฉบับ/วัน (ลงทะเบียน 1 ครั้ง = 2 ฉบับ)
 */

/* ===== ค่าที่ต้องแก้ ===== */

/* อีเมลแอดมิน/ผู้รับผิดชอบที่จะได้รับแจ้งเมื่อมีผู้ลงทะเบียนใหม่ (หลายคนคั่นด้วยจุลภาค) */
const ADMIN_RECIPIENTS = 'kwanchanok.d@psu.ac.th';

/* ชื่อผู้ส่งที่ผู้รับเห็น */
const SENDER_NAME = 'ศูนย์บริการสัตว์ทดลอง ม.อ.';

/* อีเมลที่ให้ผู้เรียนกดตอบกลับ (เว้นว่าง = ตอบกลับบัญชีที่รันสคริปต์) */
const LAB_REPLY_TO = 'psu.labanimals@gmail.com';

/* ที่อยู่เว็บของระบบอบรม — ใส่เป็นลิงก์ในอีเมล */
const APP_URL = 'https://kwanchanokd.github.io/lasc-training/';

/* ค่าจาก Firebase config ของระบบอบรม (databaseURL และ projectId) */
const DB_URL = 'https://psu-lasc-training-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_PROJECT = 'psu-lasc-training';

/* กันการยิงถี่ผิดปกติ: จำนวนการลงทะเบียนที่ส่งอีเมลได้สูงสุดต่อชั่วโมง */
const MAX_PER_HOUR = 60;

/* ===== จบส่วนที่ต้องแก้ ===== */

const ROOT = 'data/training';
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const PAY_LABEL = { none: 'ไม่มีค่าใช้จ่าย', unpaid: 'ยังไม่ชำระ', submitted: 'ส่งหลักฐานแล้ว รอตรวจสอบ', paid: 'ชำระแล้ว', waived: 'ยกเว้นค่าธรรมเนียม', rejected: 'หลักฐานไม่ผ่าน', refunded: 'คืนเงินแล้ว' };

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: 'no payload' });
    const d = JSON.parse(e.postData.contents);
    const who = readToken(d.idToken);
    if (!who) return json({ ok: false, error: 'unauthorized — ต้องเข้าสู่ระบบก่อน' });
    if (d.type === 'registration') return json(sendRegistration(d, who));
    if (d.type === 'test') {
      if (!staffRole(who)) return json({ ok: false, error: 'unauthorized — เฉพาะเจ้าหน้าที่' });
      return json(sendTest(who));
    }
    return json({ ok: false, error: 'unknown type' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* เปิด URL ด้วยเบราว์เซอร์เพื่อตรวจว่า deploy สำเร็จ */
function doGet() {
  return json({ ok: true, service: 'PSU:LASC training registration mailer' });
}

/* ---------- ลงทะเบียนใหม่ ---------- */
function sendRegistration(d, who) {
  const uid = str(d.uid, 128), eid = str(d.eid, 128);
  if (!/^[\w-]+$/.test(uid) || !/^[\w-]+$/.test(eid)) return { ok: false, error: 'bad id' };
  const isOwner = who.uid === uid;
  const role = isOwner ? null : staffRole(who);
  if (!isOwner && !role) return { ok: false, error: 'unauthorized' };
  const resend = !!d.resend && !!(role || staffRole(who));

  /* อ่านด้วย token ของผู้เรียก → ถ้า token ปลอม หรือไม่ใช่เจ้าของ/เจ้าหน้าที่ ฐานข้อมูลจะไม่ให้อ่าน */
  const en = dbGet(ROOT + '/enrollments/' + uid + '/' + eid, who.token);
  if (!en || !en.info) return { ok: false, error: 'ไม่พบการลงทะเบียน (หรือไม่มีสิทธิ์อ่าน)' };
  const i = en.info;

  const cache = CacheService.getScriptCache();
  const onceKey = 'reg-' + uid + '-' + eid;
  if (!resend) {
    if (cache.get(onceKey)) return { ok: true, duplicate: true };
    const created = Date.parse(i.createdAt || '');
    if (!created || Date.now() - created > 6 * 3600 * 1000) return { ok: false, error: 'รายการนี้ลงทะเบียนนานแล้ว — ให้เจ้าหน้าที่กดส่งอีเมลซ้ำ' };
    const hourKey = 'n-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHH');
    const n = Number(cache.get(hourKey) || 0);
    if (n >= MAX_PER_HOUR) return { ok: false, error: 'rate limited' };
    cache.put(hourKey, String(n + 1), 3700);
  }

  const course = dbGet(ROOT + '/courses/' + encodeURIComponent(i.courseId || '_')) || {};
  const session = i.sessionId ? (dbGet(ROOT + '/sessions/' + encodeURIComponent(i.sessionId)) || {}) : null;
  const set = dbGet(ROOT + '/settings') || {};

  /* ผู้เรียนลงทะเบียนเอง → อีเมลบัญชีที่เข้าสู่ระบบ (จาก token) · เจ้าหน้าที่ลงแทน → อีเมลที่กรอกในรายการ */
  const to = isOwner ? str(who.email, 200) : (isEmail(i.email) ? str(i.email, 200) : '');
  const result = { ok: true, to: '', admin: false };

  if (to && isEmail(to) && d.notifyTrainee !== false) {
    send({ to: to, subject: 'ยืนยันการลงทะเบียน: ' + str(i.courseTitle, 150) + ' (' + str(i.regNo, 40) + ')', htmlBody: traineeHtml(en, course, session, set) });
    result.to = to;
  }
  if (!resend && d.notifyAdmin !== false && ADMIN_RECIPIENTS) {
    send({ to: ADMIN_RECIPIENTS, subject: '[ลงทะเบียนใหม่] ' + fullName(i) + ' — ' + str(i.courseTitle, 120) + ' (' + str(i.regNo, 40) + ')',
      htmlBody: adminHtml(en, course, session, !isOwner ? who : null), replyTo: isEmail(to) ? to : '' });
    result.admin = true;
  }
  cache.put(onceKey, '1', 21600);
  return result;
}

function traineeHtml(en, c, s, set) {
  const i = en.info, p = en.pay || {}, isM = i.type === 'mooc';
  const amount = Number(p.amount || 0), payOK = !(amount > 0) || p.status === 'paid' || p.status === 'waived';
  const rows = [
    ['เลขที่ลงทะเบียน', '<b>' + h(i.regNo) + '</b>'],
    ['ชื่อ-นามสกุล', h(fullName(i))],
    ['หลักสูตร', h(i.courseTitle) + (c.code ? ' (' + h(c.code) + ')' : '')],
    ['ประเภท', isM ? 'อบรมเชิงทฤษฎีแบบออนไลน์ (MOOC)' : 'ฝึกปฏิบัติ ณ ศูนย์ฯ'],
    ['จำนวนชั่วโมง', h(i.hours || c.hours || 0) + ' ชั่วโมง']
  ];
  if (!isM) {
    rows.push(['วันที่ฝึก', '<b>' + dateRange(i.sessionDate, i.sessionDateEnd) + '</b>' + (i.batchNo ? ' (รุ่นที่ ' + h(i.batchNo) + ')' : '')]);
    if (s && s.timeText) rows.push(['เวลา', h(s.timeText)]);
    if (s && s.location) rows.push(['สถานที่', h(s.location)]);
  }
  rows.push(['ค่าลงทะเบียน', amount > 0 ? money(amount) + ' — ' + h(PAY_LABEL[p.status] || p.status || '') + (p.receiptNo ? ' (ใบเสร็จเลขที่ ' + h(p.receiptNo) + ')' : '') : 'ไม่มีค่าใช้จ่าย']);

  let next = '';
  if (!payOK) {
    const acc = [];
    if (set.payBank) acc.push(['ธนาคาร', h(set.payBank)]);
    if (set.payAccName) acc.push(['ชื่อบัญชี', h(set.payAccName)]);
    if (set.payAccNo) acc.push(['เลขที่บัญชี', '<b>' + h(set.payAccNo) + '</b>']);
    if (set.payPromptPay) acc.push(['พร้อมเพย์', '<b>' + h(set.payPromptPay) + '</b>']);
    next += box('#fdf3e2', '#f0c987', '<b>ขั้นตอนต่อไป: ชำระค่าลงทะเบียน ' + money(amount) + '</b><br>' +
      'โอนเงินแล้วแนบสลิปในหน้า “การเรียนของฉัน”' + (isM ? ' — บทเรียนจะเปิดเมื่อเจ้าหน้าที่ยืนยันการชำระเงิน' : ' — เจ้าหน้าที่จะยืนยันก่อนวันฝึก') +
      (acc.length ? '<div style="margin-top:8px">' + table(acc) + '</div>' : '') + (set.payNote ? '<div style="margin-top:6px">' + nl(set.payNote) + '</div>' : ''));
  }
  if (isM) next += box('#f1eaf8', '#d6c4ea', payOK ? '<b>เริ่มเรียนได้ทันที</b> — เข้าสู่ระบบแล้วไปที่ “การเรียนของฉัน” → “เริ่มเรียน” · เรียนครบทุกบทและทำแบบทดสอบผ่านเกณฑ์ จะได้รับใบรับรองพร้อมเลขที่'
    : 'เมื่อชำระเงินเรียบร้อย เข้าสู่ระบบแล้วไปที่ “การเรียนของฉัน” เพื่อเริ่มเรียน');
  else next += box('#e3f3ee', '#a9d8c8', '<b>กรุณามาที่ศูนย์ฯ ตามวันและเวลาที่กำหนด</b> · เจ้าหน้าที่จะบันทึกการเข้าเรียนและผลการฝึก แล้วออกใบรับรองการฝึกให้' +
    (s && s.note ? '<div style="margin-top:6px">' + nl(s.note) + '</div>' : ''));

  return layout('ยืนยันการลงทะเบียน',
    '<p>เรียน ' + h(fullName(i)) + '</p><p>' + h(set.orgName || 'ศูนย์บริการสัตว์ทดลอง มหาวิทยาลัยสงขลานครินทร์') + ' ได้รับการลงทะเบียนของท่านเรียบร้อยแล้ว รายละเอียดดังนี้</p>' +
    table(rows) + next + button('เข้าสู่ระบบ / การเรียนของฉัน') +
    (set.contact ? '<p style="font-size:13px;color:#555"><b>ติดต่อสอบถาม</b><br>' + nl(set.contact) + '</p>' : '') +
    '<p style="font-size:12px;color:#888">อีเมลนี้ส่งอัตโนมัติจากระบบลงทะเบียนอบรม · หากท่านไม่ได้ลงทะเบียน กรุณาตอบกลับอีเมลนี้เพื่อแจ้งศูนย์ฯ</p>');
}

function adminHtml(en, c, s, staff) {
  const i = en.info, p = en.pay || {}, isM = i.type === 'mooc';
  const rows = [
    ['เลขที่ลงทะเบียน', '<b>' + h(i.regNo) + '</b> · ' + h(dateTime(i.createdAt))],
    ['ชื่อ-นามสกุล', '<b>' + h(fullName(i)) + '</b>' + (i.firstNameEn ? ' (' + h(i.firstNameEn + ' ' + (i.lastNameEn || '')) + ')' : '')],
    ['หน่วยงาน / ตำแหน่ง', h(i.org || '-') + (i.position ? ' · ' + h(i.position) : '')],
    ['ประเภทผู้สมัคร', i.applicantType === 'psu' ? 'บุคลากร/นักศึกษา ม.อ.' : 'บุคคลภายนอก'],
    ['ติดต่อ', h(i.email || '-') + ' · ' + h(i.phone || '-')],
    ['หลักสูตร', (isM ? '[MOOC] ' : '[ฝึกปฏิบัติ] ') + h(i.courseTitle)]
  ];
  if (i.idNo) rows[3][1] += ' · รหัส ' + h(i.idNo);
  if (!isM) {
    const used = s && s.seats ? Object.keys(s.seats).length : 0, cap = s ? Number(s.capacity || 0) : 0;
    rows.push(['รอบฝึก', dateRange(i.sessionDate, i.sessionDateEnd) + (i.batchNo ? ' · รุ่นที่ ' + h(i.batchNo) : '') + '<br>ลงทะเบียนแล้ว <b>' + used + (cap ? ' / ' + cap : '') + '</b> ที่นั่ง' + (cap && used >= cap ? ' <b style="color:#c0392b">(เต็ม)</b>' : '')]);
  }
  rows.push(['ค่าลงทะเบียน', Number(p.amount || 0) > 0 ? money(p.amount) + ' — ' + h(PAY_LABEL[p.status] || p.status || '') : 'ไม่มีค่าใช้จ่าย']);
  if (i.prereqNote) rows.push(['⚠ ขอใช้ผลภาคทฤษฎีจากหน่วยงานอื่น', '<span style="color:#9c0006">' + nl(i.prereqNote) + '</span> — กรุณาตรวจสอบ']);
  if (staff || i.byStaff) rows.push(['ลงทะเบียนโดย', 'เจ้าหน้าที่ ' + h(i.byStaff || (staff && staff.email) || '')]);
  return layout('มีผู้ลงทะเบียนใหม่', table(rows) + button('เปิดระบบหลังบ้าน'));
}

function sendTest(who) {
  const to = [who.email, ADMIN_RECIPIENTS].filter(isEmail).join(',');
  send({ to: to, subject: '[ทดสอบ] อีเมลแจ้งเตือนระบบลงทะเบียนอบรม', htmlBody: layout('ทดสอบการส่งอีเมล',
    '<p>สคริปต์ส่งอีเมลของระบบลงทะเบียนอบรมทำงานปกติ</p>' + table([['กดทดสอบโดย', h(who.email)], ['ผู้รับแจ้งลงทะเบียนใหม่', h(ADMIN_RECIPIENTS)], ['เวลา', h(dateTime(new Date().toISOString()))]]) + button('เปิดระบบ')) });
  return { ok: true, to: to };
}

/* ---------- ตรวจ token / อ่านฐานข้อมูล ---------- */
function readToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    let b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(b)).getDataAsString());
  } catch (e) { return null; }
  if (!payload || payload.aud !== FIREBASE_PROJECT || !payload.user_id) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  /* ลายเซ็นของ token ตรวจโดยฐานข้อมูลตอนอ่านข้อมูลด้วย ?auth= (token ปลอมจะอ่านอะไรไม่ได้) */
  return { uid: payload.user_id, email: payload.email || '', token: idToken };
}
function staffRole(who) {
  if (who._role !== undefined) return who._role;
  const v = dbGet('allowed/' + encodeURIComponent(who.uid), who.token);
  who._role = (v === 'admin' || v === 'staff' || v === true) ? v : null;
  return who._role;
}
function dbGet(path, token) {
  const url = DB_URL + '/' + path + '.json' + (token ? '?auth=' + encodeURIComponent(token) : '');
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}

/* ---------- เครื่องมือ ---------- */
function send(o) {
  const opt = { to: o.to, subject: o.subject, htmlBody: o.htmlBody, name: SENDER_NAME };
  const rt = o.replyTo || LAB_REPLY_TO;
  if (rt) opt.replyTo = rt;
  MailApp.sendEmail(opt);
}
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function str(v, max) { const s = String(v == null ? '' : v).trim(); return max ? s.slice(0, max) : s.slice(0, 5000); }
function h(v) { return str(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nl(v) { return h(v).replace(/\n/g, '<br>'); }
function isEmail(v) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(String(v || '').trim()); }
function fullName(i) { return ([i.prefix, i.firstName].filter(Boolean).join('') + ' ' + (i.lastName || '')).trim(); }
function money(n) { return Number(n || 0).toLocaleString('th-TH') + ' บาท'; }
function thaiDate(iso) {
  const p = String(iso || '').slice(0, 10).split('-');
  if (p.length !== 3) return str(iso) || '-';
  return Number(p[2]) + ' ' + TH_MONTHS[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543);
}
function dateRange(a, b) { return (!b || b === a) ? thaiDate(a) : thaiDate(a) + ' – ' + thaiDate(b); }
function dateTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return str(iso);
  return thaiDate(Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd')) + ' ' + Utilities.formatDate(d, 'Asia/Bangkok', 'HH:mm') + ' น.';
}
function table(rows) {
  return '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows.map(function (r) {
    return '<tr><th style="text-align:left;vertical-align:top;background:#e8f0f8;color:#143f66;border:1px solid #d0dbe6;padding:6px 10px;width:34%">' +
      r[0] + '</th><td style="border:1px solid #d0dbe6;padding:6px 10px;vertical-align:top">' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}
function box(bg, border, html) { return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;padding:10px 14px;margin:14px 0;font-size:14px;line-height:1.6">' + html + '</div>'; }
function button(label) {
  if (!APP_URL) return '';
  return '<p style="margin:18px 0"><a href="' + h(APP_URL) + '" style="background:#1d5a8f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;display:inline-block;font-weight:600">' + h(label) + '</a></p>';
}
function layout(title, body) {
  return '<div style="font-family:Sarabun,Tahoma,Arial,sans-serif;max-width:640px;margin:0 auto;color:#2c3e50;line-height:1.6">' +
    '<div style="background:#1d5a8f;color:#fff;padding:14px 20px;border-radius:10px 10px 0 0;border-bottom:3px solid #0e7c66">' +
    '<div style="font-size:13px;opacity:.85">ศูนย์บริการสัตว์ทดลอง มหาวิทยาลัยสงขลานครินทร์</div><div style="font-size:18px;font-weight:700">' + h(title) + '</div></div>' +
    '<div style="border:1px solid #dfe6ee;border-top:0;border-radius:0 0 10px 10px;padding:18px 20px">' + body + '</div></div>';
}

/* รันครั้งแรกเพื่ออนุญาตสิทธิ์ (ส่งอีเมล + เชื่อมต่อภายนอก) */
function authorize() {
  UrlFetchApp.fetch(DB_URL + '/' + ROOT + '/settings.json', { muteHttpExceptions: true });
  MailApp.sendEmail({ to: ADMIN_RECIPIENTS, subject: '[ทดสอบ] อนุญาตสิทธิ์สคริปต์ระบบลงทะเบียนอบรมแล้ว', name: SENDER_NAME,
    htmlBody: '<p>สคริปต์ส่งอีเมลได้ตามปกติ — ขั้นต่อไป Deploy เป็น Web app แล้วนำ URL ไปใส่ในแท็บตั้งค่าของระบบ</p>' });
}
