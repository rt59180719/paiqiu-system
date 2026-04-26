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

// ── 春節生肖問候（12 生肖 × 除夕/初一/初二/初三） ──────────────────────
const ZODIAC = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];

function getZodiac(year) {
  return ZODIAC[(year - 1900) % 12];
}

const SPRING_GREETINGS = {
  鼠: [
    { day: '除夕', emoji: '🐭', msg: '鼠年年關將近，機靈如鼠迎好運！\n感謝這一年大家的努力，圍爐守歲，闔家幸福！' },
    { day: '初一', emoji: '🐭', msg: '鼠年初一，左手招財右手旺！\n開門大吉，新年行好運，財源滾滾來！' },
    { day: '初二', emoji: '🐭', msg: '鼠年初二，財神爺登門拜訪！\n走春愉快，招財進寶，好運連連！' },
    { day: '初三', emoji: '🐭', msg: '鼠年初三，靜心養神蓄積能量！\n好好充電，迎接鼠年每一個精彩！' },
  ],
  牛: [
    { day: '除夕', emoji: '🐮', msg: '辭舊迎新，牛年帶著豐收的果實到來！\n圍爐守歲，感謝這一年大家的耕耘與付出！' },
    { day: '初一', emoji: '🐮', msg: '牛年初一，牛氣沖天！\n踏實穩健，開門大吉，步步高升！' },
    { day: '初二', emoji: '🐮', msg: '牛年初二，走春愉快！\n如牛般勤奮積累，今年一切順心如意！' },
    { day: '初三', emoji: '🐮', msg: '牛年初三，勤懇如牛心想事成！\n養精蓄銳，迎接牛年滿滿的收穫！' },
  ],
  虎: [
    { day: '除夕', emoji: '🐯', msg: '虎年蓄勢待發，虎虎生威迎新年！\n歲末圍爐，感恩這一年，新的一年勇往直前！' },
    { day: '初一', emoji: '🐯', msg: '虎年初一，虎嘯山林氣勢如虹！\n一虎當先，開運大吉，新的一年大展鴻圖！' },
    { day: '初二', emoji: '🐯', msg: '虎年初二，如虎添翼事業騰飛！\n走春愉快，好事連連，精神抖擻！' },
    { day: '初三', emoji: '🐯', msg: '虎年初三，生龍活虎精神百倍！\n養足虎氣，迎接虎年每一個挑戰！' },
  ],
  兔: [
    { day: '除夕', emoji: '🐰', msg: '兔年即將到來，玉兔呈祥！\n歲末感恩，輕盈踏入兔飛猛進的新一年！' },
    { day: '初一', emoji: '🐰', msg: '兔年初一，兔飛猛進開運大吉！\n新的一年萬事如意，好運跟著你跑！' },
    { day: '初二', emoji: '🐰', msg: '兔年初二，靈兔旺旺好運連連！\n走春愉快，財氣旺旺，幸福滿滿！' },
    { day: '初三', emoji: '🐰', msg: '兔年初三，養足精神大展拳腳！\n充飽電力，兔年每一天都精彩！' },
  ],
  龍: [
    { day: '除夕', emoji: '🐲', msg: '龍年即將騰飛，龍騰四海！\n歲末辭舊，感謝這一年的努力，展翅迎接龍年！' },
    { day: '初一', emoji: '🐲', msg: '龍年初一，龍馬精神開運大吉！\n龍年行大運，新的一年旗開得勝！' },
    { day: '初二', emoji: '🐲', msg: '龍年初二，龍騰盛世財源廣進！\n走春愉快，龍年好事一件接一件！' },
    { day: '初三', emoji: '🐲', msg: '龍年初三，龍飛鳳舞步步高升！\n氣勢如龍，迎接龍年每一個精彩！' },
  ],
  蛇: [
    { day: '除夕', emoji: '🐍', msg: '蛇年靜謀深算，好運悄悄靠近！\n圍爐守歲，迎接充滿智慧的蛇年！' },
    { day: '初一', emoji: '🐍', msg: '蛇年初一，靈蛇納福開門大吉！\n智慧與財富一起來，新年行好運！' },
    { day: '初二', emoji: '🐍', msg: '蛇年初二，蛇年行大運！\n走春愉快，心想事成，好事連連！' },
    { day: '初三', emoji: '🐍', msg: '蛇年初三，福蛇降臨財運亨通！\n充飽能量，蛇年步步高升！' },
  ],
  馬: [
    { day: '除夕', emoji: '🐴', msg: '馬年即將策馬奔騰！\n感謝大家這一年的辛勞，一起圍爐守歲闔家圓！' },
    { day: '初一', emoji: '🐴', msg: '馬年初一，馬到成功一馬當先！\n開門大吉，新的一年旗開得勝！' },
    { day: '初二', emoji: '🐴', msg: '馬年初二，龍馬精神走春去！\n金馬獻瑞，好事一件接一件，走春愉快！' },
    { day: '初三', emoji: '🐴', msg: '馬年初三，金馬迎春萬象新！\n好好休息充電，帶著滿滿好運迎接新的一年！' },
  ],
  羊: [
    { day: '除夕', emoji: '🐑', msg: '三羊開泰，羊年吉祥好運到！\n歲末圍爐，感恩這一年，迎接喜氣洋洋的羊年！' },
    { day: '初一', emoji: '🐑', msg: '羊年初一，三羊開泰萬事亨通！\n開門大吉，新的一年喜氣洋洋！' },
    { day: '初二', emoji: '🐑', msg: '羊年初二，吉羊獻瑞財源廣進！\n走春愉快，羊年好運綿綿！' },
    { day: '初三', emoji: '🐑', msg: '羊年初三，喜氣洋洋心想事成！\n充飽電，羊年行大運！' },
  ],
  猴: [
    { day: '除夕', emoji: '🐒', msg: '靈猴年即將登場，機靈好運滾滾來！\n圍爐守歲，迎接活力滿滿的猴年！' },
    { day: '初一', emoji: '🐒', msg: '猴年初一，馬上封侯靈猴賀歲！\n開運大吉，猴年機靈行好運！' },
    { day: '初二', emoji: '🐒', msg: '猴年初二，靈猴送福財運亨通！\n走春愉快，好運連連笑開懷！' },
    { day: '初三', emoji: '🐒', msg: '猴年初三，猴年行大運心想事成！\n機靈如猴，迎接新的一年每個挑戰！' },
  ],
  雞: [
    { day: '除夕', emoji: '🐓', msg: '金雞即將引吭報曉，好運當頭！\n歲末感恩，迎接雄雞高唱的嶄新一年！' },
    { day: '初一', emoji: '🐓', msg: '雞年初一，金雞報喜開門大吉！\n雄雞一唱天下白，新年諸事順利！' },
    { day: '初二', emoji: '🐓', msg: '雞年初二，雄雞高唱步步高升！\n走春愉快，雞年好事接連而來！' },
    { day: '初三', emoji: '🐓', msg: '雞年初三，金雞納福萬事如意！\n養足精氣神，雞年大展身手！' },
  ],
  狗: [
    { day: '除夕', emoji: '🐶', msg: '旺旺旺！狗年帶著忠誠好運叩門！\n圍爐守歲，迎接忠犬旺旺的幸福新年！' },
    { day: '初一', emoji: '🐶', msg: '狗年初一，旺旺旺開運大吉！\n忠誠旺運，新的一年好事連連！' },
    { day: '初二', emoji: '🐶', msg: '狗年初二，狗年行大運財源廣進！\n走春愉快，旺旺旺旺旺！' },
    { day: '初三', emoji: '🐶', msg: '狗年初三，忠犬護運心想事成！\n充飽電，新的一年旺旺旺！' },
  ],
  豬: [
    { day: '除夕', emoji: '🐷', msg: '豬年諸事順利，大吉大利！\n圍爐守歲，迎接財運滾滾的豬年！' },
    { day: '初一', emoji: '🐷', msg: '豬年初一，諸事大吉開門大利！\n豬事順利，新年旺旺旺！' },
    { day: '初二', emoji: '🐷', msg: '豬年初二，諸事如意財源廣進！\n走春愉快，豬年福氣年年到！' },
    { day: '初三', emoji: '🐷', msg: '豬年初三，金豬旺財步步高升！\n養精蓄銳，豬年行大運！' },
  ],
};

