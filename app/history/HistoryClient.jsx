"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zipSync, strToU8 } from "fflate";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "../components/AuthProvider";
import { canEditAgenda } from "../../lib/agendaAccess";
import { SECTIONS } from "../../lib/checklistData";
import { serializeAnswer } from "../../lib/serializeAnswer";
import { getActiveTrialId, listTrials } from "../../lib/checklistStorage";

function formatIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

// "2026-10-01" -> "01/10/2026"
function formatDate(v) {
  const s = typeof v === "string" ? v.trim() : "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function getTrialBlockDate(trial) {
  const value = trial.answers?.["1"];
  const date = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function isDemoTrial(trial) {
  const identifiers = [trial.trialId, trial.customTrialId, trial.title];
  return identifiers.some((value) => /\b(?:demo|sample)\b/i.test(String(value || "")));
}

// Question lookup by number (same numbers in Trolly and V2.2)
const QUESTION_MAP = {};

SECTIONS.forEach((s) =>
  s.questions.forEach((q) => {
    QUESTION_MAP[q.num] = q;
  }),
);

function getAnswer(answers, num) {
  const q = QUESTION_MAP[num];
  if (!q) return "";
  const raw = answers?.[num];

  if (q.type === "select") {
    const opt = q.options?.find((o) => o.value === raw);
    return opt ? (opt.value ? opt.label : "") : String(raw || "");
  }

  if (q.type === "date") return formatDate(raw);

  const text = serializeAnswer(q, raw);

  if (q.type === "yesNoOther" || q.type === "yesOther") {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  return text;
}

function getAgenda(trial) {
  const agenda = trial.answers?.["4"];
  return agenda && typeof agenda === "object" ? agenda : {};
}

function getTeamMemberNames(trial) {
  const roster = trial.answers?.["5"];
  if (!roster || typeof roster !== "object") {
    return typeof roster === "string" ? roster : "";
  }

  const names = [
    ...(Array.isArray(roster.selectedEmployees)
      ? roster.selectedEmployees.map((employee) => employee?.name)
      : []),
    ...(Array.isArray(roster.externalMembers)
      ? roster.externalMembers.map((member) => member?.name)
      : []),
  ].filter((name) => typeof name === "string" && name.trim());

  if (!names.length && typeof roster.legacyNames === "string") {
    names.push(...roster.legacyNames.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean));
  }

  return names.join("\n");
}

function getAgendaRows(trials) {
  const rows = [
    [
      "Trial ID",
      "Trial",
      "Block Date",
      "Agenda Type",
      "Category",
      "Activity / Report",
      "Details",
    ],
  ];

  trials.forEach((trial) => {
    const agenda = getAgenda(trial);

    const trialId = trial.customTrialId || trial.trialId || "";
    const title = trial.title || "Untitled trial";
    const blockDate = getAnswer(trial.answers, 1);

    (Array.isArray(agenda.activities) ? agenda.activities : []).forEach(
      (activity) => {
        if (!activity || typeof activity !== "object") return;

        if (
          ![activity.category, activity.activity, activity.details].some(
            (value) => String(value ?? "").trim(),
          )
        ) {
          return;
        }

        rows.push([
          trialId,
          title,
          blockDate,
          "Internal",
          activity.category || "",
          activity.activity || "",
          activity.details || "",
        ]);
      },
    );

    (Array.isArray(agenda.deliverables) ? agenda.deliverables : []).forEach(
      (report, index) => {
        if (!String(report ?? "").trim()) return;

        rows.push([
          trialId,
          title,
          blockDate,
          "External",
          `Report ${index + 1}`,
          report,
          "",
        ]);
      },
    );
  });

  return rows;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let name = "";

  for (
    let value = index + 1;
    value > 0;
    value = Math.floor((value - 1) / 26)
  ) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }

  return name;
}

function worksheetXml(rows) {
  const columnCount = rows.reduce(
    (max, row) => Math.max(max, row.length),
    1,
  );

  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxLength = rows.reduce(
      (max, row) =>
        Math.max(max, String(row[columnIndex] ?? "").length),
      10,
    );

    return Math.min(52, Math.max(12, maxLength + 2));
  });

  const columns = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");

  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const address = `${columnName(columnIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? ' s="1"' : "";

          return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(
            value,
          )}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const lastColumn = columnName(columnCount - 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(
    1,
    rows.length,
  )}"/></worksheet>`;
}

