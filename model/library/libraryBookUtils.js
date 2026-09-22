const normalizeBookCodeText = (value = "") => String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

const normalizeBookIsbn = (value = "") => {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return undefined;
  return cleaned;
};

const buildBookCodePrefix = ({ title = "", author = "", publisherName = "", existingPrefixes = [] } = {}) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map((word) => String(word).replace(/[^A-Za-z]/g, "")[0] || "")
    .filter(Boolean)
    .map((char) => char.toUpperCase())
    .slice(0, 6)
    .join("");

  const fallback = normalizeBookCodeText((author || publisherName || title || "")).slice(0, 4) || "BK";
  const basePrefix = (initials || fallback).slice(0, 6).toUpperCase() || "BK";
  const used = new Set((existingPrefixes || []).map((value) => String(value || "").trim().toUpperCase()));

  if (!used.has(basePrefix)) {
    return basePrefix;
  }

  const suffixes = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  for (const suffix of suffixes) {
    const candidate = `${basePrefix}-${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  let counter = 1;
  while (true) {
    const candidate = `${basePrefix}-${String(counter).padStart(2, "0")}`;
    if (!used.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
};

const generateBookCopyCodes = (prefix = "BK", quantity = 0, existingCodes = []) => {
  const safePrefix = String(prefix || "BK").replace(/[^A-Z0-9-]/gi, "").toUpperCase() || "BK";
  const usedCodes = new Set((existingCodes || []).map((code) => String(code || "").trim().toUpperCase()));
  const codes = [];
  let counter = 1;

  while (codes.length < Number(quantity || 0)) {
    const candidate = `${safePrefix}-${String(counter).padStart(3, "0")}`;
    if (!usedCodes.has(candidate)) {
      codes.push(candidate);
      usedCodes.add(candidate);
    }
    counter += 1;
  }

  return codes;
};

const calculateLateFine = ({ dueDate, returnDate, finePerDay = 10, quantity = 1 }) => {
  const due = dueDate ? new Date(dueDate) : null;
  const returned = returnDate ? new Date(returnDate) : new Date();

  if (!due || returned <= due) {
    return { daysLate: 0, fineAmount: 0 };
  }

  const diffMs = returned.getTime() - due.getTime();
  const daysLate = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const fineAmount = Number(finePerDay || 0) * Number(quantity || 1) * daysLate;

  return { daysLate, fineAmount };
};

module.exports = {
  normalizeBookCodeText,
  normalizeBookIsbn,
  buildBookCodePrefix,
  generateBookCopyCodes,
  calculateLateFine,
};
