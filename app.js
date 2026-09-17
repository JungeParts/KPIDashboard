// ==========================================
// THEME
// ==========================================

const THEME_STORAGE_KEY = "kpiDashboardTheme";

function applyTheme(theme) {
   document.documentElement.setAttribute("data-theme", theme);

   const icon = document.getElementById("themeToggleIcon");
   if (icon) {
      icon.textContent = theme === "dark" ? "☀️" : "🌙";
   }
}

function toggleTheme() {
   const current =
      document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
   const next = current === "dark" ? "light" : "dark";

   localStorage.setItem(THEME_STORAGE_KEY, next);
   applyTheme(next);

   // Re-render anything drawn with JS (trend charts read CSS vars once at
   // draw time, so they need a redraw to pick up the new palette).
   if (trendState.fullHistory.length) {
      renderTrendAll();
   }
}

applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

// ==========================================
// SHARED HELPERS
// ==========================================

function setValue(id, value) {
   const element = document.getElementById(id);
   if (element) {
      element.textContent = value;
   }
}

function currency(value) {
   return parseNumber(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function percent(value) {
   return `${parseNumber(value)}%`;
}

// Abbreviated currency, e.g. $449K, $1.2M.
function currencyAbbrev(value) {
   const n = Number(value || 0);
   if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
   if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`;
   return currency(n);
}

// Same as currencyAbbrev but keeps a decimal on the K/M suffix, so a
// narrow-range chart axis doesn't collapse every tick to the same label.
function currencyAbbrevPrecise(value) {
   const n = Number(value || 0);
   if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
   if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
   return currency(n);
}

function parseNumber(value) {
   return Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
}

function pluralize(count, word) {
   return count === 1 ? word : `${word}s`;
}

function escapeHtml(value) {
   return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
}

function normalizeText(value) {
   return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
}

/** Returns the first matching field value using flexible header matching. */
function getFieldValue(record, fieldNames) {
   const matchingKey = Object.keys(record).find((recordKey) =>
      fieldNames.some((fieldName) => normalizeText(recordKey) === normalizeText(fieldName)),
   );

   return matchingKey === undefined ? "" : String(record[matchingKey]).trim();
}

/** Appends a cache-busting timestamp to a feed URL, with or without an existing query string. */
function withCacheBust(url) {
   const separator = url.includes("?") ? "&" : "?";
   return `${url}${separator}t=${Date.now()}`;
}

/** Parse CSV text into an array of objects. Supports quoted values and escaped quotes. */
function parseCsv(csvText) {
   let rows = [];
   let currentRow = [];
   let currentField = "";
   let insideQuotes = false;

   for (let i = 0; i < csvText.length; i++) {
      const currentCharacter = csvText[i];
      const nextCharacter = csvText[i + 1];

      if (currentCharacter === '"' && insideQuotes && nextCharacter === '"') {
         currentField += '"';
         i++;
      } else if (currentCharacter === '"') {
         insideQuotes = !insideQuotes;
      } else if (currentCharacter === "," && !insideQuotes) {
         currentRow.push(currentField);
         currentField = "";
      } else if ((currentCharacter === "\n" || currentCharacter === "\r") && !insideQuotes) {
         if (currentCharacter === "\r" && nextCharacter === "\n") i++;

         currentRow.push(currentField);
         if (currentRow.some((cell) => cell.trim())) rows.push(currentRow);

         currentRow = [];
         currentField = "";
      } else {
         currentField += currentCharacter;
      }
   }

   if (currentField || currentRow.length) {
      currentRow.push(currentField);
      rows.push(currentRow);
   }

   const headers = rows.shift() || [];

   return rows.map((rowData) =>
      Object.fromEntries(headers.map((header, index) => [header.trim(), rowData[index] || ""])),
   );
}

/**
 * Compares a Current reading against a Target and picks a status.
 * "higher" metrics are good at/above target; "lower" metrics are good
 * at/below target. A 10% band beyond target is "Watch" before it counts
 * as "Needs action".
 */
function computeStatus(current, target, direction) {
   if (!target && target !== 0) return null;
   if (Number.isNaN(current) || target === 0) return null;

   const onTarget = direction === "higher" ? current >= target : current <= target;
   if (onTarget) return { label: "On target", cls: "good", tone: "good" };

   const watchBand =
      direction === "higher" ? current >= target * 0.9 : current <= target * 1.1;

   return watchBand
      ? { label: "Watch", cls: "", tone: "watch" }
      : { label: "Needs action", cls: "bad", tone: "bad" };
}

function renderRecordTable(tbodyId, records, columns, emptyMessage) {
   const tbody = document.getElementById(tbodyId);
   if (!tbody) return;

   if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="muted">${emptyMessage}</td></tr>`;
      return;
   }

   tbody.innerHTML = records
      .map((record) => {
         const cells = columns
            .map((column) => {
               const raw = getFieldValue(record, column.fields);
               const value = column.format ? column.format(raw) : raw;
               const cls = column.numeric ? ' class="num"' : "";
               return `<td${cls}>${escapeHtml(value)}</td>`;
            })
            .join("");
         return `<tr>${cells}</tr>`;
      })
      .join("");
}

async function loadCsvList(path, tbodyId, columns, emptyMessage, countId, totalOptions) {
   const tbody = document.getElementById(tbodyId);

   try {
      const response = await fetch(withCacheBust(path), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      const records = parseCsv(csvText);

      if (countId) setValue(countId, String(records.length));

      renderRecordTable(tbodyId, records, columns, emptyMessage);

      if (totalOptions) {
         const total = records.reduce(
            (sum, record) => sum + parseNumber(getFieldValue(record, totalOptions.fields)),
            0,
         );
         setValue(totalOptions.elementId, currency(total));
      }

      return records;
   } catch (error) {
      console.error("CSV Load Error:", path, error);

      if (countId) setValue(countId, "—");
      if (totalOptions) setValue(totalOptions.elementId, "—");
      if (tbody) tbody.innerHTML = `<tr><td colspan="${columns.length}" class="muted">Unable to load data.</td></tr>`;

      return [];
   }
}

/** Wires a text input to hide/show rows of a rendered table by substring match. */
function wireTableFilter(inputId, tbodyId) {
   const input = document.getElementById(inputId);
   if (!input) return;

   input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll(`#${tbodyId} tr`).forEach((row) => {
         row.style.display = !query || row.textContent.toLowerCase().includes(query) ? "" : "none";
      });
   });
}

// ==========================================
// APP STATE + ROUTER
// ==========================================

const state = {
   nav: "daily", // daily | returns | trends
   dept: "parts", // parts | service
   partsTab: "overview",
   svcTab: "overview",
};

const PARTS_TAB_VIEWS = ["overview", "demand", "inventory", "sales", "pos"];
const SVC_TAB_VIEWS = ["overview", "closed", "aged", "backorder", "uptime", "pri", "missed"];

function parseHash() {
   const segments = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
   if (segments[0] === "returns") return { nav: "returns" };
   if (segments[0] === "trends") return { nav: "trends" };
   if (segments[0] === "daily") {
      const dept = segments[1] === "service" ? "service" : "parts";
      const tabList = dept === "service" ? SVC_TAB_VIEWS : PARTS_TAB_VIEWS;
      const tab = tabList.includes(segments[2]) ? segments[2] : "overview";
      return { nav: "daily", dept, tab };
   }
   return null;
}

function updateHash() {
   const tab = state.dept === "service" ? state.svcTab : state.partsTab;
   const next =
      state.nav === "daily" ? `#/daily/${state.dept}/${tab}` : `#/${state.nav}`;
   if (location.hash !== next) {
      history.replaceState(null, "", next);
   }
}

function applyRoute(route) {
   if (!route) return;
   state.nav = route.nav;
   if (route.nav === "daily") {
      state.dept = route.dept;
      if (route.dept === "service") state.svcTab = route.tab;
      else state.partsTab = route.tab;
   }
}

