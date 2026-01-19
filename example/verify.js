require('dotenv').config();
const { Pool } = require('pg');

// Create a direct connection to the database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verify() {
    try {
        console.log("🕵️  Verifying Database Content...\n");

        // 1. Check Tables
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        console.log("📋 Tables Found:");
        console.table(tables.rows);

        // 2. Check Row Counts
        const counts = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as users_count,
                (SELECT COUNT(*) FROM products) as products_count,
                (SELECT COUNT(*) FROM orders) as orders_count;
        `);
        console.log("\n📊 Data Counts:");
        console.table(counts.rows);

        // 3. Peek at the Data (First 3 rows of each)
        console.log("\n👀 Sample Data (First 3 Users):");
        const users = await pool.query('SELECT * FROM users LIMIT 3');
        console.table(users.rows);

        console.log("\n👀 Sample Data (First 3 Products):");
        const products = await pool.query('SELECT * FROM products LIMIT 3');
        console.table(products.rows);

    } catch (err) {
        console.error("❌ Verification Failed:", err.message);
    } finally {
        await pool.end();
    }
}

verify();