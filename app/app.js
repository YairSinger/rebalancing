import { profitColumns, holdingProfit, profitSummary } from "./profit.mjs";
const ILS = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const STORAGE_KEY = "portfolio-rebalancing-settings-v2";
const DB_NAME = "portfolio-rebalancing-monitor";
const DB_VERSION = 1;
const CASH_ASSET_CLASS = "Cash / Money Market";

const DEFAULT_ASSET_CLASSES = [
  "US Large Cap Equity",
  "Developed Europe Equity",
  "Cash / Money Market",
  "Israeli Shekel Bonds",
  "Emerging Markets Equity",
  "Bitcoin / Crypto",
  "Sector Equity - Semiconductors",
  "Individual Stock",
];

const DEFAULT_HOLDINGS = [
  { assetClass: "US Large Cap Equity", name: "iShares $ CORE S&P 500 UCITS ETF-TA", symbol: "1159250", account: "Bank 1424", units: 97, price: 237840, marketValueIls: 230704.8, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Developed Europe Equity", name: "iShares CORE MSCI EUROPE UCITS ETF EUR-TA", symbol: "1159094", account: "Bank 1424", units: 425, price: 35080, marketValueIls: 149090, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Cash / Money Market", name: "מיטב כספית שקלית כשרה", symbol: "5136544", account: "Bank 1424", units: 12078, price: 1160.58, marketValueIls: 140174.85, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Israeli Shekel Bonds", name: "תכלית TTF י תל בונד שקלי 5-15", symbol: "5130174", account: "Bank 1424", units: 1320, price: 4498.2, marketValueIls: 59376.24, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Emerging Markets Equity", name: "iShares CORE MSCI EM IMI UCITS ETF-TA", symbol: "1159169", account: "Bank 1424", units: 212, price: 16490, marketValueIls: 34958.8, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Bitcoin / Crypto", name: "ISHARES BITCOIN TRUST ETF", symbol: "IBIT", account: "Bank 1424", units: 135, price: 36.5, marketValueIls: 14472.25, currency: "USD", currencyGroup: "Foreign", fxToIls: 2.9370374 },
  { assetClass: "Sector Equity - Semiconductors", name: "VANECK VECTORS SEMICONDUCTOR ETF", symbol: "SMH", account: "Bank 1424", units: 4, price: 668.91, marketValueIls: 7858.45, currency: "USD", currencyGroup: "Foreign", fxToIls: 2.9370374 },
  { assetClass: "Individual Stock", name: "אלביט מערכות", symbol: "1081124", account: "Bank 1424", units: 1, price: 229800, marketValueIls: 2298, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
  { assetClass: "Cash / Money Market", name: "Free cash available for trading", symbol: "CASH", account: "Bank 1424", units: 1, price: 1663.41, marketValueIls: 1663.41, currency: "ILS", currencyGroup: "ILS", fxToIls: 1 },
];

const defaultTargets = {
  "US Large Cap Equity": 0.343,
  "Developed Europe Equity": 0.222,
  "Cash / Money Market": 0.211,
  "Israeli Shekel Bonds": 0.088,
  "Emerging Markets Equity": 0.052,
  "Bitcoin / Crypto": 0.022,
  "Sector Equity - Semiconductors": 0.012,
  "Individual Stock": 0.05,
};

let holdings = structuredClone(DEFAULT_HOLDINGS);
let definitions = DEFAULT_ASSET_CLASSES.map((assetClass) => ({
  assetClass,
  target: defaultTargets[assetClass] ?? 0,
  threshold: 0.05,
  currencyPolicy: "Mixed",
}));
let currencyTargets = { ILS: 0.7, Foreign: 0.3 };
let targetsEditable = false;
let db = null;
let snapshots = [];
let activePage = "current";
let serverStateAvailable = false;
let lastUploaded = null;

const els = {
  snapshotFile: document.getElementById("snapshotFile"),
  asOfLabel: document.getElementById("asOfLabel"),
  importStatus: document.getElementById("importStatus"),
  storeState: document.getElementById("storeState"),
  storeStateStatus: document.getElementById("storeStateStatus"),
  currentTab: document.getElementById("currentTab"),
  historyTab: document.getElementById("historyTab"),
  currentPage: document.getElementById("currentPage"),
  historyPage: document.getElementById("historyPage"),
  contributionInput: document.getElementById("contributionInput"),
  defaultThresholdInput: document.getElementById("defaultThresholdInput"),
  ilsTargetInput: document.getElementById("ilsTargetInput"),
  foreignTargetInput: document.getElementById("foreignTargetInput"),
  editTargets: document.getElementById("editTargets"),
  resetTargets: document.getElementById("resetTargets"),
  newAssetClassInput: document.getElementById("newAssetClassInput"),
  addAssetClass: document.getElementById("addAssetClass"),
  addAssetClassPanel: document.getElementById("addAssetClassPanel"),
  definitionsBody: document.querySelector("#definitionsTable tbody"),
  holdingsBody: document.querySelector("#holdingsTable tbody"),
  allocationChart: document.getElementById("allocationChart"),
  driftChart: document.getElementById("driftChart"),
  currencyChart: document.getElementById("currencyChart"),
  sellList: document.getElementById("sellList"),
  buyList: document.getElementById("buyList"),
  totalValue: document.getElementById("totalValue"),
  totalProfit: document.getElementById("totalProfit"),
  profitCoverage: document.getElementById("profitCoverage"),
  profitHistoryChart: document.getElementById("profitHistoryChart"),
  targetCheck: document.getElementById("targetCheck"),
  largestOver: document.getElementById("largestOver"),
  foreignCurrencyMetric: document.getElementById("foreignCurrencyMetric"),
  snapshotCount: document.getElementById("snapshotCount"),
  historyChart: document.getElementById("historyChart"),
  historyHead: document.querySelector("#historyTable thead"),
  historyBody: document.querySelector("#historyTable tbody"),
};

function assetClasses() {
  return definitions.map((definition) => definition.assetClass);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings");
      }
      if (!database.objectStoreNames.contains("snapshots")) {
        const store = database.createObjectStore("snapshots", { keyPath: "id" });
        store.createIndex("uploadedAt", "uploadedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadDbSettings() {
  if (!db) return false;
  const saved = await requestResult(txStore("settings").get("settings"));
  if (!saved) return false;
  applySettings(saved);
  return true;
}

async function loadServerState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return false;
    const state = await response.json();
    serverStateAvailable = true;
    if (Array.isArray(state.holdings) && state.holdings.length > 0) {
      holdings = state.holdings;
    } else if (Array.isArray(state.snapshots) && state.snapshots.length > 0) {
      const latestSnapshot = state.snapshots
        .slice()
        .sort((a, b) => new Date(a.snapshotDate) - new Date(b.snapshotDate) || new Date(a.uploadedAt) - new Date(b.uploadedAt))
        .at(-1);
      if (Array.isArray(latestSnapshot?.holdings)) holdings = latestSnapshot.holdings;
    }
    if (state.settings) applySettings(state.settings);
    snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
    lastUploaded = state.lastUploaded || snapshots.at(-1) || null;
    updateLastUploadedLabel();
    return true;
  } catch {
    serverStateAvailable = false;
    return false;
  }
}

async function saveServerState() {
  if (!serverStateAvailable) return;
  const state = {
    settings: { definitions, currencyTargets },
    holdings,
    lastUploaded,
    snapshots,
  };
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`State save failed: ${response.status}`);
}

