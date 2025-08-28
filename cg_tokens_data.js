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
// Optional safety cap on pages in case of unexpected API behavior
const MAX_PAGES = 200; // 200 * 250 = 50,000 rows
const REQUEST_DELAY_MS = 250; // small delay to be gentle on rate limits

// ensure ./data exists
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
      // optional extras you may want:
      // price_change_percentage: "1h,24h,7d,30d,1y",
      // sparkline: true,
      // locale: "en"
    },
    headers: {
      accept: "application/json",
      "x-cg-pro-api-key": API_KEY,
    },
    timeout: 30_000,
  });

  // Optional: inspect rate-limit headers if present
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
      // Simple retry once after a brief backoff
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

  // (Optional) de-duplicate by id just in case
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

async function main() {
  try {
    const results = await fetchAllPages();

    const outfile = path.join(DATA_DIR, "coins_markets_all.json");
    fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
    console.log(
      `💾 Saved ${results.length} rows to ${outfile} (vs_currency=${VS_CURRENCY}, order=${ORDER})`
    );
  } catch (error) {
    console.error("❌ Unhandled error:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
