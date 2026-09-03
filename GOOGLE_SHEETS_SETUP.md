# Manual KPI updates via Google Sheets

The dashboard reads each data feed as CSV over `fetch()`. Instead of editing
a CSV file and committing it to GitHub, you can put the data in a Google
Sheet and have the dashboard read it live — anyone with edit access to the
sheet can update the numbers without touching code or Git.

## One-time setup, per feed

Each feed below is its own **sheet tab** inside a Google Sheet (one workbook
with multiple tabs is fine).

Do **not** use File > Share > Publish to web here — its CSV export
(`/pub?output=csv`) works fine when you open the link directly in a
browser, but Google's anti-abuse layer blocks the cross-origin `fetch()`
the dashboard needs, redirecting it to a sign-in wall instead. Use the
Visualization API CSV export instead, which is the standard technique for
reading a public Sheet from client-side JS and does support cross-origin
`fetch()`:

1. Click **Share** (top right) and set **General access** to
   **Anyone with the link** → **Viewer**.
2. Get the spreadsheet ID from the address bar while the sheet is open:
   `https://docs.google.com/spreadsheets/d/`**`SPREADSHEET_ID`**`/edit#gid=...`
3. Get the tab's `gid` from the same URL (the number after `gid=`) —
   switch to the tab first if you're not sure which one it is.