async function saveDbSettings() {
  if (!db) return;
  await requestResult(txStore("settings", "readwrite").put({ definitions, currencyTargets, holdings, lastUploaded }, "settings"));
}

async function addSnapshot(snapshot) {
  if (serverStateAvailable) {
    snapshots = [...snapshots.filter((item) => item.id !== snapshot.id), snapshot]
      .sort((a, b) => new Date(a.snapshotDate) - new Date(b.snapshotDate) || new Date(a.uploadedAt) - new Date(b.uploadedAt));
    await saveServerState();
    renderHistory();
    return;
  }
  if (!db) return;
  await requestResult(txStore("snapshots", "readwrite").put(snapshot));
  snapshots = await loadSnapshots();
  renderHistory();
}

async function loadSnapshots() {
  if (!db) return [];
  const all = await requestResult(txStore("snapshots").getAll());
  return all.sort((a, b) => new Date(a.snapshotDate) - new Date(b.snapshotDate) || new Date(a.uploadedAt) - new Date(b.uploadedAt));
}

function totalValue() {
  return holdings.reduce((sum, item) => sum + (Number(item.marketValueIls) || 0), 0);
}

function byClass() {
  const total = totalValue();
  return definitions.map((definition) => {
    const marketValue = holdings
      .filter((item) => item.assetClass === definition.assetClass)
      .reduce((sum, item) => sum + (Number(item.marketValueIls) || 0), 0);
    const current = total > 0 ? marketValue / total : 0;
    return {
      ...definition,
      marketValue,
      current,
      drift: current - definition.target,
      amountToTarget: Math.max(0, definition.target * (total + contribution()) - marketValue),
    };
  });
}

function isCashClass(row) {
  return row.assetClass === CASH_ASSET_CLASS;
}

function upperBandValue(row, planningTotal) {
  return Math.max(0, (row.target + row.threshold) * planningTotal);
}

function lowerBandValue(row, planningTotal) {
  return Math.max(0, (row.target - row.threshold) * planningTotal);
}

