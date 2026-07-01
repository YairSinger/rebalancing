import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outDir = new URL("../outputs/portfolio-monitor/", import.meta.url);
const outDirPath = fileURLToPath(outDir);
await fs.mkdir(outDir, { recursive: true });

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const visual = workbook.worksheets.add("Visual Dashboard");
const holdings = workbook.worksheets.add("Holdings");
const bankImport = workbook.worksheets.add("Bank Snapshot Import");
const snapshots = workbook.worksheets.add("Monthly Snapshots");
const policy = workbook.worksheets.add("Policy");
const checks = workbook.worksheets.add("Checks");

const sheets = [dashboard, visual, holdings, bankImport, snapshots, policy, checks];
for (const sheet of sheets) {
  sheet.showGridLines = false;
}

function title(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format.font = { bold: true, size: 18, color: "#172033" };
  r.format.fill = { color: "#EAF2F8" };
  r.format.borders = { preset: "outside", style: "thin", color: "#9FB5C8" };
}

function section(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format.font = { bold: true, color: "#FFFFFF" };
  r.format.fill = { color: "#243B53" };
}

function header(range) {
  range.format.font = { bold: true, color: "#172033" };
  range.format.fill = { color: "#DDE8F0" };
  range.format.borders = { preset: "outside", style: "thin", color: "#9FB5C8" };
}

function inputStyle(range) {
  range.format.font = { color: "#0000FF" };
  range.format.fill = { color: "#FFF7CC" };
}

function formulaStyle(range) {
  range.format.font = { color: "#000000" };
}

function repeatFormula(rows, formula) {
  return Array.from({ length: rows }, () => [formula]);
}

const importedHoldingRows = [
  ["US Large Cap Equity", "iShares $ CORE S&P 500 UCITS ETF-TA (1159250)", "Bank 1424", 97, 237840, 230704.8],
  ["Developed Europe Equity", "iShares CORE MSCI EUROPE UCITS ETF EUR-TA (1159094)", "Bank 1424", 425, 35080, 149090],
  ["Cash / Money Market", "מיטב כספית שקלית כשרה (5136544)", "Bank 1424", 12078, 1160.58, 140174.85],
  ["Israeli Shekel Bonds", "תכלית TTF י תל בונד שקלי 5-15 (5130174)", "Bank 1424", 1320, 4498.2, 59376.24],
  ["Emerging Markets Equity", "iShares CORE MSCI EM IMI UCITS ETF-TA (1159169)", "Bank 1424", 212, 16490, 34958.8],
  ["Bitcoin / Crypto", "ISHARES BITCOIN TRUST ETF (IBIT)", "Bank 1424", 135, 36.5, 14472.25],
  ["Sector Equity - Semiconductors", "VANECK VECTORS SEMICONDUCTOR ETF (SMH)", "Bank 1424", 4, 668.91, 7858.45],
  ["Individual Stock", "אלביט מערכות (1081124)", "Bank 1424", 1, 229800, 2298],
  ["Cash / Money Market", "Free cash available for trading", "Bank 1424", 1, 1663.41, 1663.41],
];
const importedTotalValue = importedHoldingRows.reduce((sum, row) => sum + row[5], 0);
const individualStockLimit = 0.05;
const individualStockCurrent = importedHoldingRows
  .filter((row) => row[0] === "Individual Stock")
  .reduce((sum, row) => sum + row[5], 0) / importedTotalValue;
const nonIndividualScale = (1 - individualStockLimit) / (1 - individualStockCurrent);
const importedHoldings = importedHoldingRows.map((row) => {
  const currentWeight = row[5] / importedTotalValue;
  const targetWeight = row[0] === "Individual Stock" ? individualStockLimit : currentWeight * nonIndividualScale;
  return [...row, targetWeight];
});

