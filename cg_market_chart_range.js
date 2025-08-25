import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.COINGECKO_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing COINGECKO_API_KEY in .env");
  process.exit(1);
}

// Coingecko Pro API endpoint
const url =
  "https://pro-api.coingecko.com/api/v3/coins/bitcoin/market_chart/range";

// UNIX timestamps required by Coingecko
const fromDate = Math.floor(new Date("2024-01-01").getTime() / 1000);
const toDate = Math.floor(new Date("2024-12-31").getTime() / 1000);

async function fetchData() {
  try {
    const response = await axios.get(url, {
      params: {
        vs_currency: "usd",
        from: fromDate,
        to: toDate,
      },
      headers: {
        accept: "application/json",
        "x-cg-pro-api-key": API_KEY,
      },
    });

    // Save response to JSON file
    fs.writeFileSync(
      "data/bitcoin_data.json",
      JSON.stringify(response.data, null, 2)
    );
    console.log("✅ Data saved to bitcoin_data.json");
  } catch (error) {
    console.error(
      "❌ Error fetching data:",
      error.response?.data || error.message
    );
  }
}

fetchData();
