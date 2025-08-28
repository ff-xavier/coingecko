// File: cg_coins_markets_all.js
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.COINGECKO_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing COINGECKO_API_KEY in .env");
  process.exit(1);
}

// ---- Config (tweak as needed) ----
const VS_CURRENCY = process.env.CG_VS_CURRENCY || "usd";
const ORDER = process.env.CG_ORDER || "market_cap_desc";
const PER_PAGE = 250; // max allowed
const BASE_URL = "https://pro-api.coingecko.com/api/v3/coins/markets";
const MAX_PAGES = 200; // safety cap
const REQUEST_DELAY_MS = 250;

const DATA_DIR = "data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchPage(page) {
  const { data, headers } = await axios.get(BASE_URL, {
    params: {
      vs_currency: VS_CURRENCY,
      order: ORDER,
      per_page: PER_PAGE,
      page,
      // You can add extras if needed (they'll be ignored in CSV if nested):
      // price_change_percentage: "1h,24h,7d,30d,1y",
      // sparkline: true,
    },
    headers: {
      accept: "application/json",
      "x-cg-pro-api-key": API_KEY,
    },
    timeout: 30_000,
  });

  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  if (remaining !== undefined) {
    console.log(
      `   ↳ RateLimit remaining: ${remaining}${
        reset ? `, resets in ~${reset}s` : ""
      }`
    );
  }

  return data;
}

async function fetchAllPages() {
  let page = 1;
  let all = [];
  console.log(
    `▶️  Fetching coins/markets pages (vs_currency=${VS_CURRENCY}, per_page=${PER_PAGE})...`
  );

  while (page <= MAX_PAGES) {
    console.log(`→ Page ${page}`);
    let rows;
    try {
      rows = await fetchPage(page);
    } catch (err) {
      const msg = err.response?.data || err.message;
      console.error(`❌ Error on page ${page}:`, msg);
      await sleep(1500);
      try {
        console.log(`↻ Retrying page ${page}...`);
        rows = await fetchPage(page);
      } catch (err2) {
        console.error(
          `❌ Failed again on page ${page}. Stopping. Last error:`,
          err2.response?.data || err2.message
        );
        break;
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("✅ No more data returned. Pagination complete.");
      break;
    }

    all = all.concat(rows);
    if (rows.length < PER_PAGE) {
      console.log("✅ Final partial page received. Pagination complete.");
      break;
    }

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  // de-duplicate by id just in case
  const deduped = [];
  const seen = new Set();
  for (const r of all) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      deduped.push(r);
    }
  }

  return deduped;
}

// ----- CSV helpers (top-level primitives only) -----
function isPrimitiveCSVValue(v) {
  const t = typeof v;
  return v === null || t === "string" || t === "number" || t === "boolean";
}

function collectPrimitiveKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (isPrimitiveCSVValue(v)) keys.add(k);
    }
  }
  return keys;
}

// Prefer a sensible column order if present, then append the rest (sorted)
const PREFERRED_ORDER = [
  "id",
  "symbol",
  "name",
  "market_cap_rank",
  "current_price",
  "market_cap",
  "fully_diluted_valuation",
  "total_volume",
  "high_24h",
  "low_24h",
  "price_change_24h",
  "price_change_percentage_24h",
  "circulating_supply",
  "total_supply",
  "max_supply",
  "ath",
  "ath_change_percentage",
  "ath_date",
  "atl",
  "atl_change_percentage",
  "atl_date",
  "last_updated",
  "image", // url string
];

function buildOrderedHeaders(allKeys) {
  const presentPreferred = PREFERRED_ORDER.filter((k) => allKeys.has(k));
  const remaining = [...allKeys].filter((k) => !presentPreferred.includes(k));
  remaining.sort((a, b) => a.localeCompare(b));
  return [...presentPreferred, ...remaining];
}

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  let s = String(val);
  if (s.includes('"')) s = s.replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) s = `"${s}"`;
  return s;
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const allKeys = collectPrimitiveKeys(rows);
  const headers = buildOrderedHeaders(allKeys);
  const headerLine = headers.join(",");

  const lines = rows.map((row) =>
    headers
      .map((k) => (isPrimitiveCSVValue(row[k]) ? csvEscape(row[k]) : ""))
      .join(",")
  );

  return [headerLine, ...lines].join("\n");
}

async function main() {
  try {
    const results = await fetchAllPages();

    // JSON output
    const jsonOut = path.join(DATA_DIR, "coins_markets_all.json");
    fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
    console.log(`💾 Saved ${results.length} rows to ${jsonOut}`);

    // CSV output (top-level primitive fields only)
    const csv = toCSV(results);
    const csvOut = path.join(DATA_DIR, "coins_markets_all.csv");
    fs.writeFileSync(csvOut, csv, "utf8");
    console.log(`💾 Saved CSV to ${csvOut}`);
  } catch (error) {
    console.error("❌ Unhandled error:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