function workbookBytes(trials) {
  const trialRows = [
    COLUMNS.map((column) => column.label),
    ...trials.map((trial) => COLUMNS.map((column) => column.get(trial))),
  ];

  const sheets = [
    { name: "Trial List", rows: trialRows },
    { name: "Trial Agenda", rows: getAgendaRows(trials) },
  ];

  const files = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),

    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),

    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Trial List" sheetId="1" r:id="rId1"/><sheet name="Trial Agenda" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),

    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),

    // Header row fill = company blue (#223D62)
    "xl/styles.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF223D62"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ),

    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(sheets[0].rows)),
    "xl/worksheets/sheet2.xml": strToU8(worksheetXml(sheets[1].rows)),
  };

  return zipSync(files);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value) {
  return (
    String(value || "trial-history")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-|-$/g, "") || "trial-history"
  );
}

const COLUMNS = [
  {
    key: "trialId",
    label: "Trial ID",
    width: 200,
    sticky: true,
    get: (t) => t.customTrialId || t.trialId || "",
  },

  {
    key: "title",
    label: "Trial",
    width: 200,
    get: (t) => t.title || "Untitled trial",
  },

  {
    key: "formCategory",
    label: "Form Category",
    width: 140,
    get: (t) => t.version || "Trolly",
  },

  {
    key: "status",
    label: "Status",
    width: 110,
    get: (t) => t.submitted
      ? "Post-Trial Submitted"
      : t.preTrialSubmitted
        ? "Pre-Trial Submitted"
        : t.agendaSubmitted
          ? "Agenda Published"
          : "Draft",
  },

  {
    key: "blockDate",
    label: "Block Date",
    width: 120,
    get: (t) => getAnswer(t.answers, 1),
  },

  {
    key: "location",
    label: "Block Location",
    width: 180,
    get: (t) => getAnswer(t.answers, 2),
  },

  {
    key: "type",
    label: "Trial Type",
    width: 140,
    get: (t) => getAnswer(t.answers, 3),
  },

  {
    key: "team",
    label: "Team Members",
    width: 240,
    get: (t) => getTeamMemberNames(t),
  },

  {
    key: "agenda",
    label: "Trial Agenda",
    width: 560,
    get: (t) => getAnswer(t.answers, 4),
  },

  {
    key: "robot",
    label: "Robot ID / Software Build",
    width: 220,
    get: (t) => getAnswer(t.answers, 16),
  },

  {
    key: "trialTime",
    label: "Trial Start – End",
    width: 150,
    get: (t) => getAnswer(t.answers, 15),
  },

  {
    key: "distance",
    label: "Distance (m)",
    width: 120,
    get: (t) => getAnswer(t.answers, 28),
  },

  {
    key: "objective",
    label: "Objective Achieved",
    width: 180,
    get: (t) => getAnswer(t.answers, 34),
  },

  {
    key: "preApproved",
    label: "Pre-Trial Approved By",
    width: 180,
    get: (t) => getAnswer(t.answers, 27),
  },

  {
    key: "observations",
    label: "Key Observations / Issues / Remarks",
    width: 380,
    get: (t) => getAnswer(t.answers, 40),
  },

  {
    key: "postApproved",
    label: "Post-Trial Approved By",
    width: 180,
    get: (t) => getAnswer(t.answers, 41),
  },

  {
    key: "created",
    label: "Created At",
    width: 180,
    get: (t) => formatIso(t.createdAt),
  },

  {
    key: "updated",
    label: "Updated At",
    width: 180,
    get: (t) => formatIso(t.updatedAt),
  },
];

