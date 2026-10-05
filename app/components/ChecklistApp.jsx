"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TRIAL_AGENDA, getChecklistSectionsForVersion, SECTIONS, TOTAL_QUESTIONS } from "../../lib/checklistData";
import { serializeAnswer } from "../../lib/serializeAnswer";
import { useAuth } from "./AuthProvider";
import {
  deleteTrial,
  ensureActiveTrialId,
  getActiveTrialId,
  listTrials,
  loadSharedTrial,
  loadChecklist,
  loadTrial,
  saveChecklist,
  saveTrial,
  setActiveTrialId,
  syncTrialsWithServer,
} from "../../lib/checklistStorage";

function localISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeShort(s) {
  return typeof s === "string" ? s.trim() : "";
}

// ---- Trial ID helpers: RLM/DD/MM/YYYY/track/serial ----
function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// "RLM/01/10/2026/ML/12" -> { rlm, date, ml, serial }
function parseTrialId(value) {
  const parts = String(value || "").split("/");
  if (parts.length === 6) {
    return {
      rlm: parts[0],
      date: `${parts[1]}/${parts[2]}/${parts[3]}`,
      ml: parts[4],
      serial: parts[5],
    };
  }
  return { rlm: "RLM", date: todayDDMMYYYY(), ml: "ML", serial: "" };
}

function buildTrialId({ rlm, date, ml, serial }) {
  if (!safeShort(ml) && !safeShort(serial)) return "";
  return `${safeShort(rlm)}/${date}/${safeShort(ml)}/${safeShort(serial)}`;
}

function deriveTrialTitle(answers) {
  const blockDate = safeShort(answers?.[1]);
  const location = safeShort(answers?.[2]);
  const parts = [blockDate, location].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Untitled trial";
}

function makeBaseAnswers(version = "Trolly") {
  const base = {};
  getChecklistSectionsForVersion(version).flatMap((s) => s.questions).forEach((q) => {
    if (base[q.num] !== undefined) return;
    if (q.type === "checklist") base[q.num] = { selected: {}, otherText: "" };
    else if (q.type === "yesNoOther") base[q.num] = { choice: "", otherText: "" };
    else if (q.type === "yesOther") base[q.num] = { choice: "", otherText: "" };
    else if (q.type === "timeRange") base[q.num] = { start: "", end: "" };
    else if (q.type === "socPair") base[q.num] = { battery1: "", battery2: "" };
    else if (q.type === "date") base[q.num] = localISODate();
    else if (q.type === "agendaTable") base[q.num] = structuredClone(DEFAULT_TRIAL_AGENDA);
    else base[q.num] = "";
  });
  return base;
}

function makeCurrentAnswers(version = "Trolly", savedAnswers = {}) {
  const answers = { ...makeBaseAnswers(version), ...savedAnswers };
  [11, 37].forEach((num) => {
    if (typeof answers[num] === "string") {
      const values = [...answers[num].matchAll(/(?:battery\s*[12]\s*:\s*)?(\d+(?:\.\d+)?)\s*%?/gi)]
        .map((match) => match[1]);
      answers[num] = { battery1: values[0] ?? "", battery2: values[1] ?? "" };
    } else if (!answers[num] || typeof answers[num] !== "object") {
      answers[num] = { battery1: "", battery2: "" };
    } else {
      answers[num] = {
        battery1: String(answers[num].battery1 ?? ""),
        battery2: String(answers[num].battery2 ?? ""),
      };
    }
  });
  if (typeof answers[5] === "string") {
    answers[5] = answers[5].trim()
      ? {
          activities: [{ category: "Agenda Item", activity: "Imported from previous agenda", details: answers[5] }],
          deliverables: structuredClone(DEFAULT_TRIAL_AGENDA.deliverables),
        }
      : structuredClone(DEFAULT_TRIAL_AGENDA);
  } else if (!answers[5] || typeof answers[5] !== "object") {
    answers[5] = structuredClone(DEFAULT_TRIAL_AGENDA);
  } else {
    answers[5] = {
      activities: Array.isArray(answers[5].activities) ? answers[5].activities : [],
      deliverables: Array.isArray(answers[5].deliverables) ? answers[5].deliverables : [],
    };
  }
  const today = localISODate();
  getChecklistSectionsForVersion(version)
    .flatMap((section) => section.questions)
    .filter((question) => question.type === "date")
    .forEach((question) => {
      answers[question.num] = today;
    });
  return answers;
}

function formatIso(iso) {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function safeVersionLabel(raw) {
  const v = safeShort(raw);
  return v || "RailwayMitra";
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsvValue(v) {
  const s = String(v ?? "");
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function normTime(v) {
  return typeof v === "string" ? v : v && typeof v === "object" ? v.value || "" : "";
}

function isQuestionAnswered(q, a) {
  if (!a) return false;
  switch (q.type) {
    case "text":
    case "textarea":
      return typeof a === "string" && a.trim() !== "";
    case "time":
      if (typeof a === "object" && a !== null) return Boolean(a.value);
      return typeof a === "string" && a.trim() !== "";
    case "timeRange":
      if (typeof a !== "object" || a === null) return false;
      return Boolean(normTime(a.start)) && Boolean(normTime(a.end));
    case "socPair":
      if (typeof a !== "object" || a === null) return false;
      return Boolean(String(a.battery1 ?? "").trim()) && Boolean(String(a.battery2 ?? "").trim());
    case "date":
    case "select":
      return typeof a === "string" && a.trim() !== "";
    case "agendaTable":
      return Boolean(a && typeof a === "object" && (
        (Array.isArray(a.activities) && a.activities.some((item) => item.category || item.activity || item.details)) ||
        (Array.isArray(a.deliverables) && a.deliverables.some((report) => report.trim()))
      ));
    case "yesOther":
      if (!a || typeof a !== "object") return false;
      if (a.choice === "yes") return true;
      if (a.choice === "other") return typeof a.otherText === "string" && a.otherText.trim() !== "";
      return false;
    case "yesNoOther":
      if (!a || typeof a !== "object") return false;
      if (a.choice === "yes" || a.choice === "no") return true;
      if (a.choice === "other") return typeof a.otherText === "string" && a.otherText.trim() !== "";
      return false;
    case "checklist": {
      if (!a || typeof a !== "object") return false;
      const selected = a.selected && typeof a.selected === "object" ? a.selected : {};
      const any = Object.values(selected).some(Boolean);
      const otherOk = typeof a.otherText === "string" && a.otherText.trim() !== "";
      return any || otherOk;
    }
    default:
      return false;
  }
}

// Time is typed manually (HH:MM).
function TimeField({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label ? <div style={{ fontSize: "13px", fontWeight: 700 }}>{label}</div> : null}
      <input
        className="q-input"
        type="time"
        value={normTime(value)}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "auto" }}
      />
    </div>
  );
}

