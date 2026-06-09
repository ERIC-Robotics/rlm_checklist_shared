const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "employees.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const insert = db.prepare("INSERT OR IGNORE INTO employees (employee_code, name) VALUES (?, ?)");

const employees = [
  ["16056", "Azhar"],
  ["16055", "Soham"],
  ["2401", "Pratik"],
  ["2351", "Kunal"],
  ["2407", "Parmeet"],
  ["16064", "Ankit"],
  ["EMP007", "Bhavik"],
  ["2440", "Vasundara"],
  ["2415", "Shubham"],
];

const tx = db.transaction(() => {
  for (const [code, name] of employees) {
    insert.run(code, name);
  }
});

tx();
console.log(`Seeded ${employees.length} employees into ${dbPath}`);
db.close();
