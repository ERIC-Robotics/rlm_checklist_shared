import PDFDocument from "pdfkit";
import { SECTIONS } from "./checklistData";
import { serializeAnswer } from "./serializeAnswer";

function formatIso(iso) {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Builds a PDF report for a submitted trial and resolves with a Buffer.
export function generateTrialPdf(payload) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const answers = payload?.answers || {};
      const title = `Trial Report — ${payload?.customTrialId || payload?.trialId || "Untitled"}`;

      doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "left" });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#444444");

      const metaLines = [
        `Version: ${payload?.version || "-"}`,
        `System Trial ID: ${payload?.trialId || "-"}`,
        `Submitted At: ${formatIso(payload?.submittedAt) || "-"}`,
        `Submitted By: ${
          payload?.submittedBy
            ? `${payload.submittedBy.employeeName || ""} (${payload.submittedBy.employeeCode || ""})`
            : "-"
        }`,
        `Completion: ${payload?.answeredCount ?? "-"} / ${payload?.totalQuestions ?? "-"} (${
          payload?.completionPct ?? "-"
        }%)`,
      ];
      metaLines.forEach((line) => doc.text(line));
      doc.moveDown(1);
      doc.fillColor("#000000");

      SECTIONS.forEach((section) => {
        doc.moveDown(0.5);
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor("#1a1a1a")
          .text(section.title, { underline: false });
        doc.moveDown(0.2);
        doc.font("Helvetica").fontSize(10).fillColor("#000000");

        section.questions.forEach((q) => {
          const answerText = serializeAnswer(q, answers[q.num]) || "—";
          const label = `Q${q.num}. ${q.text || ""}`;

          if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
            doc.addPage();
          }

          doc.font("Helvetica-Bold").fontSize(10).text(label);
          doc.font("Helvetica").fontSize(10).fillColor("#333333").text(answerText, {
            indent: 12,
          });
          doc.fillColor("#000000");
          doc.moveDown(0.35);
        });
      });

      // Footer with page numbers.
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#888888")
          .text(`Page ${i + 1} of ${pageCount}`, 0, doc.page.height - 30, {
            align: "center",
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