function createTradePlan(rows, total, addedCash) {
  const planningTotal = total + addedCash;
  if (planningTotal <= 0) return { sells: [], buys: [] };

  const workingRows = rows.map((row) => ({
    ...row,
    planningValue: row.marketValue + (isCashClass(row) ? addedCash : 0),
  }));
  const cashRow = workingRows.find(isCashClass);
  const sells = workingRows
    .filter((row) => !isCashClass(row))
    .map((row) => {
      const amount = Math.max(0, row.planningValue - upperBandValue(row, planningTotal));
      return { ...row, amount, driftBeyondBand: row.planningValue / planningTotal - row.target - row.threshold };
    })
    .filter((row) => row.amount >= 1)
    .sort((a, b) => b.driftBeyondBand - a.driftBeyondBand);

  const sellTotal = sells.reduce((sum, row) => sum + row.amount, 0);
  const values = new Map(workingRows.map((row) => [row.assetClass, row.planningValue]));
  for (const sell of sells) values.set(sell.assetClass, values.get(sell.assetClass) - sell.amount);

  if (!cashRow) return { sells, buys: [] };
  const cashOriginal = cashRow.marketValue;
  const cashBeforeSells = values.get(cashRow.assetClass);
  values.set(cashRow.assetClass, cashBeforeSells + sellTotal);

  const buysByClass = new Map();
  const addInstruction = (row, amount, actionLabel) => {
    if (amount < 1) return;
    buysByClass.set(row.assetClass, {
      ...row,
      amount: (buysByClass.get(row.assetClass)?.amount || 0) + amount,
      actionLabel,
    });
  };
  const reserveCash = Math.max(0, Math.min(
    values.get(cashRow.assetClass) - cashOriginal,
    lowerBandValue(cashRow, planningTotal) - cashOriginal,
  ));
  addInstruction({
    ...cashRow,
    drift: cashOriginal / planningTotal - cashRow.target,
  }, reserveCash, "Keep as cash");

  let purchaseBudget = Math.max(0, values.get(cashRow.assetClass) - Math.max(
    upperBandValue(cashRow, planningTotal),
    lowerBandValue(cashRow, planningTotal),
  ));

  const addBuy = (row, amount) => {
    if (amount < 1) return;
    addInstruction(row, amount, "Buy");
    values.set(row.assetClass, values.get(row.assetClass) + amount);
    values.set(cashRow.assetClass, values.get(cashRow.assetClass) - amount);
    purchaseBudget -= amount;
  };

  const underLowerBand = () => workingRows
    .filter((row) => !isCashClass(row))
    .map((row) => ({
      ...row,
      needed: Math.max(0, lowerBandValue(row, planningTotal) - values.get(row.assetClass)),
      drift: values.get(row.assetClass) / planningTotal - row.target,
    }))
    .filter((row) => row.needed >= 1)
    .sort((a, b) => a.drift - b.drift);

  for (const row of underLowerBand()) {
    if (purchaseBudget < 1) break;
    addBuy(row, Math.min(row.needed, purchaseBudget));
  }

  const towardTarget = () => workingRows
    .filter((row) => !isCashClass(row))
    .map((row) => ({
      ...row,
      needed: Math.max(0, row.target * planningTotal - values.get(row.assetClass)),
      drift: values.get(row.assetClass) / planningTotal - row.target,
    }))
    .filter((row) => row.needed >= 1)
    .sort((a, b) => a.drift - b.drift);

  for (const row of towardTarget()) {
    if (purchaseBudget < 1) break;
    addBuy(row, Math.min(row.needed, purchaseBudget));
  }

  return {
    sells,
    buys: [...buysByClass.values()].sort((a, b) => b.amount - a.amount),
  };
}

function currencyGroup(item) {
  return item.currencyGroup || (item.currency === "ILS" ? "ILS" : "Foreign");
}

function holdingAssignmentKey(item) {
  const symbol = String(item.symbol || "").trim().toLowerCase();
  const name = String(item.name || "").trim().toLowerCase();
  return symbol || name ? `${symbol}|${name}` : "";
}

function preserveHoldingAssignments(rows, previousHoldings) {
  const assignments = new Map();
  for (const holding of previousHoldings) {
    const key = holdingAssignmentKey(holding);
    if (!key) continue;
    assignments.set(key, {
      assetClass: holding.assetClass,
      currencyGroup: holding.currencyGroup,
    });
  }
  return rows.map((row) => {
    const assignment = assignments.get(holdingAssignmentKey(row));
    if (!assignment) return row;
    return {
      ...row,
      assetClass: assignment.assetClass || row.assetClass,
      currencyGroup: assignment.currencyGroup || row.currencyGroup,
    };
  });
}

function byCurrency() {
  const total = totalValue();
  const groups = ["ILS", "Foreign"].map((group) => {
    const marketValue = holdings
      .filter((item) => currencyGroup(item) === group)
      .reduce((sum, item) => sum + (Number(item.marketValueIls) || 0), 0);
    const target = currencyTargets[group] ?? 0;
    const current = total > 0 ? marketValue / total : 0;
    return {
      group,
      marketValue,
      target,
      current,
      drift: current - target,
      amountToTarget: Math.max(0, target * (total + contribution()) - marketValue),
    };
  });
  return groups;
}

function contribution() {
  return Number(els.contributionInput.value) || 0;
}

function classifyHolding(name, symbol, type, exchange) {
  const text = `${name} ${symbol} ${type} ${exchange}`.toLowerCase();
  if (text.includes("cash") || text.includes("כספית")) return "Cash / Money Market";
  if (text.includes("s&p 500")) return "US Large Cap Equity";
  if (text.includes("europe")) return "Developed Europe Equity";
  if (text.includes("em imi")) return "Emerging Markets Equity";
  if (text.includes("תל בונד") || text.includes("bond")) return "Israeli Shekel Bonds";
  if (text.includes("bitcoin") || text.includes("ibit")) return "Bitcoin / Crypto";
  if (text.includes("semiconductor") || text.includes("smh")) return "Sector Equity - Semiconductors";
  if (type && type.includes("מניה")) return "Individual Stock";
  return "Individual Stock";
}

function inferCurrency(symbol, exchange, fxToIls) {
  if (fxToIls && Number(fxToIls) !== 1) return "USD";
  const text = `${symbol} ${exchange}`.toLowerCase();
  if (text.includes("nasdaq") || /^[A-Z]{2,5}$/.test(String(symbol || ""))) return "USD";
  return "ILS";
}