4. Build the feed URL as:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq?tqx=out:csv&gid=GID`
5. Paste that URL into the matching constant listed below, then commit.

The spreadsheet ID is the same for every tab in one workbook — only `gid`
changes between feeds.

**Google caches this endpoint for a few minutes**, so a sheet edit can take
a little while to show up on the dashboard even though the page itself
re-fetches every 5 minutes (`REFRESH_INTERVAL_MS`) or on demand via the
"Refresh KPI Data" button.

**Number formatting in the sheet:** if a cell is formatted as Currency or
Percent, the published CSV contains the *displayed text* (`"$624,000.00"`,
`"94.20%"`), not the underlying number. The dashboard code strips `$`, `,`,
and `%` before doing math, so formatted cells work, but two things still
trip people up:
- A negative number shown in accounting style with parentheses, e.g.
  `"($3,240.03)"`, loses its sign once the parentheses are stripped — it
  will display as a positive value. Use a plain minus sign (`-3240.03`)
  for negatives instead.
- It's simplest to just leave KPI cells formatted as **Plain text** or
  **Number** (no currency/percent symbol) and let the dashboard add the
  `$`/`%` for display — one less place for the two to disagree.

Row 1 of each tab must be the header row, using (or close to) the column
names listed below — matching is case- and punctuation-insensitive, and a
few common alternate wordings are accepted, but the header text still has
to be recognizable. If a column can't be matched, that card/row will show
blank or `0` rather than break the page.

## Feeds and their columns

### Main KPI feed — `CSV_PATH` (`index.html` and `service-department.html`)

One data row with the latest values. Columns (accepted alternates in
parentheses):

| Column | Notes |
|---|---|
| `DemandFillRate` (Demand Fill Rate, Shelf Fill Rate) | number, no `%` |
| `GrossProfitPercent` (Gross Profit Percent, Gross Profit %) | number, no `%` |
| `LostSales` (Lost Sales) | dollars |
| `BackorderLines` (Backorder Lines) | count |
| `InventoryOnHand` (Inventory On Hand) | dollars |
| `Obsolescence` | number, no `%` |
| `WorkInProcess` (Work In Process) | dollars — shown on Service page |
| `ExcessInventory` (Excess Inventory) | number, no `%` |
| `PartsSalesToday` (Parts Sales Today, Parts Sales) | dollars |
| `GrossProfitToday` (Gross Profit Today) | dollars |
| `OverrideLines` (Override Lines) | count |
| `OverrideGPImpact` (Override GP Impact) | dollars |
| `UnrealizedSales` (Unrealized Sales) | dollars |
| `UnrealizedGP` (Unrealized GP) | dollars |
| `InternalSales` (Internal Sales) | dollars |
| `SalesByEP` (Sales By EP) | dollars |

### Inventory aging — `AGING_CSV_PATH` (`index.html` only)

Sheet tab: `InventoryAgingbyValue`. One data row, the current aging-by-value
split:

| Column | Notes |
|---|---|
| `Aging6to11` (6-11 Months) | dollars |
| `Aging12plus` (12+ Months) | dollars |

### Open Purchase Orders — `OPEN_POS_CSV_PATH` (`index.html` only)

One row per open PO. Every row shown as-is, no filtering.

| Column |
|---|
| `PO` (PO Number, PO#) |
| `Vendor` (Supplier) |
| `Order Date` |
| `ETA` (Expected, Expected Date) |
| `Status` |
| `Amount` (PO Amount, Total) — dollars |

### Aged Service ROs — `AGED_RO_CSV_PATH` (`service-department.html`)

One row per open RO. Only ROs at or above 30 days old show in the queue
(`AGED_RO_THRESHOLD_DAYS`).

| Column | Notes |
|---|---|
| `RO` (RO Number) | RO number |
| `Age Days` (Age) | if omitted, age is calculated from `Open Date` instead |
| `Open Date` | only used when `Age Days` is blank |
| `Status` | |
| `Description` (Part Description, or Part Number) | |
| `Sale` (Sale Amount) | dollars |

### Backordered Parts ROs — `BACKORDERED_PARTS_CSV_PATH` (`service-department.html`)

One row per backordered part. Every row shown as-is, no filtering.

| Column |
|---|
| `RO` (RO Number) |
| `Part Number` (Part #) |
| `Description` |
| `Status` |
| `ETA` (Backorder ETA, Expected) |

### Uptime Assist — `UPTIME_ASSIST_CSV_PATH` (`service-department.html`)

| Column |
|---|
| `Customer` |
| `Vehicle` |
| `Reason` |
| `Due Date` |
| `Status` |

### Upcoming PRI Appointments — `UPCOMING_PRI_CSV_PATH` (`service-department.html`)

| Column |
|---|
| `Appt Date` (Appointment Date) |
| `Customer` |
| `Part Number` (Part #) |
| `Status` |

### Missed Opportunities — `MISSED_OPPORTUNITIES_CSV_PATH` (`service-department.html`)

One row per service advisor. Every row shown as-is, no filtering.

| Column |
|---|
| `Dealer Code` |
| `Service Advisor ID` |
| `Total Repair Orders` |
| `Customer Pay Missed Opportunity` |
| `Missed Opportunity (Warranty)` |
| `Missed Opportunity (Recall)` |
| `Missed Opportunity (Red Coding)` |
| `Warr RO w/o CP and Recall` |
| `Recall RO w/o CP` |
| `MPI+3 RO` |
| `MPI+3 Utilization %` |
| `Red Brake Count` |
| `Red Battery Count` |
| `Red Tire Count` |
| `Red Wiper Count` |
| `Red Cabin Air Filter Count` |
| `Brake Penetration %` |
| `Battery Penetration %` |
| `Tire Penetration %` |
| `Wiper Penetration %` |
| `Cabin Air Filter Penetration %` |
| `Red Brake 60 day Return Rate` |
| `Red Battery 60 day Return Rate` |
| `Red Tire 60 day Return Rate` |
| `Red Wiper 60 day Return Rate` |
| `Red Cabin Air 60 day Return Rate` |
| `Total VIN #` |
| `Recall ROs Missing MPI+3` |
| `Warranty ROs Missing MPI+3` |


### Trend history — `TREND_CSV_PATH` (`trend-analysis.html` only)

This feed works differently from every other one on this page: instead of
one row that gets **overwritten** each time the numbers change, this tab
gets a **new row appended every day**, so the dashboard can chart how each
number moves over time. Row 1 is still the header row.