function QuestionCard({ q, answer, onChange }) {
  const requiredMark = q.required ? <span className="q-required">*</span> : null;

  if (q.type === "checklist") {
    const selected = answer?.selected && typeof answer.selected === "object" ? answer.selected : {};
    const otherText = typeof answer?.otherText === "string" ? answer.otherText : "";
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <div className="checklist-group">
          {q.items.map((label) => {
            const id = label;
            const checked = Boolean(selected[id]);
            return (
              <label key={id} className={`check-item ${checked ? "checked" : ""}`}>
                <input
                  className="sr-only"
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    onChange({
                      selected: { ...selected, [id]: e.target.checked },
                      otherText,
                    });
                  }}
                />
                <span className="check-box" aria-hidden="true">
                  <svg viewBox="0 0 12 10" fill="none">
                    <polyline
                      points="1,5 4.5,8.5 11,1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {label}
              </label>
            );
          })}

          {q.hasOther ? (
            <div className="other-block">
              <div className="other-label">Other</div>
              <input
                className="q-input"
                type="text"
                placeholder="Specify..."
                value={otherText}
                onChange={(e) => onChange({ selected, otherText: e.target.value })}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (q.type === "yesOther") {
    const choice = answer?.choice ?? "";
    const otherText = answer?.otherText ?? "";
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <div className="radio-group" role="radiogroup" aria-label={`Q${q.num}`}>
          <label className={`radio-item ${choice === "yes" ? "selected" : ""}`}>
            <input
              className="sr-only"
              type="radio"
              name={`q${q.num}`}
              value="yes"
              checked={choice === "yes"}
              onChange={() => onChange({ choice: "yes", otherText: "" })}
            />
            <span className="radio-circle" aria-hidden="true">
              <span className="radio-dot" />
            </span>
            {q.yesLabel ?? "Yes"}
          </label>
          <label className={`radio-item ${choice === "other" ? "selected" : ""}`}>
            <input
              className="sr-only"
              type="radio"
              name={`q${q.num}`}
              value="other"
              checked={choice === "other"}
              onChange={() => onChange({ choice: "other", otherText })}
            />
            <span className="radio-circle" aria-hidden="true">
              <span className="radio-dot" />
            </span>
            {q.otherLabel ?? "Other"}
          </label>
        </div>
        {choice === "other" ? (
          <input
            className="q-input q-input-inline"
            type="text"
            placeholder="Specify..."
            value={otherText}
            onChange={(e) => onChange({ choice, otherText: e.target.value })}
          />
        ) : null}
      </div>
    );
  }

  if (q.type === "yesNoOther") {
    const choice = answer?.choice ?? "";
    const otherText = answer?.otherText ?? "";
    const isNo = choice === "no";
    const needsNote = isNo && !otherText.trim();
    
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""} ${needsNote ? "has-issue" : ""}`} style={needsNote ? { borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' } : isNo ? { borderLeft: '4px solid #f59e0b' } : {}}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <div className="radio-group" role="radiogroup" aria-label={`Q${q.num}`}>
          {[
            ["yes", "Yes"],
            ["no", "No"],
            ["other", "Other"],
          ].map(([val, label]) => (
            <label key={val} className={`radio-item ${choice === val ? "selected" : ""}`}>
              <input
                className="sr-only"
                type="radio"
                name={`q${q.num}`}
                value={val}
                checked={choice === val}
                onChange={() => onChange({ choice: val, otherText: (val === "other" || val === "no") ? otherText : "" })}
              />
              <span className="radio-circle" aria-hidden="true">
                <span className="radio-dot" />
              </span>
              {label}
            </label>
          ))}
        </div>
        {(choice === "other" || choice === "no") ? (
          <input
            className="q-input q-input-inline"
            type="text"
            placeholder={choice === "no" ? "Note required for 'No'..." : "Specify..."}
            value={otherText}
            onChange={(e) => onChange({ choice, otherText: e.target.value })}
            style={needsNote ? { borderColor: '#ef4444' } : {}}
          />
        ) : null}
      </div>
    );
  }

  const value = typeof answer === "string" ? answer : "";
  const inputId = `q${q.num}`;
  const common = {
    id: inputId,
    name: inputId,
    value,
    onChange: (e) => onChange(e.target.value),
  };

  if (q.type === "agendaTable") {
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">{q.text}</span>
        </div>
        <TrialAgendaTables answer={answer} onChange={onChange} />
      </div>
    );
  }

  if (q.type === "time") {
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <TimeField value={answer} onChange={onChange} />
      </div>
    );
  }

  if (q.type === "timeRange") {
    const range = answer && typeof answer === "object" ? answer : { start: "", end: "" };
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <TimeField label="Start time" value={range.start} onChange={(v) => onChange({ ...range, start: v })} />
          <TimeField label="End time" value={range.end} onChange={(v) => onChange({ ...range, end: v })} />
        </div>
      </div>
    );
  }

  if (q.type === "socPair") {
    const pair = answer && typeof answer === "object" ? answer : { battery1: "", battery2: "" };
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <span className="q-text">
            {q.text} {requiredMark}
          </span>
        </div>
        <div className="soc-pair-fields">
          <label className="soc-pair-field">
            <span>Battery 1 SoC</span>
            <input
              className="q-input"
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              placeholder="Enter percentage"
              value={pair.battery1 ?? ""}
              onChange={(event) => onChange({ ...pair, battery1: event.target.value })}
            />
            <span className="soc-pair-unit">%</span>
          </label>
          <label className="soc-pair-field">
            <span>Battery 2 SoC</span>
            <input
              className="q-input"
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              placeholder="Enter percentage"
              value={pair.battery2 ?? ""}
              onChange={(event) => onChange({ ...pair, battery2: event.target.value })}
            />
            <span className="soc-pair-unit">%</span>
          </label>
        </div>
      </div>
    );
  }

  if (q.type === "textarea") {
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <label className="q-text" htmlFor={inputId}>
            {q.text} {requiredMark}
          </label>
        </div>
        <textarea className="q-input" rows={q.rows ?? 3} placeholder={q.placeholder ?? ""} {...common} />
      </div>
    );
  }

  if (q.type === "select") {
    return (
      <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
        <div className="q-label">
          <span className="q-num">Q{q.num}</span>
          <label className="q-text" htmlFor={inputId}>
            {q.text} {requiredMark}
          </label>
        </div>
        <select className="q-select" {...common}>
          {q.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={`q-card ${isQuestionAnswered(q, answer) ? "has-answer" : ""}`}>
      <div className="q-label">
        <span className="q-num">Q{q.num}</span>
        <label className="q-text" htmlFor={inputId}>
          {q.text} {requiredMark}
        </label>
      </div>
      <input
        className={q.type === "date" ? "q-date" : "q-input"}
        type={q.type === "time" ? "time" : q.type === "date" ? "date" : "text"}
        placeholder={q.placeholder ?? ""}
        {...common}
      />
    </div>
  );
}

function TrialAgendaTables({ answer, onChange }) {
  const activities = Array.isArray(answer?.activities) ? answer.activities : [];
  const deliverables = Array.isArray(answer?.deliverables) ? answer.deliverables : [];
  const updateActivity = (index, field, value) => {
    onChange({
      ...answer,
      activities: activities.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  };

  return (
    <div className="trial-agenda-tables">
      <h3 className="trial-agenda-heading" id="trial-activities-heading">Internal Agenda</h3>
      <div className="trial-agenda-table-wrap">
        <table className="trial-agenda-table" aria-labelledby="trial-activities-heading">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Activity</th>
              <th scope="col">Details</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {activities.map((item, index) => (
              <tr key={`activity-${index}`}>
                <td><input className="trial-agenda-cell-input" aria-label={`Activity ${index + 1} category`} value={item.category ?? ""} onChange={(event) => updateActivity(index, "category", event.target.value)} /></td>
                <td><input className="trial-agenda-cell-input" aria-label={`Activity ${index + 1} activity`} value={item.activity ?? ""} onChange={(event) => updateActivity(index, "activity", event.target.value)} /></td>
                <td><input className="trial-agenda-cell-input" aria-label={`Activity ${index + 1} details`} value={item.details ?? ""} onChange={(event) => updateActivity(index, "details", event.target.value)} /></td>
                <td>
                  <button className="trial-agenda-remove" type="button" aria-label={`Remove activity ${index + 1}`} onClick={() => onChange({ ...answer, activities: activities.filter((_, itemIndex) => itemIndex !== index) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="trial-agenda-add" type="button" onClick={() => onChange({ ...answer, activities: [...activities, { category: "", activity: "", details: "" }] })}>
        Add activity
      </button>

      <h3 className="trial-agenda-heading" id="external-deliverables-heading">External Agenda</h3>
      <div className="trial-agenda-table-wrap trial-deliverables-table-wrap">
        <table className="trial-agenda-table trial-deliverables-table" aria-labelledby="external-deliverables-heading">
          <thead>
            <tr>
              <th scope="col">Sr. No.</th>
              <th scope="col">Report</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {deliverables.map((report, index) => (
              <tr key={`deliverable-${index}`}>
                <td>{index + 1}</td>
                <td><input className="trial-agenda-cell-input" aria-label={`Report ${index + 1}`} value={report ?? ""} onChange={(event) => onChange({ ...answer, deliverables: deliverables.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })} /></td>
                <td>
                  <button className="trial-agenda-remove" type="button" aria-label={`Remove report ${index + 1}`} onClick={() => onChange({ ...answer, deliverables: deliverables.filter((_, itemIndex) => itemIndex !== index) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="trial-agenda-add" type="button" onClick={() => onChange({ ...answer, deliverables: [...deliverables, ""] })}>
        Add report
      </button>
    </div>
  );
}

function Section({ section, answers, setAnswer, flash }) {
  return (
    <section
      className={`section-block ${flash ? "section-flash" : ""} ${section.pmoOnly ? "pmo-section" : ""}`}
      id={section.id}
    >
      <header className="section-header">
        <div className="section-num">{String(section.id.replace("sec", "")).padStart(2, "0")}</div>
        <div className="section-info">
          <div className="section-title">{section.title}</div>
          <div className="section-desc">{section.desc}</div>
        </div>
      </header>

      {section.pmoOnly ? <div className="section-pmo-note">ONLY FOR PMO</div> : null}

      {section.questions.map((q) => (
        <QuestionCard
          key={q.num}
          q={q}
          answer={answers[q.num]}
          onChange={(next) => setAnswer(q.num, next)}
        />
      ))}
    </section>
  );
}

export default function ChecklistApp() {
  const { employee, logout } = useAuth();
  const [isLoadingUi, setIsLoadingUi] = useState(true);
  const [scrollPct, setScrollPct] = useState(0);
  const [version, setVersion] = useState("Trolly");
  const currentSections = useMemo(() => getChecklistSectionsForVersion(version), [version]);
  const [activeSection, setActiveSection] = useState(currentSections[0]?.id ?? "sec1");
  const [flashSectionId, setFlashSectionId] = useState("");
  const [toast, setToast] = useState("");
  const [trialId, setTrialId] = useState("");
  const [trialTitle, setTrialTitle] = useState("Untitled trial");
  const [trialTitleOverride, setTrialTitleOverride] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [trialCreatedAt, setTrialCreatedAt] = useState("");
  const [isRailwayMenuOpen, setIsRailwayMenuOpen] = useState(false);

  // Trial ID format: RLM/DD/MM/YYYY/ML/serial  (date is automatic, the rest is typed)
  const [trialIdParts, setTrialIdParts] = useState({ rlm: "RLM", date: "", ml: "", serial: "" });
  const customTrialId = useMemo(() => buildTrialId(trialIdParts), [trialIdParts]);
  const setCustomTrialId = (value) =>
    setTrialIdParts({ ...parseTrialId(value), date: todayDDMMYYYY() });

  // Fill today's date on the client (avoids server/browser timezone mismatch)
  useEffect(() => {
    setTrialIdParts((p) => (p.date ? p : { ...p, date: todayDDMMYYYY() }));
  }, []);

  const [isTrialSwitcherOpen, setIsTrialSwitcherOpen] = useState(false);
  const [trials, setTrials] = useState([]);
  const [isMobileUi, setIsMobileUi] = useState(false);
  const [isActionsCollapsed, setIsActionsCollapsed] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ raisedBy: "", dateLocation: "", mastNumber: "", issueType: "", description: "" });
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  const activeSectionRef = useRef(activeSection);
  const suppressAutosaveRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => {
      const mobile = mq.matches;
      setIsMobileUi(mobile);
      // Keep actions always visible on desktop.
      if (!mobile) setIsActionsCollapsed(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const [answers, setAnswers] = useState(() => makeBaseAnswers("Trolly"));

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!employee) {
      setAnswers(makeBaseAnswers(version));
      setTrialId("");
      setTrialTitle("Untitled trial");
      setTrialTitleOverride("");
      setLastSavedAt("");
      setTrialCreatedAt("");
      setCustomTrialId("");
      setActiveTrialId("");
      return;
    }

    let cancelled = false;
    const initialize = async () => {
      let existingTrials = listTrials();
      if (!existingTrials.length) {
        const legacy = loadChecklist();
        if (legacy && typeof legacy === "object" && legacy.answers) {
          const migratedId = ensureActiveTrialId();
          saveTrial(
            migratedId,
            { ...legacy, migratedFromLegacy: true },
            {
              title: deriveTrialTitle(legacy.answers) || "Migrated trial",
              createdAt: legacy.createdAt,
              updatedAt: legacy.updatedAt,
            },
          );
        }
      }

      try {
        existingTrials = await syncTrialsWithServer();
      } catch (error) {
        if (cancelled) return;
        console.error("Shared trial sync failed:", error);
        setToast(`Shared history is unavailable: ${error.message}`);
        existingTrials = listTrials();
      }
      if (cancelled) return;

      const params = new URLSearchParams(window.location.search ?? "");
      const requestedId = params.get("trialId") ?? "";
      const urlVersion = params.get("version") ?? "";
      autoSubmittedRef.current = false;

      setTrials(existingTrials);

      const existingActive = getActiveTrialId();
      let id = requestedId || existingActive;
      if (!id && existingTrials[0]?.trialId) id = existingTrials[0].trialId;
      if (!id) id = ensureActiveTrialId();

      let loaded = null;
      try {
        loaded = await loadSharedTrial(id);
      } catch (error) {
        if (cancelled) return;
        console.error("Shared trial load failed:", error);
        setToast(`Could not load the shared trial: ${error.message}`);
        loaded = loadTrial(id);
      }
      if (cancelled) return;

      const meta = existingTrials.find((t) => t.trialId === id);

      // The saved trial decides the version (Trolly / V2.2), so a refresh or re-login keeps the right form.
      const validVersions = ["Trolly", "V2.2"];
      const startVersion =
        [loaded?.version, meta?.version, urlVersion].find((v) => validVersions.includes(v)) || "Trolly";
      setVersion(startVersion);

      suppressAutosaveRef.current = true;
      setTrialId(id);
      setActiveTrialId(id);
      if (loaded && typeof loaded === "object" && loaded.answers) {
        setAnswers(makeCurrentAnswers(startVersion, loaded.answers));
        setLastSavedAt(loaded.updatedAt ?? "");
        setTrialCreatedAt(loaded.createdAt ?? meta?.createdAt ?? "");
        setCustomTrialId(loaded.customTrialId || meta?.customTrialId || "");
        if (loaded.submitted) autoSubmittedRef.current = true;
        const override = safeShort(loaded.titleOverride);
        setTrialTitleOverride(override);
        setTrialTitle(override || deriveTrialTitle(loaded.answers));
      } else {
        const base = makeBaseAnswers(startVersion);
        setAnswers(base);
        setLastSavedAt("");
        const createdAt = meta?.createdAt ?? new Date().toISOString();
        setTrialCreatedAt(createdAt);
        setTrialTitleOverride("");
        setTrialTitle(deriveTrialTitle(base));
      }
      window.requestAnimationFrame(() => {
        suppressAutosaveRef.current = false;
      });
    };

    const frame = window.requestAnimationFrame(() => {
      initialize().catch((error) => {
        if (cancelled) return;
        console.error("Trial initialization failed:", error);
        setToast(`Could not initialize shared trials: ${error.message}`);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [employee]);

  useEffect(() => {
    const handleSyncError = (event) => {
      setToast(`Shared save failed. This device still has a local copy. ${event.detail?.message || ""}`);
    };
    window.addEventListener("trial-sync-error", handleSyncError);
    return () => window.removeEventListener("trial-sync-error", handleSyncError);
  }, []);

  // Persist (debounced-ish)
  useEffect(() => {
    if (!trialId) return;
    if (suppressAutosaveRef.current) return;
    const updatedAt = new Date().toISOString();
    const createdAt = trialCreatedAt || updatedAt;
    const derived = deriveTrialTitle(answers);
    const title = safeShort(trialTitleOverride) || derived;
    setTrialTitle(title);
    setLastSavedAt(updatedAt);
    saveTrial(
      trialId,
      {
        answers,
        createdAt,
        updatedAt,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
        titleOverride: safeShort(trialTitleOverride),
      },
      {
        title,
        createdAt,
        updatedAt,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
      },
    );

    // Keep legacy storage updated for backwards compatibility (single-trial consumers).
    saveChecklist({ answers, updatedAt, trialId });
  }, [answers, trialId, trialTitleOverride, trialCreatedAt, version, customTrialId]);

  useEffect(() => {
    setActiveSection(currentSections[0]?.id ?? "sec1");
  }, [currentSections]);

  useEffect(() => {
    let raf = 0;
    let warmup = 0;
    let sectionEls = [];

    const getMetrics = () => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollingEl = document.scrollingElement;

      const scrollTop = Math.max(
        window.scrollY ?? 0,
        docEl?.scrollTop ?? 0,
        body?.scrollTop ?? 0,
        scrollingEl?.scrollTop ?? 0,
      );

      const scrollHeight = Math.max(
        docEl?.scrollHeight ?? 0,
        body?.scrollHeight ?? 0,
        scrollingEl?.scrollHeight ?? 0,
      );

      const clientHeight = window.innerHeight ?? docEl?.clientHeight ?? 0;
      const max = Math.max(0, scrollHeight - clientHeight);
      const y = Math.max(0, scrollTop);
      return { max, y };
    };

    const getHeaderOffset = () => {
      const header = document.querySelector(".header");
      const progress = document.querySelector(".global-progress");
      const headerH = header instanceof HTMLElement ? header.offsetHeight : 64;
      const progressH = progress instanceof HTMLElement ? progress.offsetHeight : 14;
      return headerH + progressH + 12;
    };

    const ensureSectionEls = () => {
      if (sectionEls.length) return;
      sectionEls = currentSections.map((s) => document.getElementById(s.id)).filter(Boolean);
    };

    const updateActiveSectionFromScroll = () => {
      ensureSectionEls();
      if (!sectionEls.length) return;

      const offset = getHeaderOffset();
      let bestId = sectionEls[0]?.id ?? "";
      let bestTop = Number.NEGATIVE_INFINITY;

      for (const el of sectionEls) {
        const top = el.getBoundingClientRect().top;
        // Keep the active item on the section whose top has crossed the sticky header line.
        if (top <= offset + 4 && top > bestTop) {
          bestTop = top;
          bestId = el.id;
        }
      }

      if (bestId && bestId !== activeSectionRef.current) {
        setActiveSection(bestId);
        if (typeof window !== "undefined") window.history.replaceState(null, "", `#${bestId}`);
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const { max, y } = getMetrics();
        const pctNow = max > 0 ? Math.round((y / max) * 100) : 0;
        setScrollPct(Math.max(0, Math.min(100, pctNow)));
        updateActiveSectionFromScroll();
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    // Warm up during first paint/layout so we pick up correct heights even before the first user scroll.
    const tick = () => {
      if (warmup >= 8) return;
      warmup += 1;
      onScroll();
      window.requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [currentSections]);

  const allQuestions = useMemo(() => currentSections.flatMap((s) => s.questions), [currentSections]);
  const submissionThreshold = 30;

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const q of allQuestions) {
      if (isQuestionAnswered(q, answers[q.num])) count += 1;
    }
    return count;
  }, [allQuestions, answers]);

  const blockingIssues = useMemo(() => {
    const issues = [];
    for (const q of allQuestions) {
      const a = answers[q.num];
      if (q.required && !isQuestionAnswered(q, a)) {
        issues.push(`Q${q.num} is required`);
      } else if (q.type === "yesNoOther" && a?.choice === "no") {
        if (!a.otherText || a.otherText.trim() === "") {
          issues.push(`Q${q.num}: 'No' requires a note`);
        }
      }
    }
    return issues;
  }, [allQuestions, answers]);

  const requiredStats = useMemo(() => {
    const requiredQuestions = allQuestions.filter((q) => q.required);
    const requiredAnswered = requiredQuestions.reduce(
      (acc, q) => acc + (isQuestionAnswered(q, answers[q.num]) ? 1 : 0),
      0,
    );
    return { requiredTotal: requiredQuestions.length, requiredAnswered };
  }, [allQuestions, answers]);

  const pct = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);

  const sectionStats = useMemo(() => {
    const stats = {};
    for (const s of currentSections) {
      const total = s.questions.length;
      const answered = s.questions.reduce((acc, q) => acc + (isQuestionAnswered(q, answers[q.num]) ? 1 : 0), 0);
      stats[s.id] = { total, answered };
    }
    return stats;
  }, [answers, currentSections]);

  // Active section follows scroll position (scrollspy).

  useEffect(() => {
    // Give the app a short moment to hydrate + load persisted state for a smoother first paint.
    const t = setTimeout(() => setIsLoadingUi(false), 450);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isLoadingUi) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const id = hash?.startsWith("#") ? hash.slice(1) : "";
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    window.requestAnimationFrame(() => {
      setActiveSection(id);
      el.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [isLoadingUi]);

  function setAnswer(num, next) {
    setAnswers((prev) => ({ ...prev, [num]: next }));
  }

  function openTicketModal() {
    setTicketForm({ raisedBy: "", dateLocation: "", mastNumber: "", issueType: "", description: "" });
    setTicketSubmitting(false);
    setIsTicketModalOpen(true);
  }

  function closeTicketModal() {
    if (ticketSubmitting) return;
    setIsTicketModalOpen(false);
  }

  function updateTicketField(field, value) {
    setTicketForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submitTicket(e) {
    e.preventDefault();
    if (!ticketForm.raisedBy.trim() || !ticketForm.dateLocation.trim() || !ticketForm.mastNumber.trim() || !ticketForm.issueType || !ticketForm.description.trim()) {
      setToast("Please answer all 5 ticket questions");
      return;
    }

    setTicketSubmitting(true);
    const ticket = {
      raisedBy: ticketForm.raisedBy.trim(),
      issueType: ticketForm.issueType,
      dateLocation: ticketForm.dateLocation.trim(),
      mastNumber: ticketForm.mastNumber.trim(),
      description: ticketForm.description.trim(),
      trialId: trialId || "",
    };

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ticket),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Ticket could not be saved.");
      }

      setTicketSubmitting(false);
      setIsTicketModalOpen(false);
      setTicketForm({ raisedBy: "", dateLocation: "", mastNumber: "", issueType: "", description: "" });
      setToast(result.emailError
        ? `${result.ticket.ticketId} saved, but email notification failed: ${result.emailError}`
        : `${result.ticket.ticketId} raised successfully`);
    } catch (error) {
      console.error("Ticket submission error:", error);
      setTicketSubmitting(false);
      setToast(error instanceof Error ? error.message : "Ticket could not be saved. Please try again.");
    }
  }

  // Switch between Trolly and V2.2 without losing a half-filled form.
  // The current form is already autosaved, so we only need to load (or create) the draft for the chosen version.
  async function selectVersion(nextVersion) {
    if (!nextVersion || nextVersion === version) return;

    // Latest unfinished draft that belongs to the chosen version.
    const draft = listTrials()
      .filter((t) => t.trialId !== trialId && t.version === nextVersion)
      .filter((t) => !loadTrial(t.trialId)?.submitted)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];

    suppressAutosaveRef.current = true;
    autoSubmittedRef.current = false;
    setVersion(nextVersion);
    setFlashSectionId("");
    setActiveSection(getChecklistSectionsForVersion(nextVersion)[0]?.id ?? "sec1");

    let nextId;
    let nextAnswers;
    let nextCreatedAt;
    let nextCustomTrialId;
    let nextTitleOverride;
    let nextTitle;
    let savedTrial = {};

    if (draft) {
      // Reopen the half-filled form.
      try {
        savedTrial = await loadSharedTrial(draft.trialId) || {};
      } catch (error) {
        setToast(`Could not open the saved ${nextVersion} trial: ${error.message}`);
        return;
      }
      nextId = draft.trialId;
      nextAnswers = makeCurrentAnswers(nextVersion, savedTrial.answers || {});
      nextCreatedAt = savedTrial.createdAt ?? draft.createdAt ?? new Date().toISOString();
      nextCustomTrialId = savedTrial.customTrialId || draft.customTrialId || "";
      nextTitleOverride = safeShort(savedTrial.titleOverride);
      nextTitle = nextTitleOverride || deriveTrialTitle(nextAnswers);
      setLastSavedAt(savedTrial.updatedAt ?? "");
    } else {
      // No draft yet: start a blank form for this version.
      nextId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      nextAnswers = makeBaseAnswers(nextVersion);
      nextCreatedAt = new Date().toISOString();
      nextCustomTrialId = "";
      nextTitleOverride = "";
      nextTitle = "Untitled trial";
      setLastSavedAt("");
    }

    const updatedAt = new Date().toISOString();
    setTrialId(nextId);
    setActiveTrialId(nextId);
    setAnswers(nextAnswers);
    setTrialCreatedAt(nextCreatedAt);
    setCustomTrialId(nextCustomTrialId);
    setTrialTitleOverride(nextTitleOverride);
    setTrialTitle(nextTitle);
    saveTrial(
      nextId,
      {
        ...savedTrial,
        answers: nextAnswers,
        createdAt: nextCreatedAt,
        updatedAt,
        version: safeVersionLabel(nextVersion),
        customTrialId: safeShort(nextCustomTrialId),
        titleOverride: nextTitleOverride,
      },
      {
        title: nextTitle,
        createdAt: nextCreatedAt,
        updatedAt,
        version: safeVersionLabel(nextVersion),
        customTrialId: safeShort(nextCustomTrialId),
      },
    );
    setTrials(listTrials());
    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("trialId", nextId);
      url.searchParams.set("version", nextVersion);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function startNewTrial() {
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const answersForTrial = makeBaseAnswers(version);
    setActiveTrialId(fresh);
    setTrialId(fresh);
    autoSubmittedRef.current = false;
    suppressAutosaveRef.current = true;
    setTrialCreatedAt(createdAt);
    setAnswers(answersForTrial);
    setTrialTitle("Untitled trial");
    setTrialTitleOverride("");
    setCustomTrialId("");
    setLastSavedAt("");
    saveTrial(
      fresh,
      {
        answers: answersForTrial,
        createdAt,
        updatedAt: createdAt,
        version: safeVersionLabel(version),
        customTrialId: "",
        titleOverride: "",
      },
      {
        title: "Untitled trial",
        createdAt,
        updatedAt: createdAt,
        version: safeVersionLabel(version),
        customTrialId: "",
      },
    );
    setTrials(listTrials());
    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("trialId", fresh);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function switchTrial(nextTrialId) {
    if (!nextTrialId || nextTrialId === trialId) return;
    let loaded;
    try {
      loaded = await loadSharedTrial(nextTrialId);
    } catch (error) {
      setToast(`Could not open this shared trial: ${error.message}`);
      return;
    }
    const meta = listTrials().find((t) => t.trialId === nextTrialId);
    suppressAutosaveRef.current = true;
    setTrialId(nextTrialId);
    setActiveTrialId(nextTrialId);
    autoSubmittedRef.current = false;
    if (loaded && typeof loaded === "object" && loaded.answers) {
      setAnswers(makeCurrentAnswers(version, loaded.answers));
      setLastSavedAt(loaded.updatedAt ?? "");
      setTrialCreatedAt(loaded.createdAt ?? meta?.createdAt ?? "");
      setVersion((prev) => loaded.version || meta?.version || prev || "");
      setCustomTrialId(loaded.customTrialId || meta?.customTrialId || "");
      const override = safeShort(loaded.titleOverride);
      setTrialTitleOverride(override);
      setTrialTitle(override || deriveTrialTitle(loaded.answers));
    } else {
      const base = makeBaseAnswers();
      setAnswers(base);
      setLastSavedAt("");
      setTrialCreatedAt(meta?.createdAt ?? new Date().toISOString());
      setTrialTitleOverride("");
      setCustomTrialId("");
      setTrialTitle(deriveTrialTitle(base));
    }
    setTrials(listTrials());
    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("trialId", nextTrialId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function removeTrial(id) {
    if (!id) return;
    const ok = window.confirm("Delete this shared trial for everyone? This cannot be undone.");
    if (!ok) return;
    deleteTrial(id);
    const remaining = listTrials();
    setTrials(remaining);
    if (trialId === id) {
      const fallback = remaining[0]?.trialId || ensureActiveTrialId();
      switchTrial(fallback);
    }
  }

  function copyResumeLink(id) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("trialId", id);
    const text = url.toString();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => setToast("Resume link copied"))
        .catch(() => setToast("Could not copy link"));
    } else {
      setToast(text);
    }
  }

  function renameTrial(nextTitle) {
    if (!trialId) return;
    const cleaned = safeShort(nextTitle);
    suppressAutosaveRef.current = true;
    setTrialTitleOverride(cleaned);
    const derived = deriveTrialTitle(answers);
    const finalTitle = cleaned || derived;
    setTrialTitle(finalTitle);
    const updatedAt = new Date().toISOString();
    const createdAt = trialCreatedAt || updatedAt;
    setLastSavedAt(updatedAt);
    saveTrial(
      trialId,
      { answers, createdAt, updatedAt, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId), titleOverride: cleaned },
      { title: finalTitle, createdAt, updatedAt, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId) },
    );
    setTrials(listTrials());
    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });
    setToast(cleaned ? "Trial renamed" : "Trial name reset to automatic");
  }

  function autoSubmitTrial() {
    if (autoSubmittedRef.current || !trialId || blockingIssues.length > 0 || answeredCount < submissionThreshold) return;
    autoSubmittedRef.current = true;
    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};
    saveTrial(
      trialId,
      { ...current, answers, createdAt: trialCreatedAt || current.createdAt || submittedAt, updatedAt: submittedAt, submittedAt, submitted: true, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId) },
      { title: trialTitle, createdAt: trialCreatedAt || submittedAt, updatedAt: submittedAt, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId) },
    );
    setTrials(listTrials());
    setToast("Trial submitted successfully.");
  }

  const remainingRequiredMessage = blockingIssues.length
    ? `${blockingIssues.length} required field(s) still need attention: ${blockingIssues.slice(0, 3).join("; ")}${blockingIssues.length > 3 ? " ..." : ""}`
    : "";

  function submitCurrentTrial() {
    if (!trialId) return;
    if (blockingIssues.length > 0) {
      setToast(remainingRequiredMessage || "Please complete the required questions before submitting.");
      return;
    }
    if (answeredCount < submissionThreshold) {
      setToast(`Please answer at least ${submissionThreshold} questions before submitting.`);
      return;
    }
    autoSubmittedRef.current = true;
    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};
    saveTrial(
      trialId,
      { ...current, answers, createdAt: trialCreatedAt || current.createdAt || submittedAt, updatedAt: submittedAt, submittedAt, submitted: true, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId) },
      { title: trialTitle, createdAt: trialCreatedAt || submittedAt, updatedAt: submittedAt, version: safeVersionLabel(version), customTrialId: safeShort(customTrialId) },
    );
    setTrials(listTrials());
    setToast("Trial submitted successfully.");
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  function goToSection(id, e) {
    if (e) e.preventDefault();
    setActiveSection(id);
    setFlashSectionId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window !== "undefined") window.history.replaceState(null, "", `#${id}`);
    }
    window.setTimeout(() => {
      setFlashSectionId((prev) => (prev === id ? "" : prev));
    }, 900);
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          Trial Checklist
          <div className="compact-control-group">
            <button type="button" className="compact-control compact-control-button" aria-label="RailwayMitra project selector">
              RailwayMitra
            </button>
            <select
              id="railway-version"
              value={version}
              onChange={(e) => selectVersion(e.target.value)}
              className="compact-control compact-control-select"
              aria-label="Select project version"
            >
              <option value="Trolly">Trolly</option>
              <option value="V2.2">V2.2</option>
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
              <input
                type="text"
                value={trialIdParts.rlm}
                onChange={(e) => setTrialIdParts((p) => ({ ...p, rlm: e.target.value.replace(/\//g, "") }))}
                placeholder="RLM"
                aria-label="Trial ID prefix"
                className="compact-control compact-control-input"
                style={{ width: "56px" }}
              />
              <span>/</span>
              <input
                type="text"
                value={trialIdParts.date}
                readOnly
                title="Filled automatically with today's date"
                aria-label="Trial ID date (automatic)"
                className="compact-control compact-control-input"
                style={{ width: "100px", opacity: 0.85 }}
              />
              <span>/</span>
              <select
                value={trialIdParts.ml}
                onChange={(e) => setTrialIdParts((p) => ({ ...p, ml: e.target.value.replace(/\//g, "") }))}
                aria-label="Trial ID track"
                className="compact-control compact-control-select"
                style={{ width: "124px" }}
              >
                <option value="ML">ML</option>
                <option value="TT">TT (Test Track)</option>
              </select>
              <span>/</span>
              <input
                type="text"
                value={trialIdParts.serial}
                onChange={(e) => setTrialIdParts((p) => ({ ...p, serial: e.target.value.replace(/\//g, "") }))}
                placeholder="No."
                aria-label="Trial ID serial number"
                className="compact-control compact-control-input"
                style={{ width: "64px" }}
              />
            </div>
          </div>
        </div>
        <div className="header-right">
          {employee ? <span className="header-user">{employee.name}</span> : null}
          <span className="header-answered">
            {answeredCount} / {TOTAL_QUESTIONS} answered
          </span>
          <span className="progress-pill">{pct}%</span>
          <button className="raise-ticket-btn" type="button" onClick={openTicketModal}>
            🎫 Raise Ticket
          </button>
          <button
            className="trial-btn"
            type="button"
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {isTicketModalOpen ? (
        <div
          className="ticket-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeTicketModal();
          }}
        >
          <div className="ticket-panel">
            <div className="ticket-panel-head">
              <div>
                <div className="ticket-kicker">SUPPORT</div>
                <div className="ticket-panel-title" id="ticket-modal-title">Raise a Ticket</div>
                <div className="ticket-panel-subtitle">Provide the issue details below.</div>
              </div>
              <button className="ticket-close" type="button" onClick={closeTicketModal} aria-label="Close ticket form">
                ×
              </button>
            </div>

            <form className="ticket-form" onSubmit={submitTicket}>
              <div className="ticket-question">
                <label htmlFor="ticket-raised-by">1. Raised by <span>*</span></label>
                <input
                  id="ticket-raised-by"
                  className="ticket-input"
                  type="text"
                  placeholder="Name of person raising the ticket..."
                  value={ticketForm.raisedBy}
                  onChange={(e) => updateTicketField("raisedBy", e.target.value)}
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-date-location">2. Date and location of the issue <span>*</span></label>
                <input
                  id="ticket-date-location"
                  className="ticket-input"
                  type="text"
                  placeholder="Date (DD/MM/YYYY) and site / block location..."
                  value={ticketForm.dateLocation}
                  onChange={(e) => updateTicketField("dateLocation", e.target.value)}
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-mast-number">3. Mast number <span>*</span></label>
                <input
                  id="ticket-mast-number"
                  className="ticket-input"
                  type="text"
                  placeholder="Mast number..."
                  value={ticketForm.mastNumber}
                  onChange={(e) => updateTicketField("mastNumber", e.target.value)}
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-issue-type">4. Type of issue <span>*</span></label>
                <select
                  id="ticket-issue-type"
                  className="ticket-select"
                  value={ticketForm.issueType}
                  onChange={(e) => updateTicketField("issueType", e.target.value)}
                  required
                >
                  <option value="">Select type of issue</option>
                  <option value="Software">Software</option>
                  <option value="Hardware">Hardware</option>
                </select>
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-description">5. What is the issue? Describe <span>*</span></label>
                <input
                  id="ticket-description"
                  className="ticket-input"
                  type="text"
                  placeholder="Describe the issue..."
                  value={ticketForm.description}
                  onChange={(e) => updateTicketField("description", e.target.value)}
                  required
                />
              </div>

              <div className="ticket-form-footer">
                <span className="ticket-required-note">* All 5 questions are required</span>
                <div className="ticket-actions">
                  <button className="ticket-cancel" type="button" onClick={closeTicketModal} disabled={ticketSubmitting}>
                    Cancel
                  </button>
                  <button className="ticket-submit" type="submit" disabled={ticketSubmitting}>
                    {ticketSubmitting ? "Raising..." : "Raise Ticket"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isTrialSwitcherOpen ? (
        <div
          className="trial-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Trials"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTrialSwitcherOpen(false);
          }}
        >
          <div className="trial-panel">
            <div className="trial-panel-head">
              <div className="trial-panel-title">Trials shared with your team</div>
              <button className="trial-panel-close" type="button" onClick={() => setIsTrialSwitcherOpen(false)}>
                ×
              </button>
            </div>

            <div className="trial-panel-actions">
              <button className="trial-new" type="button" onClick={startNewTrial}>
                + New trial
              </button>
              {trialId ? (
                <button className="trial-link" type="button" onClick={() => copyResumeLink(trialId)}>
                  Copy current link
                </button>
              ) : null}
            </div>

            <div className="trial-list" role="list">
              {(trials.length ? trials : listTrials()).map((t) => {
                const active = t.trialId === trialId;
                return (
                  <div key={t.trialId} className={`trial-item ${active ? "active" : ""}`} role="listitem">
                    <div className="trial-item-main">
                      <div className="trial-item-title">{t.title ?? "Untitled trial"}</div>
                      <div className="trial-item-sub">
                        {t.updatedAt ? `Updated ${formatIso(t.updatedAt)}` : ""}
                        {active ? " · Current" : ""}
                      </div>
                    </div>
                    <div className="trial-item-actions">
                      <button className="trial-open" type="button" onClick={() => switchTrial(t.trialId)}>
                        Open
                      </button>
                      <button
                        className="trial-open"
                        type="button"
                        onClick={async () => {
                          const next = window.prompt("Trial name:", t.title ?? "");
                          if (next == null) return;
                          if (t.trialId === trialId) renameTrial(next);
                          else {
                            let loaded;
                            try {
                              loaded = await loadSharedTrial(t.trialId);
                            } catch (error) {
                              setToast(`Could not rename this shared trial: ${error.message}`);
                              return;
                            }
                            const answersForTitle = loaded?.answers ?? {};
                            const cleaned = safeShort(next);
                            const derived = deriveTrialTitle(answersForTitle);
                            const finalTitle = cleaned || derived;
                            const updatedAt = new Date().toISOString();
                            saveTrial(
                              t.trialId,
                              { ...(loaded ?? { answers: makeBaseAnswers() }), updatedAt, titleOverride: cleaned },
                              {
                                title: finalTitle,
                                updatedAt,
                                createdAt: loaded?.createdAt ?? t.createdAt,
                                version: loaded?.version ?? t.version,
                                customTrialId: loaded?.customTrialId ?? t.customTrialId,
                              },
                            );
                            setTrials(listTrials());
                            setToast(cleaned ? "Trial renamed" : "Trial name reset to automatic");
                          }
                        }}
                      >
                        Rename
                      </button>
                      <button className="trial-copy" type="button" onClick={() => copyResumeLink(t.trialId)}>
                        Link
                      </button>
                      <button className="trial-del" type="button" onClick={() => removeTrial(t.trialId)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!trials.length && !listTrials().length ? <div className="trial-empty">No saved trials yet.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="global-progress" aria-hidden="true" style={{ "--progress": scrollPct }}>
        <div className="global-progress-track" />
        <div className="global-progress-fill" />
        <div className="global-progress-caret" />
      </div>

      <div className="layout">
        <nav className="sidebar" aria-label="Sections">
          <div className="sidebar-label">Sections</div>
          {currentSections.map((s, idx) => {
            const st = sectionStats[s.id];
            return (
              <a
                key={s.id}
                className={`sidebar-item ${activeSection === s.id ? "active" : ""}`}
                href={`#${s.id}`}
                onClick={(e) => goToSection(s.id, e)}
              >
                <span className="sidebar-dot" />
                {s.shortTitle}
                <span className="sidebar-num">S{idx + 1}</span>
                <span className="sidebar-count">
                  {st.answered}/{st.total}
                </span>
              </a>
            );
          })}
          {/* Logout is in the header. */}
        </nav>

        <main className="main">
          {isLoadingUi ? (
            <SkeletonView />
          ) : (
            currentSections.map((s) => (
              <Section
                key={s.id}
                section={s}
                answers={answers}
                setAnswer={setAnswer}
                flash={flashSectionId === s.id}
              />
            ))
          )}
        </main>
      </div>

      <div
        className={`submit-bar ${isMobileUi && isActionsCollapsed ? "compact" : ""}`}
        role="region"
        aria-label="Actions"
      >
        <div className="submit-session-info" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <button
            className="header-trial"
            type="button"
            title="Rename trial"
            onClick={() => {
              const next = window.prompt(
                "Trial name (leave empty to use automatic name from Trial Info):",
                trialTitleOverride || trialTitle,
              );
              if (next == null) return;
              renameTrial(next);
            }}
            style={{ padding: 0, textAlign: 'left', fontSize: '15px', color: 'var(--accent)', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.3, marginBottom: '4px' }}
          >
            {trialTitle}
          </button>
          <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
            {trialCreatedAt ? `Started: ${formatIso(trialCreatedAt)}` : ""}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
            {lastSavedAt ? `Saved: ${formatIso(lastSavedAt)}` : "Not saved yet"}
          </div>
        </div>

        <div className="submit-top">
          <div className="submit-stats">
            <strong>{answeredCount}</strong> of <strong>{TOTAL_QUESTIONS}</strong> answered &nbsp;·&nbsp;{" "}
            <span>{pct}%</span>
            <span className="submit-required" style={{ display: 'block', marginTop: '4px' }}>
              Required: {requiredStats.requiredAnswered}/{requiredStats.requiredTotal}
            </span>
          </div>
          {isMobileUi ? (
            <button
              className="submit-toggle"
              type="button"
              aria-expanded={!isActionsCollapsed}
              aria-controls="submit-actions"
              onClick={() => setIsActionsCollapsed((v) => !v)}
              title={isActionsCollapsed ? "Open actions" : "Collapse actions"}
            >
              {isActionsCollapsed ? "↑" : "×"}
            </button>
          ) : null}
        </div>

        <div
          id="submit-actions"
          className="submit-actions"
          hidden={isMobileUi && isActionsCollapsed}
        >
          <button className="btn-secondary" type="button" onClick={() => { window.location.href = "/history"; }}>
            Trial History
          </button>
          <button className="btn-secondary" type="button" onClick={() => { window.location.href = "/tickets"; }}>
            Support Tickets
          </button>
          <button className="btn-submit" type="button" onClick={submitCurrentTrial}>
            Submit
          </button>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function SkeletonView() {
  return (
    <div className="skeleton">
      <div className="skeleton-section">
        <div className="skeleton-header">
          <div className="skeleton-num shimmer" />
          <div className="skeleton-lines">
            <div className="skeleton-line shimmer" style={{ width: "58%" }} />
            <div className="skeleton-line shimmer" style={{ width: "86%" }} />
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton-card shimmer" />
        ))}
      </div>
    </div>
  );
}