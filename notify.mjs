// LINE 每日排休通知腳本
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAgUAnkodvvZlHP1VA9s4_F9RA6kcB7IqM",
  authDomain: "w9001-holiday.firebaseapp.com",
  projectId: "w9001-holiday",
  storageBucket: "w9001-holiday.firebasestorage.app",
  messagingSenderId: "266789436311",
  appId: "1:266789436311:web:526dac36bd98ae75cba2d2",
};

const LINE_TOKEN = process.env.LINE_CHANNEL_TOKEN;

const SYSTEMS = [
  { appId: 'w9001-holiday',   groupId: 'C5ec1b5c73ac01f27f7c5743b7577f7ee', name: '排休系統' },
  { appId: 'gaosiang-paiqiu', groupId: 'Cfd17df69bc81b2cbe6752fbc27ed94fb', name: '高祥排休系統' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getTaiwanDateStr(offsetDays = 0) {
  const ms = Date.now() + (8 * 60 + offsetDays * 24 * 60) * 60 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDow(dateStr) {
  return new Date(dateStr + 'T00:00:00+08:00').getDay();
}

function isOff(dateStr, holidays) {
  return getDow(dateStr) === 0 || holidays.includes(dateStr);
}

async function fetchAll(db, appId, colName) {
  const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildMessage(system, todayStr, tomorrowStr, todayRecs, tomorrowRecs, staffMap, typeMap, holidays) {
  const todayDow  = WEEKDAYS[getDow(todayStr)];
  const tomorrowDow = WEEKDAYS[getDow(tomorrowStr)];
  const todayLabel    = `${todayStr.replace(/-/g, '/')}（${todayDow}）`;
  const tomorrowLabel = `${tomorrowStr.replace(/-/g, '/')}（${tomorrowDow}）`;

  const fmt = (recs) => recs.map(r => {
    const name = staffMap[r.staffId]?.name || '未知';
    const type = typeMap[r.typeId]?.name || '未知';
    const unit = typeMap[r.typeId]?.unit || 'day';
    if (type === '排休') return `• ${name}（排休）`;
    return `• ${name}（${type}-${r.amount}${unit === 'hour' ? 'h' : '天'}）`;
  }).join('\n');

  let msg = `📅 ${todayLabel} ${system.name}\n`;
  msg += `${'─'.repeat(20)}\n`;

  if (todayRecs.length === 0) {
    msg += `🏖 今日休假：無\n`;
  } else {
    msg += `🏖 今日休假（${todayRecs.length}人）\n${fmt(todayRecs)}\n`;
  }

  if (!isOff(tomorrowStr, holidays)) {
    msg += `\n📋 明日預計休假 ${tomorrowLabel}\n`;
    if (tomorrowRecs.length === 0) {
      msg += `• 無`;
    } else {
      msg += fmt(tomorrowRecs);
    }
  }

  return msg;
}

async function pushLine(groupId, text) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${await res.text()}`);
}

async function main() {
  const app = initializeApp(FIREBASE_CONFIG);
  const db  = getFirestore(app);
  await signInAnonymously(getAuth(app));

  const today    = getTaiwanDateStr(0);
  const tomorrow = getTaiwanDateStr(1);
  console.log(`台北時間 今天：${today} 明天：${tomorrow}`);

  for (const sys of SYSTEMS) {
    try {
      const [staff, types, holidays, records] = await Promise.all([
        fetchAll(db, sys.appId, 'staff'),
        fetchAll(db, sys.appId, 'leaveTypes'),
        fetchAll(db, sys.appId, 'holidays'),
        fetchAll(db, sys.appId, 'records'),
      ]);

      const holidayDates = holidays.map(h => h.date);

      // 今天是週日或國定假日 → 不發
      if (isOff(today, holidayDates)) {
        console.log(`[${sys.name}] 今日放假，略過`);
        continue;
      }

      const staffMap = Object.fromEntries(staff.map(s => [s.id, s]));
      const typeMap  = Object.fromEntries(types.map(t => [t.id, t]));

      const todayRecs    = records.filter(r => r.date === today    && r.status === 'normal');
      const tomorrowRecs = records.filter(r => r.date === tomorrow && r.status === 'normal');

      const msg = buildMessage(sys, today, tomorrow, todayRecs, tomorrowRecs, staffMap, typeMap, holidayDates);
      console.log(`\n[${sys.name}]\n${msg}\n`);

      await pushLine(sys.groupId, msg);
      console.log(`[${sys.name}] ✓ 發送成功`);
    } catch (e) {
      console.error(`[${sys.name}] ❌ ${e.message}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