function setMetaLine(text, isError) {
   const meta = document.getElementById("appMetaLine");
   if (!meta) return;
   meta.textContent = text;
   meta.style.color = isError ? "#ff8080" : "";
}

function navigate(nav) {
   state.nav = nav;
   updateHash();
   render();

   if (nav === "returns") {
      if (sessionStorage.getItem(GATE_SESSION_KEY) === "1") {
         setMetaLine("Updated —");
         loadClaims();
      } else {
         setMetaLine("");
      }
   } else if (nav === "trends") {
      if (!trendState.loaded) {
         setMetaLine("Data through —");
         refreshTrendData();
      }
   } else if (nav === "daily") {
      setMetaLine(lastDailyMeta.text, lastDailyMeta.isError);
   }
}

function setDept(dept) {
   state.dept = dept;
   updateHash();
   render();
}

function setTab(tab) {
   if (state.dept === "service") state.svcTab = tab;
   else state.partsTab = tab;
   updateHash();
   render();
}

/** Jumps to a specific department + tab from anywhere (tile/queue clicks). */
function jumpTo(target) {
   const [dept, tab] = target.split(":");
   state.nav = "daily";
   state.dept = dept;
   if (dept === "service") state.svcTab = tab;
   else state.partsTab = tab;
   updateHash();
   render();
   window.scrollTo({ top: 0, behavior: "smooth" });
}

const APP_TITLES = {
   daily: { parts: "Parts Daily", service: "Service Daily" },
   returns: "Part Return Claims",
   trends: "Trend Analysis",
};

function render() {
   // Rail active state
   document.querySelectorAll(".rail-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === state.nav);
   });

   // Top-level view visibility
   document.getElementById("dailyView").hidden = state.nav !== "daily";
   document.getElementById("returnsView").hidden = state.nav !== "returns";
   document.getElementById("trendsView").hidden = state.nav !== "trends";

   // Appbar control clusters
   document.getElementById("dailyControls").hidden = state.nav !== "daily";
   document.getElementById("returnsControls").hidden = state.nav !== "returns";
   document.getElementById("trendsControls").hidden = state.nav !== "trends";

   // Tabbars only make sense on the Daily screen
   document.getElementById("partsTabs").hidden = !(state.nav === "daily" && state.dept === "parts");
   document.getElementById("svcTabs").hidden = !(state.nav === "daily" && state.dept === "service");

   if (state.nav === "daily") {
      document.getElementById("partsViews").hidden = state.dept !== "parts";
      document.getElementById("svcViews").hidden = state.dept !== "service";

      document.getElementById("segParts").classList.toggle("checked", state.dept === "parts");
      document.getElementById("segService").classList.toggle("checked", state.dept === "service");
      document.querySelector('#segParts input').checked = state.dept === "parts";
      document.querySelector('#segService input').checked = state.dept === "service";
      document.getElementById("svcAdvisorWrap").hidden = state.dept !== "service";

      if (state.dept === "parts") {
         PARTS_TAB_VIEWS.forEach((tab) => {
            document.getElementById(`view-parts-${tab}`).hidden = tab !== state.partsTab;
         });
         document.querySelectorAll("#partsTabs .tabbar-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === state.partsTab);
         });
      } else {
         SVC_TAB_VIEWS.forEach((tab) => {
            document.getElementById(`view-svc-${tab}`).hidden = tab !== state.svcTab;
         });
         document.querySelectorAll("#svcTabs .tabbar-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === state.svcTab);
         });
      }

      document.getElementById("appTitle").textContent = APP_TITLES.daily[state.dept];
   } else {
      document.getElementById("appTitle").textContent = APP_TITLES[state.nav];
   }
}

window.addEventListener("hashchange", () => {
   const route = parseHash();
   if (route) {
      applyRoute(route);
      render();
   }
});

// ==========================================
// APPBAR STAMPS
// ==========================================

let lastDailyMeta = { text: "—", isError: false };

function dailyStamp(status) {
   const now = new Date();
   const dateText = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
   });
   const timeText = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

   if (status === "error") {
      lastDailyMeta = {
         text: `Reporting ${dateText} · Refresh failed at ${timeText} — showing last known data`,
         isError: true,
      };
   } else {
      lastDailyMeta = { text: `Reporting ${dateText} · Updated ${timeText}`, isError: false };
   }

   if (state.nav === "daily") {
      setMetaLine(lastDailyMeta.text, lastDailyMeta.isError);
   }

   updateDailyLabels();
}

/**
 * Card labels report the prior business day's activity (DealerTrack's
 * daily feed lands the morning after), so the label itself should read
 * that date rather than a static "Today".
 */
function updateDailyLabels() {
   const yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);
   const dateText = yesterday.toLocaleDateString("en-US", { month: "short", day: "numeric" });

   setValue("PartsSalesTodayLabel", `Parts Sales ${dateText}`);
   setValue("GrossProfitTodayLabel", `Gross Profit ${dateText}`);
   setValue("InternalSalesLabel", `Internal Sales ${dateText}`);
   setValue("PartsSalesTodayNote", `${dateText} · Previous day`);
}

// ==========================================
// PARTS DATA
// ==========================================

const partsData = {
   kpi: {},
   aging: { Aging6to11: 0, Aging12plus: 0 },
   openPos: [],
};

function mapCsvKpiData(kpi) {
   partsData.kpi = {
      DemandFillRate: parseNumber(getFieldValue(kpi, ["DemandFillRate", "Demand Fill Rate", "Shelf Fill Rate"])),
      GrossProfitPercent: parseNumber(getFieldValue(kpi, ["GrossProfitPercent", "Gross Profit Percent", "Gross Profit %"])),
      LostSales: parseNumber(getFieldValue(kpi, ["LostSales", "Lost Sales"])),
      BackorderLines: parseNumber(getFieldValue(kpi, ["BackorderLines", "Backorder Lines"])),
      InventoryOnHand: parseNumber(getFieldValue(kpi, ["InventoryOnHand", "Inventory On Hand", "Inventory On-Hand"])),
      Obsolescence: parseNumber(getFieldValue(kpi, ["Obsolescence"])),
      ExcessInventory: parseNumber(getFieldValue(kpi, ["ExcessInventory", "Excess Inventory"])),
      MonthsSupply: parseNumber(getFieldValue(kpi, ["MonthsSupply", "Months Supply"])),
      PartsSalesToday: parseNumber(getFieldValue(kpi, ["PartsSalesToday", "Parts Sales Today", "Parts Sales"])),
      GrossProfitToday: parseNumber(getFieldValue(kpi, ["GrossProfitToday", "Gross Profit Today"])),
      OverrideLines: parseNumber(getFieldValue(kpi, ["OverrideLines", "Override Lines"])),
      OverrideGPImpact: parseNumber(getFieldValue(kpi, ["OverrideGPImpact", "Override GP Impact"])),
      UnrealizedSales: parseNumber(getFieldValue(kpi, ["UnrealizedSales", "Unrealized Sales"])),
      UnrealizedGP: parseNumber(getFieldValue(kpi, ["UnrealizedGP", "Unrealized GP"])),
      InternalSales: parseNumber(getFieldValue(kpi, ["InternalSales", "Internal Sales"])),
      SalesByEP: getFieldValue(kpi, ["SalesByEP", "Sales By EP", "Sales by EP"]),
      WorkInProcess: parseNumber(getFieldValue(kpi, ["WorkInProcess", "Work In Process"])),
   };

   renderPartsKpi();
   renderScorecard();
   renderPartsHero();
   renderPartsQueue();

   setValue("WorkInProcess", currency(partsData.kpi.WorkInProcess));
}