// Holdings
title(holdings, "A1:K1", "Portfolio Holdings And Targets");
holdings.getRange("A3:K3").values = [[
  "Asset Class", "Ticker / Fund", "Account", "Units", "Price", "Market Value", "Target %",
  "Current %", "Drift pp", "Band pp", "Action"
]];
header(holdings.getRange("A3:K3"));
holdings.getRange("A4:K28").values = Array.from({ length: 25 }, () =>
  ["", "", "", null, null, null, null, null, null, null, ""]
);
holdings.getRange(`A4:G${3 + importedHoldings.length}`).values = importedHoldings;
holdings.getRange("H4:H28").formulasR1C1 = repeatFormula(25, "=IF(RC[-2]=\"\",\"\",IFERROR(RC[-2]/SUM(R4C6:R28C6),\"\"))");
holdings.getRange("I4:I28").formulasR1C1 = repeatFormula(25, "=IF(RC[-1]=\"\",\"\",IFERROR(RC[-1]-RC[-2],\"\"))");
holdings.getRange("J4:J28").values = Array.from({ length: 25 }, (_, index) => [index < importedHoldings.length ? 0.05 : null]);
holdings.getRange("K4:K28").formulasR1C1 = repeatFormula(25, "=IF(RC[-10]=\"\",\"\",IF(RC[-2]>RC[-1],\"Above band\",IF(RC[-2]<-RC[-1],\"Below band\",\"Inside band\")))");
holdings.getRange("D4:F28").setNumberFormat("#,##0.00");
holdings.getRange("G4:J28").setNumberFormat("0.0%");
inputStyle(holdings.getRange("A4:E28"));
inputStyle(holdings.getRange("G4:G28"));
inputStyle(holdings.getRange("J4:J28"));
inputStyle(holdings.getRange("F4:F28"));
formulaStyle(holdings.getRange("H4:I28"));
formulaStyle(holdings.getRange("K4:K28"));
holdings.getRange("A3:K28").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
holdings.freezePanes.freezeRows(3);
holdings.getRange("A:K").format.autofitColumns();

// Dashboard
title(dashboard, "A1:H1", "Conservative Rebalancing Dashboard");
dashboard.getRange("A3:B9").values = [
  ["As-of date", new Date("2026-06-23")],
  ["New contribution amount", 0],
  ["Total portfolio value", null],
  ["Target allocation total", null],
  ["Largest overweight", null],
  ["Largest underweight", null],
  ["Contribution buy first", null],
];
dashboard.getRange("B5").formulas = [["=SUM('Holdings'!F4:F28)"]];
dashboard.getRange("B6").formulas = [["=SUM('Holdings'!G4:G28)"]];
dashboard.getRange("B7").formulas = [["=IFERROR(INDEX('Holdings'!A4:A28,MATCH(MAX('Holdings'!I4:I28),'Holdings'!I4:I28,0)),\"\")"]];
dashboard.getRange("B8").formulas = [["=IFERROR(INDEX('Holdings'!A4:A28,MATCH(MIN('Holdings'!I4:I28),'Holdings'!I4:I28,0)),\"\")"]];
dashboard.getRange("B9").formulas = [["=B8"]];
dashboard.getRange("A3:A9").format.font = { bold: true };
inputStyle(dashboard.getRange("B3:B4"));
formulaStyle(dashboard.getRange("B5:B9"));
dashboard.getRange("B3").setNumberFormat("yyyy-mm-dd");
dashboard.getRange("B4:B5").setNumberFormat("$#,##0;[Red]($#,##0);-");
dashboard.getRange("B6").setNumberFormat("0.0%");
section(dashboard, "A11:H11", "Current Allocation And Contribution Targets");
dashboard.getRange("A12:H12").values = [["Asset Class", "Market Value", "Target %", "Current %", "Drift pp", "Band pp", "Contribution To Buy", "Rebalance Trade"]];
header(dashboard.getRange("A12:H12"));
dashboard.getRange("A13:A37").formulasR1C1 = repeatFormula(25, "=IF('Holdings'!R[-9]C=\"\",\"\",'Holdings'!R[-9]C)");
dashboard.getRange("B13:B37").formulasR1C1 = repeatFormula(25, "=IF('Holdings'!R[-9]C[4]=\"\",\"\",'Holdings'!R[-9]C[4])");
dashboard.getRange("C13:C37").formulasR1C1 = repeatFormula(25, "=IF('Holdings'!R[-9]C[4]=\"\",\"\",'Holdings'!R[-9]C[4])");
dashboard.getRange("D13:D37").formulasR1C1 = repeatFormula(25, "=IF('Holdings'!R[-9]C[4]=\"\",\"\",'Holdings'!R[-9]C[4])");
dashboard.getRange("E13:E37").formulasR1C1 = repeatFormula(25, "=IF('Holdings'!R[-9]C[4]=\"\",\"\",'Holdings'!R[-9]C[4])");
dashboard.getRange("F13:F37").formulasR1C1 = repeatFormula(25, "=IF(RC[-5]=\"\",\"\",'Holdings'!R[-9]C[4])");
dashboard.getRange("G13:G37").formulasR1C1 = repeatFormula(25, "=IF(RC[-6]=\"\",\"\",IF(MAX(0,(RC[-4]*(R5C2+R4C2))-RC[-5])<1,0,MAX(0,(RC[-4]*(R5C2+R4C2))-RC[-5])))");
dashboard.getRange("H13:H37").formulasR1C1 = repeatFormula(25, "=IF(RC[-7]=\"\",\"\",IF(ABS((RC[-6]+R4C2)-(RC[-5]*(R5C2+R4C2)))<1,0,(RC[-6]+R4C2)-(RC[-5]*(R5C2+R4C2))))");
dashboard.getRange("B13:B37").setNumberFormat("$#,##0;[Red]($#,##0);-");
dashboard.getRange("C13:F37").setNumberFormat("0.0%");
dashboard.getRange("G13:H37").setNumberFormat("$#,##0;[Red]($#,##0);-");
formulaStyle(dashboard.getRange("A13:H37"));
dashboard.getRange("A12:H37").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
dashboard.freezePanes.freezeRows(12);
dashboard.getRange("A:H").format.autofitColumns();

