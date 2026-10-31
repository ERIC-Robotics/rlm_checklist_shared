"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  DEFAULT_TRIAL_AGENDA,
  getChecklistSectionsForVersion,
  SECTIONS,
  TOTAL_QUESTIONS,
} from "../../lib/checklistData";
import { canEditAgenda } from "../../lib/agendaAccess";
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

const VALID_VERSIONS = ["Trolly", "V2.2"];

function agendaQuestionNums(version) {
  const sections = getChecklistSectionsForVersion(version);
  const pmoSections = sections.filter((s) => s.pmoOnly);
  const chosen = pmoSections.length ? pmoSections : sections.slice(0, 1);
  return chosen.flatMap((s) => s.questions.map((q) => q.num));
}

// Finds the answers of the newest submitted trial of this version.
// Reads straight from the server so other people's trials are not cached here.
async function findSubmittedAnswers(version, trials) {
  const candidates = trials
    .filter(
      (t) =>
        t.version === version && (t.submitted || t.agendaSubmitted),
    )
    .sort((a, b) => {
      const byAgendaSubmission =
        Number(Boolean(b.agendaSubmitted)) - Number(Boolean(a.agendaSubmitted));
      if (byAgendaSubmission) return byAgendaSubmission;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .slice(0, 8);

  const cachedAnswers = candidates.find(
    (trial) =>
      trial.agendaAnswers &&
      typeof trial.agendaAnswers === "object",
  )?.agendaAnswers;
  if (cachedAnswers) return cachedAnswers;

  const candidatesNeedingLookup = candidates.filter((trial) => !trial.agendaAnswers);
  const responses = await Promise.all(candidatesNeedingLookup.map(async (t) => {
    try {
      const response = await fetch(`/api/trials/${encodeURIComponent(t.trialId)}`);
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      const state = data?.trial;
      return (state?.submitted || state?.agendaSubmitted) && state.answers
        ? state.answers
        : null;
    } catch {
      return null;
    }
  }));
  return responses.find(Boolean) || null;
}

// Copies only the agenda answers. Aadhaar numbers are never copied to others.
function pickAgendaAnswers(version, sourceAnswers) {
  const picked = {};

  for (const num of agendaQuestionNums(version)) {
    if (sourceAnswers[num] === undefined) continue;
    picked[num] = structuredClone(sourceAnswers[num]);
  }

  const members = picked[5]?.externalMembers;

  if (Array.isArray(members)) {
    picked[5] = {
      ...picked[5],
      externalMembers: members.map((m) => ({ ...m, aadhaar: "" })),
    };
  }

  return picked;
}

// True only if this trial was created by the logged-in employee.
function isOwnTrial(meta, employeeCode) {
  if (!meta?.trialId || !employeeCode) return false;

  const owner =
    meta.ownerCode ||
    listTrials().find((t) => t.trialId === meta.trialId)?.ownerCode;

  if (owner) return owner === employeeCode;

  // Older trials with no owner saved: mine only if saved on this login.
  return Boolean(loadTrial(meta.trialId));
}

function localISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeShort(s) {
  return typeof s === "string" ? s.trim() : "";
}

function AcknowledgementPrintDocument({ answers, fullEmployeeAadhaars }) {
  const [printRoot, setPrintRoot] = useState(null);
  const roster = answers?.[5] && typeof answers[5] === "object" ? answers[5] : {};
  const selected = Array.isArray(roster.selectedEmployees)
    ? roster.selectedEmployees.map((member) => ({
        name: member.name || "",
        aadhaar:
          fullEmployeeAadhaars[member.code] ||
          (member.aadhaarLast4 ? `XXXX-XXXX-${member.aadhaarLast4}` : ""),
      }))
    : [];
  const external = Array.isArray(roster.externalMembers)
    ? roster.externalMembers.map((member) => ({
        name: member.name || "",
        aadhaar: member.aadhaar || "",
      }))
    : [];
  const legacy = typeof roster.legacyNames === "string"
    ? roster.legacyNames.split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean)
    : [];
  const members = [...selected, ...external, ...legacy.map((name) => ({ name }))];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPrintRoot(document.body));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!printRoot) return null;

  return (
    createPortal(<article className="acknowledgement-print">
      <header className="ack-letterhead">
        <img src="/logo.png" alt="ERIC Robotics" />
        <div className="ack-letterhead-contact">
          <div><span aria-hidden="true">◎</span> www.ericrobotics.com</div>
          <div><span aria-hidden="true">✉</span> info@ericrobotics.com</div>
        </div>
      </header>
      <div className="ack-letterhead-rule" />

      <div className="ack-letter-date">
        <strong>Date:</strong> <span className="ack-date-line" />
      </div>

      <div className="ack-company-details">
        <strong>ERIC Robotics Private Limited</strong><br />
        17/8, D-1 Block, MIDC, Chinchwad, Pune, Maharashtra – 411019<br />
        Email: chirag.jhawar@ericrobotics.com | Mobile: +91 70380 90881
      </div>

      <div className="ack-recipient">
        <strong>To,</strong><br />
        The Commandant,<br />
        Uttar Pradesh Special Security Force (UPSSF)<br />
        Namo Bharat (RTTS) Corridor, Delhi-Ghaziabad-Meerut.
      </div>

      <p className="ack-subject">
        <strong>Subject: Acknowledgment of Team Members and Equipment for NCRTC Trials</strong>
      </p>
      <p>Dear Sir/M&apos;am,</p>
      <p>
        We hereby acknowledge that the following team members of ERIC Robotics Private Limited
        will be present for the technical trials at the designated NCRTC site. Their details
        are given below:
      </p>

      <table className="ack-table ack-members-table">
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>Name of Team Member</th>
            <th>Aadhaar Card Number</th>
          </tr>
        </thead>
        <tbody>
          {(members.length ? members : [{ name: "" }]).map((member, index) => (
            <tr key={`ack-member-${index}`}>
              <td>{index + 1}.</td>
              <td>{member.name}</td>
              <td>{member.aadhaar}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        The following material/equipment will be carried by the team for the
        trials, on a returnable basis:
      </p>
      <table className="ack-table ack-equipment-table">
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>Material / Equipment</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Box containing the robot body", "1"],
            ["Boxes containing the robot arms", "2"],
            ["Box containing sensors", "1"],
            ["Box containing batteries and toolbox", "1"],
            ["Yellow Trolley", "1"],
          ].map(([equipment, quantity], index) => (
            <tr key={`ack-equipment-${index}`}>
              <td>{index + 1}</td>
              <td>{equipment}</td>
              <td>{quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        We request that the above members and equipment be granted access to the
        site for the purpose of conducting the trials. All necessary precautions
        will be taken for safe handling and transportation.
      </p>
      <p>Yours sincerely</p>

      <footer className="ack-signature-blocks">
        <div>
          <strong>Chirag Jhawar</strong><br />
          Charge(PIC)<br />
          Co-Founder &amp; CEO<br />
          ERIC Robotics Private Limited
        </div>
        <div className="ack-person-signature">
          Person In-Charge<br /><br />
          Signature
        </div>
      </footer>
      <footer className="ack-page-footer">
        <strong>CIN: U72200PN2018PTC179772</strong>
        <span><span aria-hidden="true">●</span> 17/8, D-1 Block, MIDC, Chinchwad, Pune – 411019</span>
      </footer>
    </article>, printRoot)
  );
}

// ---- Trial ID helpers: RLMDDMMYYYY/track/serial ----
function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
}

// Supports legacy IDs ("RLM/01/10/2026/ML/12") and current IDs
// ("RLM01102026/ML/12").
function parseTrialId(value) {
  const parts = String(value || "").split("/");

  if (parts.length === 6) {
    return {
      rlm: parts[0],
      date: `${parts[1]}${parts[2]}${parts[3]}`,
      ml: parts[4],
      serial: parts[5],
    };
  }

  if (parts.length === 3) {
    const prefixAndDate = parts[0].match(/^(.*?)(\d{8})$/);
    if (prefixAndDate) {
      return {
        rlm: prefixAndDate[1],
        date: prefixAndDate[2],
        ml: parts[1],
        serial: parts[2],
      };
    }
  }

  return {
    rlm: "RLM",
    date: todayDDMMYYYY(),
    ml: "ML",
    serial: "",
  };
}

function buildTrialId({ rlm, date, ml, serial }) {
  if (!safeShort(ml) && !safeShort(serial)) return "";
  return `${safeShort(rlm)}${date}/${safeShort(ml)}/${safeShort(serial)}`;
}

async function allocateCustomTrialId(parts) {
  const response = await fetch("/api/trials/serial", { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !/^\d+$/.test(String(data.serial || ""))) {
    throw new Error(data.error || "Could not allocate the next trial number.");
  }

  return buildTrialId({
    ...parts,
    rlm: parts.rlm || "RLM",
    date: todayDDMMYYYY(),
    ml: parts.ml || "ML",
    serial: data.serial,
  });
}

function deriveTrialTitle(answers) {
  const blockDate = safeShort(answers?.[1]);
  const locationAnswer = answers?.[2];
  const location = typeof locationAnswer === "string"
    ? safeShort(locationAnswer)
    : [safeShort(locationAnswer?.from), safeShort(locationAnswer?.to)]
        .filter(Boolean)
        .join(" to ");
  const parts = [blockDate, location].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Untitled trial";
}

// Decide the version synchronously on the very first render, so the page
// never flashes "Trolly" before switching to "V2.2".
function resolveInitialVersion() {
  if (typeof window === "undefined") return "Trolly";
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    const urlVersion = params.get("version") ?? "";
    const requestedId = params.get("trialId") ?? "";
    const id = requestedId || getActiveTrialId();
    const metaVersion = id
      ? listTrials().find((t) => t.trialId === id)?.version
      : "";

    const order = [urlVersion, metaVersion];

    return order.find((v) => VALID_VERSIONS.includes(v)) || "Trolly";
  } catch {
    return "Trolly";
  }
}

function makeBaseAnswers(version = "Trolly") {
  const base = {};

  getChecklistSectionsForVersion(version)
    .flatMap((s) => s.questions)
    .forEach((q) => {
      if (base[q.num] !== undefined) return;

      if (q.type === "locationPair") {
        base[q.num] = { from: "", to: "" };
      } else if (q.type === "checklist") {
        base[q.num] = { selected: {}, otherText: "" };
      } else if (q.type === "yesNoOther") {
        base[q.num] = { choice: "", otherText: "" };
      } else if (q.type === "yesOther") {
        base[q.num] = { choice: "", otherText: "" };
      } else if (q.type === "employeeRoster") {
        base[q.num] = { selectedEmployees: [], externalMembers: [] };
      } else if (q.type === "timeRange") {
        base[q.num] = { start: "", end: "" };
      } else if (q.type === "socPair") {
        base[q.num] = { battery1: "", battery2: "" };
      } else if (q.type === "date") {
        base[q.num] = localISODate();
      } else if (q.type === "agendaTable") {
        base[q.num] = structuredClone(DEFAULT_TRIAL_AGENDA);
      } else {
        base[q.num] = "";
      }
    });

  return base;
}

function makeCurrentAnswers(version = "Trolly", savedAnswers = {}) {
  const answers = {
    ...makeBaseAnswers(version),
    ...savedAnswers,
  };

  if (typeof answers[2] === "string") {
    answers[2] = { from: answers[2], to: "" };
  } else if (!answers[2] || typeof answers[2] !== "object") {
    answers[2] = { from: "", to: "" };
  }

  const savedRoster = savedAnswers[4];
  const savedRosterIsLegacy =
    typeof savedRoster === "string" ||
    (savedRoster &&
      typeof savedRoster === "object" &&
      ("selectedEmployees" in savedRoster ||
        "externalMembers" in savedRoster ||
        "legacyNames" in savedRoster));
  const savedFifthIsRoster =
    savedAnswers[5] &&
    typeof savedAnswers[5] === "object" &&
    ("selectedEmployees" in savedAnswers[5] ||
      "externalMembers" in savedAnswers[5] ||
      "legacyNames" in savedAnswers[5]);
  const savedFifthIsAgenda =
    savedAnswers[5] &&
    typeof savedAnswers[5] === "object" &&
    ("activities" in savedAnswers[5] || "deliverables" in savedAnswers[5]);

  if (
    !savedFifthIsRoster &&
    (savedRosterIsLegacy || savedFifthIsAgenda)
  ) {
    answers[4] = savedFifthIsAgenda
      ? savedAnswers[5]
      : structuredClone(DEFAULT_TRIAL_AGENDA);
    answers[5] = savedRosterIsLegacy
      ? savedRoster
      : { selectedEmployees: [], externalMembers: [] };
  }

  if (typeof answers[4] === "string") {
    answers[4] = answers[4].trim()
      ? {
          activities: [
            {
              category: "Agenda Item",
              activity: "Imported from previous agenda",
              details: answers[4],
            },
          ],
          deliverables: structuredClone(DEFAULT_TRIAL_AGENDA.deliverables),
        }
      : structuredClone(DEFAULT_TRIAL_AGENDA);
  } else if (!answers[4] || typeof answers[4] !== "object") {
    answers[4] = structuredClone(DEFAULT_TRIAL_AGENDA);
  } else {
    answers[4] = {
      ...answers[4],
      activities: Array.isArray(answers[4].activities)
        ? answers[4].activities
        : [],
      deliverables: Array.isArray(answers[4].deliverables)
        ? answers[4].deliverables
        : [],
    };
  }

  if (typeof answers[5] === "string") {
    answers[5] = {
      selectedEmployees: [],
      externalMembers: [],
      legacyNames: answers[5],
    };
  } else if (!answers[5] || typeof answers[5] !== "object") {
    answers[5] = { selectedEmployees: [], externalMembers: [] };
  } else {
    answers[5] = {
      ...answers[5],
      selectedEmployees: Array.isArray(answers[5].selectedEmployees)
        ? answers[5].selectedEmployees
        : [],
      externalMembers: Array.isArray(answers[5].externalMembers)
        ? answers[5].externalMembers
        : [],
    };
  }

  [14, 22].forEach((num) => {
    if (typeof answers[num] === "string") {
      const values = [
        ...answers[num].matchAll(
          /(?:battery\s*[12]\s*:\s*)?(\d+(?:\.\d+)?)\s*%?/gi,
        ),
      ].map((match) => match[1]);

      answers[num] = {
        battery1: values[0] ?? "",
        battery2: values[1] ?? "",
      };
    } else if (!answers[num] || typeof answers[num] !== "object") {
      answers[num] = { battery1: "", battery2: "" };
    } else {
      answers[num] = {
        battery1: String(answers[num].battery1 ?? ""),
        battery2: String(answers[num].battery2 ?? ""),
      };
    }
  });

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
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeVersionLabel(raw) {
  const v = safeShort(raw);
  return v || "RailwayMitra";
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
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
  return typeof v === "string"
    ? v
    : v && typeof v === "object"
      ? v.value || ""
      : "";
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
      return (
        Boolean(String(a.battery1 ?? "").trim()) &&
        Boolean(String(a.battery2 ?? "").trim())
      );

    case "date":
    case "select":
      return typeof a === "string" && a.trim() !== "";

    case "locationPair":
      if (typeof a === "string") return a.trim() !== "";
      return Boolean(
        a &&
          typeof a === "object" &&
          (String(a.from ?? "").trim() || String(a.to ?? "").trim()),
      );

    case "agendaTable":
      return Boolean(
        a &&
          typeof a === "object" &&
          ((Array.isArray(a.activities) &&
            a.activities.some(
              (item) => item.category || item.activity || item.details,
            )) ||
            (Array.isArray(a.deliverables) &&
              a.deliverables.some((report) => report.trim()))),
      );

    case "employeeRoster":
      return Boolean(
        a &&
          typeof a === "object" &&
          ((Array.isArray(a.selectedEmployees) &&
            a.selectedEmployees.length > 0) ||
            (Array.isArray(a.externalMembers) &&
              a.externalMembers.some(
                (member) =>
                  member?.name || member?.designation || member?.aadhaar,
              )) ||
            a.legacyNames),
      );

    case "yesOther":
      if (!a || typeof a !== "object") return false;
      if (a.choice === "yes") return true;
      if (a.choice === "other") {
        return typeof a.otherText === "string" && a.otherText.trim() !== "";
      }
      return false;

    case "yesNoOther":
      if (!a || typeof a !== "object") return false;
      if (a.choice === "yes" || a.choice === "no") return true;
      if (a.choice === "other") {
        return typeof a.otherText === "string" && a.otherText.trim() !== "";
      }
      return false;

    case "checklist": {
      if (!a || typeof a !== "object") return false;
      const selected =
        a.selected && typeof a.selected === "object" ? a.selected : {};
      const any = Object.values(selected).some(Boolean);
      const otherOk =
        typeof a.otherText === "string" && a.otherText.trim() !== "";
      return any || otherOk;
    }

    default:
      return false;
  }
}

// Time is captured as HH:MM:SS. The Now button records the current local time.
function getCurrentTimeHHMMSS() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function TimeField({ label, value, onChange }) {
  const currentValue = normTime(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {label ? (
        <div style={{ fontSize: "13px", fontWeight: 700 }}>{label}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <input
          className="q-input"
          type="text"
          inputMode="numeric"
          placeholder="HH:MM:SS"
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "180px" }}
          aria-label={label ? `${label} time` : "Time"}
        />

        <button
          type="button"
          className="trial-agenda-add"
          onClick={() => onChange(getCurrentTimeHHMMSS())}
          style={{
            minWidth: "78px",
            padding: "10px 16px",
            cursor: "pointer",
          }}
        >
          Now
        </button>
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  answer,
  onChange,
  readOnly = false,
  onPrintAcknowledgment,
}) {
  const requiredMark = q.required ? <span className="q-required">*</span> : null;
  const displayNum = q.displayNum ?? q.num;
  const answeredClass = isQuestionAnswered(q, answer) ? "has-answer" : "";

  const header = (withLabel) => (
    <div className="q-label">
      <span className="q-num">Q{displayNum}</span>
      {withLabel ? (
        <label className="q-text" htmlFor={`q${q.num}`}>
          {q.text} {requiredMark}
        </label>
      ) : (
        <span className="q-text">
          {q.text} {requiredMark}
        </span>
      )}
    </div>
  );

  if (q.type === "employeeRoster") {
    return (
      <div className="q-card">
        <div className="q-label">
          <span className="q-num">Q{displayNum}</span>
          <span className="q-text">{q.text}</span>
        </div>
        <EmployeeRoster
          answer={answer}
          onChange={onChange}
          readOnly={readOnly}
          onPrintAcknowledgment={onPrintAcknowledgment}
        />
      </div>
    );
  }

  if (q.type === "checklist") {
    const selected =
      answer?.selected && typeof answer.selected === "object"
        ? answer.selected
        : {};
    const otherText =
      typeof answer?.otherText === "string" ? answer.otherText : "";

    return (
      <div className={`q-card ${answeredClass}`}>
        {header(false)}

        <div className="checklist-group">
          {q.items.map((label) => {
            const id = label;
            const checked = Boolean(selected[id]);

            return (
              <label
                key={id}
                className={`check-item ${checked ? "checked" : ""}`}
              >
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
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({ selected, otherText: e.target.value })
                }
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
      <div className={`q-card ${answeredClass}`}>
        {header(false)}

        <div className="radio-group" role="radiogroup" aria-label={`Q${q.num}`}>
          <label className={`radio-item ${choice === "yes" ? "selected" : ""}`}>
            <input
              className="sr-only"
              type="radio"
              name={`q${q.num}`}
              value="yes"
              checked={choice === "yes"}
              disabled={readOnly}
              onChange={() => onChange({ choice: "yes", otherText: "" })}
            />
            <span className="radio-circle" aria-hidden="true">
              <span className="radio-dot" />
            </span>
            {q.yesLabel ?? "Yes"}
          </label>

          <label
            className={`radio-item ${choice === "other" ? "selected" : ""}`}
          >
            <input
              className="sr-only"
              type="radio"
              name={`q${q.num}`}
              value="other"
              checked={choice === "other"}
              disabled={readOnly}
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
            readOnly={readOnly}
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
      <div
        className={`q-card ${answeredClass} ${needsNote ? "has-issue" : ""}`}
        style={
          needsNote
            ? { borderLeft: "4px solid #ef4444", backgroundColor: "#fef2f2" }
            : isNo
              ? { borderLeft: "4px solid #f59e0b" }
              : {}
        }
      >
        {header(false)}

        <div className="radio-group" role="radiogroup" aria-label={`Q${q.num}`}>
          {[
            ["yes", "Yes"],
            ["no", "No"],
            ["other", "Other"],
          ].map(([val, label]) => (
            <label
              key={val}
              className={`radio-item ${choice === val ? "selected" : ""}`}
            >
              <input
                className="sr-only"
                type="radio"
                name={`q${q.num}`}
                value={val}
                checked={choice === val}
                disabled={readOnly}
                onChange={() =>
                  onChange({
                    choice: val,
                    otherText: val === "other" || val === "no" ? otherText : "",
                  })
                }
              />
              <span className="radio-circle" aria-hidden="true">
                <span className="radio-dot" />
              </span>
              {label}
            </label>
          ))}
        </div>

        {choice === "other" || choice === "no" ? (
          <input
            className="q-input q-input-inline"
            type="text"
            placeholder={
              choice === "no" ? "Note required for 'No'..." : "Specify..."
            }
            value={otherText}
            readOnly={readOnly}
            onChange={(e) => onChange({ choice, otherText: e.target.value })}
            style={needsNote ? { borderColor: "#ef4444" } : {}}
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

  if (q.type === "locationPair") {
    const location =
      answer && typeof answer === "object"
        ? answer
        : { from: typeof answer === "string" ? answer : "", to: "" };

    return (
      <div className={`q-card ${answeredClass}`}>
        {header(true)}
        <div className="location-pair-fields">
          <label>
            <span>From</span>
            <input
              className="q-input"
              type="text"
              id={inputId}
              placeholder="From location..."
              value={location.from ?? ""}
              readOnly={readOnly}
              onChange={(event) =>
                onChange({ ...location, from: event.target.value })
              }
            />
          </label>
          <label>
            <span>To</span>
            <input
              className="q-input"
              type="text"
              id={`${inputId}-to`}
              placeholder="To location..."
              value={location.to ?? ""}
              readOnly={readOnly}
              onChange={(event) =>
                onChange({ ...location, to: event.target.value })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (q.type === "agendaTable") {
    return (
      <div className={`q-card ${answeredClass}`}>
        <div className="q-label">
          <span className="q-num">Q{displayNum}</span>
          <span className="q-text">{q.text}</span>
        </div>
        <TrialAgendaTables answer={answer} onChange={onChange} readOnly={readOnly} />
      </div>
    );
  }

  if (q.type === "time") {
    return (
      <div className={`q-card ${answeredClass}`}>
        {header(false)}
        <TimeField value={answer} onChange={onChange} />
      </div>
    );
  }

  if (q.type === "timeRange") {
    const range =
      answer && typeof answer === "object" ? answer : { start: "", end: "" };

    return (
      <div className={`q-card ${answeredClass}`}>
        {header(false)}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <TimeField
            label="Start time"
            value={range.start}
            onChange={(v) => onChange({ ...range, start: v })}
          />
          <TimeField
            label="End time"
            value={range.end}
            onChange={(v) => onChange({ ...range, end: v })}
          />
        </div>
      </div>
    );
  }

  if (q.type === "socPair") {
    const pair =
      answer && typeof answer === "object"
        ? answer
        : { battery1: "", battery2: "" };

    return (
      <div className={`q-card ${answeredClass}`}>
        {header(false)}

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
              onChange={(event) =>
                onChange({ ...pair, battery1: event.target.value })
              }
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
              onChange={(event) =>
                onChange({ ...pair, battery2: event.target.value })
              }
            />
            <span className="soc-pair-unit">%</span>
          </label>
        </div>
      </div>
    );
  }

  if (q.type === "textarea") {
    return (
      <div className={`q-card ${answeredClass}`}>
        {header(true)}
        <textarea
          className="q-input"
          rows={q.rows ?? 3}
          placeholder={q.placeholder ?? ""}
          readOnly={readOnly}
          {...common}
        />
      </div>
    );
  }

  if (q.type === "number") {
    return (
      <div className={`q-card ${answeredClass}`}>
        {header(true)}
        <input
          className="q-input"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder={q.placeholder ?? ""}
          readOnly={readOnly}
          {...common}
        />
      </div>
    );
  }

  if (q.type === "select") {
    return (
      <div className={`q-card ${answeredClass}`}>
        {header(true)}
        <select className="q-select" disabled={readOnly} {...common}>
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
    <div className={`q-card ${answeredClass}`}>
      {header(true)}
      <input
        className={q.type === "date" ? "q-date" : "q-input"}
        type={q.type === "time" ? "time" : q.type === "date" ? "date" : "text"}
        placeholder={q.placeholder ?? ""}
        readOnly={readOnly}
        {...common}
      />
    </div>
  );
}

function TrialAgendaTables({ answer, onChange, readOnly = false }) {
  const activities = Array.isArray(answer?.activities) ? answer.activities : [];
  const deliverables = Array.isArray(answer?.deliverables)
    ? answer.deliverables
    : [];

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
      <h3 className="trial-agenda-heading" id="trial-activities-heading">
        Internal Agenda
      </h3>

      <div className="trial-agenda-table-wrap">
        <table
          className="trial-agenda-table"
          aria-labelledby="trial-activities-heading"
        >
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Activity</th>
              <th scope="col">Details</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {activities.map((item, index) => (
              <tr key={`activity-${index}`}>
                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`Activity ${index + 1} category`}
                    value={item.category ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateActivity(index, "category", event.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`Activity ${index + 1} activity`}
                    value={item.activity ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateActivity(index, "activity", event.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`Activity ${index + 1} details`}
                    value={item.details ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateActivity(index, "details", event.target.value)
                    }
                  />
                </td>

                <td>
                  <button
                    className="trial-agenda-remove"
                    type="button"
                    disabled={readOnly}
                    aria-label={`Remove activity ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...answer,
                        activities: activities.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="trial-agenda-add"
        type="button"
        disabled={readOnly}
        onClick={() =>
          onChange({
            ...answer,
            activities: [
              ...activities,
              { category: "", activity: "", details: "" },
            ],
          })
        }
      >
        Add activity
      </button>

      <h3 className="trial-agenda-heading" id="external-deliverables-heading">
        External Agenda
      </h3>

      <div className="trial-agenda-table-wrap trial-deliverables-table-wrap">
        <table
          className="trial-agenda-table trial-deliverables-table"
          aria-labelledby="external-deliverables-heading"
        >
          <thead>
            <tr>
              <th scope="col">Sr. No.</th>
              <th scope="col">Report</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {deliverables.map((report, index) => (
              <tr key={`deliverable-${index}`}>
                <td>{index + 1}</td>

                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`Report ${index + 1}`}
                    value={report ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      onChange({
                        ...answer,
                        deliverables: deliverables.map((value, itemIndex) =>
                          itemIndex === index ? event.target.value : value,
                        ),
                      })
                    }
                  />
                </td>

                <td>
                  <button
                    className="trial-agenda-remove"
                    type="button"
                    disabled={readOnly}
                    aria-label={`Remove report ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...answer,
                        deliverables: deliverables.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="trial-agenda-add"
        type="button"
        disabled={readOnly}
        onClick={() =>
          onChange({ ...answer, deliverables: [...deliverables, ""] })
        }
      >
        Add report
      </button>
    </div>
  );
}

// Cached: the employee list is fetched once and shared by every render.
let employeesPromise = null;

async function fetchAgendaEmployees() {
  if (!employeesPromise) {
    employeesPromise = (async () => {
      const response = await fetch("/api/agenda-employees");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Could not load employees.");
      }

      return Array.isArray(data.employees) ? data.employees : [];
    })().catch((error) => {
      employeesPromise = null;
      throw error;
    });
  }

  return employeesPromise;
}

// Type-ahead employee search (replaces the old dropdown).
function EmployeeSearch({ employees, selectedEmployees, disabled, onPick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const taken = new Set(selectedEmployees.map((e) => e.code));
    const starts = [];
    const contains = [];

    for (const e of employees) {
      if (taken.has(e.code)) continue;

      const name = String(e.name || "").toLowerCase();
      const code = String(e.code || "").toLowerCase();

      if (name.split(/\s+/).some((word) => word.startsWith(q))) {
        starts.push(e);
      } else if (name.includes(q) || code.includes(q)) {
        contains.push(e);
      }
    }

    return [...starts, ...contains].slice(0, 8);
  }, [query, employees, selectedEmployees]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);

    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(employee) {
    if (!employee) return;
    onPick(employee.code);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && e.key === "ArrowDown") {
      setOpen(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlight]) pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="q-input"
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-label="Search employee by name"
        placeholder="Type employee name"
        autoComplete="off"
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 30,
            maxHeight: "260px",
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {matches.length ? (
            matches.map((employee, index) => (
              <div
                key={employee.code}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(employee);
                }}
                onMouseEnter={() => setHighlight(index)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: index === highlight ? "#fdf3dc" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <span style={{ fontWeight: 600 }}>{employee.name}</span>
                <span style={{ fontSize: "12px", opacity: 0.7 }}>
                  {employee.designation || ""}
                </span>
              </div>
            ))
          ) : (
            <div style={{ padding: "10px 14px", opacity: 0.7 }}>
              No employee found
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PostTrialAgendaSummary({ answer, displayNum, questionText }) {
  const activities = Array.isArray(answer?.activities) ? answer.activities : [];
  const deliverables = Array.isArray(answer?.deliverables)
    ? answer.deliverables
    : [];

  return (
    <section
      className="trial-agenda-tables post-trial-agenda-summary"
    >
      <div className="q-label">
        <span className="q-num">Q{displayNum}</span>
        <span className="q-text">{questionText}</span>
      </div>

      <h4 className="trial-agenda-heading">Internal Agenda</h4>
      <div className="trial-agenda-table-wrap">
        <table className="trial-agenda-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Activity</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {activities.length ? (
              activities.map((item, index) => (
                <tr key={`post-trial-activity-${index}`}>
                  <td>{item.category || "—"}</td>
                  <td>{item.activity || "—"}</td>
                  <td>{item.details || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>No internal agenda submitted.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h4 className="trial-agenda-heading">External Agenda</h4>
      <div className="trial-agenda-table-wrap trial-deliverables-table-wrap">
        <table className="trial-agenda-table trial-deliverables-table">
          <thead>
            <tr>
              <th scope="col">Sr. No.</th>
              <th scope="col">Report</th>
            </tr>
          </thead>
          <tbody>
            {deliverables.length ? (
              deliverables.map((report, index) => (
                <tr key={`post-trial-deliverable-${index}`}>
                  <td>{index + 1}</td>
                  <td>{report || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No external agenda submitted.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeeRoster({
  answer,
  onChange,
  readOnly = false,
  onPrintAcknowledgment,
}) {
  const [employees, setEmployees] = useState([]);
  const [loadError, setLoadError] = useState("");

  const selectedEmployees = Array.isArray(answer?.selectedEmployees)
    ? answer.selectedEmployees
    : [];

  const externalMembers = Array.isArray(answer?.externalMembers)
    ? answer.externalMembers
    : [];

  async function loadEmployees() {
    setLoadError("");

    try {
      setEmployees(await fetchAgendaEmployees());
    } catch (error) {
      setLoadError(error.message || "Could not load employees.");
    }
  }

  useEffect(() => {
    let active = true;

    fetchAgendaEmployees()
      .then((list) => {
        if (active) setEmployees(list);
      })
      .catch((error) => {
        if (active) setLoadError(error.message || "Could not load employees.");
      });

    return () => {
      active = false;
    };
  }, []);

  function updateExternal(index, field, value) {
    onChange({
      ...answer,
      externalMembers: externalMembers.map((member, memberIndex) =>
        memberIndex === index ? { ...member, [field]: value } : member,
      ),
    });
  }

  function addEmployee(employeeCode) {
    const employee = employees.find((item) => item.code === employeeCode);

    if (
      !employee ||
      selectedEmployees.some((item) => item.code === employee.code)
    ) {
      return;
    }

    onChange({
      ...answer,
      selectedEmployees: [...selectedEmployees, employee],
    });
  }

  return (
    <div className="trial-agenda-tables">
      <h3 className="trial-agenda-heading" id="employee-roster-heading">
        Team members
      </h3>

      {loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <button
            className="trial-agenda-add"
            type="button"
            disabled={readOnly}
            onClick={loadEmployees}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="trial-agenda-table-wrap">
        <table
          className="trial-agenda-table"
          aria-labelledby="employee-roster-heading"
        >
          <thead>
            <tr>
              <th scope="col">Employee name</th>
              <th scope="col">Designation</th>
              <th scope="col">Aadhaar (last 4 digits)</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {selectedEmployees.map((employee, index) => (
              <tr key={employee.code}>
                <td>{employee.name}</td>
                <td>{employee.designation || "—"}</td>
                <td>
                  {employee.aadhaarLast4
                    ? `XXXX-XXXX-${employee.aadhaarLast4}`
                    : "Not added"}
                </td>
                <td>
                  <button
                    className="trial-agenda-remove"
                    type="button"
                    disabled={readOnly}
                    aria-label={`Remove ${employee.name}`}
                    onClick={() =>
                      onChange({
                        ...answer,
                        selectedEmployees: selectedEmployees.filter(
                          (_, employeeIndex) => employeeIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}

            {!selectedEmployees.length ? (
              <tr>
                <td colSpan={4}>No team members selected</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="trial-agenda-add-row">
        <EmployeeSearch
          employees={employees}
          selectedEmployees={selectedEmployees}
          disabled={readOnly || Boolean(loadError)}
          onPick={addEmployee}
        />
      </div>
      {!readOnly ? (
        <div className="form-submit-row agenda-print-row">
          <button
            className="btn-secondary form-print-button"
            type="button"
            onClick={onPrintAcknowledgment}
            title="Print the trial acknowledgment"
          >
            Print Acknowledgment
          </button>
        </div>
      ) : null}

      <div className="trial-agenda-table-wrap">
        {!employees.length && !loadError ? <p>Loading employee list…</p> : null}
      </div>

      {answer?.legacyNames ? (
        <p>Previously entered team members: {answer.legacyNames}</p>
      ) : null}

      <h3 className="trial-agenda-heading" id="external-employees-heading">
        External team members
      </h3>

      <div className="trial-agenda-table-wrap">
        <table
          className="trial-agenda-table"
          aria-labelledby="external-employees-heading"
        >
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Designation</th>
              <th scope="col">Aadhaar number</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {externalMembers.map((member, index) => (
              <tr key={`external-member-${index}`}>
                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`External member ${index + 1} name`}
                    value={member.name ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateExternal(index, "name", event.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`External member ${index + 1} designation`}
                    value={member.designation ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateExternal(index, "designation", event.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    className="trial-agenda-cell-input"
                    aria-label={`External member ${index + 1} Aadhaar number`}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={member.aadhaar ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      updateExternal(
                        index,
                        "aadhaar",
                        event.target.value.replace(/\D/g, "").slice(0, 12),
                      )
                    }
                  />
                </td>

                <td>
                  <button
                    className="trial-agenda-remove"
                    type="button"
                    disabled={readOnly}
                    aria-label={`Remove external member ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...answer,
                        externalMembers: externalMembers.filter(
                          (_, memberIndex) => memberIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="trial-agenda-add"
        type="button"
        disabled={readOnly}
        onClick={() =>
          onChange({
            ...answer,
            externalMembers: [
              ...externalMembers,
              { name: "", designation: "", aadhaar: "" },
            ],
          })
        }
      >
        Add external member
      </button>
    </div>
  );
}

function Section({
  section,
  questionDisplayNumbers,
  answers,
  setAnswer,
  flash,
  canEditAgenda,
  onSubmitAgenda,
  agendaSubmitting,
  agendaSubmitted,
  onSubmitPreTrial,
  preTrialSubmitting,
  preTrialSubmitted,
  onSubmitPostTrial,
  postTrialSubmitting,
  onPrintAcknowledgment,
}) {
  function advanceOnEnter(event) {
    let target = event.target;
    const radio =
      target instanceof HTMLInputElement && target.type === "radio"
        ? target
        : target instanceof Element
          ? target
              .closest(".radio-item")
              ?.querySelector('input[type="radio"]')
          : null;

    if (radio) target = radio;

    if (
      event.key !== "Enter" ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (target instanceof HTMLTextAreaElement && event.shiftKey) ||
      !(
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement &&
          ["text", "number", "date", "time", "checkbox", "radio"].includes(
            target.type,
          ))
      )
    ) {
      return;
    }

    const card = target.closest(".q-card");
    if (!card) return;

    const isFocusableControl = (element) =>
      (element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement &&
          !["checkbox", "radio", "file", "hidden"].includes(element.type))) &&
      !element.disabled &&
      element.getClientRects().length > 0;
    const controlsInCard = [...card.querySelectorAll("input, select, textarea")]
      .filter(isFocusableControl);

    const isChoiceInput =
      target instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(target.type);

    if (target instanceof HTMLInputElement && target.type === "radio") {
      if (!target.checked) return;
      event.preventDefault();
      const followUp = card.querySelector(".q-input-inline");
      if (followUp) {
        followUp.focus();
        return;
      }
    }

    if (isChoiceInput) {
      event.preventDefault();
    }

    const nextInCard = isChoiceInput
      ? null
      : controlsInCard[controlsInCard.indexOf(target) + 1];

    if (nextInCard) {
      event.preventDefault();
      nextInCard.focus();
      return;
    }

    const scope = event.currentTarget.closest(".main") || event.currentTarget;
    const cards = [...scope.querySelectorAll(".q-card")];
    const nextCard = cards.slice(cards.indexOf(card) + 1).find((item) =>
      [...item.querySelectorAll("input, select, textarea")].some(isFocusableControl),
    );
    const nextInput = nextCard
      ? [...nextCard.querySelectorAll("input, select, textarea")].find(isFocusableControl)
      : null;

    if (nextInput) {
      event.preventDefault();
      nextInput.focus();
      nextInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <section
      className={`section-block ${flash ? "section-flash" : ""} ${
        section.pmoOnly ? "pmo-section" : ""
      }`}
      id={section.id}
      onKeyDown={advanceOnEnter}
    >
      <header className="section-header">
        <div className="section-num">
          {String(section.id.replace("sec", "")).padStart(2, "0")}
        </div>

        <div className="section-info">
          <div className="section-title">{section.title}</div>
          <div className="section-desc">{section.desc}</div>
        </div>
      </header>

      {section.pmoOnly ? (
        <div className="section-pmo-note">
          {canEditAgenda
            ? "PMO ONLY — you can edit this agenda."
            : "PMO ONLY — read-only."}
        </div>
      ) : null}

      {section.questions.map((q) => {
        // Keep stored question IDs stable while displaying consecutive numbers
        // across the sections in their visible order.
        const displayQuestion = {
          ...q,
          displayNum: questionDisplayNumbers.get(q.num) ?? q.num,
        };
        const isPostTrialAgendaQuestion =
          section.id.startsWith("sec4") && q.num === 34;

        return (
          <Fragment key={q.num}>
            {isPostTrialAgendaQuestion ? (
              <div className="q-card">
                <PostTrialAgendaSummary
                  answer={answers[4]}
                  displayNum={displayQuestion.displayNum}
                  questionText={displayQuestion.text}
                />
              </div>
            ) : (
              <QuestionCard
                q={displayQuestion}
                answer={answers[q.num]}
                onChange={(next) => setAnswer(q.num, next)}
                readOnly={section.pmoOnly && !canEditAgenda}
                onPrintAcknowledgment={onPrintAcknowledgment}
              />
            )}
          </Fragment>
        );
      })}
      {section.id === "agenda" ? (
        <button
          className={`agenda-submit-button${!canEditAgenda ? " agenda-submit-readonly" : ""}`}
          type="button"
          onClick={canEditAgenda ? onSubmitAgenda : undefined}
          disabled={agendaSubmitting || agendaSubmitted || !canEditAgenda}
        >
          {agendaSubmitting
            ? "Submitting…"
            : agendaSubmitted
              ? "Agenda Submitted"
              : "Submit Agenda "}
        </button>
      ) : null}
      {section.id.startsWith("sec3") ? (
        <button
          className="agenda-submit-button post-trial-submit-button"
          type="button"
          onClick={onSubmitPreTrial}
          disabled={preTrialSubmitting || preTrialSubmitted}
        >
          {preTrialSubmitting
            ? "Submitting…"
            : preTrialSubmitted
              ? "Pre-Trial Submitted"
              : "Submit Pre-Trial"}
        </button>
      ) : null}
      {section.id.startsWith("sec4") ? (
        <button
          className="agenda-submit-button post-trial-submit-button"
          type="button"
          onClick={onSubmitPostTrial}
          disabled={postTrialSubmitting}
        >
          {postTrialSubmitting ? "Submitting…" : "Submit Post-Trial"}
        </button>
      ) : null}
    </section>
  );
}

export default function ChecklistApp() {
  const router = useRouter();
  const { employee, logout } = useAuth();
  const isPmo = canEditAgenda(employee?.code);

  const [isLoadingUi, setIsLoadingUi] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  const [version, setVersion] = useState(resolveInitialVersion);

  const currentSections = useMemo(
    () => getChecklistSectionsForVersion(version),
    [version],
  );
  const questionDisplayNumbers = useMemo(() => {
    let displayNum = 0;
    return new Map(
      currentSections.flatMap((section) =>
        section.questions.map((question) => [question.num, ++displayNum]),
      ),
    );
  }, [currentSections]);

  const [activeSection, setActiveSection] = useState(
    currentSections[0]?.id ?? "sec1",
  );
  const [flashSectionId, setFlashSectionId] = useState("");
  const [toast, setToast] = useState("");
  const [fullEmployeeAadhaars, setFullEmployeeAadhaars] = useState({});
  const [trialId, setTrialId] = useState("");
  const [trialTitle, setTrialTitle] = useState("Untitled trial");
  const [trialTitleOverride, setTrialTitleOverride] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [trialCreatedAt, setTrialCreatedAt] = useState("");
  const [isRailwayMenuOpen, setIsRailwayMenuOpen] = useState(false);

  const [trialIdParts, setTrialIdParts] = useState({
    rlm: "RLM",
    date: "",
    ml: "",
    serial: "",
  });

  const customTrialId = useMemo(
    () => buildTrialId(trialIdParts),
    [trialIdParts],
  );

  const setCustomTrialId = (value) =>
    setTrialIdParts({
      ...parseTrialId(value),
      date: todayDDMMYYYY(),
    });

  useEffect(() => {
    setTrialIdParts((p) =>
      p.date ? p : { ...p, date: todayDDMMYYYY() },
    );
  }, []);

  const [isTrialSwitcherOpen, setIsTrialSwitcherOpen] = useState(false);
  const [trials, setTrials] = useState([]);
  const agendaSubmitted = Boolean(
    trials.find((item) => item.trialId === trialId)?.agendaSubmitted ||
    loadTrial(trialId)?.agendaSubmitted,
  );
  const preTrialSubmitted = Boolean(
    trials.find((item) => item.trialId === trialId)?.preTrialSubmitted ||
    loadTrial(trialId)?.preTrialSubmitted,
  );
  const [isMobileUi, setIsMobileUi] = useState(false);
  const [isActionsCollapsed, setIsActionsCollapsed] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    raisedBy: "",
    dateLocation: "",
    issueType: "",
    happened: "",
    expected: "",
  });

  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [agendaSubmitting, setAgendaSubmitting] = useState(false);
  const [preTrialSubmitting, setPreTrialSubmitting] = useState(false);
  const [ticketFiles, setTicketFiles] = useState([]);
  const [trialSubmitting, setTrialSubmitting] = useState(false);

  const activeSectionRef = useRef(activeSection);
  const suppressAutosaveRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    fetchAgendaEmployees().catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mq = window.matchMedia("(max-width: 600px)");

    const apply = () => {
      const mobile = mq.matches;
      setIsMobileUi(mobile);
      if (!mobile) setIsActionsCollapsed(false);
    };

    apply();
    mq.addEventListener("change", apply);

    return () => mq.removeEventListener("change", apply);
  }, []);

  const [answers, setAnswers] = useState(() =>
    makeBaseAnswers(resolveInitialVersion()),
  );

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
      setIsReady(true);
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      const params = new URLSearchParams(window.location.search ?? "");
      const requestedId = params.get("trialId") ?? "";
      const urlVersion = params.get("version") ?? "";
      const forceNewTrial = params.get("newTrial") === "1";
      const fastStartNewTrial = forceNewTrial && VALID_VERSIONS.includes(urlVersion);
      let fastStartId = "";
      let fastStartAnswers = null;
      let fastStartCustomIdPromise = null;

      // A new trial has no remote data to wait for. Show its questions now and
      // finish shared-history sync, agenda prefill, and ID allocation in the background.
      if (fastStartNewTrial) {
        fastStartId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        fastStartAnswers = makeBaseAnswers(urlVersion);
        const createdAt = new Date().toISOString();
        suppressAutosaveRef.current = true;
        setVersion(urlVersion);
        setAnswers(fastStartAnswers);
        setTrialId(fastStartId);
        setActiveTrialId(fastStartId);
        setTrialCreatedAt(createdAt);
        setTrialTitle("Untitled trial");
        setTrialTitleOverride("");
        setLastSavedAt("");
        setCustomTrialId("");
        fastStartCustomIdPromise = allocateCustomTrialId({ rlm: "RLM", ml: "ML" })
          .then((customId) => ({ customId }))
          .catch((allocationError) => ({ allocationError }));
        window.requestAnimationFrame(() => {
          suppressAutosaveRef.current = false;
        });
      }

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

      autoSubmittedRef.current = false;

      setTrials(existingTrials);

      const existingActive = getActiveTrialId();

      let id = forceNewTrial ? fastStartId : requestedId || existingActive;

      if (!id && !forceNewTrial) {
        const mine = existingTrials.find((t) => isOwnTrial(t, employee.code));
        if (mine) id = mine.trialId;
      }

      if (!id && !forceNewTrial) {
        id = ensureActiveTrialId();
      }

      let freshId = Boolean(fastStartId);

      if (VALID_VERSIONS.includes(urlVersion)) {
        const activeMeta = existingTrials.find((t) => t.trialId === id);

        if (forceNewTrial || !activeMeta || activeMeta.version !== urlVersion) {
          const draft = existingTrials
            .filter((t) => t.version === urlVersion)
            .filter((t) => isOwnTrial(t, employee.code))
            .filter((t) => !t.submitted && !loadTrial(t.trialId)?.submitted)
            .sort((a, b) =>
              String(b.updatedAt || "").localeCompare(
                String(a.updatedAt || ""),
              ),
            )[0];

          if (draft && !forceNewTrial) {
            id = draft.trialId;
          } else {
            id = fastStartId || `${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            freshId = true;
          }
        }
      }

      let loaded = null;

      try {
        loaded = freshId ? null : await loadSharedTrial(id);
      } catch (error) {
        if (cancelled) return;

        if (error?.status === 403) {
          window.location.replace("/history");
          return;
        }

        console.error("Shared trial load failed:", error);
        setToast(`Could not load the shared trial: ${error.message}`);
        loaded = loadTrial(id);
      }

      if (cancelled) return;

      const meta = existingTrials.find((t) => t.trialId === id);

      const startVersion =
        (requestedId
          ? [loaded?.version, meta?.version, urlVersion]
          : [urlVersion, loaded?.version, meta?.version]
        ).find((v) => VALID_VERSIONS.includes(v)) || "Trolly";
      const savedCustomTrialId =
        loaded?.customTrialId || meta?.customTrialId || "";
      const needsSubmittedAnswers =
        !canEditAgenda(employee.code) &&
        (!loaded?.answers || (!loaded.submitted && !loaded.agendaSubmitted));
      const [nextCustomTrialId, submittedAnswers] = await Promise.all([
        savedCustomTrialId
          ? Promise.resolve(savedCustomTrialId)
          : fastStartCustomIdPromise
            ? fastStartCustomIdPromise.then(({ customId, allocationError }) => {
                if (allocationError) throw allocationError;
                return customId;
              })
            : allocateCustomTrialId({ rlm: "RLM", ml: "ML" }),
        needsSubmittedAnswers
          ? findSubmittedAnswers(startVersion, existingTrials)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setCustomTrialId(nextCustomTrialId);

      setVersion(startVersion);

      suppressAutosaveRef.current = true;

      setTrialId(id);
      setActiveTrialId(id);

      if (loaded && typeof loaded === "object" && loaded.answers) {
        let loadedAnswers = makeCurrentAnswers(startVersion, loaded.answers);
        if (!canEditAgenda(employee.code) && !loaded.submitted && !loaded.agendaSubmitted) {
          if (submittedAnswers) {
            loadedAnswers = {
              ...loadedAnswers,
              ...pickAgendaAnswers(startVersion, submittedAnswers),
            };
          }
        }
        setAnswers(loadedAnswers);
        setLastSavedAt(loaded.updatedAt ?? "");
        setTrialCreatedAt(loaded.createdAt ?? meta?.createdAt ?? "");

        if (loaded.submitted) {
          autoSubmittedRef.current = true;
        }

        const override = safeShort(loaded.titleOverride);

        setTrialTitleOverride(override);
        setTrialTitle(override || deriveTrialTitle(loadedAnswers));
      } else {
        let base = makeBaseAnswers(startVersion);

        if (!canEditAgenda(employee.code)) {
          if (submittedAnswers) {
            base = { ...base, ...pickAgendaAnswers(startVersion, submittedAnswers) };
          }
        }

        if (fastStartAnswers) {
          const untouchedAgendaAnswers = pickAgendaAnswers(startVersion, base);
          setAnswers((current) => {
            const merged = { ...current };
            for (const [number, value] of Object.entries(untouchedAgendaAnswers)) {
              if (JSON.stringify(current[number]) === JSON.stringify(fastStartAnswers[number])) {
                merged[number] = value;
              }
            }
            return merged;
          });
        } else {
          setAnswers(base);
        }
        setLastSavedAt("");

        const createdAt = meta?.createdAt ?? new Date().toISOString();

        setTrialCreatedAt(createdAt);
        setTrialTitleOverride("");
        if (!fastStartAnswers) setTrialTitle(deriveTrialTitle(base));
      }

      setIsReady(true);

      window.requestAnimationFrame(() => {
        suppressAutosaveRef.current = false;
      });
    };

    const frame = window.requestAnimationFrame(() => {
      initialize().catch((error) => {
        if (cancelled) return;

        console.error("Trial initialization failed:", error);
        setToast(`Could not initialize shared trials: ${error.message}`);
        setIsReady(true);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [employee]);

  useEffect(() => {
    const handleSyncError = (event) => {
      setToast(
        `Shared save failed. This device still has a local copy. ${
          event.detail?.message || ""
        }`,
      );
    };

    window.addEventListener("trial-sync-error", handleSyncError);

    return () => window.removeEventListener("trial-sync-error", handleSyncError);
  }, []);

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

    saveChecklist({ answers, updatedAt, trialId });
  }, [
    answers,
    trialId,
    trialTitleOverride,
    trialCreatedAt,
    version,
    customTrialId,
  ]);

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
      const progressH =
        progress instanceof HTMLElement ? progress.offsetHeight : 14;

      return headerH + progressH + 12;
    };

    const ensureSectionEls = () => {
      if (sectionEls.length) return;

      sectionEls = currentSections
        .map((s) => document.getElementById(s.id))
        .filter(Boolean);
    };

    const updateActiveSectionFromScroll = () => {
      ensureSectionEls();

      if (!sectionEls.length) return;

      const offset = getHeaderOffset();

      let bestId = sectionEls[0]?.id ?? "";
      let bestTop = Number.NEGATIVE_INFINITY;

      for (const el of sectionEls) {
        const top = el.getBoundingClientRect().top;

        if (top <= offset + 4 && top > bestTop) {
          bestTop = top;
          bestId = el.id;
        }
      }

      if (bestId && bestId !== activeSectionRef.current) {
        setActiveSection(bestId);

        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", `#${bestId}`);
        }
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

  const allQuestions = useMemo(
    () => currentSections.flatMap((s) => s.questions),
    [currentSections],
  );

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

    return {
      requiredTotal: requiredQuestions.length,
      requiredAnswered,
    };
  }, [allQuestions, answers]);

  const pct = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);

  const sectionStats = useMemo(() => {
    const stats = {};

    for (const s of currentSections) {
      const total = s.questions.length;

      const answered = s.questions.reduce(
        (acc, q) => acc + (isQuestionAnswered(q, answers[q.num]) ? 1 : 0),
        0,
      );

      stats[s.id] = { total, answered };
    }

    return stats;
  }, [answers, currentSections]);

  useEffect(() => {
    setIsLoadingUi(false);
  }, []);

  useEffect(() => {
    if (isLoadingUi || !isReady) return;

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const id = hash?.startsWith("#") ? hash.slice(1) : "";

    if (!id) return;

    const el = document.getElementById(id);

    if (!el) return;

    window.requestAnimationFrame(() => {
      setActiveSection(id);
      el.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [isLoadingUi, isReady]);

  function setAnswer(num, next) {
    setAnswers((prev) => ({ ...prev, [num]: next }));
  }

  async function printAcknowledgment() {
    const selectedEmployees = Array.isArray(answers?.[5]?.selectedEmployees)
      ? answers[5].selectedEmployees
      : [];
    if (selectedEmployees.length && !isPmo) {
      setToast("Full Aadhaar printing is restricted to PMO users.");
      return;
    }

    try {
      if (selectedEmployees.length) {
        const response = await fetch("/api/agenda-employees/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeCodes: selectedEmployees.map((member) => member.code) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not load Aadhaar numbers for printing.");
        setFullEmployeeAadhaars(result.aadhaars || {});
      } else {
        setFullEmployeeAadhaars({});
      }

      const clearPrintedAadhaars = () => {
        setFullEmployeeAadhaars({});
        window.removeEventListener("afterprint", clearPrintedAadhaars);
      };
      window.addEventListener("afterprint", clearPrintedAadhaars);
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => window.print()),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not prepare the acknowledgment for printing.");
    }
  }

  // ============================================================
  // TICKET FUNCTIONS
  // ============================================================

  function openTicketModal() {
    setTicketForm({
      raisedBy: "",
      dateLocation: "",
      issueType: "",
      happened: "",
      expected: "",
    });

    setTicketFiles([]);
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

  function advanceTicketQuestion(event) {
    const target = event.target;
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      (target instanceof HTMLTextAreaElement && event.shiftKey) ||
      !(
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && target.type === "text")
      )
    ) {
      return;
    }

    const question = target.closest(".ticket-question");
    if (!question) return;
    const canFocus = (element) =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      !element.disabled &&
      element.type !== "file" &&
      element.getClientRects().length > 0;
    const controls = [...question.querySelectorAll("input, select, textarea")]
      .filter(canFocus);
    const nextControl = controls[controls.indexOf(target) + 1];

    if (nextControl) {
      event.preventDefault();
      nextControl.focus();
      return;
    }

    const questions = [...event.currentTarget.querySelectorAll(".ticket-question")];
    const nextQuestion = questions.slice(questions.indexOf(question) + 1).find((item) =>
      [...item.querySelectorAll("input, select, textarea")].some(canFocus),
    );
    const nextInput = nextQuestion
      ? [...nextQuestion.querySelectorAll("input, select, textarea")].find(canFocus)
      : null;
    if (nextInput) {
      event.preventDefault();
      nextInput.focus();
    }
  }

  async function submitTicket(e) {
    e.preventDefault();

    if (
      !ticketForm.raisedBy.trim() ||
      !ticketForm.dateLocation.trim() ||
      !ticketForm.issueType ||
      !ticketForm.happened.trim() ||
      !ticketForm.expected.trim()
    ) {
      setToast("Please answer all required ticket questions");
      return;
    }

    setTicketSubmitting(true);

    const formData = new FormData();
    formData.set("raisedBy", ticketForm.raisedBy.trim());
    formData.set("issueType", ticketForm.issueType);
    formData.set("dateLocation", ticketForm.dateLocation.trim());
    formData.set("happened", ticketForm.happened.trim());
    formData.set("expected", ticketForm.expected.trim());
    formData.set("trialId", trialId || "");
    formData.set("formVersion", version);
    ticketFiles.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Ticket could not be saved.");
      }

      setTicketSubmitting(false);
      setIsTicketModalOpen(false);

      setTicketForm({
        raisedBy: "",
        dateLocation: "",
        issueType: "",
        happened: "",
        expected: "",
      });
      setTicketFiles([]);

      setToast(
        result.emailError
          ? `${result.ticket.ticketId} saved, but email notification failed: ${result.emailError}`
          : `${result.ticket.ticketId} raised successfully`,
      );
    } catch (error) {
      console.error("Ticket submission error:", error);

      setTicketSubmitting(false);

      setToast(
        error instanceof Error
          ? error.message
          : "Ticket could not be saved. Please try again.",
      );
    }
  }

  // ============================================================
  // VERSION SWITCHING
  // ============================================================

  async function selectVersion(nextVersion) {
    if (!nextVersion || nextVersion === version) return;

    const existingTrials = listTrials();
    const draft = existingTrials
      .filter((t) => t.trialId !== trialId && t.version === nextVersion)
      .filter((t) => !loadTrial(t.trialId)?.submitted)
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      )[0];

    suppressAutosaveRef.current = true;
    autoSubmittedRef.current = false;

    setVersion(nextVersion);
    setFlashSectionId("");
    setActiveSection(
      getChecklistSectionsForVersion(nextVersion)[0]?.id ?? "sec1",
    );

    let nextId;
    let nextAnswers;
    let nextCreatedAt;
    let nextCustomTrialId;
    let nextTitleOverride;
    let nextTitle;

    let savedTrial = {};

    if (draft) {
      try {
        savedTrial = (await loadSharedTrial(draft.trialId)) || {};
      } catch (error) {
        setToast(
          `Could not open the saved ${nextVersion} trial: ${error.message}`,
        );
        return;
      }

      nextId = draft.trialId;
      nextAnswers = makeCurrentAnswers(nextVersion, savedTrial.answers || {});
      nextCreatedAt =
        savedTrial.createdAt ?? draft.createdAt ?? new Date().toISOString();
      nextCustomTrialId = savedTrial.customTrialId || draft.customTrialId;
      if (!nextCustomTrialId) {
        try {
          nextCustomTrialId = await allocateCustomTrialId(trialIdParts);
        } catch (error) {
          suppressAutosaveRef.current = false;
          setVersion(version);
          setActiveSection(
            getChecklistSectionsForVersion(version)[0]?.id ?? "sec1",
          );
          setToast(`Could not allocate this trial's ID: ${error.message}`);
          return;
        }
      }
      nextTitleOverride = safeShort(savedTrial.titleOverride);
      nextTitle = nextTitleOverride || deriveTrialTitle(nextAnswers);

      setLastSavedAt(savedTrial.updatedAt ?? "");
    } else {
      nextId = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      nextAnswers = makeBaseAnswers(nextVersion);
      if (!isPmo) {
        const source = await findSubmittedAnswers(nextVersion, listTrials());
        if (source) {
          nextAnswers = {
            ...nextAnswers,
            ...pickAgendaAnswers(nextVersion, source),
          };
        }
      }
      nextCreatedAt = new Date().toISOString();
      try {
        nextCustomTrialId = await allocateCustomTrialId(trialIdParts);
      } catch (error) {
        suppressAutosaveRef.current = false;
        setVersion(version);
        setActiveSection(
          getChecklistSectionsForVersion(version)[0]?.id ?? "sec1",
        );
        setToast(`Could not create a new trial: ${error.message}`);
        return;
      }
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

  async function startNewTrial() {
    const fresh = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const createdAt = new Date().toISOString();
    let nextCustomId;
    try {
      nextCustomId = await allocateCustomTrialId(trialIdParts);
    } catch (error) {
      console.error("New trial ID allocation failed:", error);
      setToast(`Could not create a new trial: ${error.message}`);
      return;
    }
    let answersForTrial = makeBaseAnswers(version);
    if (!isPmo) {
      const source = await findSubmittedAnswers(version, trials);
      if (source) {
        answersForTrial = {
          ...answersForTrial,
          ...pickAgendaAnswers(version, source),
        };
      }
    }

    setActiveTrialId(fresh);
    setTrialId(fresh);

    autoSubmittedRef.current = false;
    suppressAutosaveRef.current = true;

    setTrialCreatedAt(createdAt);
    setAnswers(answersForTrial);
    setTrialTitle("Untitled trial");
    setTrialTitleOverride("");
    setCustomTrialId(nextCustomId);
    setLastSavedAt("");

    saveTrial(
      fresh,
      {
        answers: answersForTrial,
        createdAt,
        updatedAt: createdAt,
        version: safeVersionLabel(version),
        customTrialId: nextCustomId,
        titleOverride: "",
      },
      {
        title: "Untitled trial",
        createdAt,
        updatedAt: createdAt,
        version: safeVersionLabel(version),
        customTrialId: nextCustomId,
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

    const nextVersion =
      [loaded?.version, meta?.version, version].find((v) =>
        VALID_VERSIONS.includes(v),
      ) || "Trolly";
    const savedCustomTrialId =
      loaded?.customTrialId || meta?.customTrialId || "";

    suppressAutosaveRef.current = true;

    setTrialId(nextTrialId);
    setActiveTrialId(nextTrialId);
    setVersion(nextVersion);
    let nextCustomId = savedCustomTrialId;
    if (!nextCustomId) {
      try {
        nextCustomId = await allocateCustomTrialId(trialIdParts);
      } catch (error) {
        setToast(`Could not allocate this trial's ID: ${error.message}`);
        return;
      }
    }
    setCustomTrialId(nextCustomId);

    autoSubmittedRef.current = false;

    if (loaded && typeof loaded === "object" && loaded.answers) {
      setAnswers(makeCurrentAnswers(nextVersion, loaded.answers));
      setLastSavedAt(loaded.updatedAt ?? "");
      setTrialCreatedAt(loaded.createdAt ?? meta?.createdAt ?? "");

      const override = safeShort(loaded.titleOverride);

      setTrialTitleOverride(override);
      setTrialTitle(override || deriveTrialTitle(loaded.answers));
    } else {
      const base = makeBaseAnswers(nextVersion);

      setAnswers(base);
      setLastSavedAt("");
      setTrialCreatedAt(meta?.createdAt ?? new Date().toISOString());
      setTrialTitleOverride("");
      setTrialTitle(deriveTrialTitle(base));
    }

    setTrials(listTrials());

    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);

      url.searchParams.set("trialId", nextTrialId);
      url.searchParams.set("version", nextVersion);

      window.history.replaceState(null, "", url.toString());
    }
  }

  function removeTrial(id) {
    if (!id) return;

    const ok = window.confirm(
      "Delete this shared trial for everyone? This cannot be undone.",
    );

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
      {
        answers,
        createdAt,
        updatedAt,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
        titleOverride: cleaned,
      },
      {
        title: finalTitle,
        createdAt,
        updatedAt,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
      },
    );

    setTrials(listTrials());

    window.requestAnimationFrame(() => {
      suppressAutosaveRef.current = false;
    });

    setToast(cleaned ? "Trial renamed" : "Trial name reset to automatic");
  }

  function markTrialSubmitted() {
    autoSubmittedRef.current = true;

    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};

    saveTrial(
      trialId,
      {
        ...current,
        answers,
        createdAt: trialCreatedAt || current.createdAt || submittedAt,
        updatedAt: submittedAt,
        submittedAt,
        submitted: true,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
      },
      {
        title: trialTitle,
        createdAt: trialCreatedAt || submittedAt,
        updatedAt: submittedAt,
        version: safeVersionLabel(version),
        customTrialId: safeShort(customTrialId),
      },
    );

    setTrials(listTrials());
    setToast("Trial submitted successfully.");
  }

  function autoSubmitTrial() {
    if (
      autoSubmittedRef.current ||
      !trialId ||
      blockingIssues.length > 0 ||
      answeredCount < submissionThreshold
    ) {
      return;
    }

    markTrialSubmitted();
  }

  const remainingRequiredMessage = blockingIssues.length
    ? `${blockingIssues.length} required field(s) still need attention: ${blockingIssues
        .slice(0, 3)
        .join("; ")}${blockingIssues.length > 3 ? " ..." : ""}`
    : "";

  // ============================================================
  // UPDATED AGENDA SUBMIT
  // NO REQUIRED QUESTION VALIDATION
  // NO 30 QUESTION VALIDATION
  // NO 36 QUESTION VALIDATION
  // ============================================================
  function submitCurrentTrial() {
    if (!trialId) return;

    markTrialSubmitted();
  }

  async function submitAgenda() {
    if (!trialId || agendaSubmitting || agendaSubmitted || !isPmo) return;

    setAgendaSubmitting(true);
    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};
    const state = {
      ...current,
      answers,
      createdAt: trialCreatedAt || current.createdAt || submittedAt,
      updatedAt: submittedAt,
      agendaSubmitted: true,
      preTrialSubmitted: preTrialSubmitted || current.preTrialSubmitted === true,
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
    };
    const meta = {
      title: trialTitle,
      createdAt: state.createdAt,
      updatedAt: submittedAt,
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
      agendaSubmitted: true,
      preTrialSubmitted: preTrialSubmitted || current.preTrialSubmitted === true,
    };

    saveTrial(trialId, state, meta);
    setTrials(listTrials());
    setLastSavedAt(submittedAt);

    try {
      const response = await fetch(`/api/trials/${encodeURIComponent(trialId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, meta }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Could not submit the trial agenda.");
      }
      router.push("/history");
    } catch (error) {
      console.error("Trial agenda submission failed:", error);
      setToast(
        `Agenda saved on this device, but shared submission failed: ${error instanceof Error ? error.message : "Please try again."}`,
      );
    } finally {
      setAgendaSubmitting(false);
    }
  }

  async function submitPreTrial() {
    if (!trialId || preTrialSubmitting || preTrialSubmitted) return;

    setPreTrialSubmitting(true);
    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};
    const state = {
      ...current,
      answers,
      createdAt: trialCreatedAt || current.createdAt || submittedAt,
      updatedAt: submittedAt,
      preTrialSubmitted: true,
      ...(isPmo ? { agendaSubmitted: true } : {}),
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
    };
    const meta = {
      title: trialTitle,
      createdAt: state.createdAt,
      updatedAt: submittedAt,
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
      preTrialSubmitted: true,
      ...(isPmo ? { agendaSubmitted: true } : {}),
    };

    saveTrial(trialId, state, meta);
    setTrials(listTrials());
    setLastSavedAt(submittedAt);

    try {
      const response = await fetch(`/api/trials/${encodeURIComponent(trialId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, meta }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not submit the pre-trial checklist.");
      setTrials(listTrials());
      setToast("Pre-trial sections 1–3 submitted. You can complete post-trial details later.");
      window.location.href = "/history";
    } catch (error) {
      console.error("Pre-trial submission failed:", error);
      setToast(`Pre-trial checklist saved on this device, but shared submission failed: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setPreTrialSubmitting(false);
    }
  }

  async function submitPostTrial() {
    if (!trialId || trialSubmitting) return;

    setTrialSubmitting(true);
    autoSubmittedRef.current = true;
    const submittedAt = new Date().toISOString();
    const current = loadTrial(trialId) || {};
    const state = {
      ...current,
      answers,
      createdAt: trialCreatedAt || current.createdAt || submittedAt,
      updatedAt: submittedAt,
      submittedAt,
      submitted: true,
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
    };
    const meta = {
      title: trialTitle,
      createdAt: state.createdAt,
      updatedAt: submittedAt,
      version: safeVersionLabel(version),
      customTrialId: safeShort(customTrialId),
      submitted: true,
    };

    saveTrial(trialId, state, meta);
    setTrials(listTrials());
    setLastSavedAt(submittedAt);

    // Save to server
    try {
      const response = await fetch(`/api/trials/${encodeURIComponent(trialId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, meta }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Could not submit the trial.");
      }
    } catch (error) {
      console.error("Post-trial save failed:", error);
      setToast(`Trial saved locally, but shared submission failed: ${error instanceof Error ? error.message : "Please try again."}`);
      setTrialSubmitting(false);
      return;
    }

    // Send email summary
    try {
      const emailResponse = await fetch("/api/submit-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trialId,
          answers,
          customTrialId: safeShort(customTrialId),
          version: safeVersionLabel(version),
          submittedAt,
          submittedBy: {
            employeeName: employee?.name,
            employeeCode: employee?.code,
          },
          answeredCount,
          totalQuestions: TOTAL_QUESTIONS,
          completionPct: pct,
        }),
      });
      const emailResult = await emailResponse.json().catch(() => ({}));
      if (!emailResponse.ok || !emailResult.ok) {
        throw new Error(emailResult.error || "Could not send the trial report email.");
      }
      setToast("Post-trial submitted. Trial summary emailed successfully.");
    } catch (emailError) {
      console.error("Post-trial email failed:", emailError);
      setToast(`Trial submitted, but email failed: ${emailError instanceof Error ? emailError.message : "Check email config."}`);
    }

    setTrialSubmitting(false);
    router.push("/history");
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

      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${id}`);
      }
    }

    window.setTimeout(() => {
      setFlashSectionId((prev) => (prev === id ? "" : prev));
    }, 900);
  }

  return (
    // 
    <div className="app-shell">
  <header className="header">
    <div
      className="header-title"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
      }}
    >
      <img
        src="/logo.png"
        alt="Eric Robotics"
        style={{
          width: "92px",
          height: "92px",
          objectFit: "contain",
          flexShrink: 0,
        }}
      />

      <span>Trial Checklist</span>

      <div className="compact-control-group">
        <button
          type="button"
          className="compact-control compact-control-button"
          aria-label="RailwayMitra project selector"
        >
              RailwayMitra · {version}
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                value={trialIdParts.rlm}
                onChange={(e) =>
                  setTrialIdParts((p) => ({
                    ...p,
                    rlm: e.target.value.replace(/\//g, ""),
                  }))
                }
                placeholder="RLM"
                aria-label="Trial ID prefix"
                className="compact-control compact-control-input"
                style={{ width: "56px" }}
              />

              <input
                type="text"
                value={trialIdParts.date}
                readOnly
                title="Filled automatically with today's date"
                aria-label="Trial ID date (automatic)"
                className="compact-control compact-control-input"
                style={{ width: "100px", opacity: 0.85 }}
              />

              <select
                value={trialIdParts.ml}
                onChange={(e) =>
                  setTrialIdParts((p) => ({
                    ...p,
                    ml: e.target.value.replace(/\//g, ""),
                  }))
                }
                aria-label="Trial ID track"
                className="compact-control compact-control-select"
                style={{ width: "124px" }}
              >
                <option value="ML">ML</option>
                <option value="TT">TT (Test Track)</option>
              </select>

              <input
                type="text"
                value={trialIdParts.serial}
                readOnly
                placeholder="Auto"
                title="Assigned automatically from the trial number sequence"
                aria-label="Trial ID serial number"
                className="compact-control compact-control-input"
                style={{ width: "64px", cursor: "default" }}
              />
            </div>
          </div>
        </div>

        <div className="header-right">
          {employee ? (
            <span className="header-user">
              {employee.designation
                ? `${employee.name} · ${employee.designation}`
                : employee.name}
            </span>
          ) : null}

          <span className="header-answered">
            {answeredCount} / {TOTAL_QUESTIONS} answered
          </span>

          <span className="progress-pill">{pct}%</span>

          <button
            className="raise-ticket-btn"
            type="button"
            onClick={openTicketModal}
          >
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
                <div className="ticket-panel-title" id="ticket-modal-title">
                  Raise a Ticket
                </div>
                <div className="ticket-panel-subtitle">
                  Provide the issue details below.
                </div>
              </div>

              <button
                className="ticket-close"
                type="button"
                onClick={closeTicketModal}
                aria-label="Close ticket form"
              >
                ×
              </button>
            </div>

            <form className="ticket-form" onSubmit={submitTicket} onKeyDown={advanceTicketQuestion}>
              <div className="ticket-question">
                <label htmlFor="ticket-raised-by">
                  1. Raised by <span>*</span>
                </label>
                <input
                  id="ticket-raised-by"
                  className="ticket-input"
                  type="text"
                  placeholder="Name of person raising the ticket..."
                  value={ticketForm.raisedBy}
                  onChange={(e) =>
                    updateTicketField("raisedBy", e.target.value)
                  }
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-date-location">
                  2. Date and location of the issue <span>*</span>
                </label>
                <input
                  id="ticket-date-location"
                  className="ticket-input"
                  type="text"
                  placeholder="Date (DD/MM/YYYY) and site / block location..."
                  value={ticketForm.dateLocation}
                  onChange={(e) =>
                    updateTicketField("dateLocation", e.target.value)
                  }
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-issue-type">
                  3. Type of issue <span>*</span>
                </label>
                <select
                  id="ticket-issue-type"
                  className="ticket-select"
                  value={ticketForm.issueType}
                  onChange={(e) =>
                    updateTicketField("issueType", e.target.value)
                  }
                  required
                >
                  <option value="">Select type of issue</option>
                  <option value="Software">Software</option>
                  <option value="Hardware">Hardware</option>
                </select>
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-happened">
                  4. What happened? <span>*</span>
                </label>
                <textarea
                  id="ticket-happened"
                  className="ticket-input"
                  rows={6}
                  placeholder="Describe the bug clearly and concisely."
                  value={ticketForm.happened}
                  onChange={(e) =>
                    updateTicketField("happened", e.target.value)
                  }
                  required
                />
              </div>

              <div className="ticket-question">
                <label htmlFor="ticket-expected">
                  5. What was expected? <span>*</span>
                </label>
                <textarea
                  id="ticket-expected"
                  className="ticket-input"
                  rows={6}
                  placeholder="Describe what should have happened."
                  value={ticketForm.expected}
                  onChange={(e) =>
                    updateTicketField("expected", e.target.value)
                  }
                  required
                />
              </div>

              <div className="ticket-question">
                <label>
                  6. Photos or videos
                </label>

                <div className="mt-3">
                  <label
                    htmlFor="screenshot-upload"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                  >
                    📷 Add photos or videos
                  </label>

                  <input
                    id="screenshot-upload"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => setTicketFiles(Array.from(e.target.files || []))}
                  />
                </div>
                <div className="ticket-attachment-note">
                  Up to 10 files, 25 MB total. Supported: images and videos.
                </div>
                {ticketFiles.length ? (
                  <ul className="ticket-selected-files">
                    {ticketFiles.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}-${index}`}>
                        {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="ticket-form-footer">
                <span className="ticket-required-note">
                  * All required questions must be completed
                </span>

                <div className="ticket-actions">
                  <button
                    className="ticket-cancel"
                    type="button"
                    onClick={closeTicketModal}
                    disabled={ticketSubmitting}
                  >
                    Cancel
                  </button>

                  <button
                    className="ticket-submit"
                    type="submit"
                    disabled={ticketSubmitting}
                  >
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
              <div className="trial-panel-title">
                Trials shared with your team
              </div>

              <button
                className="trial-panel-close"
                type="button"
                onClick={() => setIsTrialSwitcherOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="trial-panel-actions">
              <button className="trial-new" type="button" onClick={startNewTrial}>
                + New trial
              </button>

              {trialId ? (
                <button
                  className="trial-link"
                  type="button"
                  onClick={() => copyResumeLink(trialId)}
                >
                  Copy current link
                </button>
              ) : null}
            </div>

            <div className="trial-list" role="list">
              {(trials.length ? trials : listTrials()).map((t) => {
                const active = t.trialId === trialId;

                return (
                  <div
                    key={t.trialId}
                    className={`trial-item ${active ? "active" : ""}`}
                    role="listitem"
                  >
                    <div className="trial-item-main">
                      <div className="trial-item-title">
                        {t.title ?? "Untitled trial"}
                      </div>

                      <div className="trial-item-sub">
                        {t.updatedAt ? `Updated ${formatIso(t.updatedAt)}` : ""}
                        {active ? " · Current" : ""}
                      </div>
                    </div>

                    <div className="trial-item-actions">
                      <button
                        className="trial-open"
                        type="button"
                        onClick={() => switchTrial(t.trialId)}
                      >
                        Open
                      </button>

                      <button
                        className="trial-open"
                        type="button"
                        onClick={async () => {
                          const next = window.prompt(
                            "Trial name:",
                            t.title ?? "",
                          );

                          if (next == null) return;

                          if (t.trialId === trialId) {
                            renameTrial(next);
                          } else {
                            let loaded;

                            try {
                              loaded = await loadSharedTrial(t.trialId);
                            } catch (error) {
                              setToast(
                                `Could not rename this shared trial: ${error.message}`,
                              );
                              return;
                            }

                            const answersForTitle = loaded?.answers ?? {};
                            const cleaned = safeShort(next);
                            const derived = deriveTrialTitle(answersForTitle);
                            const finalTitle = cleaned || derived;
                            const updatedAt = new Date().toISOString();

                            saveTrial(
                              t.trialId,
                              {
                                ...(loaded ?? { answers: makeBaseAnswers() }),
                                updatedAt,
                                titleOverride: cleaned,
                              },
                              {
                                title: finalTitle,
                                updatedAt,
                                createdAt: loaded?.createdAt ?? t.createdAt,
                                version: loaded?.version ?? t.version,
                                customTrialId:
                                  loaded?.customTrialId ?? t.customTrialId,
                              },
                            );

                            setTrials(listTrials());

                            setToast(
                              cleaned
                                ? "Trial renamed"
                                : "Trial name reset to automatic",
                            );
                          }
                        }}
                      >
                        Rename
                      </button>

                      <button
                        className="trial-copy"
                        type="button"
                        onClick={() => copyResumeLink(t.trialId)}
                      >
                        Link
                      </button>

                      <button
                        className="trial-del"
                        type="button"
                        onClick={() => removeTrial(t.trialId)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {!trials.length && !listTrials().length ? (
                <div className="trial-empty">No saved trials yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="global-progress"
        aria-hidden="true"
        style={{ "--progress": scrollPct }}
      >
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
                className={`sidebar-item ${
                  activeSection === s.id ? "active" : ""
                }`}
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

        </nav>

        <main className="main">
          {isLoadingUi || !isReady ? (
            <SkeletonView />
          ) : (
            currentSections.map((s) => (
                <Section
                key={s.id}
                section={s}
                questionDisplayNumbers={questionDisplayNumbers}
                answers={answers}
                setAnswer={setAnswer}
                flash={flashSectionId === s.id}
                canEditAgenda={isPmo}
                onSubmitAgenda={submitAgenda}
                agendaSubmitting={agendaSubmitting}
                agendaSubmitted={agendaSubmitted}
                onSubmitPreTrial={submitPreTrial}
                preTrialSubmitting={preTrialSubmitting}
                preTrialSubmitted={preTrialSubmitted}
                onSubmitPostTrial={submitPostTrial}
                postTrialSubmitting={trialSubmitting}
                onPrintAcknowledgment={printAcknowledgment}
              />
            ))
          )}
        </main>
      </div>

      <div
        className={`submit-bar ${
          isMobileUi && isActionsCollapsed ? "compact" : ""
        }`}
        role="region"
        aria-label="Actions"
      >
        <div
          className="submit-session-info"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            marginBottom: "16px",
            paddingBottom: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
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
            style={{
              padding: 0,
              textAlign: "left",
              fontSize: "15px",
              color: "var(--accent)",
              fontWeight: 800,
              whiteSpace: "normal",
              lineHeight: 1.3,
              marginBottom: "4px",
            }}
          >
            {trialTitle}
          </button>

          <div style={{ fontSize: "12px", color: "var(--text-light)" }}>
            {trialCreatedAt ? `Started: ${formatIso(trialCreatedAt)}` : ""}
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-light)" }}>
            {lastSavedAt ? `Saved: ${formatIso(lastSavedAt)}` : "Not saved yet"}
          </div>
        </div>

        <div className="submit-top">
          <div className="submit-stats">
            <strong>{answeredCount}</strong> of{" "}
            <strong>{TOTAL_QUESTIONS}</strong> answered &nbsp;·&nbsp;
            <span>{pct}%</span>
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
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              window.location.href = "/history";
            }}
          >
            Trial List
          </button>

        </div>
      </div>

      <AcknowledgementPrintDocument
        answers={answers}
        fullEmployeeAadhaars={fullEmployeeAadhaars}
      />

      <div
        className={`toast ${toast ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
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
