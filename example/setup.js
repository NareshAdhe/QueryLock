// setup.js
require('dotenv').config();
const { Pool } = require('pg');
const QueryLock = require('query-lock'); 

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
    console.log("🛠️  Starting Database Setup via QueryLock...");

    const db = new QueryLock({
        db: { type: 'postgres', client: pool },
        ai: { llm: 'gemini', apiKey: process.env.GEMINI_API_KEY }
    });

    try {
        // Optional: Manual cleanup to ensure a clean slate
        console.log("🧹 Cleaning old tables...");
        await pool.query("DROP TABLE IF EXISTS orders, products, users CASCADE;");

        // 1. Create Schema
        console.log("🏗️  Creating Schema...");
        await db.define(
            'setup_schema', 
            `Create a normalized schema for an e-commerce system with three tables:
             1. 'users' (id, name, email, join_date)
             2. 'products' (id, name, category, price, stock_quantity)
             3. 'orders' (id, user_id, product_id, quantity, order_date).
             Ensure appropriate Foreign Keys.`
        );

        // 2. Seed Data
        console.log("🌱 Seeding Mock Data...");
        await db.create(
            'seed_data',
            `Insert the following data:
             - 5 users with realistic names.
             - 5 electronics products with prices $500-$2000.
             - 10 orders distributing these products randomly.`
        );

        console.log("✅ Database Setup Complete! You can now run 'node main.js'");

    } catch (err) {
        console.error("❌ Setup Failed:", err.message);
    } finally {
        await pool.end();
    }
}

seed();