function renderDefinitions() {
  els.definitionsBody.innerHTML = "";
  for (const definition of definitions) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(definition.assetClass)}</td>
      <td><input type="number" min="0" max="100" step="0.1" value="${(definition.target * 100).toFixed(1)}" data-kind="target" data-class="${escapeHtml(definition.assetClass)}" ${targetsEditable ? "" : "disabled"}></td>
      <td><input type="number" min="0" max="100" step="0.1" value="${(definition.threshold * 100).toFixed(1)}" data-kind="threshold" data-class="${escapeHtml(definition.assetClass)}" ${targetsEditable ? "" : "disabled"}></td>
      <td>
        <select data-kind="currencyPolicy" data-class="${escapeHtml(definition.assetClass)}" ${targetsEditable ? "" : "disabled"}>
          ${["Mixed", "ILS", "Foreign"].map((option) => `<option value="${option}" ${option === definition.currencyPolicy ? "selected" : ""}>${option}</option>`).join("")}
        </select>
      </td>
      <td>
        <button class="removeAssetClass" type="button" data-remove-class="${escapeHtml(definition.assetClass)}" ${targetsEditable ? "" : "disabled"} title="Remove asset class">Remove</button>
      </td>
    `;
    els.definitionsBody.append(row);
  }
  els.ilsTargetInput.value = ((currencyTargets.ILS ?? 0) * 100).toFixed(1);
  els.foreignTargetInput.value = ((currencyTargets.Foreign ?? 0) * 100).toFixed(1);
  els.ilsTargetInput.disabled = !targetsEditable;
  els.foreignTargetInput.disabled = !targetsEditable;
  els.defaultThresholdInput.disabled = !targetsEditable;
  els.resetTargets.disabled = !targetsEditable;
  els.addAssetClass.disabled = !targetsEditable;
  els.newAssetClassInput.disabled = !targetsEditable;
  els.addAssetClassPanel.hidden = !targetsEditable;
  els.editTargets.textContent = targetsEditable ? "Done editing" : "Edit targets";
}

function render() {
  renderDefinitions();
  const rows = byClass();
  const currencyRows = byCurrency();
  const total = totalValue();
  const plan = createTradePlan(rows, total, contribution());
  const over = rows.slice().sort((a, b) => b.drift - a.drift)[0];
  const targetSum = definitions.reduce((sum, item) => sum + item.target, 0);
  const currencyTargetSum = currencyRows.reduce((sum, item) => sum + item.target, 0);
  const foreign = currencyRows.find((item) => item.group === "Foreign");

  els.totalValue.textContent = ILS.format(total);
  const profit = profitSummary(holdings.filter((item) => item.symbol !== "CASH"));
  els.totalProfit.textContent = profit.known ? `${ILS.format(profit.profitIls)}${profit.unknown ? " (partial)" : ""}` : "Unknown";
  els.profitCoverage.textContent = `${profit.known} priced / ${profit.unknown} without cost basis`;
  els.targetCheck.textContent = `${PCT.format(targetSum)} assets / ${PCT.format(currencyTargetSum)} FX`;
  els.targetCheck.style.color = Math.abs(targetSum - 1) <= 0.0005 && Math.abs(currencyTargetSum - 1) <= 0.0005 ? "var(--green)" : "var(--red)";
  els.largestOver.textContent = over ? `${over.assetClass} (${formatSignedPct(over.drift)})` : "-";
  els.foreignCurrencyMetric.textContent = foreign ? `${PCT.format(foreign.current)} / ${PCT.format(foreign.target)}` : "-";
  renderTradeList(els.sellList, plan.sells, "No sales required outside current bands.");
  renderTradeList(els.buyList, plan.buys, "No purchases required outside current bands.");

  renderCharts(rows, currencyRows);
  renderHoldings(rows, total);
  updateLastUploadedLabel();
  saveSettings();
}

function renderTradeList(element, trades, emptyMessage) {
  if (trades.length === 0) {
    element.innerHTML = `<div class="tradeEmpty">${emptyMessage}</div>`;
    return;
  }
  element.innerHTML = trades.map((row, index) => `
    <div class="tradeRow">
      <div class="tradeRank">${index + 1}</div>
      <div class="tradeAsset" title="${escapeHtml(row.assetClass)}">${row.actionLabel ? `${escapeHtml(row.actionLabel)} ` : ""}${escapeHtml(row.assetClass)}</div>
      <div class="tradeAmount">${ILS.format(row.amount)}</div>
      <div class="tradeDrift">${formatSignedPct(row.drift)}</div>
    </div>
  `).join("");
}

function renderCharts(rows, currencyRows) {
  const maxWeight = Math.max(0.01, ...rows.flatMap((row) => [row.current, row.target]));
  els.allocationChart.innerHTML = rows.map((row) => `
    <div class="barRow">
      <div class="label" title="${escapeHtml(row.assetClass)}">${escapeHtml(row.assetClass)}</div>
      <div class="track">
        <div class="bar" style="width:${(row.current / maxWeight) * 100}%"></div>
        <div class="targetBar" style="width:${(row.target / maxWeight) * 100}%"></div>
      </div>
      <div class="num">${PCT.format(row.current)}</div>
    </div>
  `).join("");

  const maxDrift = Math.max(0.01, ...rows.flatMap((row) => [Math.abs(row.drift), row.threshold]));
  els.driftChart.innerHTML = rows.map((row) => {
    const width = Math.abs(row.drift) / maxDrift * 50;
    const left = row.drift >= 0 ? 50 : 50 - width;
    const bandWidth = Math.min(100, row.threshold / maxDrift * 100);
    const bandLeft = 50 - bandWidth / 2;
    const driftClass = Math.abs(row.drift) <= row.threshold ? "insideBand" : row.drift >= 0 ? "positive" : "negative";
    return `
      <div class="driftRow">
        <div class="label" title="${escapeHtml(row.assetClass)}">${escapeHtml(row.assetClass)}</div>
        <div class="driftTrack" title="Band ${PCT.format(row.threshold)}">
          <div class="driftBand" style="left:${bandLeft}%; width:${bandWidth}%"></div>
          <div class="driftBar ${driftClass}" style="left:${left}%; width:${width}%"></div>
        </div>
        <div class="num">${formatSignedPct(row.drift)}</div>
      </div>
    `;
  }).join("");

  const maxCurrency = Math.max(0.01, ...currencyRows.flatMap((row) => [row.current, row.target]));
  els.currencyChart.innerHTML = currencyRows.map((row) => `
    <div class="barRow">
      <div class="label" title="${escapeHtml(row.group)}">${escapeHtml(row.group)}</div>
      <div class="track">
        <div class="bar" style="width:${(row.current / maxCurrency) * 100}%"></div>
        <div class="targetBar" style="width:${(row.target / maxCurrency) * 100}%"></div>
      </div>
      <div class="num">${PCT.format(row.current)}</div>
    </div>
  `).join("");
}

function renderHoldings(classRows, total) {
  const classes = new Map(classRows.map((row) => [row.assetClass, row]));
  const options = assetClasses();
  els.holdingsBody.innerHTML = "";
  holdings.forEach((item, index) => {
    const definition = classes.get(item.assetClass);
    const current = total > 0 ? item.marketValueIls / total : 0;
    const drift = definition ? definition.drift : 0;
    const threshold = definition ? definition.threshold : 0;
    const action = Math.abs(drift) <= threshold ? "Inside band" : drift > 0 ? "Above band" : "Below band";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <select data-holding-index="${index}" data-kind="assetClass">
          ${options.map((assetClass) => `<option value="${escapeHtml(assetClass)}" ${assetClass === item.assetClass ? "selected" : ""}>${escapeHtml(assetClass)}</option>`).join("")}
        </select>
      </td>
      <td>${escapeHtml(item.name)}<br><small>${escapeHtml(item.symbol || "")}</small></td>
      <td>${escapeHtml(item.currency)}${item.fxToIls && item.fxToIls !== 1 ? `<br><small>FX ${item.fxToIls.toFixed(4)}</small>` : ""}</td>
      <td>
        <select data-holding-index="${index}" data-kind="currencyGroup">
          ${["ILS", "Foreign"].map((group) => `<option value="${group}" ${group === currencyGroup(item) ? "selected" : ""}>${group}</option>`).join("")}
        </select>
      </td>
      <td class="num">${formatNumber(item.units)}</td>
      <td class="num">${ILS.format(item.marketValueIls)}</td>
      <td class="num">${typeof item.profitIls === "number" ? ILS.format(item.profitIls) : "-"}</td>
      <td class="num">${PCT.format(current)}</td>
      <td class="num">${definition ? PCT.format(definition.target) : "-"}</td>
      <td class="num">${formatSignedPct(drift)}</td>
      <td class="num">${definition ? PCT.format(definition.threshold) : "-"}</td>
      <td><span class="status ${action === "Inside band" ? "inside" : action === "Above band" ? "above" : "below"}">${action}</span></td>
    `;
    els.holdingsBody.append(row);
  });
}

