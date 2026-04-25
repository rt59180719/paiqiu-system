import React, { useState, useEffect, useMemo } from "react";
import {
  Car,
  Megaphone,
  Settings,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Download,
  AlertTriangle,
  Upload,
  CheckCircle2,
  Info,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

// --- Firebase Initialization ---
// 這裡加入環境判斷：如果在 Canvas 預覽視窗，使用系統提供的設定；如果在 CodeSandbox，則使用您的專屬鑰匙
const fallbackConfig = {
  apiKey: "AIzaSyAgUAnkodvvZlHP1VA9s4_F9RA6kcB7IqM",
  authDomain: "w9001-holiday.firebaseapp.com",
  projectId: "w9001-holiday",
  storageBucket: "w9001-holiday.firebasestorage.app",
  messagingSenderId: "266789436311",
  appId: "1:266789436311:web:526dac36bd98ae75cba2d2",
  measurementId: "G-0YTBRV42P1",
};

const firebaseConfig =
  typeof __firebase_config !== "undefined" && __firebase_config
    ? JSON.parse(__firebase_config)
    : fallbackConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId =
  typeof __app_id !== "undefined" && __app_id ? __app_id : "w9001-holiday";

// --- Constants ---
const YEAR = 2026;
// 標籤顏色：加入藍色與紫色
const COLORS = [
  "#FCA5A5",
  "#FCD34D",
  "#86EFAC",
  "#6EE7B7",
  "#67E8F9",
  "#7DD3FC",
  "#93C5FD",
  "#3B82F6",
  "#C4B5FD",
  "#A855F7",
  "#D8B4FE",
  "#F9A8D4",
];
// 設定假別顯示的強制順序
const LEAVE_ORDER = [
  "排休",
  "特休",
  "公假",
  "事假",
  "病假",
  "婚假",
  "生理假",
  "產假",
  "產檢假",
  "喪假",
  "補休",
];
const DEFAULT_LEAVE_TYPES = [
  { name: "排休", unit: "day" },
  { name: "特休", unit: "hour" },
  { name: "公假", unit: "hour" },
  { name: "事假", unit: "hour" },
  { name: "病假", unit: "hour" },
  { name: "婚假", unit: "day" },
  { name: "生理假", unit: "day" },
  { name: "產假", unit: "day" },
  { name: "產檢假", unit: "day" },
  { name: "喪假", unit: "day" },
  { name: "補休", unit: "hour" },
];

export default function App() {
  // --- Auth & Admin State ---
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPwd, setLoginPwd] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [globalError, setGlobalError] = useState(""); // 新增全域錯誤狀態

  // --- Global Data State ---
  const [staffList, setStaffList] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState({
    announcement: "📢 系統公告：請於每月25號前完成隔月排休",
    lockedMonths: [],
  });

  // --- UI State ---
  const [currentMonth, setCurrentMonth] = useState(() => {
    const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return tw.getUTCMonth() + 1;
  });
  const [loading, setLoading] = useState(true);

  // --- Auth Effect ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error:", e);
        setGlobalError(`登入驗證失敗 (${e.code}): ${e.message}`);
        setLoading(false); // 停止轉圈圈，顯示錯誤
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!user) return;

    const paths = {
      staff: collection(db, "artifacts", appId, "public", "data", "staff"),
      types: collection(db, "artifacts", appId, "public", "data", "leaveTypes"),
      hols: collection(db, "artifacts", appId, "public", "data", "holidays"),
      recs: collection(db, "artifacts", appId, "public", "data", "records"),
      sets: collection(db, "artifacts", appId, "public", "data", "settings"),
    };

    let unsubscribes = [];

    const setupListener = (colRef, setter, isSingleDoc = false) => {
      return onSnapshot(
        colRef,
        (snapshot) => {
          if (isSingleDoc) {
            const mainDoc = snapshot.docs.find((d) => d.id === "main");
            if (mainDoc) setter(mainDoc.data());
            else initSettings();
          } else {
            setter(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          }
        },
        (err) => {
          console.error("DB Error:", err);
          setGlobalError(
            `資料庫連線失敗: ${err.message} (請確認是否以「測試模式」建立資料庫)`
          );
          setLoading(false); // 停止轉圈圈
        }
      );
    };

    unsubscribes.push(setupListener(paths.staff, setStaffList));
    unsubscribes.push(
      setupListener(paths.types, (data) => {
        const sortedData = [...data].sort((a, b) => {
          let idxA = LEAVE_ORDER.indexOf(a.name);
          let idxB = LEAVE_ORDER.indexOf(b.name);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
        });
        setLeaveTypes(sortedData);
        if (sortedData.length === 0) initDefaultLeaveTypes();
      })
    );
    unsubscribes.push(setupListener(paths.hols, setHolidays));
    unsubscribes.push(setupListener(paths.recs, setRecords));
    unsubscribes.push(setupListener(paths.sets, setSettings, true));

    setLoading(false);
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [user]);

  // --- Initialization Helpers ---
  const initDefaultLeaveTypes = async () => {
    DEFAULT_LEAVE_TYPES.forEach(async (type) => {
      const newRef = doc(
        collection(db, "artifacts", appId, "public", "data", "leaveTypes")
      );
      await setDoc(newRef, type);
    });
  };
  const initSettings = async () => {
    const ref = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "settings",
      "main"
    );
    await setDoc(ref, {
      announcement: "📢 系統公告：請於每月25號前完成隔月排休",
      lockedMonths: [],
    });
  };

  // --- Admin Logic ---
  const handleLogin = () => {
    if (loginPwd === "743") {
      setIsAdmin(true);
      setShowLogin(false);
      setLoginPwd("");
      setLoginError("");
    } else {
      setLoginError("密碼錯誤！請重新輸入");
    }
  };
  const handleLogout = () => {
    setIsAdmin(false);
    setShowAdminPanel(false);
  };

  // 錯誤提示畫面
  if (globalError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border-t-8 border-red-500">
          <h2 className="text-2xl font-bold text-red-600 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-8 h-8" /> 系統連線發生錯誤
          </h2>
          <div className="bg-red-50 p-4 rounded-xl mb-6 border border-red-100 text-red-800 font-mono text-sm break-words">
            {globalError}
          </div>
          <div className="space-y-3 text-slate-700 font-medium">
            <p>這通常是以下兩個原因造成的，請確認設定：</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                您尚未在 Firebase 開啟{" "}
                <strong>
                  Authentication (驗證) &gt; Sign-in method &gt; 匿名
                </strong>{" "}
                功能。
              </li>
              <li>
                目前瀏覽器的網址尚未加入白名單。
                <br />
                請至 Firebase 點選{" "}
                <strong>
                  Authentication &gt; Settings (設定) &gt; Authorized domains
                  (授權網域)
                </strong>
                ，點擊「新增網域」，然後將您目前的網址（例如{" "}
                <span className="text-blue-600">xxx.csb.app</span>）加進去。
              </li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // 載入中轉圈圈畫面
  if (loading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-lg"></div>
        <p className="text-2xl font-bold text-slate-600 animate-pulse tracking-widest">
          系統連線中...
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
      {/* Top Bar */}
      <header className="bg-white shadow-sm border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Car className="text-blue-600 w-7 h-7" />
          <h1 className="text-xl font-bold text-slate-800">排休系統</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-full font-bold transition-all text-sm"
              >
                <Settings className="w-4 h-4" /> 管理中心
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-full font-bold transition-all text-sm"
              >
                <LogOut className="w-4 h-4" /> 退出
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-white px-5 py-2.5 rounded-full font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm border border-slate-600"
            >
              <Settings className="w-4 h-4 text-slate-300" />
              <span>進入後台</span>
            </button>
          )}
        </div>
      </header>

      {/* Announcement */}
      {settings.announcement && !showAdminPanel && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 m-4 rounded shadow-sm">
          <div className="flex gap-3">
            <Megaphone className="text-blue-500 flex-shrink-0 mt-1 w-5 h-5" />
            <pre className="whitespace-pre-wrap font-sans text-sm text-blue-900 leading-relaxed">
              {settings.announcement}
            </pre>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="p-4">
        {showAdminPanel && isAdmin ? (
          <AdminPanel
            staffList={staffList}
            leaveTypes={leaveTypes}
            holidays={holidays}
            records={records}
            settings={settings}
            appId={appId}
            db={db}
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3">
              <Calendar
                year={YEAR}
                month={currentMonth}
                setMonth={setCurrentMonth}
                staffList={staffList}
                leaveTypes={leaveTypes}
                holidays={holidays}
                records={records}
                lockedMonths={settings.lockedMonths || []}
                isAdmin={isAdmin}
                appId={appId}
                db={db}
              />
            </div>
            <div className="xl:col-span-1">
              <ApplicationForm
                staffList={staffList}
                leaveTypes={leaveTypes}
                records={records}
                holidays={holidays}
                isAdmin={isAdmin}
                lockedMonths={settings.lockedMonths || []}
                appId={appId}
                db={db}
              />
            </div>
          </div>
        )}
      </main>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm transform transition-all">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 border-b pb-3">
              <Lock className="w-6 h-6 text-blue-600" /> 管理員登入
            </h3>
            <input
              type="password"
              value={loginPwd}
              onChange={(e) => {
                setLoginPwd(e.target.value);
                setLoginError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full border-2 border-slate-200 p-3 rounded-xl mb-2 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-lg"
              placeholder="請輸入後台密碼"
              autoFocus
            />
            {loginError && (
              <p className="text-red-500 text-sm font-bold mb-4">
                {loginError}
              </p>
            )}
            {!loginError && <div className="mb-4"></div>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl transition-colors cursor-pointer block"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleLogin}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all cursor-pointer block"
              >
                登入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// FRONTEND: Calendar Component
// ==========================================
function Calendar({
  year,
  month,
  setMonth,
  staffList,
  leaveTypes,
  holidays,
  records,
  lockedMonths,
  isAdmin,
  appId,
  db,
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun, 6=Sat
  const isLocked = lockedMonths.includes(month);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const requestCancelLeave = (record) => {
    const recMonth = parseInt(record.date.split("-")[1], 10);
    if (!isAdmin && lockedMonths.includes(recMonth)) {
      setErrorMsg("該月份已鎖定，一般人員無法取消休假！");
      return;
    }
    setCancelTarget(record);
  };

  const confirmCancelLeave = async () => {
    if (!cancelTarget) return;
    try {
      await updateDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "records",
          cancelTarget.id
        ),
        {
          status: "cancelled",
        }
      );
      setCancelTarget(null);
    } catch (e) {
      setErrorMsg("取消失敗: " + e.message);
      setCancelTarget(null);
    }
  };

  const getStaffName = (id) =>
    staffList.find((s) => s.id === id)?.name || "未知";
  const getStaffNick = (id) =>
    staffList.find((s) => s.id === id)?.nickname || "未知";
  const getStaffColor = (id) =>
    staffList.find((s) => s.id === id)?.color || "#e2e8f0";
  const getTypeName = (id) =>
    leaveTypes.find((t) => t.id === id)?.name || "未知";
  const getTypeUnit = (id) =>
    leaveTypes.find((t) => t.id === id)?.unit || "day";

  // Generate Grid
  const grid = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);

  // 當有彈出視窗時，強制將整個日曆的層級拉高到最頂部，確保遮罩能百分之百蓋住所有元素
  const hasModalOpen = cancelTarget || errorMsg;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative transition-all ${
        hasModalOpen ? "z-[99999]" : "z-0"
      }`}
    >
      <div
        className={`p-4 flex items-center justify-between border-b ${
          isLocked ? "bg-amber-50" : "bg-white"
        }`}
      >
        <button
          onClick={() => setMonth((m) => m - 1)}
          className={`btn-icon ${
            month === 1 ? "invisible" : "hover:bg-slate-100"
          }`}
        >
          <ChevronLeft /> 上個月
        </button>
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {year} 年 {month} 月
            {isLocked && (
              <span className="bg-amber-200 text-amber-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> 已鎖定
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={() => setMonth((m) => m + 1)}
          className={`btn-icon ${
            month === 12 ? "invisible" : "hover:bg-slate-100"
          }`}
        >
          下個月 <ChevronRight />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
          <div
            key={d}
            className={`p-2 text-center font-bold text-sm ${
              i === 0 || i === 6 ? "text-red-500" : "text-slate-600"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[120px]">
        {grid.map((day, idx) => {
          if (!day)
            return (
              <div
                key={idx}
                className="border-r border-b border-slate-100 bg-slate-50/50"
              ></div>
            );

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
            day
          ).padStart(2, "0")}`;
          const isSunday = idx % 7 === 0;
          const isSaturday = idx % 7 === 6;
          const holiday = holidays.find((h) => h.date === dateStr);

          const dayRecords = records.filter(
            (r) => r.date === dateStr && r.status === "normal"
          );

          let cellClass =
            "border-r border-b border-slate-200 relative p-1 overflow-hidden group hover:bg-slate-50 transition-colors";
          if (isSunday) cellClass += " bg-slate-100";
          if (holiday) cellClass += " bg-red-50";

          return (
            <div key={idx} className={cellClass}>
              {/* Background Date Number (1/4 size visually, semi-transparent) - Hidden on Mobile */}
              <div className="hidden md:flex absolute inset-0 items-center justify-center text-[5rem] font-bold text-slate-300 opacity-20 pointer-events-none select-none z-0">
                {day}
              </div>

              {/* Foreground Content */}
              <div className="relative z-10 h-full flex flex-col">
                <div className="flex justify-between items-start mb-1">
                  <span
                    className={`font-bold text-sm ${
                      isSaturday || isSunday || holiday
                        ? "text-red-600"
                        : "text-slate-700"
                    }`}
                  >
                    {day}
                  </span>
                </div>

                {isSunday && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none pt-4">
                    <span className="text-4xl md:text-5xl font-black text-slate-300 tracking-wider transform -rotate-12 opacity-60">
                      休假
                    </span>
                  </div>
                )}

                {holiday && !isSunday && (
                  <div className="bg-red-600 text-white text-xs font-bold w-full text-center py-0.5 rounded shadow-sm mb-1 z-20">
                    {holiday.name}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {!isSunday &&
                    dayRecords.map((rec) => {
                      const typeName = getTypeName(rec.typeId);
                      const unit = getTypeUnit(rec.typeId);
                      const isPaiXiu = typeName === "排休";

                      // Desktop format: 王小明(特休-4h) or 王小明(排休)
                      const displayStrDesktop = isPaiXiu
                        ? `${getStaffName(rec.staffId)}(排休)`
                        : `${getStaffName(rec.staffId)}(${typeName}-${
                            rec.amount
                          }${unit === "hour" ? "h" : "d"})`;

                      // Mobile format: 暱稱(假別) e.g., 小明(特休)
                      const displayStrMobile = `${getStaffNick(
                        rec.staffId
                      )}(${typeName})`;

                      return (
                        <div
                          key={rec.id}
                          onClick={() => requestCancelLeave(rec)}
                          className="text-[11px] leading-tight px-1.5 py-1 rounded shadow-sm cursor-pointer hover:opacity-80 transition-opacity truncate border border-black/5"
                          style={{
                            backgroundColor: getStaffColor(rec.staffId),
                          }}
                          title="點擊取消休假"
                        >
                          <span className="hidden md:inline text-black/80 font-medium">
                            {displayStrDesktop}
                          </span>
                          <span className="md:hidden text-black/80 font-medium">
                            {displayStrMobile}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel Confirmation Modal (重度毛玻璃模糊遮罩 + 超大點擊按鈕) */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm border-t-8 border-red-500">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600 border-b pb-3">
              <AlertTriangle className="w-6 h-6" /> 確認取消休假
            </h3>
            <p className="mb-8 text-slate-700 text-lg">
              確定要取消 <strong>{getStaffName(cancelTarget.staffId)}</strong>{" "}
              在 <br />
              <span className="text-xl font-bold block mt-2 px-3 py-2 bg-slate-100 rounded text-center">
                {cancelTarget.date}
              </span>{" "}
              的休假嗎？
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="flex-1 flex items-center justify-center w-full py-8 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-xl cursor-pointer"
              >
                保留不取消
              </button>
              <button
                type="button"
                onClick={confirmCancelLeave}
                className="flex-1 flex items-center justify-center w-full py-8 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold shadow-lg transition-all text-xl cursor-pointer"
              >
                確定取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal for Calendar (重度毛玻璃模糊遮罩 + 超大點擊按鈕) */}
      {errorMsg && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm border-t-8 border-red-500">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-6 h-6" /> 系統提示
            </h3>
            <p className="mb-6 text-slate-700 font-medium text-lg">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="flex items-center justify-center w-full py-8 bg-slate-200 text-slate-800 font-bold rounded-xl hover:bg-slate-300 text-xl cursor-pointer transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// FRONTEND: Application Form
// ==========================================
function ApplicationForm({
  staffList,
  leaveTypes,
  records,
  holidays,
  isAdmin,
  lockedMonths,
  appId,
  db,
}) {
  const [staffId, setStaffId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 過濾掉離職日已經過去的人員 (若有設定離職日，且離職日小於今天，則不顯示)
  const availableStaffForDropdown = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return staffList.filter(
      (s) => !s.resignationDate || s.resignationDate >= todayStr
    );
  }, [staffList]);

  // Available types logic based on quota
  const availableTypes = useMemo(() => {
    if (!staffId) return [];
    const staff = staffList.find((s) => s.id === staffId);
    if (!staff) return [];

    return leaveTypes.filter((type) => {
      if (isAdmin) return true; // Admin ignores quotas
      const quota = staff.quotas?.[type.id] || 0;
      const used = records
        .filter(
          (r) =>
            r.staffId === staffId &&
            r.typeId === type.id &&
            r.status === "normal"
        )
        .reduce((sum, r) => sum + Number(r.amount), 0);
      return quota - used > 0;
    });
  }, [staffId, leaveTypes, staffList, records, isAdmin]);

  const handleStartDateChange = (e) => {
    const val = e.target.value;
    setStartDate(val);
    if (!endDate || val > endDate) setEndDate(val);
  };

  const getDayOfWeek = (dateStr) => new Date(dateStr).getDay();
  const getWeekNumber = (dateStr) => {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!staffId || !typeId || !startDate || !endDate) {
      setConflictError("請填寫完整資訊");
      return;
    }

    setIsSubmitting(true);
    try {
      const staff = staffList.find((s) => s.id === staffId);
      const selType = leaveTypes.find((t) => t.id === typeId);
      const isPaiXiu = selType.name === "排休";
      const dailyAmount = isPaiXiu ? 1 : Number(hoursPerDay);

      let current = new Date(startDate);
      const end = new Date(endDate);
      const datesToApply = [];

      while (current <= end) {
        const dStr = current.toISOString().split("T")[0];
        const dayOfW = current.getDay();
        const isSun = dayOfW === 0;
        const isHol = holidays.some((h) => h.date === dStr);

        if (!isSun && !isHol) {
          datesToApply.push(dStr);
        }
        current.setDate(current.getDate() + 1);
      }

      if (datesToApply.length === 0)
        throw new Error("所選區間皆為假日，無須請假");

      if (!isAdmin) {
        let totalNeeded = datesToApply.length * dailyAmount;
        const currentQuota = staff.quotas?.[typeId] || 0;
        const currentUsed = records
          .filter(
            (r) =>
              r.staffId === staffId &&
              r.typeId === typeId &&
              r.status === "normal"
          )
          .reduce((sum, r) => sum + Number(r.amount), 0);

        if (currentQuota - currentUsed < totalNeeded) {
          throw new Error(
            `額度不足！此假別剩餘額度: ${
              currentQuota - currentUsed
            }，但本次需扣除: ${totalNeeded}`
          );
        }

        for (const dStr of datesToApply) {
          const month = parseInt(dStr.split("-")[1], 10);

          if (lockedMonths.includes(month))
            throw new Error(`${month}月已被管理員鎖定，無法新增休假`);
          if (staff.resignationDate && dStr >= staff.resignationDate)
            throw new Error(`日期 ${dStr} 已超過或等於您的離職日`);

          const exist = records.find(
            (r) =>
              r.staffId === staffId && r.date === dStr && r.status === "normal"
          );
          if (exist) throw new Error(`日期 ${dStr} 您已經有排過假了`);

          if (staff.agentId) {
            const agentLeave = records.find(
              (r) =>
                r.staffId === staff.agentId &&
                r.date === dStr &&
                r.status === "normal"
            );
            if (agentLeave)
              throw new Error(
                `日期 ${dStr} 您的代理人已休假，兩人不可同日休假`
              );
          }

          if (isPaiXiu) {
            if (staff.group) {
              const groupMates = staffList
                .filter((s) => s.group === staff.group && s.id !== staffId)
                .map((s) => s.id);
              const groupLeaves = records.filter(
                (r) =>
                  r.date === dStr &&
                  r.status === "normal" &&
                  groupMates.includes(r.staffId) &&
                  leaveTypes.find((t) => t.id === r.typeId)?.name === "排休"
              );
              if (groupLeaves.length > 0)
                throw new Error(`日期 ${dStr} 同組已有其他人排休`);
            }

            const weekNum = getWeekNumber(dStr);
            const existingInWeek = records.filter((r) => {
              if (r.staffId !== staffId || r.status !== "normal") return false;
              const rTypeName = leaveTypes.find((t) => t.id === r.typeId)?.name;
              if (rTypeName !== "排休") return false;
              return getWeekNumber(r.date) === weekNum;
            });
            const batchInWeek = datesToApply.filter(
              (d) => getWeekNumber(d) === weekNum && d < dStr
            );
            if (existingInWeek.length + batchInWeek.length >= 1) {
              throw new Error(`日期 ${dStr} 違反每週限排休 1 天之規則`);
            }

            const isSat = getDayOfWeek(dStr) === 6;
            if (isSat) {
              const satExisting = records.filter((r) => {
                if (r.staffId !== staffId || r.status !== "normal")
                  return false;
                if (leaveTypes.find((t) => t.id === r.typeId)?.name !== "排休")
                  return false;
                return (
                  getDayOfWeek(r.date) === 6 &&
                  parseInt(r.date.split("-")[1], 10) === month
                );
              });
              const batchSat = datesToApply.filter(
                (d) =>
                  getDayOfWeek(d) === 6 &&
                  parseInt(d.split("-")[1], 10) === month &&
                  d < dStr
              );
              if (satExisting.length + batchSat.length >= 1) {
                throw new Error(
                  `${month}月您已排過星期六，每月僅限 1 次週六排休`
                );
              }
            }
          }
        }
      }

      for (const dStr of datesToApply) {
        const newRef = doc(
          collection(db, "artifacts", appId, "public", "data", "records")
        );
        await setDoc(newRef, {
          staffId,
          date: dStr,
          typeId,
          amount: dailyAmount,
          status: "normal",
          createdAt: new Date().toISOString(),
        });
      }

      setSuccessMsg(`成功申請了 ${datesToApply.length} 天假！`);
      setStartDate("");
      setEndDate("");
      setTypeId("");
    } catch (err) {
      setConflictError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selTypeObj = leaveTypes.find((t) => t.id === typeId);

  // 當有彈出視窗時，強制將整個表單的層級拉高到最頂部，確保遮罩能百分之百蓋住日曆
  const hasModalOpen = conflictError || successMsg;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 sticky top-20 transition-all ${
        hasModalOpen ? "z-[99999]" : "z-10"
      }`}
    >
      <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2 text-slate-800">
        <Plus className="w-5 h-5" /> 新增休假
      </h3>
      {isAdmin && (
        <div className="mb-4 bg-red-100 text-red-700 text-xs p-2 rounded font-bold">
          目前為無敵模式，不受規則限制
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            選擇人員
          </label>
          <select
            required
            className="w-full border border-slate-300 rounded p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500"
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              setTypeId("");
            }}
          >
            <option value="">-- 請選擇 --</option>
            {/* 隱藏離職日已過的人員 */}
            {availableStaffForDropdown.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.group})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            假別
          </label>
          <select
            required
            className="w-full border border-slate-300 rounded p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={!staffId}
          >
            <option value="">-- 請選擇 --</option>
            {availableTypes.map((t) => {
              const quota =
                staffList.find((s) => s.id === staffId)?.quotas?.[t.id] || 0;
              const used = records
                .filter(
                  (r) =>
                    r.staffId === staffId &&
                    r.typeId === t.id &&
                    r.status === "normal"
                )
                .reduce((sum, r) => sum + Number(r.amount), 0);
              const remain = isAdmin ? "無限制" : quota - used;
              return (
                <option key={t.id} value={t.id}>
                  {t.name} (剩餘: {remain} {t.unit === "hour" ? "小時" : "天"})
                </option>
              );
            })}
          </select>
          {!isAdmin && staffId && availableTypes.length === 0 && (
            <p className="text-xs text-red-500 mt-1">目前無可用額度之假別</p>
          )}
        </div>

        {selTypeObj && selTypeObj.name !== "排休" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              每日請假時數 (最小1)
            </label>
            <input
              type="number"
              min="1"
              max="24"
              required
              className="w-full border border-slate-300 rounded p-2 bg-slate-50"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              起始日
            </label>
            <input
              type="date"
              required
              min={`${YEAR}-01-01`}
              max={`${YEAR}-12-31`}
              className="w-full border border-slate-300 rounded p-2 bg-slate-50"
              value={startDate}
              onChange={handleStartDateChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              截止日
            </label>
            <input
              type="date"
              required
              min={startDate || `${YEAR}-01-01`}
              max={`${YEAR}-12-31`}
              className="w-full border border-slate-300 rounded p-2 bg-slate-50"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 italic">
          系統將自動略過週日與國定假日
        </p>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded transition-colors disabled:opacity-50 text-lg"
        >
          {isSubmitting ? "處理中..." : "送出申請"}
        </button>
      </form>

      {/* 🔴 Fullscreen Dark Modal for Conflicts (重度毛玻璃模糊遮罩 + 超大點擊按鈕) */}
      {conflictError && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center border-t-8 border-red-500">
            <AlertTriangle className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black mb-4 text-slate-800 tracking-wider">
              拒絕申請
            </h3>
            <p className="mb-8 text-red-600 text-lg leading-relaxed font-bold bg-red-50 p-4 rounded-xl border border-red-100">
              {conflictError}
            </p>
            <button
              type="button"
              onClick={() => setConflictError("")}
              className="flex items-center justify-center w-full py-12 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg text-2xl cursor-pointer"
            >
              了解並修改
            </button>
          </div>
        </div>
      )}

      {/* Success Modal (重度毛玻璃模糊遮罩 + 超大點擊按鈕) */}
      {successMsg && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center border-t-8 border-green-500">
            <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black mb-2 text-slate-800">
              申請成功
            </h3>
            <p className="mb-8 text-slate-600 font-medium text-lg">
              {successMsg}
            </p>
            <button
              type="button"
              onClick={() => setSuccessMsg("")}
              className="flex items-center justify-center w-full py-12 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors shadow-lg text-2xl cursor-pointer"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// BACKEND: Admin Panel
// ==========================================
function AdminPanel({
  staffList,
  leaveTypes,
  holidays,
  records,
  settings,
  appId,
  db,
}) {
  const [activeTab, setActiveTab] = useState("announcement");

  const tabs = [
    { id: "announcement", label: "公告設定" },
    { id: "staff", label: "人員名單 (Staff)" },
    { id: "set", label: "假別管理 (Set)" },
    { id: "holidays", label: "假日管理 (Holidays)" },
    { id: "records", label: "休假紀錄 (Records)" },
    { id: "stats", label: "統計 (MonthlyStats)" },
    { id: "lock", label: "鎖定月份 (LOCK)" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
      <div className="w-full md:w-64 bg-slate-800 text-slate-300 flex-shrink-0">
        <div className="p-4 bg-slate-900 text-white font-bold border-b border-slate-700 flex items-center gap-2">
          <Settings className="w-5 h-5" /> 管理中心
        </div>
        <nav className="flex flex-col py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-left transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white font-bold border-r-4 border-blue-400"
                  : "hover:bg-slate-700 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 p-6 bg-slate-50 overflow-y-auto">
        {activeTab === "announcement" && (
          <AdminAnnouncement settings={settings} appId={appId} db={db} />
        )}
        {activeTab === "staff" && (
          <AdminStaff
            staffList={staffList}
            leaveTypes={leaveTypes}
            appId={appId}
            db={db}
          />
        )}
        {activeTab === "set" && (
          <AdminLeaveTypes leaveTypes={leaveTypes} appId={appId} db={db} />
        )}
        {activeTab === "holidays" && (
          <AdminHolidays holidays={holidays} appId={appId} db={db} />
        )}
        {activeTab === "records" && (
          <AdminRecords
            records={records}
            staffList={staffList}
            leaveTypes={leaveTypes}
            appId={appId}
            db={db}
          />
        )}
        {activeTab === "stats" && (
          <AdminStats
            records={records}
            staffList={staffList}
            leaveTypes={leaveTypes}
          />
        )}
        {activeTab === "lock" && (
          <AdminLock settings={settings} appId={appId} db={db} />
        )}
      </div>
    </div>
  );
}

// --- Admin Sub-components ---

function AdminAnnouncement({ settings, appId, db }) {
  const [text, setText] = useState(settings.announcement || "");
  const [saveMsg, setSaveMsg] = useState("");

  const handleSave = async () => {
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "settings", "main"),
        { announcement: text }
      );
      setSaveMsg("公告儲存成功！");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) {
      setSaveMsg("儲存失敗");
    }
  };
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">公告設定</h2>
      <textarea
        className="w-full h-40 border border-slate-300 rounded p-3 mb-4 focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed shadow-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="支援多行顯示..."
      />
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-md"
        >
          <Save className="w-5 h-5" /> 儲存公告
        </button>
        {saveMsg && (
          <span className="text-green-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

function AdminStaff({ staffList, leaveTypes, appId, db }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [modalMsg, setModalMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleEdit = (staff) => {
    setEditingId(staff ? staff.id : "new");
    setFormData(
      staff
        ? { ...staff }
        : {
            name: "",
            nickname: "",
            group: "",
            agentId: "",
            color: COLORS[0],
            quotas: {},
            resignationDate: "",
          }
    );
  };

  const handleSave = async () => {
    try {
      if (editingId === "new") {
        await setDoc(
          doc(collection(db, "artifacts", appId, "public", "data", "staff")),
          formData
        );
      } else {
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "staff", editingId),
          formData
        );
      }
      setEditingId(null);
    } catch (e) {
      console.error("儲存失敗", e);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteDoc(
      doc(db, "artifacts", appId, "public", "data", "staff", deleteTarget.id)
    );
    setDeleteTarget(null);
  };

  const handleImportCSV = async () => {
    if (!csvData.trim()) {
      setModalMsg({ title: "錯誤", desc: "請輸入資料", isError: true });
      return;
    }
    const lines = csvData.split("\n");
    let count = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(",").map((s) => s.trim());
      if (cols.length >= 2) {
        const [name, nickname, group, color] = cols;
        await setDoc(
          doc(collection(db, "artifacts", appId, "public", "data", "staff")),
          {
            name,
            nickname: nickname || name,
            group: group || "",
            color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
            agentId: "",
            quotas: {},
            resignationDate: "",
          }
        );
        count++;
      }
    }
    setModalMsg({
      title: "匯入成功",
      desc: `成功新增 ${count} 筆人員資料！`,
      isError: false,
    });
    setShowImport(false);
    setCsvData("");
  };

  if (editingId) {
    return (
      <div className="bg-white p-6 rounded-xl border shadow-sm max-w-4xl">
        <h3 className="font-bold text-xl mb-6 border-b pb-2">
          {editingId === "new" ? "新增人員" : "編輯人員"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              姓名
            </label>
            <input
              className="w-full border p-2 rounded bg-slate-50"
              value={formData.name || ""}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              暱稱 (縮寫顯示)
            </label>
            <input
              className="w-full border p-2 rounded bg-slate-50"
              value={formData.nickname || ""}
              onChange={(e) =>
                setFormData({ ...formData, nickname: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              組別
            </label>
            <input
              className="w-full border p-2 rounded bg-slate-50"
              value={formData.group || ""}
              onChange={(e) =>
                setFormData({ ...formData, group: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              代理人
            </label>
            <select
              className="w-full border p-2 rounded bg-slate-50"
              value={formData.agentId || ""}
              onChange={(e) =>
                setFormData({ ...formData, agentId: e.target.value })
              }
            >
              <option value="">無</option>
              {staffList
                .filter((s) => s.id !== editingId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              離職日 (卡控排班)
            </label>
            <input
              type="date"
              className="w-full border p-2 rounded bg-slate-50"
              value={formData.resignationDate || ""}
              onChange={(e) =>
                setFormData({ ...formData, resignationDate: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              標籤顏色
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.color || "#e2e8f0"}
                onChange={(e) =>
                  setFormData({ ...formData, color: e.target.value })
                }
                className="h-10 w-12 border rounded cursor-pointer p-0.5"
              />
              <div className="flex gap-1 flex-wrap">
                {COLORS.slice(0, 6).map((c) => (
                  <div
                    key={c}
                    onClick={() => setFormData({ ...formData, color: c })}
                    className="w-6 h-6 rounded cursor-pointer border border-black/20"
                    style={{ backgroundColor: c }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <h4 className="font-bold border-b pb-2 mb-4 text-slate-700">
          各假別額度 (未設定則預設為0)
        </h4>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-8">
          {leaveTypes.map((type) => (
            <div
              key={type.id}
              className="bg-slate-50 p-2.5 rounded border border-slate-200"
            >
              <label className="block text-xs font-bold mb-1.5 text-slate-600">
                {type.name} ({type.unit === "hour" ? "時" : "天"})
              </label>
              <input
                type="number"
                min="0"
                className="w-full border border-slate-300 p-1.5 rounded text-sm focus:ring-1"
                value={formData.quotas?.[type.id] || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    quotas: {
                      ...formData.quotas,
                      [type.id]: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700"
          >
            儲存資料
          </button>
          <button
            onClick={() => setEditingId(null)}
            className="bg-slate-200 text-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-300"
          >
            取消返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">人員名單</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
          >
            <Upload className="w-4 h-4" /> 批次匯入
          </button>
          <button
            onClick={() => handleEdit(null)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-4 h-4" /> 新增人員
          </button>
        </div>
      </div>

      {showImport && (
        <div className="mb-6 bg-white p-5 rounded-xl border shadow-sm">
          <h3 className="font-bold mb-2 flex items-center gap-2 text-slate-700">
            <Upload className="w-5 h-5" /> 貼上 CSV 資料
          </h3>
          <p className="text-sm text-slate-500 mb-3 bg-slate-50 p-2 rounded">
            格式：
            <span className="font-mono text-blue-600">
              姓名, 暱稱, 組別, 標籤顏色(#HEX)
            </span>
            <br />
            範例：
            <span className="font-mono text-slate-600">
              王小明, 小明, A組, #FCA5A5
            </span>
          </p>
          <textarea
            className="w-full h-32 border border-slate-300 rounded-lg p-3 mb-3 text-sm font-mono focus:ring-2 focus:ring-green-500"
            placeholder="王小明, 小明, A組, #FCA5A5&#10;李小華, 小華, B組, #93C5FD"
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
          ></textarea>
          <div className="flex gap-2">
            <button
              onClick={handleImportCSV}
              className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-green-700"
            >
              開始匯入
            </button>
            <button
              onClick={() => setShowImport(false)}
              className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg font-bold hover:bg-slate-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white border rounded-xl shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-4 w-16">顏色</th>
              <th className="p-4">姓名(暱稱)</th>
              <th className="p-4">組別</th>
              <th className="p-4">代理人</th>
              <th className="p-4">離職日</th>
              <th className="p-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staffList.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div
                    className="w-6 h-6 rounded border border-black/20 shadow-sm"
                    style={{ backgroundColor: s.color }}
                  ></div>
                </td>
                <td className="p-4 font-bold text-slate-800">
                  {s.name}{" "}
                  <span className="text-slate-400 font-normal">
                    ({s.nickname})
                  </span>
                </td>
                <td className="p-4 text-slate-600">{s.group}</td>
                <td className="p-4 text-slate-500">
                  {staffList.find((a) => a.id === s.agentId)?.name || "-"}
                </td>
                <td className="p-4 text-red-600 font-medium">
                  {s.resignationDate || "-"}
                </td>
                <td className="p-4 flex gap-2 justify-center">
                  <button
                    onClick={() => handleEdit(s)}
                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-80 border-t-8 border-red-500">
            <h3 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> 刪除確認
            </h3>
            <p className="mb-6 text-slate-700">
              確定要刪除 <strong>{deleteTarget.name}</strong>{" "}
              的資料嗎？(此操作無法復原)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 flex items-center justify-center w-full py-4 bg-slate-100 rounded hover:bg-slate-200 font-bold cursor-pointer text-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 flex items-center justify-center w-full py-4 bg-red-600 text-white rounded hover:bg-red-700 font-bold cursor-pointer text-lg"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMsg && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div
            className={`bg-white p-6 rounded-xl shadow-2xl w-80 border-t-8 ${
              modalMsg.isError ? "border-red-500" : "border-green-500"
            }`}
          >
            <h3
              className={`text-lg font-bold mb-2 ${
                modalMsg.isError ? "text-red-600" : "text-green-600"
              }`}
            >
              {modalMsg.title}
            </h3>
            <pre className="mb-6 text-slate-700 whitespace-pre-wrap font-sans">
              {modalMsg.desc}
            </pre>
            <button
              type="button"
              onClick={() => setModalMsg(null)}
              className="flex items-center justify-center w-full py-4 bg-slate-100 rounded font-bold hover:bg-slate-200 cursor-pointer text-lg"
            >
              了解
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminLeaveTypes({ leaveTypes, appId, db }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("day");
  const [modalMsg, setModalMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleAdd = async () => {
    if (!name) return;
    await setDoc(
      doc(collection(db, "artifacts", appId, "public", "data", "leaveTypes")),
      { name, unit }
    );
    setName("");
  };

  const requestDelete = (type) => {
    if (type.name === "排休") {
      setModalMsg({
        title: "無法刪除",
        desc: "「排休」為系統核心必要假別，不可刪除！",
        isError: true,
      });
      return;
    }
    setDeleteTarget(type);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteDoc(
      doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "leaveTypes",
        deleteTarget.id
      )
    );
    setDeleteTarget(null);
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-slate-800">假別管理</h2>
      <div className="flex flex-wrap gap-3 mb-6 bg-white p-5 rounded-xl border shadow-sm items-end">
        <div>
          <label className="block text-xs font-bold mb-1 text-slate-600">
            假別名稱
          </label>
          <input
            className="border border-slate-300 p-2 rounded w-48 focus:ring-2 focus:ring-blue-500 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：颱風假"
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-slate-600">
            計算單位
          </label>
          <select
            className="border border-slate-300 p-2 rounded w-40 focus:ring-2"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="day">天 (隱藏時數)</option>
            <option value="hour">小時 (顯示時數)</option>
          </select>
        </div>
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-5 py-2 rounded font-bold hover:bg-blue-700 shadow-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> 新增假別
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden max-w-2xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-4">假別名稱</th>
              <th className="p-4">單位</th>
              <th className="p-4 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leaveTypes.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-800">{t.name}</td>
                <td className="p-4">
                  <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold">
                    {t.unit === "day" ? "天數 (Day)" : "時數 (Hour)"}
                  </span>
                </td>
                <td className="p-4 flex justify-center">
                  <button
                    onClick={() => requestDelete(t)}
                    className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    title={t.name === "排休" ? "不可刪除" : "刪除"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-80 border-t-8 border-red-500">
            <h3 className="text-lg font-bold mb-4 text-red-600">
              確認刪除假別？
            </h3>
            <p className="mb-6 text-slate-700">
              即將刪除：<strong>{deleteTarget.name}</strong>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 flex items-center justify-center w-full py-4 bg-slate-100 rounded font-bold cursor-pointer text-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 flex items-center justify-center w-full py-4 bg-red-600 text-white rounded font-bold cursor-pointer text-lg"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMsg && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-80 border-t-8 border-red-500">
            <h3 className="text-lg font-bold mb-2 text-red-600 flex items-center gap-2">
              <Info className="w-5 h-5" /> {modalMsg.title}
            </h3>
            <p className="mb-6 text-slate-700">{modalMsg.desc}</p>
            <button
              type="button"
              onClick={() => setModalMsg(null)}
              className="flex items-center justify-center w-full py-4 bg-slate-100 rounded font-bold hover:bg-slate-200 cursor-pointer text-lg"
            >
              了解
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminHolidays({ holidays, appId, db }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const handleAdd = async () => {
    if (!date || !name) return;
    await setDoc(
      doc(collection(db, "artifacts", appId, "public", "data", "holidays")),
      { date, name }
    );
    setDate("");
    setName("");
  };
  const handleDelete = async (id) => {
    await deleteDoc(
      doc(db, "artifacts", appId, "public", "data", "holidays", id)
    );
  };

  const sortedHols = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-slate-800">
        假日管理 (國定假日)
      </h2>
      <div className="flex flex-wrap gap-3 mb-6 bg-white p-5 rounded-xl border shadow-sm items-end">
        <div>
          <label className="block text-xs font-bold mb-1 text-slate-600">
            日期
          </label>
          <input
            type="date"
            className="border border-slate-300 p-2 rounded focus:ring-2 outline-none"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-slate-600">
            節日名稱
          </label>
          <input
            className="border border-slate-300 p-2 rounded focus:ring-2 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：中秋節"
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-5 py-2 rounded font-bold shadow-sm hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> 新增假日
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {sortedHols.map((h) => (
          <div
            key={h.id}
            className="bg-white border-2 border-red-100 rounded-xl p-3.5 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow"
          >
            <div>
              <div className="text-xs text-slate-500 font-mono mb-0.5">
                {h.date}
              </div>
              <div className="font-bold text-red-600">{h.name}</div>
            </div>
            <button
              onClick={() => handleDelete(h.id)}
              className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminRecords({ records, staffList, leaveTypes, appId, db }) {
  const sortedRecs = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const [showImport, setShowImport] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [modalResult, setModalResult] = useState(null);

  const exportCSV = () => {
    const headers = ["人員", "日期", "假別", "時數/天數", "狀態"];
    const rows = sortedRecs.map((r) => [
      staffList.find((s) => s.id === r.staffId)?.name || "-",
      r.date,
      leaveTypes.find((t) => t.id === r.typeId)?.name || "-",
      r.amount,
      r.status === "normal" ? "正常" : "已取消",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `休假紀錄匯出_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleStatus = async (rec) => {
    const newStatus = rec.status === "normal" ? "cancelled" : "normal";
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "records", rec.id),
      { status: newStatus }
    );
  };

  const handleImportCSV = async () => {
    if (!csvData.trim()) {
      setModalResult({
        title: "輸入空白",
        desc: "請貼上要匯入的資料。",
        isError: true,
      });
      return;
    }

    const lines = csvData.split("\n");
    let count = 0;
    let errors = [];

    for (const [i, line] of lines.entries()) {
      if (!line.trim()) continue;
      const cols = line.split(",").map((s) => s.trim());
      if (cols.length >= 4) {
        const [staffName, rawDate, typeName, amount] = cols;

        let dStr = rawDate.replace(/\//g, "-");
        const dParts = dStr.split("-");
        if (dParts.length === 3) {
          dStr = `${dParts[0]}-${dParts[1].padStart(
            2,
            "0"
          )}-${dParts[2].padStart(2, "0")}`;
        } else {
          errors.push(`第${i + 1}行: 日期格式異常 "${rawDate}"`);
          continue;
        }

        const staff = staffList.find((s) => s.name === staffName);
        const type = leaveTypes.find((t) => t.name === typeName);

        if (!staff) {
          errors.push(`第${i + 1}行: 找不到人員 "${staffName}"`);
          continue;
        }
        if (!type) {
          errors.push(`第${i + 1}行: 找不到假別 "${typeName}"`);
          continue;
        }
        if (isNaN(amount) || Number(amount) <= 0) {
          errors.push(`第${i + 1}行: 數量無效 "${amount}"`);
          continue;
        }

        const newRef = doc(
          collection(db, "artifacts", appId, "public", "data", "records")
        );
        await setDoc(newRef, {
          staffId: staff.id,
          date: dStr,
          typeId: type.id,
          amount: Number(amount),
          status: "normal",
          createdAt: new Date().toISOString(),
        });
        count++;
      } else {
        errors.push(`第${i + 1}行: 欄位不足`);
      }
    }

    setModalResult({
      title: "匯入完成",
      desc: `成功匯入 ${count} 筆紀錄！\n\n${
        errors.length > 0 ? "【錯誤提示】\n" + errors.join("\n") : ""
      }`,
      isError: errors.length > 0,
    });
    setShowImport(false);
    setCsvData("");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">休假紀錄</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
          >
            <Upload className="w-4 h-4" /> 批次匯入
          </button>
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
          >
            <Download className="w-4 h-4" /> 匯出 CSV
          </button>
        </div>
      </div>

      {showImport && (
        <div className="mb-6 bg-white p-5 rounded-xl border shadow-sm">
          <h3 className="font-bold mb-2 flex items-center gap-2 text-slate-700">
            <Upload className="w-5 h-5" /> 貼上 CSV 資料
          </h3>
          <p className="text-sm text-slate-500 mb-3 bg-slate-50 p-2 rounded">
            格式：
            <span className="font-mono text-blue-600">
              姓名, 日期, 假別名稱, 時數/天數
            </span>
            <br />
            範例：
            <span className="font-mono text-slate-600">
              王小明, 2026-5-10, 特休, 8
            </span>
            <br />
            <span className="text-xs text-amber-600 mt-1 block">
              *系統會自動優化日期格式 (例如 2026/5/1 將自動轉為標準
              2026-05-01)，請放心輸入。
            </span>
          </p>
          <textarea
            className="w-full h-32 border border-slate-300 rounded-lg p-3 mb-3 text-sm font-mono focus:ring-2 focus:ring-blue-500"
            placeholder="王小明, 2026-05-10, 特休, 8&#10;李小華, 2026-06-15, 排休, 1"
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
          ></textarea>
          <div className="flex gap-2">
            <button
              onClick={handleImportCSV}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700"
            >
              開始解析並匯入
            </button>
            <button
              onClick={() => setShowImport(false)}
              className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg font-bold hover:bg-slate-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-4">人員</th>
              <th className="p-4">日期</th>
              <th className="p-4">假別</th>
              <th className="p-4">數量</th>
              <th className="p-4">狀態</th>
              <th className="p-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y max-h-96 overflow-y-auto block md:table-row-group">
            {sortedRecs.slice(0, 100).map((r) => {
              const t = leaveTypes.find((t) => t.id === r.typeId);
              return (
                <tr
                  key={r.id}
                  className={`transition-colors hover:bg-slate-50 ${
                    r.status === "cancelled"
                      ? "bg-slate-50 text-slate-400 opacity-60"
                      : ""
                  }`}
                >
                  <td className="p-4 font-bold">
                    {staffList.find((s) => s.id === r.staffId)?.name}
                  </td>
                  <td className="p-4 font-mono">{r.date}</td>
                  <td className="p-4">{t?.name}</td>
                  <td className="p-4">
                    <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">
                      {r.amount} {t?.unit === "hour" ? "h" : "d"}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        r.status === "normal"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {r.status === "normal" ? "正常" : "已取消"}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggleStatus(r)}
                      className="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors text-xs"
                    >
                      切換狀態
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border-t">
          僅顯示最新 100 筆，完整紀錄請匯出 CSV
        </div>
      </div>

      {/* Import Result Modal */}
      {modalResult && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border-t-8 border-blue-500">
            <h3
              className={`text-xl font-bold mb-3 flex items-center gap-2 ${
                modalResult.isError ? "text-amber-600" : "text-blue-600"
              }`}
            >
              <Info className="w-6 h-6" /> {modalResult.title}
            </h3>
            <pre className="mb-6 text-slate-700 font-sans whitespace-pre-wrap bg-slate-50 p-4 rounded-lg text-sm max-h-60 overflow-y-auto custom-scrollbar">
              {modalResult.desc}
            </pre>
            <button
              type="button"
              onClick={() => setModalResult(null)}
              className="flex items-center justify-center w-full py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm cursor-pointer text-lg"
            >
              了解
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminStats({ records, staffList, leaveTypes }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const stats = staffList.map((staff) => {
    const staffRecs = records.filter(
      (r) =>
        r.staffId === staff.id &&
        r.status === "normal" &&
        parseInt(r.date.split("-")[1], 10) === selectedMonth
    );

    const totals = {};
    leaveTypes.forEach((t) => (totals[t.name] = 0));

    staffRecs.forEach((r) => {
      const typeName = leaveTypes.find((t) => t.id === r.typeId)?.name;
      if (typeName) totals[typeName] += Number(r.amount);
    });

    return { name: staff.name, group: staff.group, totals };
  });

  const exportCSV = () => {
    const headers = [
      "人員",
      "組別",
      ...leaveTypes.map((t) => `${t.name}(${t.unit === "hour" ? "時" : "天"})`),
    ];
    const rows = stats.map((s) => [
      s.name,
      s.group,
      ...leaveTypes.map((t) => s.totals[t.name] || 0),
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${YEAR}年${selectedMonth}月_休假統計.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">月度統計</h2>
        <div className="flex gap-4 items-center bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          <span className="font-bold text-slate-600 pl-2">選擇月份:</span>
          <select
            className="border border-slate-300 p-2 rounded-lg bg-slate-50 font-bold text-blue-700 focus:ring-2 outline-none"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} 月份
              </option>
            ))}
          </select>
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> 匯出報表
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm text-center">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-4 text-left border-r min-w-[120px]">
                人員 / 組別
              </th>
              {leaveTypes.map((t) => (
                <th key={t.id} className="p-4">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.map((s, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 text-left border-r">
                  <div className="font-bold text-slate-800 text-base">
                    {s.name}
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    {s.group || "無組別"}
                  </div>
                </td>
                {leaveTypes.map((t) => (
                  <td key={t.id} className="p-4 text-slate-500 text-base">
                    {s.totals[t.name] > 0 ? (
                      <span className="font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                        {s.totals[t.name]}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminLock({ settings, appId, db }) {
  const lockedMonths = settings.lockedMonths || [];

  // Custom Modal States replacing prompt()
  const [targetMonth, setTargetMonth] = useState(null);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState("");

  const openLockModal = (month) => {
    setTargetMonth(month);
    setPwdInput("");
    setPwdError("");
  };

  const confirmToggle = async () => {
    if (pwdInput !== "w9001") {
      setPwdError("密碼錯誤！請輸入正確的解鎖/鎖定密碼。");
      return;
    }

    let newLocked = [...lockedMonths];
    if (newLocked.includes(targetMonth)) {
      newLocked = newLocked.filter((m) => m !== targetMonth); // 解鎖
    } else {
      newLocked.push(targetMonth); // 鎖定
    }

    try {
      await setDoc(
        doc(db, "artifacts", appId, "public", "data", "settings", "main"),
        { lockedMonths: newLocked },
        { merge: true }
      );
      setTargetMonth(null);
    } catch (e) {
      setPwdError("資料庫更新失敗: " + e.message);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-slate-800">鎖定月份</h2>
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded mb-8 shadow-sm">
        <p className="text-blue-900 font-medium flex items-center gap-2">
          <Info className="w-5 h-5" />{" "}
          點擊下方月份卡片並輸入密碼進行切換。鎖定後，前台一般人員將無法新增或取消該月份的休假。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const isLocked = lockedMonths.includes(month);
          return (
            <div
              key={month}
              onClick={() => openLockModal(month)}
              className={`cursor-pointer rounded-2xl border-2 p-5 flex flex-col items-center justify-center transition-all h-36 shadow-sm hover:shadow-lg hover:-translate-y-1
                ${
                  isLocked
                    ? "bg-amber-100 border-amber-300 text-amber-800 shadow-amber-200/50"
                    : "bg-white border-slate-200 text-slate-700 hover:border-blue-300"
                }`}
            >
              <span
                className={`text-4xl font-black mb-3 ${
                  isLocked
                    ? "opacity-90 text-amber-600"
                    : "opacity-20 text-slate-900"
                }`}
              >
                {month}
              </span>
              <span className="text-sm font-bold tracking-widest">
                {month} 月
              </span>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-white/50">
                {isLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5" /> 狀態：鎖定
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> 開放申請
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lock Password Modal replacing prompt() */}
      {targetMonth && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm transform transition-all border-t-8 border-blue-500">
            <h3 className="text-xl font-black mb-6 text-slate-800 flex items-center gap-2">
              {lockedMonths.includes(targetMonth) ? (
                <Unlock className="w-6 h-6 text-green-500" />
              ) : (
                <Lock className="w-6 h-6 text-red-500" />
              )}
              {lockedMonths.includes(targetMonth)
                ? `解除鎖定 ${targetMonth} 月`
                : `鎖定 ${targetMonth} 月`}
            </h3>
            <p className="text-sm text-slate-500 mb-4 font-bold bg-slate-50 p-2 rounded">
              請輸入授權密碼以變更狀態：
            </p>
            <input
              type="password"
              className="w-full border-2 border-slate-200 p-3 rounded-xl mb-2 focus:border-blue-500 outline-none text-lg text-center tracking-[0.5em] font-bold"
              value={pwdInput}
              onChange={(e) => {
                setPwdInput(e.target.value);
                setPwdError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmToggle()}
              autoFocus
            />
            {pwdError && (
              <p className="text-red-500 font-bold text-sm mb-4 text-center animate-pulse">
                {pwdError}
              </p>
            )}
            {!pwdError && <div className="mb-4"></div>}

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setTargetMonth(null)}
                className="flex-1 flex items-center justify-center w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 cursor-pointer text-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmToggle}
                className="flex-1 flex items-center justify-center w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg cursor-pointer text-lg"
              >
                確認送出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