const SUMMARY_COLUMNS = [
  {
    key: "dateLocation",
    label: "Date/location",
    get: (trial) =>
      [getAnswer(trial.answers, 1), getAnswer(trial.answers, 2)]
        .filter(Boolean)
        .join("\n"),
  },
  { key: "reachingTime", label: "Reaching time", answer: 9 },
  { key: "ptwNumber", label: "PTW Number", answer: 10 },
  { key: "unloadingTime", label: "Robot Unloading time", answer: 11 },
  { key: "placementTime", label: "Robot placement on track time", answer: 12 },
  { key: "assemblyStart", label: "Assembly start time", answer: 13 },
  { key: "assemblyEnd", label: "Assembly end time", answer: 14 },
  { key: "movementStart", label: "Movement start time", answer: 18 },
  { key: "trackCleared", label: "Track cleared time", answer: 23 },
  { key: "distance", label: "Distance", answer: 28 },
  { key: "observations", label: "Key Observations / Issues / Remark", answer: 40 },
].map((column) => ({
  ...column,
  get: column.get || ((trial) => getAnswer(trial.answers, column.answer)),
}));

const TABLE_COLUMNS = COLUMNS.filter(
  (column) => !["robot", "trialTime"].includes(column.key),
);

const ACTION_WIDTH = 140;
const EXPORT_WIDTH = 150;

const TABLE_WIDTH =
  TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0) +
  ACTION_WIDTH +
  EXPORT_WIDTH;

const cellBase = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
  fontSize: "14px",
  verticalAlign: "top",
  textAlign: "left",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "white",
};

