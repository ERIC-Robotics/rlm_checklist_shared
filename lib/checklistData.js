export const TOTAL_QUESTIONS = 30;

export const DEFAULT_TRIAL_AGENDA = {
  activities: [
    {
      category: "Autonomy Run",
      activity: "GPS-only autonomy run",
      details: "Execution by Azhar",
    },
    {
      category: "Knowledge Transfer",
      activity: "On-bot KT",
      details: "Azhar to provide KT to Gyanendra and Kapil",
    },
    {
      category: "Data Acquisition",
      activity: "Sensor data collection",
      details: "Profiler, Front Camera, and LiDAR",
    },
    {
      category: "SOD Validation",
      activity: "Live pipeline check",
      details: "Validate new SOD pipeline during trial",
    },
    {
      category: "Speed Profile",
      activity: "Robot operation speed",
      details: "Maintain 1.0 m/s on straight sections and 0.7 m/s on curves",
    },
    {
      category: "Data Transfer",
      activity: "Post-trial activity",
      details: "Azhar to initiate data transfer after trial completion",
    },
  ],
  deliverables: [
    "Fastener Integrity Report",
    "Rail Wear Report",
    "SOD Report",
  ],
};

// Trial Type options used only when V2.2 is selected
const V22_TRIAL_TYPE_OPTIONS = [
  { value: "", label: "Select trial type" },
  { value: "Test Track", label: "Test Track" },
  { value: "Main Line", label: "Main Line" }
];

export function getChecklistSectionsForVersion(version = "Trolly") {
  if (version === "V2.2") {
    return SECTIONS.map((section) => ({
      ...section,
      id: `${section.id}-v22`,
      shortTitle: `${section.shortTitle} (V2.2)`,
      title: `${section.title} (V2.2)`,
      questions: section.questions.map((question) => ({
        ...question,
        id: `${question.num}-v22`,

        // Q3 = Trial type
        ...(question.num === 3
          ? { options: V22_TRIAL_TYPE_OPTIONS }
          : {}),
      })),
    }));
  }

  return SECTIONS;
}

const yno = (num, text, { required = true } = {}) => ({
  num,
  type: "yesNoOther",
  text,
  required,
});

const text = (
  num,
  textLabel,
  { required = true, placeholder = "" } = {},
) => ({
  num,
  type: "text",
  text: textLabel,
  required,
  placeholder,
});

const time = (num, textLabel, { required = true } = {}) => ({
  num,
  type: "time",
  text: textLabel,
  required,
});

const socPair = (num, textLabel, { required = true } = {}) => ({
  num,
  type: "socPair",
  text: textLabel,
  required,
});

const date = (num, textLabel, { required = true } = {}) => ({
  num,
  type: "date",
  text: textLabel,
  required,
});

const select = (
  num,
  textLabel,
  options,
  { required = true } = {},
) => ({
  num,
  type: "select",
  text: textLabel,
  required,
  options,
});

const checklist = (
  num,
  title,
  items,
  { required = true, hasOther = false } = {},
) => ({
  num,
  type: "checklist",
  text: title,
  required,
  items,
  hasOther,
});

// ============================================================
// CHECKLIST SECTIONS
// ============================================================
//
// Question numbers:
// 1-5   = PMO Trial Details, Trial Agenda, and Team Members
// 6-8   = S2 Pre-Trial Checklist
// 9-20, 23-25 = S3 Trial Log
// 27    = Pre-Trial Approval (keeps its Trial List answer key)
// 28, 34, 40-41 = S4 Post-Trial Checklist (keeps Trial List answer keys)
//
// ============================================================

