// main.js
require('dotenv').config();
const { Pool } = require('pg');

const QueryLock = require('query-lock');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    console.log("🚀 Starting Application...\n");

    const db = new QueryLock({
        db: { type: 'postgres', client: pool },
        ai: { llm: 'gemini', apiKey: process.env.GEMINI_API_KEY }
    });

    try {
        // Query 1: High Value Customers (Complex Join + Aggregation)
        console.log("------------------------------------------------");
        const topSpenders = await db.read("get_top_spenders",
            `List the top 3 users who have spent the most money. 
             Show names and total_spent. Order by total_spent descending.`)
        console.log("💰 Top Spenders:");
        console.table(topSpenders.rows);

        // Query 2: Low Stock Alert (Filtering)
        console.log("\n------------------------------------------------");
        const lowStock = await db.read(
            'check_low_stock',
            `List products with stock_quantity < 50.`
        );
        console.log("⚠️ Low Stock Alert (< 50):");
        console.table(lowStock.rows);

        // Query 3: Recent Activity (Sorting)
        console.log("\n------------------------------------------------");
        const recent = await db.read(
            'recent_orders',
            `Show details of the 5 most recent orders.
             Include User Name, Product Name, Price, and Order Date.`
        );
        console.log("📅 Recent Activity (Last 5 Orders):");
        console.table(recent.rows);

    } catch (err) {
        console.error("❌ Application Error:", err.message);
    } finally {
        await pool.end();
    }
}

main();