// ── 其他國定假日問候 ──────────────────────────────────────────────────────
const HOLIDAY_GREETINGS = [
  { keywords: ['元旦', '開國'],   emoji: '🎊', msg: '新年快樂！新的一年從放假開始\n祝大家萬事如意、鴻圖大展！' },
  { keywords: ['和平', '二二八'], emoji: '🕊️', msg: '今天是和平紀念日\n珍惜得來不易的和平，好好休假充電！' },
  { keywords: ['兒童'],           emoji: '🎈', msg: '今天是兒童節放假！童心未泯最快樂～\n祝大家玩得盡興、無憂無慮！' },
  { keywords: ['清明'],           emoji: '🌿', msg: '今天是清明節\n慎終追遠、感念親恩，也記得好好休息！' },
  { keywords: ['勞動'],           emoji: '🎉', msg: '今天是五一勞動節放假啦～\n感謝大家平日的辛勤付出，好好充電享受假期！' },
  { keywords: ['端午'],           emoji: '🐉', msg: '今天是端午節放假！\n記得吃粽子、看龍舟，祝健康平安、百毒不侵！' },
  { keywords: ['中秋'],           emoji: '🌕', msg: '今天是中秋節放假！\n月圓人團圓，烤肉、賞月、吃月餅，一樣都不能少～' },
  { keywords: ['國慶', '雙十'],   emoji: '🇹🇼', msg: '今天是中華民國國慶日！\n生日快樂，台灣！祝大家假期平安愉快！' },
  { keywords: ['教師'],           emoji: '☀️', msg: '今天放假，難得清閒的一天！\n好好放鬆充電，享受屬於自己的時光！' },
  { keywords: ['光復'],           emoji: '✨', msg: '今天是台灣光復節假期\n感謝歷史的洪流帶來今日，好好休假！' },
  { keywords: ['行憲'],           emoji: '🎄', msg: '今天是行憲紀念日，也是聖誕節！\nMerry Christmas！祝大家假期歡樂！' },
];