function renderPartsKpi() {
   const k = partsData.kpi;

   setValue("DemandFillRate", percent(k.DemandFillRate));
   setValue("DemandFillRate2", percent(k.DemandFillRate));
   setValue("GrossProfitPercent", percent(k.GrossProfitPercent));
   setValue("GrossProfitPercent2", percent(k.GrossProfitPercent));
   setValue("LostSales", currency(k.LostSales));
   setValue("BackorderLines", String(k.BackorderLines));
   setValue("InventoryOnHand", currency(k.InventoryOnHand));
   setValue("InventoryOnHand2", currency(k.InventoryOnHand));
   setValue("Obsolescence", percent(k.Obsolescence));
   setValue("ExcessInventory", percent(k.ExcessInventory));
   setValue("MonthsSupply", k.MonthsSupply.toFixed(1));
   setValue("PartsSalesToday", currency(k.PartsSalesToday));
   setValue("PartsSalesToday2", currency(k.PartsSalesToday));
   setValue("GrossProfitToday", currency(k.GrossProfitToday));
   setValue("OverrideLines", String(k.OverrideLines));
   setValue("OverrideLines2", String(k.OverrideLines));
   setValue("OverrideGPImpact", currency(k.OverrideGPImpact));
   setValue("UnrealizedSales", currency(k.UnrealizedSales));
   setValue("UnrealizedSales2", currency(k.UnrealizedSales));
   setValue("UnrealizedGP", currency(k.UnrealizedGP));
   setValue("InternalSales", currency(k.InternalSales));
   setValue("SalesByEP", k.SalesByEP);
}

const PARTS_SCORECARD_ROWS = [
   { key: "DemandFillRate", metric: "Demand fill rate", target: 95.0, direction: "higher", format: percent },
   { key: "GrossProfitPercent", metric: "Parts gross profit", target: 40.0, direction: "higher", format: percent },
   { key: "Obsolescence", metric: "Obsolescence", target: 3.0, direction: "lower", format: percent },
   { key: "MonthsSupply", metric: "Months supply", target: 1.5, direction: "lower", format: (v) => v.toFixed(1) },
];

function renderScorecard() {
   const k = partsData.kpi;
   const rows = PARTS_SCORECARD_ROWS.map((row) => {
      const current = k[row.key];
      const status = computeStatus(current, row.target, row.direction) || { label: "Watch", cls: "" };
      return `<tr>
         <td>${row.metric}</td>
         <td style="text-align:right;font-variant-numeric:tabular-nums">${row.format(current)}</td>
         <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--s)">${row.direction === "lower" ? "≤ " : "≥ "}${row.format(row.target)}</td>
         <td style="text-align:right"><span class="badge ${status.cls}">${status.label}</span></td>
      </tr>`;
   });

   rows.push(`<tr>
      <td>Unrealized sales</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${currency(k.UnrealizedSales)}</td>
      <td style="text-align:right;color:var(--s)">—</td>
      <td style="text-align:right"><span class="badge">Watch</span></td>
   </tr>`);

   document.getElementById("scorecardBody").innerHTML = rows.join("");
}

function partsHeroCard(kicker, title, sub, tone, jump) {
   return `<button type="button" class="hero-card ${tone === "bad" ? "tone-bad" : ""}" data-jump="${jump}">
      <div class="hero-kicker">${kicker}</div>
      <div class="hero-title">${escapeHtml(title)}</div>
      <div class="hero-sub">${escapeHtml(sub)}</div>
   </button>`;
}

function renderPartsHero() {
   const k = partsData.kpi;
   const cards = [];

   PARTS_SCORECARD_ROWS.forEach((row) => {
      const current = k[row.key];
      const status = computeStatus(current, row.target, row.direction);
      if (!status || status.tone === "good") return;
      const kicker = status.tone === "bad" ? "Act now" : "Watch";
      cards.push(
         partsHeroCard(
            kicker,
            row.metric,
            `${row.format(current)} vs target ${row.format(row.target)}`,
            status.tone,
            row.key === "MonthsSupply" ? "parts:inventory" : row.key === "Obsolescence" ? "parts:inventory" : "parts:demand",
         ),
      );
   });

   if (k.UnrealizedSales > 0) {
      cards.push(partsHeroCard("Watch", "Unrealized sales", `${currency(k.UnrealizedSales)} in missed demand`, "watch", "parts:sales"));
   }

   const hero = document.getElementById("partsHero");
   hero.innerHTML =
      `<div class="hero-count"><strong>${cards.length}</strong><span>Need action today</span></div>` +
      (cards.length ? cards.join("") : `<div class="hero-empty">All parts targets are on track.</div>`);

   wireJumpButtons(hero);
}

function renderPartsQueue() {
   const k = partsData.kpi;
   const rows = [
      { count: String(k.BackorderLines), label: "Backordered demand lines", note: "MTD", tone: "var(--r)", jump: "parts:demand", show: k.BackorderLines > 0 },
      { count: String(k.OverrideLines), label: "Price override lines", note: "prev day", tone: "var(--a)", jump: "parts:sales", show: k.OverrideLines > 0 },
      { count: String(partsData.openPos.length), label: "Open purchase orders", note: "committed spend", tone: "var(--s)", jump: "parts:pos", show: partsData.openPos.length > 0 },
   ].filter((row) => row.show);

   const queue = document.getElementById("partsQueue");
   if (!rows.length) {
      queue.innerHTML = `<div class="queue-empty">No open exceptions right now.</div>`;
      return;
   }

   queue.innerHTML = rows
      .map(
         (row) => `<button type="button" class="queue-row" data-jump="${row.jump}">
         <span class="queue-count" style="color:${row.tone}">${row.count}</span>
         <span class="queue-label">${escapeHtml(row.label)}</span>
         <span class="queue-note">${escapeHtml(row.note)}</span>
         <span class="queue-caret">›</span>
      </button>`,
      )
      .join("");

   wireJumpButtons(queue);
}

function wireJumpButtons(root) {
   root.querySelectorAll("[data-jump]").forEach((el) => {
      el.addEventListener("click", () => jumpTo(el.dataset.jump));
   });
}

