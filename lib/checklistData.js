export const TOTAL_QUESTIONS = 41;

export const DEFAULT_TRIAL_AGENDA = {
  activities: [
    { category: "Autonomy Run", activity: "GPS-only autonomy run", details: "Execution by Azhar" },
    { category: "Knowledge Transfer", activity: "On-bot KT", details: "Azhar to provide KT to Gyanendra and Kapil" },
    { category: "Data Acquisition", activity: "Sensor data collection", details: "Profiler, Front Camera, and LiDAR" },
    { category: "SOD Validation", activity: "Live pipeline check", details: "Validate new SOD pipeline during trial" },
    {
      category: "Speed Profile",
      activity: "Robot operation speed",
      details: "Maintain 1.0 m/s on straight sections and 0.7 m/s on curves",
    },
    { category: "Data Transfer", activity: "Post-trial activity", details: "Azhar to initiate data transfer after trial completion" },
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
  { value: "Main Line", label: "Main Line" },
  { value: "other", label: "Other" },
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
        // Q3 = Trial type: swap the dropdown options for V2.2
        ...(question.num === 3 ? { options: V22_TRIAL_TYPE_OPTIONS } : {}),
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

const text = (num, textLabel, { required = true, placeholder = "" } = {}) => ({
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

// Start time (above) and end time (below), each with its own "Now" button
const timeRange = (num, textLabel, { required = true } = {}) => ({
  num,
  type: "timeRange",
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

const select = (num, textLabel, options, { required = true } = {}) => ({
  num,
  type: "select",
  text: textLabel,
  required,
  options,
});

const checklist = (num, title, items, { required = true, hasOther = false } = {}) => ({
  num,
  type: "checklist",
  text: title,
  required,
  items,
  hasOther,
});

// Question numbers are stable IDs. ChecklistApp.jsx and HistoryClient.jsx
// reference a few numbers directly: Block Date = 1, Block Location = 2,
// Trial Type = 3, Team members = 4.
export const SECTIONS = [
  {
    id: "agenda",
    shortTitle: "Trial Agenda",
    title: "Trial Agenda",
    desc: "Agenda is maintained by PMO only. Other users can view the submitted agenda but cannot edit it.",
    pmoOnly: true,
    questions: [
      date(1, "Block Date"),
      text(2, "Block Location", { placeholder: "Site / block location..." }),
      select(3, "Trial type", [
        { value: "", label: "Select trial type" },
        { value: "pune", label: "Pune (Test track)" },
        { value: "live", label: "Live Track" },
        { value: "other", label: "Other" },
      ]),
      text(4, "Team member names", { placeholder: "Names of team members..." }),
      { num: 5, type: "agendaTable", text: "Trial Agenda", required: false },
    ],
  },

  {
    id: "sec1",
    shortTitle: "Trial Information",
    title: "Trial Information",
    desc: "Captures the details of the trial as it happens. Use the 'Now' button to log the current time.",
    questions: [
      time(6, "Reaching Time"),
      time(7, "Robot unloading time"),
      time(8, "Assembly Start Time"),
      time(9, "Assembly End Time"),
      select(10, "Trial mode", [
        { value: "", label: "Select trial mode" },
        { value: "manual", label: "Manual" },
        { value: "semi-autonomous", label: "Semi-autonomous" },
        { value: "autonomous", label: "Autonomous" },
        { value: "other", label: "Other" },
      ]),
      socPair(11, "Battery SoC before trial (%)"),
      yno(12, "Site safety briefing given, track and area ahead clear, and robot placed correctly on track"),
      time(13, "Robot placement on track time"),
      time(14, "Movement start time"),
      timeRange(15, "Trial start time and end time"),
    ],
  },

  {
    id: "sec2",
    shortTitle: "Pre-Trial Departure",
    title: "Pre-Trial Departure",
    desc: "Readiness checks before leaving for the trial.",
    questions: [
      text(16, "Robot ID and software build version deployed", {
        placeholder: "Robot ID / software build...",
      }),
      yno(17, "Trial permission (PTW / block) documents verified and site access confirmed"),
      checklist(
        18,
        "PPE and safety kit packed and available",
        [
          "Helmets available",
          "Reflective jackets available",
          "Safety shoes available",
          "First aid kit available",
        ],
        { hasOther: true },
      ),
    ],
  },

  {
    id: "sec3",
    shortTitle: "Pre-Trial Checks",
    title: "Pre-Trial Checks",
    desc: "All pre-trial operational checks. Every item should be marked before the form moves ahead.",
    questions: [
      yno(19, "Robot assembled as per SOP, all fasteners secured and no visible damage"),
      yno(20, "Robot boots up and all ROS2 nodes launch without errors"),
      checklist(
        21,
        "Sensor status before trial",
        [
          "Profilers connected and streaming",
          "RGB camera streaming",
          "LiDAR streaming",
          "IMU readings stable",
          "GPS has good satellite lock",
        ],
        { hasOther: true },
      ),
      yno(22, "Network connectivity stable and system timestamps synchronised across all compute units"),
      yno(23, "Profiler configuration verified (IP address, 20° angle, encoder signal, test trigger)"),
      yno(24, "Camera positioned on central FOV of rail head, aligned with rail direction, and exposure within limits"),
      yno(25, "Test recording completed and sufficient storage space available"),
      yno(26, "Emergency stop and obstacle detection / safety mechanisms tested and active"),
      text(27, "Final pre-trial verification approved by", { placeholder: "Name of approver..." }),
    ],
  },

  {
    id: "sec4",
    shortTitle: "Trial Execution",
    title: "Trial Execution",
    desc: "This section is filled during the trial or immediately after it.",
    questions: [
      text(28, "Distance covered during the trial (m)", { placeholder: "Distance in metres, e.g. 1200" }),
      yno(29, "All sensor data streamed continuously with no dropouts or ROS2 node disconnections"),
      yno(30, "Battery voltage, current and temperature within safe limits throughout the trial"),
      yno(31, "CPU, memory and disk usage within safe limits throughout the trial"),
      yno(32, "Robot movement smooth, and obstacle detection / safety mechanisms remained active"),
      yno(33, "Trial completed without any fault, restart, emergency stop or unusual behaviour"),
      yno(34, "Trial objective achieved"),
    ],
  },

  {
    id: "sec5",
    shortTitle: "Post-Trial Checks",
    title: "Post-Trial Checks",
    desc: "This section closes the trial-level validation before the BOT -> REPORT phase starts.",
    questions: [
      yno(35, "Bag files saved, not corrupted, correctly named, and data duration matches trial duration"),
      text(36, "Total recording size and number of bag files generated", {
        placeholder: "e.g. 120 GB, 15 bag files",
      }),
      socPair(37, "Battery SoC after trial (%)"),
      yno(38, "Post-run inspection done on sensors, mounts, wheels and components (damage, looseness, overheating)"),
      yno(39, "Robot disassembled, packed in flight case, and no equipment left behind at site"),
      text(40, "Key observations, issues and remarks", { placeholder: "Describe observations / issues..." }),
      text(41, "Final post-trial verification approved by", { placeholder: "Name of approver..." }),
    ],
  },
];

export function getAllQuestions() {
  return SECTIONS.flatMap((s) => s.questions).sort((a, b) => a.num - b.num);
}