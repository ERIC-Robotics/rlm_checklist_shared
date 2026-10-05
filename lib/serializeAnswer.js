// Turns a single question's stored answer into a plain, human-readable string.
// Shared by the client (CSV export) and the server (PDF generation) so both
// always render answers the same way.
export function serializeAnswer(q, a) {
  if (a == null) return "";
  switch (q.type) {
    case "text":
    case "textarea":
    case "time":
      if (typeof a === "object" && a !== null) return a.value + (a.isEdited && a.reason ? ` (Edited: ${a.reason})` : "");
      return typeof a === "string" ? a : "";
    case "timeRange": {
      if (typeof a !== "object" || a === null) return "";
      const start = typeof a.start === "string" ? a.start : "";
      const end = typeof a.end === "string" ? a.end : "";
      if (!start && !end) return "";
      return `${start || "-"} to ${end || "-"}`;
    }
    case "socPair": {
      if (typeof a !== "object" || a === null) return typeof a === "string" ? a : "";
      const battery1 = String(a.battery1 ?? "");
      const battery2 = String(a.battery2 ?? "");
      return `Battery 1: ${battery1}%\nBattery 2: ${battery2}%`;
    }
    case "date":
      return typeof a === "string" ? a : "";
    case "select":
      return typeof a === "string" ? a : "";
    case "yesOther":
      if (!a || typeof a !== "object") return "";
      if (a.choice === "other") return a.otherText ?? "";
      return a.choice ?? "";
    case "yesNoOther":
      if (!a || typeof a !== "object") return "";
      if (a.choice === "other" || a.choice === "no") return a.choice + (a.otherText ? ` - ${a.otherText}` : "");
      return a.choice ?? "";
    case "checklist": {
      if (!a || typeof a !== "object") return "";
      const selected = a.selected && typeof a.selected === "object" ? a.selected : {};
      const chosen = Object.entries(selected)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k);
      const other = typeof a.otherText === "string" && a.otherText.trim() ? [`Other: ${a.otherText.trim()}`] : [];
      return [...chosen, ...other].join(" | ");
    }
    case "agendaTable": {
      if (!a || typeof a !== "object") return "";
      const activities = Array.isArray(a.activities)
        ? a.activities.map((item) => [item.category, item.activity, item.details].filter(Boolean).join(" — ")).filter(Boolean)
        : [];
      const deliverables = Array.isArray(a.deliverables)
        ? a.deliverables.filter((report) => typeof report === "string" && report.trim()).map((report, index) => `Report ${index + 1}: ${report}`)
        : [];
      return [...activities, ...deliverables].join("\n");
    }
    default:
      return "";
  }
}