// Visual Dashboard
title(visual, "A1:L1", "Portfolio Visual Dashboard");
visual.getRange("A3:C8").values = [
  ["Next thing to buy", null, null],
  ["Asset class", null, null],
  ["Amount to reach target", null, null],
  ["Current weight", null, null],
  ["Target weight", null, null],
  ["Drift", null, null],
];
visual.getRange("B3:C3").merge();
visual.getRange("B4:C4").merge();
visual.getRange("B5:C5").merge();
visual.getRange("B6:C6").merge();
visual.getRange("B7:C7").merge();
visual.getRange("B8:C8").merge();
visual.getRange("B3").formulas = [["='Dashboard'!B9"]];
visual.getRange("B4").formulas = [["='Dashboard'!B9"]];
visual.getRange("B5").formulas = [["=IFERROR(INDEX('Dashboard'!G13:G37,MATCH(B3,'Dashboard'!A13:A37,0)),0)"]];
visual.getRange("B6").formulas = [["=IFERROR(INDEX('Dashboard'!D13:D37,MATCH(B3,'Dashboard'!A13:A37,0)),0)"]];
visual.getRange("B7").formulas = [["=IFERROR(INDEX('Dashboard'!C13:C37,MATCH(B3,'Dashboard'!A13:A37,0)),0)"]];
visual.getRange("B8").formulas = [["=IFERROR(INDEX('Dashboard'!E13:E37,MATCH(B3,'Dashboard'!A13:A37,0)),0)"]];
visual.getRange("A3:C8").format.fill = { color: "#EAF2F8" };
visual.getRange("A3:C8").format.borders = { preset: "outside", style: "medium", color: "#243B53" };
visual.getRange("A3:A8").format.font = { bold: true, color: "#172033" };
visual.getRange("B3").format.font = { bold: true, size: 20, color: "#0B5CAD" };
visual.getRange("B5").setNumberFormat("$#,##0;[Red]($#,##0);-");
visual.getRange("B6:B8").setNumberFormat("0.0%");

section(visual, "A10:F10", "Allocation By Category");
visual.getRange("A11:D11").values = [["Asset Class", "Current %", "Target %", "Drift pp"]];
header(visual.getRange("A11:D11"));
const visualCategories = [
  "US Large Cap Equity",
  "Developed Europe Equity",
  "Cash / Money Market",
  "Israeli Shekel Bonds",
  "Emerging Markets Equity",
  "Bitcoin / Crypto",
  "Sector Equity - Semiconductors",
  "Individual Stock",
];
visual.getRange("A12:A19").values = visualCategories.map((category) => [category]);
visual.getRange("B12:B19").formulasR1C1 = repeatFormula(8, "=SUMIF('Holdings'!R4C1:R28C1,RC[-1],'Holdings'!R4C8:R28C8)");
visual.getRange("C12:C19").formulasR1C1 = repeatFormula(8, "=SUMIF('Holdings'!R4C1:R28C1,RC[-2],'Holdings'!R4C7:R28C7)");
visual.getRange("D12:D19").formulasR1C1 = repeatFormula(8, "=RC[-2]-RC[-1]");
visual.getRange("B12:D19").setNumberFormat("0.0%");
visual.getRange("A11:D19").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
formulaStyle(visual.getRange("B12:D19"));