function getSpringGreeting(holiday, allHolidays) {
  const year = parseInt(holiday.date.split('-')[0]);
  const zodiac = getZodiac(year);
  const set = SPRING_GREETINGS[zodiac];

  if (holiday.name.includes('除夕')) {
    const g = set.find(g => g.day === '除夕');
    return `${g.emoji} 【${zodiac}年除夕】闔家圍爐囉！\n${'─'.repeat(20)}\n${g.msg}\n\n祝大家年夜飯吃好吃滿 🙌`;
  }

  // 找出今天是春節第幾天（初一、初二、初三）
  const springDates = allHolidays
    .filter(h => h.name === '春節')
    .map(h => h.date)
    .sort();
  const idx = springDates.indexOf(holiday.date);
  const dayNames = ['初一', '初二', '初三'];

  // 初四以後不發訊息
  if (idx >= dayNames.length) return null;

  const dayLabel = dayNames[idx];
  const g = set.find(g => g.day === dayLabel);
  return `${g.emoji} 【${zodiac}年${dayLabel}】新春快樂！\n${'─'.repeat(20)}\n${g.msg}\n\n祝大家休假愉快 🙌`;
}

function getHolidayGreeting(holiday, allHolidays, tomorrow) {
  const name = holiday.name;

  if (name.includes('除夕') || name.includes('春節')) {
    return getSpringGreeting(holiday, allHolidays);
  }

  const matched = HOLIDAY_GREETINGS.find(g => g.keywords.some(k => name.includes(k)));
  const emoji  = matched?.emoji || '🎌';
  const detail = matched?.msg   || '好好放假充電吧！';

  let msg = `${emoji} 今天是【${name}】假期\n${'─'.repeat(20)}\n${detail}`;

  // 若明日是補假，加上提醒
  const tomorrowHoliday = allHolidays.find(h => h.date === tomorrow);
  if (tomorrowHoliday?.name.includes('補假')) {
    msg += `\n\n📌 明日（${tomorrow.replace(/-/g, '/')}）是【${tomorrowHoliday.name}】\n祝各位放假愉快 🎉`;
  } else {
    msg += `\n\n祝大家休假愉快 🙌`;
  }

  return msg;
}

// ── 工具函式 ──────────────────────────────────────────────────────────────
function getTaiwanDateStr(offsetDays = 0) {
  const ms = Date.now() + (8 * 60 + offsetDays * 24 * 60) * 60 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isOff(dateStr, holidayDates) {
  return getDow(dateStr) === 0 || holidayDates.includes(dateStr);
}

async function fetchAll(db, appId, colName) {
  const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildMessage(system, todayStr, tomorrowStr, todayRecs, tomorrowRecs, staffMap, typeMap, holidayDates) {
  const todayDow    = WEEKDAYS[getDow(todayStr)];
  const tomorrowDow = WEEKDAYS[getDow(tomorrowStr)];
  const todayLabel    = `${todayStr.replace(/-/g, '/')}（${todayDow}）`;
  const tomorrowLabel = `${tomorrowStr.replace(/-/g, '/')}（${tomorrowDow}）`;

  const fmt = (recs) => recs.map(r => {
    const name = staffMap[r.staffId]?.name || '未知';
    const type = typeMap[r.typeId]?.name   || '未知';
    const unit = typeMap[r.typeId]?.unit   || 'day';
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

  if (!isOff(tomorrowStr, holidayDates)) {
    msg += `\n📋 明日預計休假 ${tomorrowLabel}\n`;
    msg += tomorrowRecs.length === 0 ? '• 無' : fmt(tomorrowRecs);
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

// ── 主程式 ────────────────────────────────────────────────────────────────
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
      const todayHoliday = holidays.find(h => h.date === today);

      // 週日且非國定假日 → 跳過
      if (getDow(today) === 0 && !todayHoliday) {
        console.log(`[${sys.name}] 今日週日，略過`);
        continue;
      }

      // 補假日 → 跳過（正日已發過問候）
      if (todayHoliday?.name.includes('補假')) {
        console.log(`[${sys.name}] 補假日，略過`);
        continue;
      }

      // 國定假日 → 發節日問候（春節初四以後回傳 null 則跳過）
      if (todayHoliday) {
        const msg = getHolidayGreeting(todayHoliday, holidays, tomorrow);
        if (!msg) {
          console.log(`[${sys.name}] 春節假期（初四以後），略過`);
          continue;
        }
        console.log(`\n[${sys.name}] 國定假日：${todayHoliday.name}\n${msg}\n`);
        await pushLine(sys.groupId, msg);
        console.log(`[${sys.name}] ✓ 節日問候發送成功`);
        continue;
      }

      // 一般工作日 → 發排休通知
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