| Column | Notes |
|---|---|
| `Date` | any format `new Date()` can parse, e.g. `2026-09-02` |
| `DemandFillRate` (Demand Fill Rate, Shelf Fill Rate) | number, no `%` |
| `GrossProfitPercent` (Gross Profit Percent, Gross Profit %) | number, no `%` |
| `LostSales` (Lost Sales) | dollars |
| `InventoryOnHand` (Inventory On Hand) | dollars |
| `ExcessInventory` (Excess Inventory) | number, no `%` |
| `MonthsSupply` (Months Supply, Months Supply On Hand) | number |
| `PartsSalesToday` (Parts Sales Today, Parts Sales) | dollars |
| `Aging6to11` (6-11 Months) | dollars |
| `Aging12plus` (12+ Months) | dollars |

Set it up the same way as every other feed (see steps 1-5 above), then paste
the CSV URL into `TREND_CSV_PATH` in `trend-analysis.html`.

**Adding a row every day.** The simplest approach: once a day, copy that
day's values from the main `KPI` tab and the `InventoryAgingbyValue` tab
into a new row at the bottom of the history tab. To automate it instead,
open **Extensions → Apps Script** on the spreadsheet, paste this in, then
add a time-driven trigger (Triggers ⏱ → Add Trigger → `snapshotDailyHistory`
→ Day timer → whatever time your numbers are finalized, e.g. 6pm):

```javascript
function snapshotDailyHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kpi = ss.getSheetByName("KPI"); // main KPI tab (CSV_PATH, gid=0)
  const aging = ss.getSheetByName("InventoryAgingbyValue");
  const history = ss.getSheetByName("History");

  // Row 2 holds the current values on both source tabs (row 1 is headers).
  const kpiHeaders = kpi.getRange(1, 1, 1, kpi.getLastColumn()).getValues()[0];
  const kpiValues = kpi.getRange(2, 1, 1, kpi.getLastColumn()).getValues()[0];
  const agingHeaders = aging.getRange(1, 1, 1, aging.getLastColumn()).getValues()[0];
  const agingValues = aging.getRange(2, 1, 1, aging.getLastColumn()).getValues()[0];

  function find(headers, values, name) {
    const index = headers.indexOf(name);
    return index === -1 ? "" : values[index];
  }

  history.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    find(kpiHeaders, kpiValues, "DemandFillRate"),
    find(kpiHeaders, kpiValues, "GrossProfitPercent"),
    find(kpiHeaders, kpiValues, "LostSales"),
    find(kpiHeaders, kpiValues, "InventoryOnHand"),
    find(kpiHeaders, kpiValues, "ExcessInventory"),
    find(kpiHeaders, kpiValues, "MonthsSupply"),
    find(kpiHeaders, kpiValues, "PartsSalesToday"),
    find(agingHeaders, agingValues, "Aging6to11"),
    find(agingHeaders, agingValues, "Aging12plus"),
  ]);
}
```

Adjust the sheet/tab names and column names in the script to match yours —
this is a starting point, not a drop-in fit for every spreadsheet layout.

## Where the URLs live in code

- `index.html`: `CSV_PATH`, `AGING_CSV_PATH`, `OPEN_POS_CSV_PATH` (in the `CONFIG` section of the `<script>`)
- `service-department.html`: `CSV_PATH`, `AGED_RO_CSV_PATH`, `BACKORDERED_PARTS_CSV_PATH`,
  `UPTIME_ASSIST_CSV_PATH`, `UPCOMING_PRI_CSV_PATH`, `MISSED_OPPORTUNITIES_CSV_PATH` (same `CONFIG` section)
- `trend-analysis.html`: `TREND_CSV_PATH` (same `CONFIG` section)

Until each constant is swapped to a published Google Sheets link, it keeps
pointing at the existing GitHub CSV snapshot, so the dashboard keeps
working while you migrate feeds one at a time.
