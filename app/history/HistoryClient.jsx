"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zipSync, strToU8 } from "fflate";
import { useAuth } from "../components/AuthProvider";
import { SECTIONS } from "../../lib/checklistData";
import { serializeAnswer } from "../../lib/serializeAnswer";

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

// Question lookup by number (same numbers in Trolly and V2.2)
const QUESTION_MAP = {};
SECTIONS.forEach((s) => s.questions.forEach((q) => { QUESTION_MAP[q.num] = q; }));

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
  const agenda = trial.answers?.["5"];
  return agenda && typeof agenda === "object" ? agenda : {};
}

function getAgendaRows(trials) {
  const rows = [["Trial ID", "Trial", "Block Date", "Agenda Type", "Category", "Activity / Report", "Details"]];

  trials.forEach((trial) => {
    const agenda = getAgenda(trial);
    const trialId = trial.customTrialId || trial.trialId || "";
    const title = trial.title || "Untitled trial";
    const blockDate = getAnswer(trial.answers, 1);

    (Array.isArray(agenda.activities) ? agenda.activities : []).forEach((activity) => {
      if (!activity || typeof activity !== "object") return;
      if (![activity.category, activity.activity, activity.details].some((value) => String(value ?? "").trim())) return;
      rows.push([
        trialId,
        title,
        blockDate,
        "Internal",
        activity.category || "",
        activity.activity || "",
        activity.details || "",
      ]);
    });

    (Array.isArray(agenda.deliverables) ? agenda.deliverables : []).forEach((report, index) => {
      if (!String(report ?? "").trim()) return;
      rows.push([trialId, title, blockDate, "External", `Report ${index + 1}`, report, ""]);
    });
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
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function worksheetXml(rows) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxLength = rows.reduce(
      (max, row) => Math.max(max, String(row[columnIndex] ?? "").length),
      10,
    );
    return Math.min(52, Math.max(12, maxLength + 2));
  });
  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const address = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastColumn = columnName(columnCount - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, rows.length)}"/></worksheet>`;
}

function workbookBytes(trials) {
  const trialRows = [
    COLUMNS.map((column) => column.label),
    ...trials.map((trial) => COLUMNS.map((column) => column.get(trial))),
  ];
  const sheets = [
    { name: "Trial History", rows: trialRows },
    { name: "Trial Agenda", rows: getAgendaRows(trials) },
  ];
  const files = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Trial History" sheetId="1" r:id="rId1"/><sheet name="Trial Agenda" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
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
  return String(value || "trial-history")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-|-$/g, "") || "trial-history";
}

const COLUMNS = [
  { key: "trialId", label: "Trial ID", width: 200, sticky: true, get: (t) => t.customTrialId || t.trialId || "" },
  { key: "title", label: "Trial", width: 200, get: (t) => t.title || "Untitled trial" },
  { key: "formCategory", label: "Form Category", width: 140, get: (t) => t.version || "Trolly" },
  { key: "status", label: "Status", width: 110, get: (t) => (t.submitted ? "Submitted" : "Draft") },
  { key: "blockDate", label: "Block Date", width: 120, get: (t) => getAnswer(t.answers, 1) },
  { key: "location", label: "Block Location", width: 180, get: (t) => getAnswer(t.answers, 2) },
  { key: "type", label: "Trial Type", width: 140, get: (t) => getAnswer(t.answers, 3) },
  { key: "team", label: "Team Members", width: 240, get: (t) => getAnswer(t.answers, 4) },
  { key: "agenda", label: "Trial Agenda", width: 560, get: (t) => getAnswer(t.answers, 5) },
  { key: "mode", label: "Trial Mode", width: 140, get: (t) => getAnswer(t.answers, 10) },
  { key: "robot", label: "Robot ID / Software Build", width: 220, get: (t) => getAnswer(t.answers, 16) },
  { key: "trialTime", label: "Trial Start – End", width: 150, get: (t) => getAnswer(t.answers, 15) },
  { key: "distance", label: "Distance (m)", width: 120, get: (t) => getAnswer(t.answers, 28) },
  { key: "objective", label: "Objective Achieved", width: 180, get: (t) => getAnswer(t.answers, 34) },
  { key: "preApproved", label: "Pre-Trial Approved By", width: 180, get: (t) => getAnswer(t.answers, 27) },
  { key: "observations", label: "Key Observations / Issues / Remarks", width: 380, get: (t) => getAnswer(t.answers, 40) },
  { key: "postApproved", label: "Post-Trial Approved By", width: 180, get: (t) => getAnswer(t.answers, 41) },
  { key: "created", label: "Created At", width: 180, get: (t) => formatIso(t.createdAt) },
  { key: "updated", label: "Updated At", width: 180, get: (t) => formatIso(t.updatedAt) },
];

