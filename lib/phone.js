// Clean any phone format to E.164: +1XXXXXXXXXX
export function cleanPhone(raw) {
  if (!raw) return null;
  // Strip everything except digits and +
  let digits = raw.replace(/[^\d+]/g, "");
  // Remove leading +
  if (digits.startsWith("+")) digits = digits.slice(1);
  // Now we have only digits
  // If 11 digits starting with 1, it's +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }
  // If 10 digits, prepend +1
  if (digits.length === 10) {
    return "+1" + digits;
  }
  // If it already looks international (> 11 digits), just add +
  if (digits.length > 10) {
    return "+" + digits;
  }
  // Too short — invalid
  return null;
}
