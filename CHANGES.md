# Requested changes implemented

1. Added a **Trial Agenda** section above Trial Information. Agenda fields are editable only for employee codes listed in `NEXT_PUBLIC_PMO_CODES`.
2. Replaced the old Trials navbar button with a **RailwayMitra** dropdown containing **Trolly** and **V2.2**.
3. Removed **Reset**.
4. Removed the **Trials** navbar button.
5. Removed **Export JSON (Draft)**.
6. **Submit Post-Trial** sends the full trial summary and PDF report to `SOFTWARE_LEAD_EMAIL` after saving the trial.
7. **Trial History** now loads all saved trials, supports date sorting, search, and has **Export Excel** (CSV format compatible with Excel).
8. **My Tickets** now supports Open / Resolved / Resolved by me actions. New tickets are emailed to the configured team-lead email list.
9. Added **Ticket raised by name** as question 1 in the Raise Ticket form.
10. The Post-Trial Checklist displays the submitted Internal and External
    Trial Agenda above **Trial objective achieved**.

## Configuration

Copy `.env.example` to `.env.local`.

Set:
- `NEXT_PUBLIC_PMO_CODES=PMO,PMO001` (replace with the actual PMO employee codes)
- `TEAM_LEAD_EMAILS=vaishnavi.kulkarni@ericrobotics.com` (comma-separated for multiple team leads)
- Cloudflare Email Service via the `EMAIL` binding in `wrangler.jsonc`; set
  `MAIL_FROM` to a sender address enabled for the Cloudflare Email Service.

The trial report PDF is emailed when **Submit Post-Trial** is clicked.