const ACTION_WIDTH = 140;
const EXPORT_WIDTH = 150;
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0) + ACTION_WIDTH + EXPORT_WIDTH;

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
  background: "#f1f5f9",
  color: "var(--accent)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

function AgendaTables({ trial }) {
  const agenda = getAgenda(trial);
  const activities = (Array.isArray(agenda.activities) ? agenda.activities : [])
    .filter((item) => item && typeof item === "object")
    .filter((item) => [item.category, item.activity, item.details].some((value) => String(value ?? "").trim()));
  const reports = (Array.isArray(agenda.deliverables) ? agenda.deliverables : [])
    .filter((report) => String(report ?? "").trim());

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
              {activities.length ? activities.map((activity, index) => (
                <tr key={`activity-${index}`}>
                  <td>{activity.category || "—"}</td>
                  <td>{activity.activity || "—"}</td>
                  <td>{activity.details || "—"}</td>
                </tr>
              )) : (
                <tr><td colSpan={3}>No internal agenda items</td></tr>
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
              {reports.length ? reports.map((report, index) => (
                <tr key={`report-${index}`}>
                  <td>{index + 1}</td>
                  <td>{report}</td>
                </tr>
              )) : (
                <tr><td colSpan={2}>No external reports</td></tr>
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
  const { employee, loading } = useAuth();
  const [trials, setTrials] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [search, setSearch] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!loading && !employee) {
      router.replace("/login?next=/history");
    }
  }, [loading, employee, router]);

  useEffect(() => {
    let active = true;
    fetch("/api/trials?include=answers")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load shared Trial History.");
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
  }, []);

  const filteredTrials = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = trials.filter((t) => {
      if (!q) return true;
      const searchString = `${t.trialId || ""} ${COLUMNS.map((c) => c.get(t)).join(" ")}`.toLowerCase();
      return searchString.includes(q);
    });

    const dateOf = (t) => {
      const d = new Date(t.answers?.["1"] || t.createdAt || 0).getTime();
      return Number.isNaN(d) ? 0 : d;
    };

    return filtered.sort((a, b) => (sortNewest ? dateOf(b) - dateOf(a) : dateOf(a) - dateOf(b)));
  }, [trials, search, sortNewest]);

  function exportTrials(selectedTrials, name) {
    if (isExporting) return;
    setIsExporting(true);
    setExportError("");
    try {
      const date = new Date().toISOString().slice(0, 10);
      const baseName = `${safeFilename(name)}-${date}`;
      const workbook = workbookBytes(selectedTrials);
      downloadBlob(
        new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${baseName}.xlsx`,
      );
    } catch (error) {
      console.error("Trial history export failed:", error);
      setExportError("Could not create the Excel file. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  if (loading || !employee) return null;

  return (
    <div style={{ padding: "32px 24px", margin: "0 auto", fontFamily: "var(--font-ui), sans-serif", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
        <button onClick={() => router.push("/form")} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "white", cursor: "pointer", fontWeight: "bold" }}>
          ← Back to Form
        </button>
        <h1 style={{ fontSize: "28px", color: "var(--accent)", margin: 0 }}>Trial History</h1>
        <button onClick={() => exportTrials(filteredTrials, "trial-history")} disabled={isExporting || filteredTrials.length === 0} style={{ marginLeft: "auto", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--accent)", background: "var(--accent)", color: "white", cursor: "pointer", fontWeight: "bold", opacity: isExporting || filteredTrials.length === 0 ? 0.6 : 1 }}>
          {isExporting ? "Preparing file…" : "Export Excel"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search all trials by date, type, location, ID, team or agenda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "280px", padding: "14px 20px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "16px", background: "white", boxShadow: "var(--shadow)" }}
        />
        <button
          onClick={() => setSortNewest((v) => !v)}
          style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border)", background: "white", cursor: "pointer", fontWeight: "700" }}
        >
          Sort by date: {sortNewest ? "Newest first" : "Oldest first"}
        </button>
      </div>

      <div style={{ marginBottom: "10px", color: "var(--text-sub)", fontSize: "14px" }}>
        Showing {filteredTrials.length} of {trials.length} trials
        <span style={{ marginLeft: "12px", fontSize: "13px" }}>· Scroll the table left / right to see all columns</span>
      </div>

      {loadError ? (
        <div role="alert" style={{ padding: "20px", marginBottom: "16px", color: "#991b1b", background: "#fee2e2", borderRadius: "12px" }}>
          Shared Trial History could not be loaded: {loadError}
        </div>
      ) : null}

      {exportError ? (
        <div role="alert" style={{ padding: "16px", marginBottom: "16px", color: "#991b1b", background: "#fee2e2", borderRadius: "12px" }}>
          {exportError}
        </div>
      ) : null}

      {isLoadingHistory ? (
        <div role="status" style={{ padding: "40px", textAlign: "center", color: "var(--text-sub)", background: "white", borderRadius: "12px", border: "1px solid var(--border)" }}>
          Loading shared trials…
        </div>
      ) : filteredTrials.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-sub)", background: "white", borderRadius: "12px", border: "1px solid var(--border)" }}>
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
          <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: `${TABLE_WIDTH}px` }}>
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.key} style={{ width: `${c.width}px` }} />
              ))}
              <col style={{ width: `${EXPORT_WIDTH}px` }} />
              <col style={{ width: `${ACTION_WIDTH}px` }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      ...headBase,
                      ...(c.sticky ? { left: 0, zIndex: 4, borderRight: "1px solid var(--border)" } : {}),
                    }}
                  >
                    {c.label}
                  </th>
                ))}
                <th style={{ ...headBase, right: `${ACTION_WIDTH}px`, zIndex: 3, textAlign: "center" }}>Export</th>
                <th style={{ ...headBase, right: 0, zIndex: 4, borderLeft: "1px solid var(--border)", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrials.map((t) => (
                <tr key={t.trialId}>
                  {COLUMNS.map((c) => {
                    const value = c.get(t);
                    if (c.key === "agenda") {
                      return (
                        <td key={c.key} className="history-agenda-cell" style={cellBase}>
                          <AgendaTables trial={t} />
                        </td>
                      );
                    }
                    if (c.key === "status") {
                      return (
                        <td key={c.key} style={cellBase}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 800,
                              background: t.submitted ? "#dcfce7" : "#fef3c7",
                              color: t.submitted ? "#166534" : "#92400e",
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
                          ...(c.sticky ? { position: "sticky", left: 0, zIndex: 1, fontWeight: 800, color: "var(--accent)", borderRight: "1px solid var(--border)" } : {}),
                        }}
                      >
                        {value || "—"}
                      </td>
                    );
                  })}
                  <td style={{ ...cellBase, position: "sticky", right: `${ACTION_WIDTH}px`, zIndex: 1, textAlign: "center" }}>
                    <button
                      onClick={() => exportTrials([t], t.customTrialId || t.trialId || "trial")}
                      style={{ padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap" }}
                      disabled={isExporting}
                    >
                      Excel
                    </button>
                  </td>
                  <td style={{ ...cellBase, position: "sticky", right: 0, zIndex: 1, borderLeft: "1px solid var(--border)", textAlign: "center" }}>
                    <button
                      onClick={() => router.push(`/form?version=${encodeURIComponent(t.version || "Trolly")}&trialId=${encodeURIComponent(t.trialId)}`)}
                      style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontWeight: "bold", cursor: "pointer" }}
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
    </div>
  );
}