function renderHistory() {
  els.snapshotCount.textContent = snapshots.length === 1 ? "1 saved snapshot" : `${snapshots.length} saved snapshots`;
  if (snapshots.length === 0) {
    els.historyChart.innerHTML = `<div class="emptyState">Upload a bank Excel snapshot to start the history.</div>`;
    els.profitHistoryChart.innerHTML = `<div class="emptyState">Profit history needs bank snapshots with a reported ILS profit or total cost basis.</div>`;
    els.historyHead.innerHTML = "";
    els.historyBody.innerHTML = "";
    return;
  }

  const classNames = [...new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot.byClass)))];
  const maxValue = Math.max(1, ...snapshots.flatMap((snapshot) => classNames.map((name) => snapshot.byClass[name] || 0)));
  els.historyChart.innerHTML = classNames.map((assetClass) => {
    const points = snapshots.map((snapshot) => {
      const value = snapshot.byClass[assetClass] || 0;
      return `
        <div class="historyPoint">
          <div class="historyBar" style="height:${Math.max(2, (value / maxValue) * 90)}px"></div>
          <small>${escapeHtml(shortDate(snapshot.snapshotDate))}</small>
        </div>
      `;
    }).join("");
    const latest = snapshots[snapshots.length - 1].byClass[assetClass] || 0;
    return `
      <div class="historySeries">
        <div class="historySeriesHead">
          <strong>${escapeHtml(assetClass)}</strong>
          <span>${ILS.format(latest)}</span>
        </div>
        <div class="historyBars">${points}</div>
      </div>
    `;
  }).join("");

  const knownProfits = snapshots.map((snapshot) => {
    const summary = snapshot.profitSummary || profitSummary((snapshot.holdings || []).filter((item) => item.symbol !== "CASH"));
    return summary.known && !summary.unknown ? summary.profitIls : null;
  });
  const limit = Math.max(1, ...knownProfits.filter((value) => value !== null).map(Math.abs));
  els.profitHistoryChart.innerHTML = knownProfits.some((value) => value !== null)
    ? `<div class="profitBars" role="img" aria-label="Unrealized profit by snapshot in ILS">${snapshots.map((snapshot, index) => {
      const value = knownProfits[index];
      const height = value === null ? 0 : Math.max(2, Math.abs(value) / limit * 68);
      return `<div class="profitPoint" title="${escapeHtml(snapshot.snapshotDate)}: ${value === null ? "unknown" : escapeHtml(ILS.format(value))}">
        <span>${value === null ? "-" : ILS.format(value)}</span>
        <div class="profitBarArea"><div class="profitBar ${value < 0 ? "negative" : ""}" style="height:${height}px"></div></div>
        <small>${escapeHtml(shortDate(snapshot.snapshotDate))}</small>
      </div>`;
    }).join("")}</div>`
    : `<div class="emptyState">No complete profit snapshots yet. Re-import a report with ILS profit or total cost basis.</div>`;

  els.historyHead.innerHTML = `
    <tr>
      <th>Date</th>
      <th>File</th>
      <th class="num">Total</th>
      <th class="num">Unrealized profit</th>
      ${classNames.map((name) => `<th class="num">${escapeHtml(name)}</th>`).join("")}
      <th class="num">Foreign</th>
    </tr>
  `;
  els.historyBody.innerHTML = snapshots.map((snapshot) => `
    <tr>
      <td>${escapeHtml(snapshot.snapshotDate)}</td>
      <td>${escapeHtml(snapshot.fileName)}</td>
      <td class="num">${ILS.format(snapshot.totalValue)}</td>
      <td class="num">${(() => { const p = snapshot.profitSummary || profitSummary((snapshot.holdings || []).filter((item) => item.symbol !== "CASH")); return p.known && !p.unknown ? ILS.format(p.profitIls) : "-"; })()}</td>
      ${classNames.map((name) => `<td class="num">${ILS.format(snapshot.byClass[name] || 0)}</td>`).join("")}
      <td class="num">${PCT.format((snapshot.byCurrency.Foreign || 0) / snapshot.totalValue)}</td>
    </tr>
  `).join("");
}

