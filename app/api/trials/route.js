import { NextResponse } from "next/server";
import { canEditAgenda } from "../../../lib/agendaAccess";
import { getDb } from "../../../lib/db";
import { getSessionEmployee } from "../../../lib/session";

export const dynamic = "force-dynamic";

const TRIAL_LIST_ANSWER_NUMBERS = [
  "1", "2", "3", "4", "5", "9", "10", "11", "12", "13", "14", "15", "16",
  "18", "23", "27", "28", "34", "40", "41",
];

function getTrialListAnswers(state) {
  const answers = state?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return {};
  }

  const selectedAnswers = {};
  for (const number of TRIAL_LIST_ANSWER_NUMBERS) {
    if (!Object.hasOwn(answers, number)) continue;
    selectedAnswers[number] = answers[number];
  }

  for (const number of ["4", "5"]) {
    const answer = selectedAnswers[number];
    if (!answer || typeof answer !== "object") continue;
    for (const memberKey of ["externalMembers", "selectedEmployees"]) {
      if (!Array.isArray(answer[memberKey])) continue;
      selectedAnswers[number] = {
        ...selectedAnswers[number],
        [memberKey]: answer[memberKey].map((member) => ({
          ...member,
          ...(Object.hasOwn(member || {}, "aadhaar") ? { aadhaar: "" } : {}),
        })),
      };
    }
  }

  return selectedAnswers;
}

export async function GET(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to view shared trials." }, { status: 401 });

    const searchParams = new URL(request.url).searchParams;
    const includeAnswers = searchParams.get("include") === "summary";
    const publishedOnly = searchParams.get("published") === "1";
    const isPmo = canEditAgenda(employee.code);
    const db = await getDb("trials");
    const [rows, deletedRows] = await Promise.all([
      db`
        SELECT trial_id, title,
               CASE WHEN ${includeAnswers} OR submitted OR agenda_submitted OR pre_trial_submitted THEN
                 jsonb_build_object('answers', COALESCE((
                   SELECT jsonb_object_agg(answer.key, answer.value)
                   FROM jsonb_each(state->'answers') AS answer
                   WHERE answer.key = ANY(ARRAY['1', '2', '3', '4', '5', '9', '10', '11', '12', '13', '14', '15', '16', '18', '23', '27', '28', '34', '40', '41'])
                 ), '{}'::jsonb))
                 ELSE '{}'::jsonb END AS state,
               version, custom_trial_id, submitted, agenda_submitted, pre_trial_submitted,
               owner_code, created_at, updated_at
        FROM trials
        WHERE agenda_submitted = TRUE
           OR pre_trial_submitted = TRUE
           OR (${publishedOnly} = TRUE AND submitted = TRUE)
           OR (
             ${publishedOnly} = FALSE
             AND (owner_code = ${employee.code} OR ${isPmo} = TRUE)
           )
        ORDER BY updated_at DESC
      `,
      publishedOnly ? Promise.resolve([]) : db`SELECT trial_id FROM deleted_trials`,
    ]);
    const trials = rows.map((row) => ({
      trialId: row.trial_id,
      title: row.title,
      ...(includeAnswers
        ? { answers: getTrialListAnswers(row.state) }
        : row.submitted || row.agenda_submitted || row.pre_trial_submitted
          ? { agendaAnswers: getTrialListAnswers(row.state) }
          : {}),
      version: row.version,
      customTrialId: row.custom_trial_id,
      submitted: row.submitted,
      agendaSubmitted: row.agenda_submitted,
      preTrialSubmitted: row.pre_trial_submitted,
      ownerCode:
        row.owner_code === employee.code || isPmo ? row.owner_code : "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return NextResponse.json({
      trials,
      deletedTrialIds: deletedRows.map((row) => row.trial_id),
    });
  } catch (error) {
    console.error("Shared trial list error:", error);
    return NextResponse.json({ error: "Could not load shared trials." }, { status: 500 });
  }
}
