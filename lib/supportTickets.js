export function mapSupportTicket(row) {
  return {
    ticketId: row.ticket_id,
    status: row.status,
    raisedBy: row.raised_by,
    employee: row.employee,
    employeeCode: row.employee_code,
    issueType: row.issue_type,
    dateLocation: row.date_location,
    mastNumber: row.mast_number,
    description: row.description,
    trialId: row.trial_id,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