async function loadKpiCsv() {
   try {
      const response = await fetch(withCacheBust(CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      const records = parseCsv(csvText);

      if (!records.length) {
         console.warn("No KPI rows found.");
         dailyStamp("error");
         return;
      }

      mapCsvKpiData(records[0]);
      dailyStamp();
   } catch (error) {
      console.error("CSV Load Error:", error);
      dailyStamp("error");
   }
}

function setAgingBar(prefix, value, totalValue) {
   const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
   const fillEl = document.getElementById(`fill${prefix}`);
   if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;
   setValue(`val${prefix}`, currencyAbbrev(value));
}

async function loadAgingCsv() {
   try {
      const response = await fetch(withCacheBust(AGING_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load aging CSV (${response.status})`);

      const csvText = await response.text();
      const records = parseCsv(csvText);
      if (!records.length) {
         console.warn("No inventory aging rows found.");
         return;
      }

      const bucket = records[0];
      partsData.aging.Aging6to11 = parseNumber(getFieldValue(bucket, ["Aging6to11", "6-11 Months", "6 to 11 Months"]));
      partsData.aging.Aging12plus = parseNumber(getFieldValue(bucket, ["Aging12plus", "12+ Months", "12 Plus Months"]));

      const total = partsData.aging.Aging6to11 + partsData.aging.Aging12plus;
      setAgingBar("Aging6to11", partsData.aging.Aging6to11, total);
      setAgingBar("Aging12plus", partsData.aging.Aging12plus, total);
   } catch (error) {
      console.error("Aging CSV Load Error:", error);
   }
}

const OPEN_POS_COLUMNS = [
   { fields: ["PO", "PO Number", "PO#", "PONumber"] },
   { fields: ["Order Date"] },
   { fields: ["Vendor"] },
   { fields: ["Name"] },
   { fields: ["User"] },
   { fields: ["Control"] },
   { fields: ["Account"] },
   { fields: ["Amount", "PO Amount", "Total"], format: currency, numeric: true },
];

async function loadOpenPosCsv() {
   const records = await loadCsvList(
      OPEN_POS_CSV_PATH,
      "openPosQueue",
      OPEN_POS_COLUMNS,
      "No open purchase orders.",
      null,
      { fields: ["Amount", "PO Amount", "Total"], elementId: "openPosTotal" },
   );

   partsData.openPos = records;
   const total = document.getElementById("openPosTotal").textContent;
   setValue("openPosSummary", records.length ? `${records.length} open · ${total} committed` : "0 open");
   renderPartsQueue();
}

// ==========================================
// SERVICE DATA
// ==========================================

const svcData = {
   closedCount: 0,
   agedRows: [],
   backorderCount: 0,
   uptimeCount: 0,
   priCount: 0,
   missedCount: 0,
   // Raw, unfiltered records for every feed that carries an Advisor column,
   // kept around so the advisor filter can re-render client-side without
   // re-fetching. Upcoming PRI has no advisor field, so it's not here.
   closedRaw: [],
   agedRawAll: [],
   backorderRaw: [],
   uptimeRaw: [],
   missedRaw: [],
   advisor: "", // "" = all advisors
};

// Header names accepted for the advisor column, in priority order. Missed
// Opportunities already ships "Service Advisor ID"; the other feeds were
// asked to add a plain "Advisor" column, so both are matched the same way
// everywhere else in the app matches flexible headers.
const ADVISOR_FIELDS = ["Advisor", "Service Advisor", "Service Advisor ID", "Advisor ID"];

function filterByAdvisor(records) {
   if (!svcData.advisor) return records;
   return records.filter((record) => getFieldValue(record, ADVISOR_FIELDS) === svcData.advisor);
}

function collectAdvisors() {
   const all = [
      ...svcData.closedRaw,
      ...svcData.agedRawAll,
      ...svcData.backorderRaw,
      ...svcData.uptimeRaw,
      ...svcData.missedRaw,
   ];
   const advisors = new Set();
   all.forEach((record) => {
      const value = getFieldValue(record, ADVISOR_FIELDS);
      if (value) advisors.add(value);
   });
   return [...advisors].sort();
}

function populateAdvisorFilter() {
   const select = document.getElementById("svcAdvisorFilter");
   if (!select) return;

   const advisors = collectAdvisors();
   if (svcData.advisor && !advisors.includes(svcData.advisor)) {
      svcData.advisor = "";
   }

   select.innerHTML =
      '<option value="">All advisors</option>' +
      advisors.map((a) => `<option value="${escapeHtml(a)}"${a === svcData.advisor ? " selected" : ""}>${escapeHtml(a)}</option>`).join("");
}

function renderFilteredServiceViews() {
   renderClosedRoTable();
   renderAgedRoTable();
   renderBackorderTable();
   renderUptimeTable();
   renderMissedOppTables();
   renderSvcHero();
   renderSvcQueue();
}

document.getElementById("svcAdvisorFilter").addEventListener("change", (event) => {
   svcData.advisor = event.target.value;
   renderFilteredServiceViews();
});

async function refreshDailyData() {
   const btn = document.getElementById("refreshBtn");
   if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
   }

   try {
      await Promise.all([
         loadKpiCsv(),
         loadAgingCsv(),
         loadOpenPosCsv(),
         loadClosedRoWithPartsCsv(),
         loadAgedRoCsv(),
         loadBackorderedPartsCsv(),
         loadUptimeAssistCsv(),
         loadUpcomingPriCsv(),
         loadMissedOpportunitiesCsv(),
      ]);
      populateAdvisorFilter();
      renderSvcHero();
      renderSvcQueue();
   } finally {
      if (btn) {
         btn.disabled = false;
         btn.classList.remove("loading");
      }
   }
}

const CLOSED_RO_WITH_PARTS_COLUMNS = [
   { fields: ["RO", "RO Number", "RONumber"] },
   { fields: ["Close Date", "CloseDate"] },
   { fields: ["Status"] },
   { fields: ["Customer"] },
];

function renderClosedRoTable() {
   const filtered = filterByAdvisor(svcData.closedRaw);
   renderRecordTable("closedRoWithPartsQueue", filtered, CLOSED_RO_WITH_PARTS_COLUMNS, "No closed ROs currently have parts attached.");

   svcData.closedCount = filtered.length;
   setValue("closedRoWithPartsCount", String(filtered.length));
   setValue("closedRoWithPartsCountDetail", String(filtered.length));
   setValue("closedRoWithPartsNote", filtered.length ? "critical" : "none open");
}

async function loadClosedRoWithPartsCsv() {
   try {
      const response = await fetch(withCacheBust(CLOSED_RO_WITH_PARTS_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      svcData.closedRaw = parseCsv(csvText);
      renderClosedRoTable();
   } catch (error) {
      console.error("CSV Load Error:", CLOSED_RO_WITH_PARTS_CSV_PATH, error);

      svcData.closedRaw = [];
      setValue("closedRoWithPartsCount", "—");
      setValue("closedRoWithPartsCountDetail", "—");
      setValue("closedRoWithPartsNote", "—");
      const tbody = document.getElementById("closedRoWithPartsQueue");
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="muted">Unable to load data.</td></tr>';
   }
}

/** Age in days for a single RO record. Prefers an explicit Age Days column; falls back to Open Date. */
function getRoAgeDays(record) {
   const ageDaysValue = getFieldValue(record, ["Age Days", "AgeDays", "Age"]);
   if (ageDaysValue !== "") return parseNumber(ageDaysValue);

   const openDateValue = getFieldValue(record, ["Open Date", "OpenDate"]);
   if (!openDateValue) return 0;

   const openDate = new Date(openDateValue);
   if (Number.isNaN(openDate.getTime())) return 0;

   const msPerDay = 24 * 60 * 60 * 1000;
   return Math.floor((Date.now() - openDate.getTime()) / msPerDay);
}

function renderAgedRoQueue(records) {
   const tbody = document.getElementById("agedRoQueue");
   if (!tbody) return;

   const agedRows = records
      .map((record) => ({ record, age: getRoAgeDays(record) }))
      .filter((row) => row.age >= AGED_RO_THRESHOLD_DAYS)
      .sort((a, b) => b.age - a.age);

   svcData.agedRows = agedRows;
   setValue("agedRoCount", String(agedRows.length));
   setValue("agedRoCountDetail", String(agedRows.length));
   setValue("agedRoNote", agedRows.length ? `oldest ${agedRows[0].age}d` : "none open");

   if (!agedRows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No ROs currently open 10+ days.</td></tr>';
      setValue("agedRoTotal", currency(0));
      return;
   }

   let total = 0;
   tbody.innerHTML = agedRows
      .map(({ record, age }) => {
         const ro = getFieldValue(record, ["RO", "RO Number", "RONumber"]);
         const status = getFieldValue(record, ["Status"]);
         const description =
            getFieldValue(record, ["Description", "Part Description"]) ||
            getFieldValue(record, ["Part Number", "PartNumber"]);
         const sale = parseNumber(getFieldValue(record, ["Sale", "Sale Amount"]));
         total += sale;

         return `<tr>
            <td>${escapeHtml(ro)}</td>
            <td>${age}d</td>
            <td>${escapeHtml(status)}</td>
            <td>${escapeHtml(description)}</td>
            <td class="num">${currency(sale)}</td>
         </tr>`;
      })
      .join("");

   setValue("agedRoTotal", currency(total));
}

function renderAgedRoTable() {
   renderAgedRoQueue(filterByAdvisor(svcData.agedRawAll));
}

async function loadAgedRoCsv() {
   const tbody = document.getElementById("agedRoQueue");
   try {
      const response = await fetch(withCacheBust(AGED_RO_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load aged RO CSV (${response.status})`);

      const csvText = await response.text();
      svcData.agedRawAll = parseCsv(csvText);
      renderAgedRoTable();
   } catch (error) {
      console.error("Aged RO CSV Load Error:", error);
      svcData.agedRawAll = [];
      setValue("agedRoCount", "—");
      setValue("agedRoCountDetail", "—");
      setValue("agedRoTotal", "—");
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">Unable to load aged RO data.</td></tr>';
   }
}

const BACKORDERED_PARTS_COLUMNS = [
   { fields: ["RO", "RO Number", "RONumber"] },
   { fields: ["Part Number", "PartNumber", "Part #"] },
   { fields: ["Description"] },
   { fields: ["Status"] },
   { fields: ["ETA", "Backorder ETA", "Expected"] },
];

function renderBackorderTable() {
   const filtered = filterByAdvisor(svcData.backorderRaw);
   renderRecordTable("backorderedPartsQueue", filtered, BACKORDERED_PARTS_COLUMNS, "No ROs currently have backordered parts.");

   svcData.backorderCount = filtered.length;
   setValue("backorderedPartsCount", String(filtered.length));
   setValue("backorderedPartsCountDetail", String(filtered.length));
}

async function loadBackorderedPartsCsv() {
   try {
      const response = await fetch(withCacheBust(BACKORDERED_PARTS_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      svcData.backorderRaw = parseCsv(csvText);
      renderBackorderTable();
   } catch (error) {
      console.error("CSV Load Error:", BACKORDERED_PARTS_CSV_PATH, error);

      svcData.backorderRaw = [];
      setValue("backorderedPartsCount", "—");
      setValue("backorderedPartsCountDetail", "—");
      const tbody = document.getElementById("backorderedPartsQueue");
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">Unable to load data.</td></tr>';
   }
}

const UPTIME_ASSIST_COLUMNS = [
   { fields: ["RO"] },
   { fields: ["VIN"] },
   { fields: ["Open Date"] },
   { fields: ["Due Date", "DueDate"] },
   { fields: ["Status"] },
];

function renderUptimeTable() {
   const filtered = filterByAdvisor(svcData.uptimeRaw);
   renderRecordTable("uptimeAssistQueue", filtered, UPTIME_ASSIST_COLUMNS, "No open Uptime Assist follow-ups.");

   svcData.uptimeCount = filtered.length;
   setValue("uptimeAssistCount", String(filtered.length));
}

async function loadUptimeAssistCsv() {
   try {
      const response = await fetch(withCacheBust(UPTIME_ASSIST_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      svcData.uptimeRaw = parseCsv(csvText);
      renderUptimeTable();
   } catch (error) {
      console.error("CSV Load Error:", UPTIME_ASSIST_CSV_PATH, error);

      svcData.uptimeRaw = [];
      setValue("uptimeAssistCount", "—");
      const tbody = document.getElementById("uptimeAssistQueue");
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">Unable to load data.</td></tr>';
   }
}

const UPCOMING_PRI_COLUMNS = [
   { fields: ["Appt Date", "Appointment Date", "ApptDate"] },
   { fields: ["VIN"] },
   { fields: ["Part Number", "PartNumber", "Part #"] },
   { fields: ["Status"] },
];

async function loadUpcomingPriCsv() {
   const records = await loadCsvList(
      UPCOMING_PRI_CSV_PATH,
      "upcomingPriQueue",
      UPCOMING_PRI_COLUMNS,
      "No upcoming appointments with PRI parts.",
      "upcomingPriCount",
   );
   svcData.priCount = records.length;
}

// Missed Opportunities has ~29 columns in the source sheet — far too many
// for one table. Split into topic tabs that each repeat the two key
// columns (Dealer Code, Service Advisor ID) alongside a manageable set of
// related metrics.
const MISSED_OPP_GROUPS = [
   {
      tbodyId: "moOverviewQueue",
      columns: [
         { fields: ["Dealer Code"] },
         { fields: ["Service Advisor ID"] },
         { fields: ["Total Repair Orders"], numeric: true },
         { fields: ["Total VIN #"], numeric: true },
         { fields: ["MPI+3 RO"], numeric: true },
         { fields: ["MPI+3 Utilization %"], format: percent, numeric: true },
      ],
   },
   {
      tbodyId: "moMissedOppQueue",
      columns: [
         { fields: ["Dealer Code"] },
         { fields: ["Service Advisor ID"] },
         { fields: ["Customer Pay Missed Opportunity"], numeric: true },
         { fields: ["Missed Opportunity (Warranty)"], numeric: true },
         { fields: ["Missed Opportunity (Recall)"], numeric: true },
         { fields: ["Missed Opportunity (Red Coding)"], numeric: true },
         { fields: ["Warr RO w/o CP and Recall"], numeric: true },
         { fields: ["Recall RO w/o CP"], numeric: true },
         { fields: ["Recall ROs Missing MPI+3"], numeric: true },
         { fields: ["Warranty ROs Missing MPI+3"], numeric: true },
      ],
   },
   {
      tbodyId: "moRedTagQueue",
      columns: [
         { fields: ["Dealer Code"] },
         { fields: ["Service Advisor ID"] },
         { fields: ["Red Brake Count"], numeric: true },
         { fields: ["Brake Penetration %"], format: percent, numeric: true },
         { fields: ["Red Battery Count"], numeric: true },
         { fields: ["Battery Penetration %"], format: percent, numeric: true },
         { fields: ["Red Tire Count"], numeric: true },
         { fields: ["Tire Penetration %"], format: percent, numeric: true },
         { fields: ["Red Wiper Count"], numeric: true },
         { fields: ["Wiper Penetration %"], format: percent, numeric: true },
         { fields: ["Red Cabin Air Filter Count"], numeric: true },
         { fields: ["Cabin Air Filter Penetration %"], format: percent, numeric: true },
      ],
   },
   {
      tbodyId: "moReturnRateQueue",
      columns: [
         { fields: ["Dealer Code"] },
         { fields: ["Service Advisor ID"] },
         { fields: ["Red Brake 60 day Return Rate"], format: percent, numeric: true },
         { fields: ["Red Battery 60 day Return Rate"], format: percent, numeric: true },
         { fields: ["Red Tire 60 day Return Rate"], format: percent, numeric: true },
         { fields: ["Red Wiper 60 day Return Rate"], format: percent, numeric: true },
         { fields: ["Red Cabin Air 60 day Return Rate"], format: percent, numeric: true },
      ],
   },
];

function showMissedOppTab(tabId) {
   const panel = document.getElementById("missedOpportunitiesPanel");
   if (!panel) return;

   panel.querySelectorAll(".tab-btn").forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
   });

   panel.querySelectorAll(".tab-panel").forEach((tabPanel) => {
      tabPanel.classList.toggle("hidden", tabPanel.id !== tabId);
   });
}

function renderMissedOppTables() {
   const filtered = filterByAdvisor(svcData.missedRaw);
   svcData.missedCount = filtered.length;
   setValue("missedOpportunitiesCount", String(filtered.length));

   MISSED_OPP_GROUPS.forEach((group) => {
      renderRecordTable(group.tbodyId, filtered, group.columns, "No missed opportunities data reported.");
   });
}

async function loadMissedOpportunitiesCsv() {
   try {
      const response = await fetch(withCacheBust(MISSED_OPPORTUNITIES_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load CSV (${response.status})`);

      const csvText = await response.text();
      svcData.missedRaw = parseCsv(csvText);
      renderMissedOppTables();
   } catch (error) {
      console.error("CSV Load Error:", MISSED_OPPORTUNITIES_CSV_PATH, error);

      svcData.missedRaw = [];
      svcData.missedCount = 0;
      setValue("missedOpportunitiesCount", "—");

      MISSED_OPP_GROUPS.forEach((group) => {
         const tbody = document.getElementById(group.tbodyId);
         if (tbody) tbody.innerHTML = `<tr><td colspan="${group.columns.length}" class="muted">Unable to load data.</td></tr>`;
      });
   }
}

function svcHeroCard(kicker, title, sub, tone, jump) {
   return `<button type="button" class="hero-card ${tone === "bad" ? "tone-bad" : ""}" data-jump="${jump}">
      <div class="hero-kicker">${kicker}</div>
      <div class="hero-title">${escapeHtml(title)}</div>
      <div class="hero-sub">${escapeHtml(sub)}</div>
   </button>`;
}

function renderSvcHero() {
   const cards = [];

   if (svcData.closedCount > 0) {
      cards.push(
         svcHeroCard(
            "Act now",
            `${svcData.closedCount} closed ${pluralize(svcData.closedCount, "RO")} with open parts`,
            "Parts still attached to a closed RO",
            "bad",
            "service:closed",
         ),
      );
   }

   if (svcData.agedRows.length > 0) {
      const oldest = svcData.agedRows[0].age;
      cards.push(
         svcHeroCard(
            "Act now",
            `${svcData.agedRows.length} ${pluralize(svcData.agedRows.length, "RO")} open 10+ days`,
            `Oldest ${oldest} days`,
            "bad",
            "service:aged",
         ),
      );
   }

   if (svcData.backorderCount > 0) {
      cards.push(
         svcHeroCard(
            "Watch",
            `${svcData.backorderCount} ${pluralize(svcData.backorderCount, "RO")} waiting on parts`,
            "Parts on backorder",
            "watch",
            "service:backorder",
         ),
      );
   }

   const hero = document.getElementById("svcHero");
   hero.innerHTML =
      `<div class="hero-count"><strong>${cards.length}</strong><span>Need action today</span></div>` +
      (cards.length ? cards.join("") : `<div class="hero-empty">No open service exceptions right now.</div>`);

   wireJumpButtons(hero);
}

function renderSvcQueue() {
   const rows = [
      { count: String(svcData.closedCount), label: "Closed ROs with open parts", note: "critical", tone: "var(--r)", jump: "service:closed", show: svcData.closedCount > 0 },
      { count: String(svcData.agedRows.length), label: "ROs open 10+ days", note: svcData.agedRows[0] ? `oldest ${svcData.agedRows[0].age}d` : "", tone: "var(--r)", jump: "service:aged", show: svcData.agedRows.length > 0 },
      { count: String(svcData.backorderCount), label: "ROs waiting on parts", note: "backordered", tone: "var(--a)", jump: "service:backorder", show: svcData.backorderCount > 0 },
      { count: String(svcData.uptimeCount), label: "Uptime Assist follow-ups", note: "open", tone: "var(--a)", jump: "service:uptime", show: svcData.uptimeCount > 0 },
      { count: String(svcData.priCount), label: "Upcoming appts with PRI parts", note: "next 7 days", tone: "var(--s)", jump: "service:pri", show: svcData.priCount > 0 },
   ].filter((row) => row.show);

   const queue = document.getElementById("svcQueue");
   if (!rows.length) {
      queue.innerHTML = `<div class="queue-empty">No open service exceptions right now.</div>`;
      return;
   }

   queue.innerHTML = rows
      .map(
         (row) => `<button type="button" class="queue-row" data-jump="${row.jump}">
         <span class="queue-count" style="color:${row.tone}">${row.count}</span>
         <span class="queue-label">${escapeHtml(row.label)}</span>
         <span class="queue-note">${escapeHtml(row.note)}</span>
         <span class="queue-caret">›</span>
      </button>`,
      )
      .join("");

   wireJumpButtons(queue);
}

// ==========================================
// RETURNS (Part Return Claims) — gated
// ==========================================
// Client-side only — a speed bump against casual browsing, not real
// security. The underlying CSV is still fetchable directly by anyone with
// its raw GitHub URL, gate or no gate. Don't put anything here you
// wouldn't want technically reachable that way.
//
// To change the access code: pick a new phrase, get its SHA-256 hex
// digest (e.g. in a browser console:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("new code"))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
// ) and paste the result below. Current code: PartsReturns2026
const GATE_HASH = "31a5bbe8665027b483a1d2c392dc22954d33b38f535685732d06379c64fae3f8";
const GATE_SESSION_KEY = "partReturnsUnlocked";

async function sha256Hex(text) {
   const bytes = new TextEncoder().encode(text);
   const digest = await crypto.subtle.digest("SHA-256", bytes);
   return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function showReturnsContent() {
   document.getElementById("gate").hidden = true;
   document.getElementById("returnsContent").hidden = false;
   document.getElementById("returnsControls").hidden = state.nav !== "returns";
   loadClaims();
}

function showReturnsGate() {
   document.getElementById("returnsContent").hidden = true;
   document.getElementById("gate").hidden = false;
   document.getElementById("returnsControls").hidden = true;
}

document.getElementById("gateForm").addEventListener("submit", async function (event) {
   event.preventDefault();

   const input = document.getElementById("gatePassword");
   const errorEl = document.getElementById("gateError");
   const hash = await sha256Hex(input.value);

   if (hash === GATE_HASH) {
      sessionStorage.setItem(GATE_SESSION_KEY, "1");
      errorEl.textContent = "";
      input.value = "";
      showReturnsContent();
   } else {
      errorEl.textContent = "Incorrect access code.";
   }
});

document.getElementById("lockLink").addEventListener("click", function (event) {
   event.preventDefault();
   sessionStorage.removeItem(GATE_SESSION_KEY);
   showReturnsGate();
});

function renderClaims(records) {
   const tbody = document.getElementById("claimsTable");
   if (!tbody) return;

   const openStatuses = ["submitted", "pending", "open", "underreview"];
   const openRows = records.filter((record) => openStatuses.includes(normalizeText(getFieldValue(record, ["Status"]))));
   const openValue = openRows.reduce((total, record) => total + parseNumber(getFieldValue(record, ["Amount", "Claim Amount"])), 0);

   setValue("openClaimCount", String(openRows.length));
   setValue("openClaimValue", currency(openValue));

   if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No return claims on file yet.</td></tr>';
      return;
   }

   tbody.innerHTML = records
      .map((record) => {
         const claimNumber = getFieldValue(record, ["Claim Number", "ClaimNumber", "Claim #", "Claim"]);
         const partNumber = getFieldValue(record, ["Part Number", "PartNumber"]);
         const description = getFieldValue(record, ["Description"]);
         const submitted = getFieldValue(record, ["Date Submitted", "DateSubmitted", "Submitted"]);
         const status = getFieldValue(record, ["Status"]);
         const amount = parseNumber(getFieldValue(record, ["Amount", "Claim Amount"]));

         return `<tr>
            <td>${escapeHtml(claimNumber)}</td>
            <td>${escapeHtml(partNumber)}</td>
            <td>${escapeHtml(description)}</td>
            <td>${escapeHtml(submitted)}</td>
            <td>${escapeHtml(status)}</td>
            <td class="num">${currency(amount)}</td>
         </tr>`;
      })
      .join("");
}

async function loadClaims() {
   const tbody = document.getElementById("claimsTable");
   const btn = document.getElementById("refreshClaimsBtn");

   if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
   }

   try {
      const response = await fetch(withCacheBust(CLAIMS_CSV_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load claims CSV (${response.status})`);

      const csvText = await response.text();
      renderClaims(parseCsv(csvText));

      if (state.nav === "returns") {
         const timeText = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
         setMetaLine(`Updated ${timeText}`);
      }
   } catch (error) {
      console.error("Claims CSV Load Error:", error);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Unable to load claims data.</td></tr>';
      if (state.nav === "returns") {
         const timeText = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
         setMetaLine(`Refresh failed at ${timeText} — showing last known data`, true);
      }
   } finally {
      if (btn) {
         btn.disabled = false;
         btn.classList.remove("loading");
      }
   }
}

if (sessionStorage.getItem(GATE_SESSION_KEY) === "1") {
   showReturnsContent();
}

// ==========================================
// TRENDS
// ==========================================

const TREND_METRICS = [
   { key: "DemandFillRate", label: "Demand Fill Rate", fields: ["DemandFillRate", "Demand Fill Rate", "Shelf Fill Rate"], colorClass: "trend-b", format: percent, goodDirection: "up" },
   { key: "GrossProfitPercent", label: "Gross Profit %", fields: ["GrossProfitPercent", "Gross Profit Percent", "Gross Profit %"], colorClass: "trend-g", format: percent, goodDirection: "up" },
   { key: "LostSales", label: "Lost Sales", fields: ["LostSales", "Lost Sales"], colorClass: "trend-r", format: currencyAbbrev, axisFormat: currencyAbbrevPrecise, goodDirection: "down" },
   { key: "InventoryOnHand", label: "Inventory On-Hand", fields: ["InventoryOnHand", "Inventory On Hand"], colorClass: "trend-b", format: currencyAbbrev, axisFormat: currencyAbbrevPrecise, goodDirection: null },
   { key: "ExcessInventory", label: "Excess Inventory", fields: ["ExcessInventory", "Excess Inventory"], colorClass: "trend-a", format: percent, goodDirection: "down" },
   { key: "MonthsSupply", label: "Months Supply On Hand", fields: ["MonthsSupply", "Months Supply", "Months Supply On Hand"], colorClass: "trend-b", format: (v) => parseNumber(v).toFixed(1), goodDirection: null },
   { key: "PartsSalesToday", label: "Parts Sales (Daily)", fields: ["PartsSalesToday", "Parts Sales Today", "Parts Sales"], colorClass: "trend-g", format: currencyAbbrev, axisFormat: currencyAbbrevPrecise, goodDirection: "up" },
   { key: "Aging6to11", label: "Aging 6–11 Months", fields: ["Aging6to11", "6-11 Months", "6 to 11 Months"], colorClass: "trend-a", format: currencyAbbrev, axisFormat: currencyAbbrevPrecise, goodDirection: "down" },
   { key: "Aging12plus", label: "Aging 12+ Months", fields: ["Aging12plus", "12+ Months", "12 Plus Months"], colorClass: "trend-r", format: currencyAbbrev, axisFormat: currencyAbbrevPrecise, goodDirection: "down" },
];

const DATE_FIELDS = ["Date"];

const trendState = { fullHistory: [], loaded: false };

async function loadTrendCsv() {
   const response = await fetch(withCacheBust(TREND_CSV_PATH), { cache: "no-store" });
   if (!response.ok) throw new Error(`Unable to load trend CSV (${response.status})`);

   const csvText = await response.text();
   const records = parseCsv(csvText);

   return records
      .map((record) => {
         const dateValue = getFieldValue(record, DATE_FIELDS);
         const date = new Date(dateValue);
         return { date, raw: record };
      })
      .filter((row) => !Number.isNaN(row.date.getTime()))
      .sort((a, b) => a.date - b.date);
}

async function refreshTrendData() {
   const btn = document.getElementById("trendRefreshBtn");
   const grid = document.getElementById("trendGrid");

   if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
   }
   if (grid) grid.style.opacity = "0.6";

   try {
      trendState.fullHistory = await loadTrendCsv();
      trendState.loaded = true;

      const setupCallout = document.getElementById("setupCallout");
      const tableDetails = document.getElementById("dataTableDetails");

      if (!trendState.fullHistory.length) {
         if (setupCallout) setupCallout.hidden = false;
         if (tableDetails) tableDetails.hidden = true;
         if (grid) grid.innerHTML = "";
         if (state.nav === "trends") setMetaLine("Data through —");
      } else {
         if (setupCallout) setupCallout.hidden = true;
         if (tableDetails) tableDetails.hidden = false;

         const latest = trendState.fullHistory[trendState.fullHistory.length - 1];
         const latestText = latest.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

         renderTrendAll();
         const timeText = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
         if (state.nav === "trends") {
            setMetaLine(`Data through ${latestText} · Updated ${timeText}`);
         }
      }
   } catch (error) {
      console.error("Trend CSV Load Error:", error);
      const setupCallout = document.getElementById("setupCallout");
      if (setupCallout) setupCallout.hidden = false;
      document.getElementById("dataTableDetails").hidden = true;
      if (grid) grid.innerHTML = "";
      if (state.nav === "trends") {
         const timeText = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
         setMetaLine(`Refresh failed at ${timeText} — showing last known data`, true);
      }
   } finally {
      if (btn) {
         btn.disabled = false;
         btn.classList.remove("loading");
      }
      if (grid) grid.style.opacity = "1";
   }
}

function getFilteredTrendHistory() {
   const rangeValue = document.getElementById("rangeSelect").value;
   if (rangeValue === "all") return trendState.fullHistory;

   const days = Number(rangeValue);
   const cutoff = new Date();
   cutoff.setDate(cutoff.getDate() - days);

   return trendState.fullHistory.filter((row) => row.date >= cutoff);
}

function renderTrendAll() {
   const rows = getFilteredTrendHistory();
   renderTrendGrid(rows);
   renderTrendDataTable(rows);
}

const CHART_W = 320;
const CHART_H = 170;
const CHART_PAD_LEFT = 52;
const CHART_PAD_RIGHT = 10;
const CHART_PAD_TOP = 14;
const CHART_PAD_BOTTOM = 20;

/** Picks a "nice" axis step so gridline labels land on round numbers. */
function niceStep(rawStep) {
   const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
   const residual = rawStep / magnitude;

   let niceResidual;
   if (residual <= 1) niceResidual = 1;
   else if (residual <= 2) niceResidual = 2;
   else if (residual <= 5) niceResidual = 5;
   else niceResidual = 10;

   return niceResidual * magnitude;
}

function buildTicks(min, max) {
   if (min === max) {
      min -= 1;
      max += 1;
   }

   const step = niceStep((max - min) / 3);
   const niceMin = Math.floor(min / step) * step;
   const niceMax = Math.ceil(max / step) * step;

   const ticks = [];
   for (let v = niceMin; v <= niceMax + step / 2; v += step) {
      ticks.push(Math.round(v * 1000) / 1000);
   }

   return { ticks, min: niceMin, max: niceMax };
}

function formatDateShort(date) {
   return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Renders a single-series trend line chart into `container`. `points` is [{date, value}], sorted ascending. */
function renderLineChart(container, points, metric) {
   container.innerHTML = "";

   if (points.length < 2) {
      const msg = document.createElement("p");
      msg.className = "muted";
      msg.textContent = points.length ? "Need at least two days of data to plot a trend." : "No data in this range.";
      container.appendChild(msg);
      return;
   }

   const values = points.map((p) => p.value);
   const { ticks, min, max } = buildTicks(Math.min(...values), Math.max(...values));

   const plotW = CHART_W - CHART_PAD_LEFT - CHART_PAD_RIGHT;
   const plotH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

   const xAt = (i) => CHART_PAD_LEFT + (i / (points.length - 1)) * plotW;
   const yAt = (v) => CHART_PAD_TOP + (1 - (v - min) / (max - min)) * plotH;

   const svgNs = "http://www.w3.org/2000/svg";
   const svg = document.createElementNS(svgNs, "svg");
   svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);
   svg.classList.add("trend-svg");
   svg.setAttribute("role", "img");
   svg.setAttribute(
      "aria-label",
      `${metric.label} trend from ${formatDateShort(points[0].date)} to ${formatDateShort(points[points.length - 1].date)}`,
   );

   ticks.forEach((tickValue) => {
      const y = yAt(tickValue);
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", CHART_PAD_LEFT);
      line.setAttribute("x2", CHART_W - CHART_PAD_RIGHT);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.classList.add("trend-grid-line");
      svg.appendChild(line);

      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("x", CHART_PAD_LEFT - 6);
      label.setAttribute("y", y + 3);
      label.setAttribute("text-anchor", "end");
      label.classList.add("trend-axis-label");
      label.textContent = (metric.axisFormat || metric.format)(tickValue);
      svg.appendChild(label);
   });

   const baseline = document.createElementNS(svgNs, "line");
   baseline.setAttribute("x1", CHART_PAD_LEFT);
   baseline.setAttribute("x2", CHART_W - CHART_PAD_RIGHT);
   baseline.setAttribute("y1", CHART_H - CHART_PAD_BOTTOM);
   baseline.setAttribute("y2", CHART_H - CHART_PAD_BOTTOM);
   baseline.classList.add("trend-axis");
   svg.appendChild(baseline);

   [0, points.length - 1].forEach((i) => {
      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("x", xAt(i));
      label.setAttribute("y", CHART_H - 4);
      label.setAttribute("text-anchor", i === 0 ? "start" : "end");
      label.classList.add("trend-axis-label");
      label.textContent = formatDateShort(points[i].date);
      svg.appendChild(label);
   });

   const pathData = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ");
   const path = document.createElementNS(svgNs, "path");
   path.setAttribute("d", pathData);
   path.classList.add("trend-line", metric.colorClass);
   svg.appendChild(path);

   const lastIndex = points.length - 1;
   const endX = xAt(lastIndex);
   const endY = yAt(points[lastIndex].value);

   const endDot = document.createElementNS(svgNs, "circle");
   endDot.setAttribute("cx", endX);
   endDot.setAttribute("cy", endY);
   endDot.setAttribute("r", 4.5);
   endDot.classList.add("trend-end", metric.colorClass);
   svg.appendChild(endDot);

   const endLabel = document.createElementNS(svgNs, "text");
   endLabel.setAttribute("x", Math.min(endX, CHART_W - CHART_PAD_RIGHT - 4));
   endLabel.setAttribute("y", Math.max(endY - 8, 10));
   endLabel.setAttribute("text-anchor", "end");
   endLabel.classList.add("trend-end-label");
   endLabel.textContent = metric.format(points[lastIndex].value);
   svg.appendChild(endLabel);

   const crosshair = document.createElementNS(svgNs, "line");
   crosshair.setAttribute("y1", CHART_PAD_TOP);
   crosshair.setAttribute("y2", CHART_H - CHART_PAD_BOTTOM);
   crosshair.classList.add("trend-crosshair");
   crosshair.style.display = "none";
   svg.appendChild(crosshair);

   const hoverDot = document.createElementNS(svgNs, "circle");
   hoverDot.setAttribute("r", 4);
   hoverDot.classList.add("trend-hover-dot", metric.colorClass);
   hoverDot.style.display = "none";
   svg.appendChild(hoverDot);

   const hitRect = document.createElementNS(svgNs, "rect");
   hitRect.setAttribute("x", CHART_PAD_LEFT);
   hitRect.setAttribute("y", 0);
   hitRect.setAttribute("width", plotW);
   hitRect.setAttribute("height", CHART_H);
   hitRect.classList.add("trend-hit");
   svg.appendChild(hitRect);

   container.appendChild(svg);

   const tooltip = document.createElement("div");
   tooltip.className = "trend-tooltip";
   tooltip.hidden = true;
   container.appendChild(tooltip);

   let activeIndex = lastIndex;

   function showAt(index) {
      activeIndex = Math.max(0, Math.min(points.length - 1, index));
      const point = points[activeIndex];
      const x = xAt(activeIndex);
      const y = yAt(point.value);

      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.style.display = "";

      hoverDot.setAttribute("cx", x);
      hoverDot.setAttribute("cy", y);
      hoverDot.style.display = "";

      tooltip.innerHTML = "";
      const valueEl = document.createElement("div");
      valueEl.className = "tt-value";
      valueEl.textContent = metric.format(point.value);
      const dateEl = document.createElement("div");
      dateEl.className = "tt-date";
      dateEl.textContent = point.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      tooltip.appendChild(valueEl);
      tooltip.appendChild(dateEl);

      tooltip.style.left = `${(x / CHART_W) * 100}%`;
      tooltip.style.top = `${(y / CHART_H) * 100}%`;
      tooltip.hidden = false;
   }

   function hideTooltip() {
      crosshair.style.display = "none";
      hoverDot.style.display = "none";
      tooltip.hidden = true;
   }

   function indexFromClientX(clientX) {
      const rect = svg.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * CHART_W;
      const ratio = (relX - CHART_PAD_LEFT) / plotW;
      return Math.round(ratio * (points.length - 1));
   }

   hitRect.addEventListener("pointermove", (event) => showAt(indexFromClientX(event.clientX)));
   hitRect.addEventListener("pointerleave", hideTooltip);

   container.tabIndex = 0;
   container.addEventListener("focus", () => showAt(lastIndex));
   container.addEventListener("blur", hideTooltip);
   container.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
         event.preventDefault();
         showAt(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
         event.preventDefault();
         showAt(activeIndex + 1);
      } else if (event.key === "Home") {
         event.preventDefault();
         showAt(0);
      } else if (event.key === "End") {
         event.preventDefault();
         showAt(lastIndex);
      } else if (event.key === "Escape") {
         hideTooltip();
      }
   });
}

function renderTrendGrid(rows) {
   const grid = document.getElementById("trendGrid");
   grid.innerHTML = "";

   if (rows.length < 2) {
      const empty = document.createElement("p");
      empty.className = "trend-empty";
      empty.textContent = "Not enough history in this date range yet — try a wider range, or check back after a few more days of data.";
      grid.appendChild(empty);
      return;
   }

   TREND_METRICS.forEach((metric) => {
      const points = rows.map((row) => ({ date: row.date, value: parseNumber(getFieldValue(row.raw, metric.fields)) }));

      const card = document.createElement("div");
      card.className = "trend-card";

      const heading = document.createElement("h3");
      heading.textContent = metric.label;
      card.appendChild(heading);

      const latest = points[points.length - 1].value;
      const previous = points[points.length - 2].value;
      const delta = Math.round((latest - previous) * 100) / 100;

      const headline = document.createElement("div");
      headline.className = "trend-headline";

      const valueEl = document.createElement("span");
      valueEl.className = "trend-value";
      valueEl.textContent = metric.format(latest);
      headline.appendChild(valueEl);

      const deltaEl = document.createElement("span");
      const isGood = metric.goodDirection === "up" ? delta >= 0 : metric.goodDirection === "down" ? delta <= 0 : null;
      deltaEl.className = "trend-delta " + (isGood === null ? "neutral" : isGood ? "good" : "bad");
      const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "▬";
      deltaEl.textContent = `${arrow} ${metric.format(Math.abs(delta))} vs prior day`;
      headline.appendChild(deltaEl);

      card.appendChild(headline);

      const chartWrap = document.createElement("div");
      chartWrap.className = "trend-chart-wrap";
      card.appendChild(chartWrap);

      grid.appendChild(card);

      renderLineChart(chartWrap, points, metric);
   });
}

function renderTrendDataTable(rows) {
   const head = document.getElementById("dataTableHead");
   const body = document.getElementById("dataTableBody");

   head.innerHTML = "";
   body.innerHTML = "";

   const dateTh = document.createElement("th");
   dateTh.textContent = "Date";
   head.appendChild(dateTh);

   TREND_METRICS.forEach((metric) => {
      const th = document.createElement("th");
      th.textContent = metric.label;
      head.appendChild(th);
   });

   [...rows].reverse().forEach((row) => {
      const tr = document.createElement("tr");

      const dateTd = document.createElement("td");
      dateTd.textContent = row.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      tr.appendChild(dateTd);

      TREND_METRICS.forEach((metric) => {
         const td = document.createElement("td");
         td.className = "num";
         td.textContent = metric.format(parseNumber(getFieldValue(row.raw, metric.fields)));
         tr.appendChild(td);
      });

      body.appendChild(tr);
   });
}

document.getElementById("rangeSelect").addEventListener("change", () => {
   if (trendState.fullHistory.length) renderTrendAll();
});

// ==========================================
// STARTUP
// ==========================================

document.querySelectorAll(".rail-btn[data-nav]").forEach((btn) => {
   btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

document.querySelectorAll('#segParts, #segService').forEach((label) => {
   label.querySelector("input").addEventListener("change", (event) => setDept(event.target.value));
});

document.querySelectorAll("#partsTabs .tabbar-btn, #svcTabs .tabbar-btn").forEach((btn) => {
   btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

wireJumpButtons(document);
wireTableFilter("posFilter", "openPosQueue");

window.addEventListener("load", function () {
   const route = parseHash();
   if (route) {
      applyRoute(route);
   }
   render();
   updateHash();

   refreshDailyData();

   if (state.nav === "returns" && sessionStorage.getItem(GATE_SESSION_KEY) === "1") {
      loadClaims();
   }
   if (state.nav === "trends") {
      refreshTrendData();
   }

   if (REFRESH_INTERVAL_MS > 0) {
      setInterval(refreshDailyData, REFRESH_INTERVAL_MS);
   }
});
