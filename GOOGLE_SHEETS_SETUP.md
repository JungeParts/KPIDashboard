# Manual KPI updates via Google Sheets

The dashboard reads each data feed as CSV over `fetch()`. Instead of editing
a CSV file and committing it to GitHub, you can put the data in a Google
Sheet and have the dashboard read it live — anyone with edit access to the
sheet can update the numbers without touching code or Git.

## One-time setup, per feed

Each feed below is its own **sheet tab** inside a Google Sheet (one workbook
with multiple tabs is fine — publish each tab separately).

1. Open the Google Sheet, right-click the tab for this feed.
2. **File > Share > Publish to web**.
3. Under **Link**, choose the specific sheet tab — not "Entire Document".
4. In the format dropdown, choose **Comma-separated values (.csv)**.
5. Click **Publish** and confirm. Copy the generated link — it looks like
   `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=123&single=true&output=csv`.
6. Paste that link into the matching `TODO` constant listed below, replacing
   the existing `raw.githubusercontent.com/...` value, then commit.

**Google caches published CSVs for a few minutes**, so a sheet edit can take
up to ~5 minutes to show up on the dashboard even though the page itself
re-fetches every 5 minutes (`REFRESH_INTERVAL_MS`) or on demand via the
"Refresh KPI Data" button.

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

One data row, the current aging-by-value split:

| Column | Notes |
|---|---|
| `Aging0to6` (0-6 Months) | dollars |
| `Aging7to12` (7-12 Months) | dollars |
| `Aging13to24` (13-24 Months) | dollars |
| `Aging25plus` (25+ Months) | dollars |

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

## Where the URLs live in code

- `index.html`: `CSV_PATH`, `AGING_CSV_PATH` (in the `CONFIG` section of the `<script>`)
- `service-department.html`: `CSV_PATH`, `AGED_RO_CSV_PATH`, `BACKORDERED_PARTS_CSV_PATH`,
  `UPTIME_ASSIST_CSV_PATH`, `UPCOMING_PRI_CSV_PATH` (same `CONFIG` section)

Until each constant is swapped to a published Google Sheets link, it keeps
pointing at the existing GitHub CSV snapshot, so the dashboard keeps
working while you migrate feeds one at a time.