function shortDate(value) {
  const parts = String(value).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
}

function showPage(page) {
  activePage = page;
  els.currentPage.hidden = page !== "current";
  els.historyPage.hidden = page !== "history";
  els.currentTab.classList.toggle("active", page === "current");
  els.historyTab.classList.toggle("active", page === "history");
  if (page === "history") renderHistory();
}

function saveSettings() {
  const payload = {
    definitions,
    currencyTargets,
    holdings,
    lastUploaded,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (serverStateAvailable) {
    saveServerState().catch((error) => console.warn("Could not save settings to JSON state", error));
  } else {
    saveDbSettings().catch((error) => console.warn("Could not save settings to IndexedDB", error));
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applySettings(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not load saved settings", error);
  }
}

function applySettings(saved) {
  if (Array.isArray(saved.holdings) && saved.holdings.length > 0) {
    holdings = saved.holdings;
  }
  if (saved.lastUploaded) {
    lastUploaded = saved.lastUploaded;
  }
  if (Array.isArray(saved.definitions)) {
    const names = [...new Set([
      ...saved.definitions.map((item) => item.assetClass).filter(Boolean),
      ...holdings.map((item) => item.assetClass).filter(Boolean),
    ])];
    definitions = names.map((assetClass) => {
      const fallback = definitions.find((item) => item.assetClass === assetClass);
      const stored = saved.definitions.find((item) => item.assetClass === assetClass);
      return {
        assetClass,
        target: Number(stored?.target ?? fallback?.target ?? 0),
        threshold: Number(stored?.threshold ?? fallback?.threshold ?? 0.05),
        currencyPolicy: stored?.currencyPolicy || fallback?.currencyPolicy || "Mixed",
      };
    });
  }
  if (saved.currencyTargets) {
    currencyTargets = {
      ILS: Number(saved.currencyTargets.ILS ?? currencyTargets.ILS),
      Foreign: Number(saved.currencyTargets.Foreign ?? currencyTargets.Foreign),
    };
  }
}

async function importSnapshot(file) {
  try {
    els.importStatus.textContent = "Reading snapshot...";
    const workbook = await readXlsx(file);
    const rows = preserveHoldingAssignments(extractRows(workbook), holdings);
    holdings = rows;
    const snapshot = createSnapshot(file.name, rows);
    lastUploaded = {
      fileName: snapshot.fileName,
      snapshotDate: snapshot.snapshotDate,
      uploadedAt: snapshot.uploadedAt,
      holdingsCount: snapshot.holdings.length,
      totalValue: snapshot.totalValue,
    };
    await addSnapshot(snapshot);
    els.asOfLabel.textContent = `Loaded ${file.name}`;
    els.importStatus.textContent = `${rows.length} holdings loaded and snapshot saved`;
    render();
  } catch (error) {
    console.error(error);
    els.importStatus.textContent = `Import failed: ${error.message}`;
  }
}

async function storeStateNow() {
  els.storeState.disabled = true;
  els.storeStateStatus.textContent = "Storing state...";
  try {
    if (serverStateAvailable) {
      await saveServerState();
      els.storeStateStatus.textContent = `Stored to data/state.json at ${new Date().toLocaleTimeString()}`;
    } else {
      saveSettings();
      els.storeStateStatus.textContent = "Stored in this browser. Use the local server for data/state.json.";
    }
  } catch (error) {
    console.error(error);
    els.storeStateStatus.textContent = `Store failed: ${error.message}`;
  } finally {
    els.storeState.disabled = false;
  }
}

function updateLastUploadedLabel() {
  if (lastUploaded?.fileName) {
    els.asOfLabel.textContent = `Loaded ${lastUploaded.fileName}`;
  }
}

function createSnapshot(fileName, rows) {
  const snapshotDate = inferSnapshotDate(fileName) || new Date().toISOString().slice(0, 10);
  const uploadedAt = new Date().toISOString();
  return {
    id: `${snapshotDate}-${uploadedAt}-${fileName}`,
    fileName,
    uploadedAt,
    snapshotDate,
    holdings: structuredClone(rows),
    byClass: summarizeRows(rows, (item) => item.assetClass),
    byCurrency: summarizeRows(rows, currencyGroup),
    totalValue: rows.reduce((sum, item) => sum + (Number(item.marketValueIls) || 0), 0),
    profitSummary: profitSummary(rows.filter((item) => item.symbol !== "CASH")),
  };
}

function summarizeRows(rows, keyFn) {
  const totals = {};
  for (const row of rows) {
    const key = keyFn(row);
    totals[key] = (totals[key] || 0) + (Number(row.marketValueIls) || 0);
  }
  return totals;
}

function inferSnapshotDate(fileName) {
  const iso = fileName.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = fileName.match(/([0-3]\d)([01]\d)(20\d{2})/);
  if (compact) return `${compact[3]}-${compact[2]}-${compact[1]}`;
  return null;
}

async function readXlsx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = parseZip(bytes);
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(await zipText(entries, "xl/sharedStrings.xml"))
    : [];
  const workbookXml = await zipText(entries, "xl/workbook.xml");
  const relsXml = await zipText(entries, "xl/_rels/workbook.xml.rels");
  const sheetPath = firstSheetPath(workbookXml, relsXml);
  const sheetXml = await zipText(entries, sheetPath);
  return parseSheet(sheetXml, sharedStrings);
}

function extractRows(sheetRows) {
  const headerIndex = sheetRows.findIndex((row) => row.includes("שם נייר") && row.includes("שווי בש\"ח"));
  if (headerIndex === -1) throw new Error("Could not find bank holdings header row");
  const dataRows = [];
  const columns = profitColumns(sheetRows[headerIndex]);
  for (const row of sheetRows.slice(headerIndex + 1)) {
    const name = row[0];
    if (!name || String(name).includes("סה\"כ")) break;
    const symbol = String(row[1] || "");
    const marketValueIls = parseNumber(row[2]);
    if (!Number.isFinite(marketValueIls)) continue;
    const units = parseNumber(row[4]);
    const price = parseNumber(row[6]);
    const type = String(row[8] || "");
    const tradedValue = parseNumber(row[11]);
    const fxToIls = parseNumber(row[12]) || 1;
    const exchange = String(row[13] || "");
    const currency = inferCurrency(symbol, exchange, fxToIls);
    const inferredCurrencyGroup = currency === "ILS" ? "ILS" : "Foreign";
    dataRows.push({
      assetClass: classifyHolding(name, symbol, type, exchange),
      name: String(name),
      symbol,
      account: "Bank import",
      units,
      price,
      marketValueIls,
      ...holdingProfit(row, columns, marketValueIls),
      tradedValue,
      currency,
      currencyGroup: inferredCurrencyGroup,
      fxToIls,
    });
  }
  const cashHeaderIndex = sheetRows.findIndex((row) => row.includes("יתרה פנויה למסחר"));
  if (cashHeaderIndex >= 0) {
    const cashColumn = sheetRows[cashHeaderIndex].findIndex((cell) => cell === "יתרה פנויה למסחר");
    const freeCash = parseNumber(sheetRows[cashHeaderIndex + 1]?.[cashColumn]);
    if (Number.isFinite(freeCash) && freeCash > 0) {
      dataRows.push({
        assetClass: "Cash / Money Market",
        name: "Free cash available for trading",
        symbol: "CASH",
        account: "Bank import",
        units: 1,
        price: freeCash,
        marketValueIls: freeCash,
        costBasisIls: null,
        profitIls: null,
        tradedValue: freeCash,
        currency: "ILS",
        currencyGroup: "ILS",
        fxToIls: 1,
      });
    }
  }
  return dataRows;
}

function parseZip(bytes) {
  const entries = new Map();
  let offset = 0;
  while (offset < bytes.length - 4) {
    if (readU32(bytes, offset) !== 0x04034b50) break;
    const method = readU16(bytes, offset + 8);
    const compressedSize = readU32(bytes, offset + 18);
    const uncompressedSize = readU32(bytes, offset + 22);
    const nameLength = readU16(bytes, offset + 26);
    const extraLength = readU16(bytes, offset + 28);
    const name = decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, { method, data, uncompressedSize });
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function zipText(entries, path) {
  const entry = entries.get(path);
  if (!entry) throw new Error(`Missing ${path}`);
  if (entry.method === 0) return decode(entry.data);
  if (entry.method !== 8) throw new Error(`Unsupported zip compression ${entry.method}`);
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return decode(new Uint8Array(buffer));
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) =>
    [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1])).join("")
  );
}