export const SECTIONS = [
  // ==========================================================
  // PMO TRIAL AGENDA
  // ==========================================================
  {
    id: "agenda",
    shortTitle: "Trial Agenda",
    title: "Trial Agenda",
    desc: "Agenda is maintained by PMO only. Other users can view the submitted agenda but cannot edit it.",
    pmoOnly: true,

    questions: [
      date(1, "Block Date"),

      {
        num: 2,
        type: "locationPair",
        text: "Block Location",
        required: true,
      },

      select(3, "Trial type", [
        { value: "", label: "Select trial type" },
        { value: "pune", label: "Pune (Test track)" },
        { value: "live", label: "Live Track" }
      ]),

      {
        num: 4,
        type: "agendaTable",
        text: "Trial Agenda",
        required: false,
      },

      {
        num: 5,
        type: "employeeRoster",
        text: "Team members",
        required: false,
      },
    ],
  },

  // ==========================================================
  // S2 - PRE-TRIAL CHECKLIST
  // ==========================================================
  {
    id: "sec2",
    shortTitle: "Section 2 – Pre Trial check List",
    title: "Section 2 – Pre Trial check List",
    desc: "Complete the readiness, supplies, and safety checks before departure.",

    questions: [
      checklist(
        6,
        "Readiness – Pre Departure",
        [
          "Flight case / transport box ready",
          "Loading completed & verified",
          "Trial permission documents",
          "Vehicle Arrangement",
          "Electronics, Mechanical tool box",
        ],
      ),

      checklist(
        7,
        "Extra supplies carried to site",
        [
          "Ethernet cable",
          "USB cable",
          "USB pen drive / external SSD",
          "Power extension board",
          "Charger / power adapter",
          "Spare nuts, bolts and fasteners",
          "Cable ties and tape",
        ],
        { hasOther: true },
      ),

      checklist(
        8,
        "Safety & PPE",
        [
          "Helmets available",
          "Reflective jackets available",
          "Safety shoes available",
          "First aid kit available",
        ],
      ),

      text(27, "Pre-Trial Approved By", {
        placeholder: "Name of approver...",
      }),
    ],
  },

  // ==========================================================
  // S3 - TRIAL LOG
  // ==========================================================
  {
    id: "sec3",
    shortTitle: "Section 3 – Trial Log",
    title: "Section 3 – Trial Log",
    desc: "Record the key timestamps and outcomes during the trial.",

    questions: [
      time(9, "Reaching Time"),

      text(10, "PTW number", {
        placeholder: "PTW number...",
      }),

      time(11, "Robot unloading time"),

      time(12, "Robot placement on track time"),

      time(13, "Assembly Start Time"),

      time(14, "Assembly End Time"),

      yno(
        15,
        "Robot assembled as per SOP, all fasteners secured and no visible damage",
      ),

      yno(16, "Robot boots up and all ROS2 nodes launch without errors"),

      yno(17, "Ensure lights are on with proper exposure"),

      time(18, "Movement start time"),

      checklist(
        19,
        "Trial mode(s) used during the trial",
        [
          "Manual",
          "Semi-autonomous",
          "Autonomous",
        ],
        {
          hasOther: true,
        },
      ),

      text(20, "Reason for switching to manual mode (if applicable)", {
        placeholder: "e.g. LiDAR fault, sensor issue...",
        required: false,
      }),

      time(23, "Track cleared time"),

      yno(
        24,
        "Robot disassembled, packed in flight case, and no equipment left behind at site",
      ),

      yno(
        25,
        "Robot placed on docking station for data transfer",
      ),
    ],
  },

  // ==========================================================
  // S4 - POST-TRIAL CHECKLIST
  // ==========================================================
  {
    id: "sec4",
    shortTitle: "Section 4 – Post-Trial Checklist",
    title: "Section 4 – Post-Trial Checklist",
    desc: "Record the trial outcome and post-trial approval.",
    questions: [
      {
        num: 28,
        type: "number",
        text: "Distance (m)",
        required: false,
        placeholder: "Enter distance in meters...",
      },
      yno(34, "Trial objective achieved – all agenda points covered", { required: false }),
      {
        num: 40,
        type: "textarea",
        text: "Key Observations / Issues / Remarks",
        required: false,
        placeholder: "Record post-trial observations...",
        rows: 4,
      },
      text(41, "Post-Trial Approved By", {
        required: false,
        placeholder: "Name of approver...",
      }),
    ],
  },
];

// ============================================================
// GET ALL QUESTIONS
// ============================================================

export function getAllQuestions() {
  return SECTIONS.flatMap((section) => section.questions).sort(
    (a, b) => a.num - b.num,
  );
}
