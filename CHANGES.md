# Requested changes implemented

1. Added a **Trial Agenda** section above Trial Information. Agenda fields are editable only for employee codes listed in `NEXT_PUBLIC_PMO_CODES`.
2. Replaced the old Trials navbar button with a **RailwayMitra** dropdown containing **Trolly** and **V2.2**.
3. Removed **Reset**.
4. Removed the **Trials** navbar button.
5. Removed **Export JSON (Draft)**.
6. Removed the visible **Submit Trial / PDF-email** flow. When all checklist questions are completed, the trial is automatically marked **Submitted** and saved.
7. **Trial History** now loads all saved trials, supports date sorting, search, and has **Export Excel** (CSV format compatible with Excel).
8. **My Tickets** now supports Open / Resolved / Resolved by me actions. New tickets are emailed to the configured team-lead email list.
9. Added **Ticket raised by name** as question 1 in the Raise Ticket form.

## Configuration

Copy `.env.example` to `.env.local`.

Set:
- `NEXT_PUBLIC_PMO_CODES=PMO,PMO001` (replace with the actual PMO employee codes)
- `TEAM_LEAD_EMAILS=vaishnavi.kulkarni@ericrobotics.com` (comma-separated for multiple team leads)
- SMTP variables for ticket email delivery.

The app intentionally does not send a PDF when a trial is completed.
