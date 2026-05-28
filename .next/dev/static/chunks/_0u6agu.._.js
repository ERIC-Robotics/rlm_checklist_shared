(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/firebaseClient.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertFirebaseConfigured",
    ()=>assertFirebaseConfigured,
    "auth",
    ()=>auth,
    "firebaseApp",
    ()=>firebaseApp,
    "googleProvider",
    ()=>googleProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$firebase$2f$app$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/firebase/app/dist/esm/index.esm.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$app$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@firebase/app/dist/esm/index.esm.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$firebase$2f$auth$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/firebase/auth/dist/esm/index.esm.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__p__as__getAuth$3e$__ = __turbopack_context__.i("[project]/node_modules/@firebase/auth/dist/esm/index-907e9a1a.js [app-client] (ecmascript) <export p as getAuth>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Y__as__GoogleAuthProvider$3e$__ = __turbopack_context__.i("[project]/node_modules/@firebase/auth/dist/esm/index-907e9a1a.js [app-client] (ecmascript) <export Y as GoogleAuthProvider>");
;
;
function hasFirebaseConfig() {
    return Boolean(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_API_KEY && __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN && __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_APP_ID);
}
function getFirebaseApp() {
    if (!hasFirebaseConfig()) return null;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$app$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getApps"])().length) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$app$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getApp"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$app$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["initializeApp"])({
        apiKey: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_FIREBASE_APP_ID
    });
}
const firebaseApp = getFirebaseApp();
const auth = firebaseApp ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__p__as__getAuth$3e$__["getAuth"])(firebaseApp) : null;
const googleProvider = firebaseApp ? new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Y__as__GoogleAuthProvider$3e$__["GoogleAuthProvider"]() : null;
function assertFirebaseConfigured() {
    if (firebaseApp && auth && googleProvider) return;
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID to .env.local and restart the dev server.");
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/loginHistory.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "clearLoginEvents",
    ()=>clearLoginEvents,
    "clearLoginSessionFlag",
    ()=>clearLoginSessionFlag,
    "listLoginEvents",
    ()=>listLoginEvents,
    "recordLoginEvent",
    ()=>recordLoginEvent,
    "setKnownUserName",
    ()=>setKnownUserName
]);
"use client";
const STORAGE_KEY = "rm:loginHistory:v1";
const SESSION_KEY = "rm:loginRecorded:v1";
const NAMES_KEY = "rm:userNames:v1";
const MAX_EVENTS = 50;
function safeParseJson(raw, fallback) {
    if (typeof raw !== "string" || !raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch  {
        return fallback;
    }
}
function deriveNameFromEmail(email) {
    if (typeof email !== "string") return "";
    const trimmed = email.trim();
    if (!trimmed) return "";
    const local = trimmed.split("@")[0] || "";
    const cleaned = local.replace(/[._-]+/g, " ").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    return cleaned.replace(/\b\w/g, (c)=>c.toUpperCase());
}
function normalizeDisplayName(name) {
    if (typeof name !== "string") return "";
    const cleaned = name.trim().replace(/\s+/g, " ");
    if (!cleaned) return "";
    // Title-case, but keep digits/symbols as-is.
    return cleaned.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, first, rest)=>`${first.toUpperCase()}${String(rest).toLowerCase()}`);
}
function readKnownNames() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const obj = safeParseJson(window.localStorage.getItem(NAMES_KEY), {});
    return obj && typeof obj === "object" ? obj : {};
}
function writeKnownNames(next) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    window.localStorage.setItem(NAMES_KEY, JSON.stringify(next));
}
function setKnownUserName({ uid, email, name }) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const safeName = normalizeDisplayName(name);
    if (!safeName) return;
    const next = readKnownNames();
    if (uid && typeof uid === "string") next[`uid:${uid}`] = safeName;
    if (email && typeof email === "string") next[`email:${email.trim().toLowerCase()}`] = safeName;
    writeKnownNames(next);
}
function getKnownUserName(uid, email) {
    const known = readKnownNames();
    if (uid && typeof uid === "string" && typeof known[`uid:${uid}`] === "string") return known[`uid:${uid}`];
    if (email && typeof email === "string") {
        const key = `email:${email.trim().toLowerCase()}`;
        if (typeof known[key] === "string") return known[key];
    }
    return "";
}
function safeUserName(user) {
    if (!user) return "Unknown";
    const known = getKnownUserName(user.uid || "", user.email || "");
    if (known) return known;
    const name = (user.displayName || "").trim();
    if (name) return name;
    const email = (user.email || "").trim();
    if (email) return deriveNameFromEmail(email) || email;
    return (user.uid || "Unknown").slice(0, 12);
}
function listLoginEvents() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const arr = safeParseJson(window.localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e)=>e && typeof e === "object").map((e)=>({
            uid: typeof e.uid === "string" ? e.uid : "",
            email: typeof e.email === "string" ? e.email : "",
            name: (()=>{
                const rawName = typeof e.name === "string" ? e.name.trim() : "";
                const rawEmail = typeof e.email === "string" ? e.email.trim() : "";
                const known = getKnownUserName(e.uid, rawEmail);
                if (known) return known;
                if (rawName && rawName !== rawEmail) return rawName;
                return deriveNameFromEmail(rawEmail) || rawName;
            })(),
            at: typeof e.at === "string" ? e.at : ""
        })).filter((e)=>e.at).sort((a, b)=>String(b.at).localeCompare(String(a.at)));
}
function recordLoginEvent(user) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if (!user) return;
    // Avoid duplicating events for the same tab session.
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    setKnownUserName({
        uid: user.uid || "",
        email: user.email || "",
        name: (user.displayName || "").trim()
    });
    const nextEvent = {
        uid: user.uid || "",
        email: user.email || "",
        name: safeUserName(user),
        at: new Date().toISOString()
    };
    const existing = listLoginEvents();
    const deduped = [
        nextEvent,
        ...existing
    ].filter(Boolean).slice(0, MAX_EVENTS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    window.dispatchEvent(new Event("rm:loginHistoryUpdated"));
}
function clearLoginEvents() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(NAMES_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("rm:loginHistoryUpdated"));
}
function clearLoginSessionFlag() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    window.sessionStorage.removeItem(SESSION_KEY);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/components/AuthProvider.jsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AuthProvider,
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$compiler$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/compiler-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$firebase$2f$auth$2f$dist$2f$esm$2f$index$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/firebase/auth/dist/esm/index.esm.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__z__as__onAuthStateChanged$3e$__ = __turbopack_context__.i("[project]/node_modules/@firebase/auth/dist/esm/index-907e9a1a.js [app-client] (ecmascript) <export z as onAuthStateChanged>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$firebaseClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/firebaseClient.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$loginHistory$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/loginHistory.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
const AuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    user: null,
    loading: true
});
function AuthProvider(t0) {
    _s();
    const $ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$compiler$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["c"])(9);
    if ($[0] !== "55f280696752729670c3299a63caf86b51ffa5542e04ce2c653433f702946aba") {
        for(let $i = 0; $i < 9; $i += 1){
            $[$i] = Symbol.for("react.memo_cache_sentinel");
        }
        $[0] = "55f280696752729670c3299a63caf86b51ffa5542e04ce2c653433f702946aba";
    }
    const { children } = t0;
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(Boolean(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$firebaseClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["auth"]));
    let t1;
    let t2;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = ({
            "AuthProvider[useEffect()]": ()=>{
                if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$firebaseClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["auth"]) {
                    return;
                }
                const unsubscribe = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$firebase$2f$auth$2f$dist$2f$esm$2f$index$2d$907e9a1a$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__z__as__onAuthStateChanged$3e$__["onAuthStateChanged"])(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$firebaseClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["auth"], {
                    "AuthProvider[useEffect() > onAuthStateChanged(arg1)]": (u)=>{
                        setUser(u ?? null);
                        if (u) {
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$loginHistory$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["recordLoginEvent"])(u);
                        }
                        setLoading(false);
                    }
                }["AuthProvider[useEffect() > onAuthStateChanged(arg1)]"], {
                    "AuthProvider[useEffect() > onAuthStateChanged(arg2)]": ()=>{
                        setUser(null);
                        setLoading(false);
                    }
                }["AuthProvider[useEffect() > onAuthStateChanged(arg2)]"]);
                return ()=>unsubscribe();
            }
        })["AuthProvider[useEffect()]"];
        t2 = [];
        $[1] = t1;
        $[2] = t2;
    } else {
        t1 = $[1];
        t2 = $[2];
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])(t1, t2);
    let t3;
    if ($[3] !== loading || $[4] !== user) {
        t3 = {
            user,
            loading
        };
        $[3] = loading;
        $[4] = user;
        $[5] = t3;
    } else {
        t3 = $[5];
    }
    const value = t3;
    let t4;
    if ($[6] !== children || $[7] !== value) {
        t4 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AuthContext.Provider, {
            value: value,
            children: children
        }, void 0, false, {
            fileName: "[project]/app/components/AuthProvider.jsx",
            lineNumber: 73,
            columnNumber: 10
        }, this);
        $[6] = children;
        $[7] = value;
        $[8] = t4;
    } else {
        t4 = $[8];
    }
    return t4;
}
_s(AuthProvider, "mSoPxj1rVVfSgsX370v4jkPJN7U=");
_c = AuthProvider;
function useAuth() {
    _s1();
    const $ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$compiler$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["c"])(1);
    if ($[0] !== "55f280696752729670c3299a63caf86b51ffa5542e04ce2c653433f702946aba") {
        for(let $i = 0; $i < 1; $i += 1){
            $[$i] = Symbol.for("react.memo_cache_sentinel");
        }
        $[0] = "55f280696752729670c3299a63caf86b51ffa5542e04ce2c653433f702946aba";
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AuthContext);
}
_s1(useAuth, "gDsCjeeItUuvgOWf1v4qoK9RF6k=");
var _c;
__turbopack_context__.k.register(_c, "AuthProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_0u6agu.._.js.map