const headBase = {
  padding: "12px 14px",
  borderBottom: "2px solid var(--border)",
  fontSize: "13px",
  fontWeight: 800,
  textAlign: "left",
  whiteSpace: "nowrap",
  background: "#e9f0f9",
  color: "var(--accent)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

function AgendaTables({ trial }) {
  const agenda = getAgenda(trial);

  const activities = (
    Array.isArray(agenda.activities) ? agenda.activities : []
  )
    .filter((item) => item && typeof item === "object")
    .filter((item) =>
      [item.category, item.activity, item.details].some((value) =>
        String(value ?? "").trim(),
      ),
    );

  const reports = (
    Array.isArray(agenda.deliverables) ? agenda.deliverables : []
  ).filter((report) => String(report ?? "").trim());

  if (!activities.length && !reports.length) return "—";

  return (
    <div className="history-agenda">
      <section className="history-agenda-section">
        <h3>Internal Agenda</h3>

        <div className="history-agenda-table-wrap">
          <table className="history-agenda-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Activity</th>
                <th scope="col">Details</th>
              </tr>
            </thead>

            <tbody>
              {activities.length ? (
                activities.map((activity, index) => (
                  <tr key={`activity-${index}`}>
                    <td>{activity.category || "—"}</td>
                    <td>{activity.activity || "—"}</td>
                    <td>{activity.details || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No internal agenda items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-agenda-section">
        <h3>External Agenda</h3>

        <div className="history-agenda-table-wrap">
          <table className="history-agenda-table history-external-agenda-table">
            <thead>
              <tr>
                <th scope="col">Sr. No.</th>
                <th scope="col">Report</th>
              </tr>
            </thead>

            <tbody>
              {reports.length ? (
                reports.map((report, index) => (
                  <tr key={`report-${index}`}>
                    <td>{index + 1}</td>
                    <td>{report}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>No external reports</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function HistoryClient() {
  const router = useRouter();
  const { employee, loading, logout } = useAuth();
  const isPmo = canEditAgenda(employee?.code);

  const [trials, setTrials] = useState([]);
  const [trialListStartAt, setTrialListStartAt] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loadError, setLoadError] = useState("");
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isResettingTrials, setIsResettingTrials] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!employee) {
      router.replace("/login?next=/history");
      return;
    }

    let active = true;

    const resetKey = `rm:trial-list-start:v1:${employee.code}`;
    let startAt = 0;
    try {
      startAt = Number(window.localStorage.getItem(resetKey)) || 0;
      if (!startAt) {
        startAt = Date.now();
        window.localStorage.setItem(resetKey, String(startAt));
      }
    } catch {
      startAt = Date.now();
    }
    setTrialListStartAt(startAt);

    fetch("/api/trials?include=summary&published=1")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || "Could not load the shared Trial List.",
          );
        }

        if (active) {
          setTrials(Array.isArray(data.trials) ? data.trials : []);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (!active) return;

        console.error("Shared history load failed:", error);
        setLoadError(error.message);
      })
      .finally(() => {
        if (active) setIsLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, [loading, employee, router]);

  const filteredTrials = useMemo(() => {
    const q = search.trim().toLowerCase();
    const invalidDateRange = dateFrom && dateTo && dateFrom > dateTo;

    const filtered = trials.filter((t) => {
      if (isDemoTrial(t)) return false;
      const lastUpdatedAt = new Date(t.updatedAt || t.createdAt || 0).getTime();
      if (trialListStartAt && (!Number.isFinite(lastUpdatedAt) || lastUpdatedAt < trialListStartAt)) return false;
      const blockDate = getTrialBlockDate(t);
      if (invalidDateRange) return false;
      if (dateFrom && (!blockDate || blockDate < dateFrom)) return false;
      if (dateTo && (!blockDate || blockDate > dateTo)) return false;
      if (!q) return true;

      const searchString =
        `${t.trialId || ""} ${COLUMNS.map((c) => c.get(t)).join(" ")}`.toLowerCase();

      return searchString.includes(q);
    });

    const dateOf = (t) => {
      const d = new Date(
        t.answers?.["1"] || t.createdAt || 0,
      ).getTime();

      return Number.isNaN(d) ? 0 : d;
    };

    return filtered.sort((a, b) => dateOf(b) - dateOf(a));
  }, [trials, search, dateFrom, dateTo, trialListStartAt]);

  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  function exportTrials(selectedTrials, name) {
    if (isExporting) return;

    setIsExporting(true);
    setExportError("");

    try {
      const date = new Date().toISOString().slice(0, 10);
      const baseName = `${safeFilename(name)}-${date}`;
      const workbook = workbookBytes(selectedTrials);

      downloadBlob(
        new Blob([workbook], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${baseName}.xlsx`,
      );
    } catch (error) {
      console.error("Trial history export failed:", error);
      setExportError(
        "Could not create the Excel file. Please try again.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function downloadSummaryPdf(trial) {
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const trialId = trial.customTrialId || trial.trialId || "Trial";
      pdf.setFontSize(16);
      pdf.text(`Trial Summary - ${trialId}`, 14, 18);
      pdf.setFontSize(10);
      pdf.text(trial.title || "Untitled trial", 14, 25);
      autoTable(pdf, {
        startY: 32,
        head: [["Summary field", "Details"]],
        body: SUMMARY_COLUMNS.map((column) => [
          column.label,
          column.get(trial) || "—",
        ]),
        styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [34, 61, 98] },
        columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 118 } },
      });
      pdf.save(`${safeFilename(trialId)}-summary.pdf`);
    } catch (error) {
      console.error("Trial summary PDF download failed:", error);
      setExportError("Could not create the summary PDF. Please try again.");
    }
  }

  async function resetDemoTrials() {
    const confirmed = window.confirm(
      "This permanently deletes all current shared trial records and restarts the trial ID number at 1. Continue only if all current trials are demo data.",
    );
    if (!confirmed || isResettingTrials) return;

    setIsResettingTrials(true);
    try {
      const response = await fetch("/api/trials/reset", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not reset demo trials.");
      window.location.href = "/form?newTrial=1";
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not reset demo trials.");
      setIsResettingTrials(false);
    }
  }

  if (loading || !employee) return null;

  return (
    <div className="trial-list-layout">
      <aside className="trial-list-sidebar" aria-label="Dashboard navigation">
        <div className="trial-list-brand">RailwayMitra</div>
        <div className="trial-list-nav-label">Workspace</div>
        <button
          type="button"
          className={`trial-list-nav-item ${showSummary ? "" : "active"}`}
          aria-current={!showSummary ? "page" : undefined}
          onClick={() => {
            setShowSummary(false);
            setExportError("");
          }}
        >
          Trial List
        </button>
        <button
          type="button"
          className="trial-list-nav-item"
          onClick={() => {
            let savedVersion = "";
            try {
              savedVersion = window.localStorage.getItem(
                `rm:trial-version:v1:${employee.code}`,
              ) || "";
            } catch {}
            const versionQuery = savedVersion
              ? `&version=${encodeURIComponent(savedVersion)}`
              : "";
            router.push(`/form?newTrial=1${versionQuery}`);
          }}
        >
          + New Trial Form
        </button>
        <button
          type="button"
          className="trial-list-nav-item"
          onClick={() => router.push("/tickets")}
        >
          Support Tickets
        </button>
        <button
          type="button"
          className="trial-list-logout"
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </aside>
      <main className="trial-list-main">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "28px",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            color: "var(--accent)",
            margin: 0,
          }}
        >
          {showSummary ? "Trial Summary" : "Trial List"}
        </h1>

        {isPmo ? (
          <button
            type="button"
            onClick={resetDemoTrials}
            disabled={isResettingTrials}
            style={{
              marginLeft: "auto",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #b42318",
              background: "white",
              color: "#b42318",
              cursor: "pointer",
              fontWeight: "bold",
              opacity: isResettingTrials ? 0.6 : 1,
            }}
          >
            {isResettingTrials ? "Resetting…" : "Reset Demo Trials / IDs"}
          </button>
        ) : null}
        <button
            onClick={() =>
              exportTrials(
                filteredTrials,
                dateFrom || dateTo
                  ? `trial-list-${dateFrom || "start"}-to-${dateTo || "end"}`
                  : "trial-list",
              )
            }
            disabled={isExporting || filteredTrials.length === 0}
            style={{
              marginLeft: isPmo ? 0 : "auto",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
              opacity: isExporting || filteredTrials.length === 0 ? 0.6 : 1,
            }}
          >
            {isExporting ? "Preparing file…" : "Export Excel"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search all trials by date, type, location, ID, team or agenda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: "280px",
            padding: "14px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            fontSize: "16px",
            background: "white",
            boxShadow: "var(--shadow)",
          }}
        />

        <label className="trial-date-filter">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="Filter trials from block date"
          />
        </label>
        <label className="trial-date-filter">
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Filter trials through block date"
          />
        </label>

      </div>

      <div
        style={{
          marginBottom: "10px",
          color: "var(--text-sub)",
          fontSize: "14px",
        }}
      >
        {invalidDateRange
          ? "The start date must be on or before the end date."
          : `Showing ${filteredTrials.length} trials`}
        {dateFrom || dateTo ? (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            style={{
              marginLeft: "12px",
              border: 0,
              padding: 0,
              background: "transparent",
              color: "var(--accent)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Clear date range
          </button>
        ) : null}
        <span
          style={{
            marginLeft: "12px",
            fontSize: "13px",
          }}
        >
          · Scroll the table left / right to see all columns
        </span>
      </div>

      {loadError ? (
        <div
          role="alert"
          style={{
            padding: "20px",
            marginBottom: "16px",
            color: "#991b1b",
            background: "#fee2e2",
            borderRadius: "12px",
          }}
        >
          The shared Trial List could not be loaded:{" "}
          {loadError}
        </div>
      ) : null}
      {exportError ? (
        <div
          role="alert"
          style={{
            padding: "16px",
            marginBottom: "16px",
            color: "#991b1b",
            background: "#fee2e2",
            borderRadius: "12px",
          }}
        >
          {exportError}
        </div>
      ) : null}

      {isLoadingHistory ? (
        <div
          role="status"
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--text-sub)",
            background: "white",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          Loading shared trials…
        </div>
      ) : showSummary ? (
        filteredTrials.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "var(--text-sub)",
              background: "white",
              borderRadius: "12px",
              border: "1px solid var(--border)",
            }}
          >
            No trials found.
          </div>
        ) : (
          <div
            style={{
              overflow: "auto",
              maxHeight: "72vh",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: "white",
              boxShadow: "var(--shadow)",
            }}
          >
            <table style={{ borderCollapse: "collapse", minWidth: "1600px", width: "100%" }}>
              <thead>
                <tr>
                  <th style={headBase}>Trial ID</th>
                  {SUMMARY_COLUMNS.map((column) => (
                    <th key={column.key} style={headBase}>{column.label}</th>
                  ))}
                  <th style={{ ...headBase, textAlign: "center" }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrials.map((trial) => (
                  <tr key={trial.trialId}>
                    <td style={cellBase}>{trial.customTrialId || trial.trialId || "—"}</td>
                    {SUMMARY_COLUMNS.map((column) => (
                      <td key={column.key} style={cellBase}>{column.get(trial) || "—"}</td>
                    ))}
                    <td style={{ ...cellBase, textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => downloadSummaryPdf(trial)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid var(--accent)",
                          background: "var(--accent)",
                          color: "white",
                          fontWeight: "bold",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : filteredTrials.length === 0 ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--text-sub)",
            background: "white",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          No trials found.
        </div>
      ) : (
        <div
          style={{
            overflow: "auto",
            maxHeight: "72vh",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            background: "white",
            boxShadow: "var(--shadow)",
          }}
        >
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              tableLayout: "fixed",
              width: `${TABLE_WIDTH}px`,
            }}
          >
            <colgroup>
              {TABLE_COLUMNS.map((c) => (
                <col
                  key={c.key}
                  style={{ width: `${c.width}px` }}
                />
              ))}

              <col style={{ width: `${EXPORT_WIDTH}px` }} />
              <col style={{ width: `${ACTION_WIDTH}px` }} />
            </colgroup>

            <thead>
              <tr>
                {TABLE_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      ...headBase,
                      ...(c.sticky
                        ? {
                            left: 0,
                            zIndex: 4,
                            borderRight:
                              "1px solid var(--border)",
                          }
                        : {}),
                    }}
                  >
                    {c.label}
                  </th>
                ))}

                <th
                  style={{
                    ...headBase,
                    right: `${ACTION_WIDTH}px`,
                    zIndex: 3,
                    textAlign: "center",
                  }}
                >
                  Export
                </th>

                <th
                  style={{
                    ...headBase,
                    right: 0,
                    zIndex: 4,
                    borderLeft:
                      "1px solid var(--border)",
                    textAlign: "center",
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredTrials.map((t) => (
                <tr key={t.trialId}>
                  {TABLE_COLUMNS.map((c) => {
                    const value = c.get(t);

                    if (c.key === "agenda") {
                      return (
                        <td
                          key={c.key}
                          className="history-agenda-cell"
                          style={cellBase}
                        >
                          <AgendaTables trial={t} />
                        </td>
                      );
                    }

                    if (c.key === "status") {
                      return (
                        <td
                          key={c.key}
                          style={cellBase}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 800,
                              background: t.submitted
                                ? "#dcfce7"
                                : "#e0e9f5",
                              color: t.submitted
                                ? "#166534"
                                : "#223d62",
                            }}
                          >
                            {value}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={c.key}
                        style={{
                          ...cellBase,
                          ...(c.sticky
                            ? {
                                position: "sticky",
                                left: 0,
                                zIndex: 1,
                                fontWeight: 800,
                                color: "var(--accent)",
                                borderRight:
                                  "1px solid var(--border)",
                              }
                            : {}),
                        }}
                      >
                        {value || "—"}
                      </td>
                    );
                  })}

                  <td
                    style={{
                      ...cellBase,
                      position: "sticky",
                      right: `${ACTION_WIDTH}px`,
                      zIndex: 1,
                      textAlign: "center",
                    }}
                  >
                    <button
                      onClick={() =>
                        exportTrials(
                          [t],
                          t.customTrialId ||
                            t.trialId ||
                            "trial",
                        )
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border:
                          "1px solid var(--accent)",
                        background: "var(--accent)",
                        color: "white",
                        fontWeight: "bold",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      disabled={isExporting}
                    >
                      Excel
                    </button>
                  </td>

                  <td
                    style={{
                      ...cellBase,
                      position: "sticky",
                      right: 0,
                      zIndex: 1,
                      borderLeft:
                        "1px solid var(--border)",
                      textAlign: "center",
                    }}
                  >
                    <button
                      onClick={() =>
                        router.push(
                          `/form?version=${encodeURIComponent(
                            t.version || "Trolly",
                          )}&trialId=${encodeURIComponent(
                            t.trialId,
                          )}`,
                        )
                      }
                      style={{
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border:
                          "1px solid var(--accent)",
                        background: "var(--accent)",
                        color: "white",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Open Trial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </main>
    </div>
  );
}