visual.getRange("F11:G11").values = [["Asset Class", "Drift pp"]];
header(visual.getRange("F11:G11"));
visual.getRange("F12:F19").formulasR1C1 = repeatFormula(8, "=RC[-5]");
visual.getRange("G12:G19").formulasR1C1 = repeatFormula(8, "=RC[-3]");
visual.getRange("G12:G19").setNumberFormat("0.0%");
visual.getRange("F11:G19").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
formulaStyle(visual.getRange("F12:G19"));

const allocationChart = visual.charts.add("ColumnClustered", visual.getRange("A11:C19"), "Auto");
allocationChart.title.text = "Current vs Target Allocation";
allocationChart.setPosition(visual.getRange("E3:L20"));
allocationChart.width = 760;
allocationChart.height = 360;
allocationChart.hasLegend = true;
allocationChart.yAxis = { numberFormatCode: "0%" };

const driftChart = visual.charts.add("ColumnClustered", visual.getRange("F11:G19"), "Auto");
driftChart.title.text = "Drift From Target";
driftChart.setPosition(visual.getRange("A22:F38"));
driftChart.width = 640;
driftChart.height = 300;
driftChart.hasLegend = false;
driftChart.yAxis = { numberFormatCode: "0%" };
visual.getRange("A:L").format.autofitColumns();

// Bank Snapshot Import
title(bankImport, "A1:P1", "Bank Snapshot Import Staging");
bankImport.getRange("A3:P3").values = [[
  "שם נייר", "מספר נייר/סימבול", "שווי בש\"ח", "אחוז נייר מהתיק", "כמות",
  "שינוי יומי בשוק %", "שער אחרון", "שינוי משער קניה משוקלל %", "סוג נייר",
  "התראה", "שער קניה משוקלל", "שווי במטבע הנסחר", "שער שערוך לשקלים",
  "בורסה", "רווח יומי בש\"ח", "רווח יומי באחוז"
]];
header(bankImport.getRange("A3:P3"));
bankImport.getRange("A5:F10").values = [
  ["How to update", "Paste the securities rows from a new bank export here, starting at row 4.", null, null, null, null],
  ["Current automation", "Excel .xlsx cannot contain a safe file-upload macro without a VBA .xlsm or external add-in.", null, null, null, null],
  ["Repeatable path", "Use the workspace script to rebuild this workbook from a new exported bank file.", null, null, null, null],
  ["Next step", "If you want a true button workflow, use an .xlsm VBA workbook or an Office Script in OneDrive/Excel web.", null, null, null, null],
  ["Source format", "Matches /Users/yair/Downloads/התיק שלי_1424_23062026.xlsx rows A6:P15.", null, null, null, null],
  ["Safety", "The original bank export is never modified.", null, null, null, null],
];
bankImport.getRange("A5:F10").format.wrapText = true;
bankImport.getRange("A5:A10").format.font = { bold: true };
bankImport.getRange("A:P").format.autofitColumns();
bankImport.getRange("B:F").format.columnWidth = 28;

// Monthly Snapshots
title(snapshots, "A1:H1", "Monthly Monitoring Log");
snapshots.getRange("A3:H3").values = [[
  "Date", "Total Value", "Largest Overweight", "Largest Underweight", "Buy First", "Manual Notes", "Panic Trigger?", "Action Taken"
]];
header(snapshots.getRange("A3:H3"));
snapshots.getRange("A4:H63").values = Array.from({ length: 60 }, () => ["", null, "", "", "", "", "", ""]);
snapshots.getRange("A4").values = [[new Date("2026-06-23")]];
snapshots.getRange("B4:E4").formulas = [["='Dashboard'!B5", "='Dashboard'!B7", "='Dashboard'!B8", "='Dashboard'!B9"]];
snapshots.getRange("A4:A63").setNumberFormat("yyyy-mm-dd");
snapshots.getRange("B4:B63").setNumberFormat("$#,##0;[Red]($#,##0);-");
inputStyle(snapshots.getRange("A4:A63"));
inputStyle(snapshots.getRange("F4:H63"));
snapshots.getRange("A3:H63").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
snapshots.freezePanes.freezeRows(3);
snapshots.getRange("A:H").format.autofitColumns();

