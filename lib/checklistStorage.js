const LEGACY_STORAGE_KEY = "trial_sop_checklist_v1";
const TRIALS_INDEX_KEY = "trial_sop_trials_index_v1";
const ACTIVE_TRIAL_KEY = "trial_sop_active_trial_v1";
const EMPLOYEE_STORAGE_KEY = "rm:employee:v1";
const syncQueue = new Map();

function getStorage() {
  if (typeof globalThis === "undefined") return null;
  if (globalThis.localStorage) return globalThis.localStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
}

function readCurrentEmployeeCode() {
  const storage = getStorage();
  if (!storage) return "";
  try {
    const raw = storage.getItem(EMPLOYEE_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.code === "string" ? parsed.code : "";
  } catch {
    return "";
  }
}

function scopedStorageKey(key) {
  const employeeCode = readCurrentEmployeeCode();
  return employeeCode ? `${key}__${employeeCode}` : key;
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function trialStorageKey(trialId) {
  return scopedStorageKey(`trial_sop_trial_${trialId}_v1`);
}

export function listTrials() {
  const storage = getStorage();
  if (!storage) return [];
  const parsed = safeParse(storage.getItem(scopedStorageKey(TRIALS_INDEX_KEY)));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.trials)) return [];
  return parsed.trials.filter((t) => t && typeof t === "object" && typeof t.trialId === "string");
}

export function upsertTrialMeta(meta) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const trials = listTrials();
    const idx = trials.findIndex((t) => t.trialId === meta.trialId);
    const now = new Date().toISOString();
    const existing = idx >= 0 ? trials[idx] : null;
    const next = {
      trialId: meta.trialId,
      title: meta.title ?? "Untitled trial",
      createdAt: meta.createdAt ?? existing?.createdAt ?? now,
      updatedAt: meta.updatedAt ?? now,
      version: meta.version ?? existing?.version,
      customTrialId: meta.customTrialId ?? existing?.customTrialId,
      submitted: meta.submitted ?? existing?.submitted ?? false,
      ownerCode: meta.ownerCode ?? existing?.ownerCode,
    };
    if (idx >= 0) trials[idx] = { ...trials[idx], ...next };
    else trials.unshift(next);
    storage.setItem(scopedStorageKey(TRIALS_INDEX_KEY), JSON.stringify({ trials }));
  } catch {
    // ignore
  }
}

function cacheTrial(trialId, state, meta) {
  const storage = getStorage();
  if (!storage || !trialId) return;
  try {
    storage.setItem(trialStorageKey(trialId), JSON.stringify(state));
    upsertTrialMeta({ trialId, ...meta });
  } catch (error) {
    console.error("Could not cache trial locally:", error);
  }
}

function reportSyncError(error) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("trial-sync-error", {
    detail: { message: error instanceof Error ? error.message : "Could not sync this trial." },
  }));
}

