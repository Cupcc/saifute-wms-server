function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatDateOnly(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateValue(value) {
  if (!value) {
    return "-";
  }
  if (value instanceof Date) {
    return formatDateOnly(value);
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : String(value);
}
