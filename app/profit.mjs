// All monetary values here are in ILS. A missing cost basis is unknown, not zero.
export function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[(),₪\s]/g, "").replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const result = Number(cleaned) * (negative ? -1 : 1);
  return Number.isFinite(result) ? result : null;
}

function normalizeHeader(value) {
  return String(value ?? "").trim().replace(/[\s\u200e\u200f"'״׳()/:_-]+/g, "").toLowerCase();
}

function findColumn(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

export function profitColumns(headerRow) {
  const headers = headerRow.map(normalizeHeader);
  return {
    totalCost: findColumn(headers, [/^עלות(?:קניה|רכישה|מקורית|השקעה)?(?:בשח|בשקלים)?$/, /^עלותכוללת/, /^סכום(?:קניה|רכישה)/, /^costbasis/, /^purchasecost/]),
    unitCost: findColumn(headers, [/^שער(?:קניה|רכישה|עלות)/, /^מחיר(?:קניה|רכישה)/, /^purchaseprice/, /^averagecost/]),
    profitIls: findColumn(headers, [/^(?:רווח|הפסד|רווחהפסד)(?:ממומש)?(?:בשח|בשקלים|סכום)?$/, /^profit(?:ils|amount)?$/, /^gainloss(?:ils|amount)?$/]),
  };
}

// Prefer a reported monetary profit, then a reported total purchase cost.
// Per-unit purchase prices require an explicit currency/scale contract and are
// intentionally left out rather than assuming the quote units or FX conversion.
export function holdingProfit(row, columns, marketValueIls) {
  if (columns.profitIls >= 0) {
    const profitIls = parseAmount(row[columns.profitIls]);
    if (profitIls !== null) return { costBasisIls: marketValueIls - profitIls, profitIls };
  }
  if (columns.totalCost >= 0) {
    const costBasisIls = parseAmount(row[columns.totalCost]);
    if (costBasisIls !== null) return { costBasisIls, profitIls: marketValueIls - costBasisIls };
  }
  return { costBasisIls: null, profitIls: null };
}

export function profitSummary(rows) {
  const known = rows.filter((row) => typeof row.profitIls === "number" && Number.isFinite(row.profitIls));
  return {
    profitIls: known.reduce((sum, row) => sum + row.profitIls, 0),
    known: known.length,
    unknown: rows.length - known.length,
  };
}