function firstSheetPath(workbookXml, relsXml) {
  const relId = workbookXml.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  if (!relId) throw new Error("No worksheet found");
  const rel = [...relsXml.matchAll(/<Relationship\b[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => tag.includes(`Id="${relId}"`));
  const target = rel?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error("No worksheet relationship found");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const col = ref ? columnIndex(ref) : values.length;
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const raw = cellMatch[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cellMatch[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      values[col] = type === "s" ? sharedStrings[Number(raw)] ?? "" : xmlDecode(raw);
    }
    rows.push(values);
  }
  return rows;
}

function columnIndex(col) {
  return [...col].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decode(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function xmlDecode(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSignedPct(value) {
  const formatted = PCT.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

els.snapshotFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importSnapshot(file);
});
els.storeState.addEventListener("click", storeStateNow);

els.definitionsBody.addEventListener("input", (event) => {
  const target = event.target;
  if (!targetsEditable) return;
  const assetClass = target.dataset.class;
  const definition = definitions.find((item) => item.assetClass === assetClass);
  if (!definition) return;
  if (target.dataset.kind === "currencyPolicy") {
    definition.currencyPolicy = target.value;
  } else {
    definition[target.dataset.kind] = (Number(target.value) || 0) / 100;
  }
  render();
});

els.definitionsBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!targetsEditable || target.dataset.kind !== "currencyPolicy") return;
  const definition = definitions.find((item) => item.assetClass === target.dataset.class);
  if (!definition) return;
  definition.currencyPolicy = target.value;
  render();
});

els.definitionsBody.addEventListener("click", (event) => {
  const assetClass = event.target.dataset.removeClass;
  if (!targetsEditable || !assetClass) return;
  const remaining = definitions.filter((definition) => definition.assetClass !== assetClass);
  const fallbackClass = remaining[0]?.assetClass || "Unclassified";
  holdings = holdings.map((holding) => (
    holding.assetClass === assetClass ? { ...holding, assetClass: fallbackClass } : holding
  ));
  definitions = remaining.length > 0
    ? remaining
    : [{ assetClass: fallbackClass, target: 0, threshold: (Number(els.defaultThresholdInput.value) || 5) / 100, currencyPolicy: "Mixed" }];
  render();
});

els.holdingsBody.addEventListener("change", (event) => {
  const index = Number(event.target.dataset.holdingIndex);
  const kind = event.target.dataset.kind;
  const holding = holdings[index];
  if (!holding) return;
  if (kind === "assetClass") {
    holding.assetClass = event.target.value;
  }
  if (kind === "currencyGroup") {
    holding.currencyGroup = event.target.value;
  }
  render();
});

els.contributionInput.addEventListener("input", render);
els.defaultThresholdInput.addEventListener("input", () => {
  if (!targetsEditable) return;
  const threshold = (Number(els.defaultThresholdInput.value) || 0) / 100;
  definitions = definitions.map((definition) => ({ ...definition, threshold }));
  render();
});
els.resetTargets.addEventListener("click", () => {
  if (!targetsEditable) return;
  definitions = DEFAULT_ASSET_CLASSES.map((assetClass) => ({
    assetClass,
    target: defaultTargets[assetClass] ?? 0,
    threshold: (Number(els.defaultThresholdInput.value) || 5) / 100,
    currencyPolicy: "Mixed",
  }));
  currencyTargets = { ILS: 0.7, Foreign: 0.3 };
  render();
});
els.addAssetClass.addEventListener("click", () => {
  if (!targetsEditable) return;
  const assetClass = els.newAssetClassInput.value.trim();
  if (!assetClass) return;
  if (definitions.some((definition) => definition.assetClass.toLowerCase() === assetClass.toLowerCase())) return;
  definitions = [...definitions, { assetClass, target: 0, threshold: (Number(els.defaultThresholdInput.value) || 5) / 100, currencyPolicy: "Mixed" }];
  els.newAssetClassInput.value = "";
  render();
});
els.newAssetClassInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.addAssetClass.click();
  }
});
els.editTargets.addEventListener("click", () => {
  targetsEditable = !targetsEditable;
  render();
});
els.ilsTargetInput.addEventListener("input", () => {
  if (!targetsEditable) return;
  currencyTargets.ILS = (Number(els.ilsTargetInput.value) || 0) / 100;
  render();
});
els.foreignTargetInput.addEventListener("input", () => {
  if (!targetsEditable) return;
  currencyTargets.Foreign = (Number(els.foreignTargetInput.value) || 0) / 100;
  render();
});
els.currentTab.addEventListener("click", () => showPage("current"));
els.historyTab.addEventListener("click", () => showPage("history"));

els.asOfLabel.textContent = "Example snapshot from 2026-06-23";
init();

async function init() {
  const loadedFromServer = await loadServerState();
  if (loadedFromServer) {
    render();
    renderHistory();
    return;
  }

  try {
    db = await openDatabase();
    const loadedFromDb = await loadDbSettings();
    if (!loadedFromDb) {
      loadSettings();
      await saveDbSettings();
    }
    snapshots = await loadSnapshots();
  } catch (error) {
    console.warn("IndexedDB unavailable; using localStorage settings only", error);
    loadSettings();
  }
  render();
  renderHistory();
        }
