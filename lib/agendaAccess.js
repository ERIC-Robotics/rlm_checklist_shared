export const PMO_EMPLOYEE_CODES = ["2440", "16080"];

export function canEditAgenda(employeeCode) {
  return PMO_EMPLOYEE_CODES.includes(employeeCode);
}
