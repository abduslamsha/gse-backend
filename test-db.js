const pool = require("./src/config/db");

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("✅ Database connected!");
        console.log("Time:", result.rows[0].now);
    } catch (error) {
        console.error("❌ Database connection error:", error.message);
    }
    process.exit();
}

testConnection();