async function putRemoteTrial(trialId, state, meta) {
  const response = await fetch(`/api/trials/${encodeURIComponent(trialId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, meta }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not save this trial to the shared database.");
}

function queueRemoteTrialSave(trialId, state, meta) {
  if (typeof window === "undefined") return;
  let queued = syncQueue.get(trialId);
  if (!queued) {
    queued = { state: null, meta: null, timer: null, saving: false };
    syncQueue.set(trialId, queued);
  }
  queued.state = state;
  queued.meta = meta;
  if (queued.timer) clearTimeout(queued.timer);
  queued.timer = setTimeout(async () => {
    if (queued.saving || !queued.state) return;
    queued.saving = true;
    const nextState = queued.state;
    const nextMeta = queued.meta;
    queued.state = null;
    queued.meta = null;
    try {
      await putRemoteTrial(trialId, nextState, nextMeta);
    } catch (error) {
      reportSyncError(error);
    } finally {
      queued.saving = false;
      if (queued.state) {
        queued.timer = setTimeout(() => {
          queued.timer = null;
          if (queued.state) queueRemoteTrialSave(trialId, queued.state, queued.meta);
        }, 0);
      } else {
        syncQueue.delete(trialId);
      }
    }
  }, 500);
}

export function deleteTrial(trialId) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(trialStorageKey(trialId));
    const trials = listTrials().filter((t) => t.trialId !== trialId);
    storage.setItem(scopedStorageKey(TRIALS_INDEX_KEY), JSON.stringify({ trials }));
    const active = getActiveTrialId();
    if (active === trialId) storage.removeItem(scopedStorageKey(ACTIVE_TRIAL_KEY));
  } catch {
    // ignore
  }
  fetch(`/api/trials/${encodeURIComponent(trialId)}`, { method: "DELETE" })
    .then(async (response) => {
      if (response.ok) return;
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not delete the shared trial.");
    })
    .catch(reportSyncError);
}

export function getActiveTrialId() {
  const storage = getStorage();
  if (!storage) return "";
  try {
    return storage.getItem(scopedStorageKey(ACTIVE_TRIAL_KEY)) ?? "";
  } catch {
    return "";
  }
}

export function setActiveTrialId(trialId) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const scopedActiveKey = scopedStorageKey(ACTIVE_TRIAL_KEY);
    if (!trialId) storage.removeItem(scopedActiveKey);
    else storage.setItem(scopedActiveKey, trialId);
  } catch {
    // ignore
  }
}

export function loadTrial(trialId) {
  const storage = getStorage();
  if (!storage || !trialId) return null;
  const parsed = safeParse(storage.getItem(trialStorageKey(trialId)));
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

export function saveTrial(trialId, state, meta) {
  const storage = getStorage();
  if (!storage || !trialId) return;
  try {
    const sharedMeta = {
      trialId,
      title: meta?.title,
      createdAt: meta?.createdAt,
      updatedAt: meta?.updatedAt,
      version: meta?.version,
      customTrialId: meta?.customTrialId,
      submitted: state?.submitted,
    };
    storage.setItem(trialStorageKey(trialId), JSON.stringify(state));
    upsertTrialMeta(sharedMeta);
    setActiveTrialId(trialId);
    queueRemoteTrialSave(trialId, state, sharedMeta);
  } catch {
    // ignore quota / private mode failures
  }
}

export async function syncTrialsWithServer() {
  const response = await fetch("/api/trials");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load shared trials.");
  const remoteTrials = Array.isArray(data.trials) ? data.trials : [];
  const remoteIds = new Set(remoteTrials.map((trial) => trial.trialId));
  const localTrials = listTrials();

  for (const meta of localTrials) {
    if (remoteIds.has(meta.trialId)) continue;
    const state = loadTrial(meta.trialId);
    if (!state?.answers) continue;
    await putRemoteTrial(meta.trialId, state, meta);
  }

  remoteTrials.forEach((meta) => upsertTrialMeta(meta));
  const merged = [...remoteTrials];
  localTrials.forEach((meta) => {
    if (!remoteIds.has(meta.trialId)) merged.push(meta);
  });
  return merged;
}

export async function loadSharedTrial(trialId) {
  if (!trialId) return null;
  const response = await fetch(`/api/trials/${encodeURIComponent(trialId)}`);
  if (response.status === 404) return loadTrial(trialId);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load this shared trial.");
  const trial = data.trial;
  if (!trial || typeof trial !== "object") throw new Error("The server returned an invalid trial.");

  const { trialId: _trialId, title, ...state } = trial;
  cacheTrial(trialId, state, {
    title,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    version: state.version,
    customTrialId: state.customTrialId,
    submitted: state.submitted,
  });
  return state;
}

export function clearTrial(trialId) {
  deleteTrial(trialId);
}

function generateTrialId() {
  // short, URL-safe id
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function ensureActiveTrialId() {
  const storage = getStorage();
  if (!storage) return "";
  const existing = getActiveTrialId();
  if (existing) return existing;
  const id = generateTrialId();
  setActiveTrialId(id);
  return id;
}

// ---- Legacy single-trial API (kept for backwards compatibility) ----
export function loadChecklist() {
  const storage = getStorage();
  if (!storage) return null;
  const legacy = safeParse(storage.getItem(scopedStorageKey(LEGACY_STORAGE_KEY)));
  if (!legacy || typeof legacy !== "object") return null;
  return legacy;
}

export function saveChecklist(state) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(scopedStorageKey(LEGACY_STORAGE_KEY), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearChecklist() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(scopedStorageKey(LEGACY_STORAGE_KEY));
  } catch {
    // ignore
  }
}