// Policy
title(policy, "A1:F1", "Rebalancing Policy Draft");
policy.getRange("A3:F3").values = [["Policy Area", "Baseline Rule", "Why Conservative", "What To Test", "Owner Decision", "Status"]];
header(policy.getRange("A3:F3"));
policy.getRange("A4:F10").values = [
  ["Scheduled review", "Review monthly; full scheduled rebalance every 12-24 months.", "Limits unnecessary trading while still catching slow drift.", "Compare annual vs biennial drift and drawdown in backtest.", "", "Draft"],
  ["New money", "When adding money, buy the most underweight asset class first.", "Moves toward target without selling and may reduce taxes/costs.", "Check whether cash flows are large enough to restore bands.", "", "Draft"],
  ["Tolerance bands", "Default absolute band: 5 percentage points per asset class.", "Avoids reacting to normal noise.", "Test 3 pp, 5 pp, and 20% relative bands.", "", "Draft"],
  ["Panic trigger", "Do not sell immediately on a 1-day move. Flag only if 5-trading-day or 20-trading-day drawdown breaches threshold and allocation drift is outside band.", "Reduces whipsaw risk and avoids using price moves without allocation context.", "Backtest 1-day, 5-day, 20-day, and volatility-adjusted triggers.", "", "Draft"],
  ["Panic action", "If trigger fires, rebalance only back to target bands, not necessarily exact target.", "Conserves risk control while limiting large trades during stressed markets.", "Measure max drawdown, recovery time, turnover, and missed rebound.", "", "Draft"],
  ["Risk priority", "Primary metric: drawdown and time underwater. Secondary: return and turnover.", "Matches stated preference to avoid losses over chasing upside.", "Use historical crises: 2008, 2020, 2022, and local-currency stress if relevant.", "", "Draft"],
  ["Data source", "Current holdings imported from /Users/yair/Downloads/התיק שלי_1424_23062026.xlsx. Individual Stock is capped at a 5% target and other placeholder targets are scaled to keep total target allocation at 100%.", "Keeps process transparent before automation.", "Replace placeholder target percentages with your actual investment policy before using trade recommendations.", "", "Draft"],
];
policy.getRange("A4:F10").format.wrapText = true;
inputStyle(policy.getRange("E4:F10"));
policy.getRange("A3:F10").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
policy.getRange("A:F").format.autofitColumns();
policy.getRange("B:D").format.columnWidth = 36;

// Checks
title(checks, "A1:F1", "Workbook Checks");
checks.getRange("A3:F3").values = [["Check", "Actual", "Expected", "Difference", "Tolerance", "Status"]];
header(checks.getRange("A3:F3"));
checks.getRange("A4:F7").values = [
  ["Target allocation sums to 100%", null, 1, null, 0.0001, null],
  ["No negative market values", null, 0, null, 0, null],
  ["Portfolio value is positive", null, 1, null, 0, null],
  ["No formulas errors visible", "Manual Excel scan after edits", "No errors", "", "", "Review"],
];
checks.getRange("B4").formulas = [["=SUM('Holdings'!G4:G28)"]];
checks.getRange("D4").formulas = [["=B4-C4"]];
checks.getRange("F4").formulas = [["=IF(ABS(D4)<=E4,\"OK\",\"Review\")"]];
checks.getRange("B5").formulas = [["=MIN('Holdings'!F4:F28)"]];
checks.getRange("D5").formulas = [["=B5-C5"]];
checks.getRange("F5").formulas = [["=IF(B5>=C5,\"OK\",\"Review\")"]];
checks.getRange("B6").formulas = [["=IF('Dashboard'!B5>0,1,0)"]];
checks.getRange("D6").formulas = [["=B6-C6"]];
checks.getRange("F6").formulas = [["=IF(B6=C6,\"OK\",\"Review\")"]];
checks.getRange("B4:E4").setNumberFormat("0.0%");
checks.getRange("B5:E5").setNumberFormat("$#,##0;[Red]($#,##0);-");
checks.getRange("B6:E6").setNumberFormat("0");
checks.getRange("A3:F7").format.borders = { preset: "inside", style: "thin", color: "#D7DEE7" };
formulaStyle(checks.getRange("B4:F7"));
checks.getRange("A:F").format.autofitColumns();

const inspect = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(inspect.ndjson);

for (const sheetName of ["Dashboard", "Visual Dashboard", "Holdings", "Bank Snapshot Import", "Monthly Snapshots", "Policy", "Checks"]) {
  const blob = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(new URL(`${sheetName.replaceAll(" ", "_")}.png`, outDir), new Uint8Array(await blob.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = `${outDirPath}portfolio_rebalancing_monitor_visual.xlsx`;
await output.save(outputPath);
console.log(outputPath);
