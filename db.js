require('dotenv').config();
const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  const isSSL = process.env.NODE_ENV === 'production' || 
                process.env.DATABASE_URL.includes('render.com') ||
                process.env.DATABASE_URL.includes('dpg-') ||
                process.env.DATABASE_URL.includes('neon.tech') ||
                process.env.DATABASE_URL.includes('sslmode=require');
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isSSL ? { rejectUnauthorized: false } : false
  });
}

// ─── Tạo bảng tự động khi khởi động ──────────────────────
async function initDB() {
  if (!pool) {
    console.warn('⚠️ [DB Warning] DATABASE_URL chưa được thiết lập. Hãy thêm biến môi trường DATABASE_URL trong Render Environment.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS contestants (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255) DEFAULT '',
        color VARCHAR(20) DEFAULT '#0057a8',
        photo TEXT DEFAULT '',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        vote_id VARCHAR(100) UNIQUE NOT NULL,
        contestant_id VARCHAR(10) NOT NULL REFERENCES contestants(id) ON DELETE CASCADE,
        voter_name VARCHAR(255) DEFAULT 'Người ẩn danh',
        comment TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        contestant_id VARCHAR(10) REFERENCES contestants(id) ON DELETE CASCADE,
        sharer_name VARCHAR(255) DEFAULT 'Người dùng',
        platform VARCHAR(50) DEFAULT 'facebook',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed default contestants nếu bảng trống
    const { rows } = await client.query('SELECT COUNT(*) as cnt FROM contestants');
    if (parseInt(rows[0].cnt) === 0) {
      const defaults = [
        { id: '01', name: 'Thí sinh 01', subtitle: 'Đến từ Hà Nội',    color: '#0057a8' },
        { id: '02', name: 'Thí sinh 02', subtitle: 'Đến từ TP.HCM',    color: '#003d7a' },
        { id: '03', name: 'Thí sinh 03', subtitle: 'Đến từ Đà Nẵng',   color: '#005299' },
        { id: '04', name: 'Thí sinh 04', subtitle: 'Đến từ Cần Thơ',   color: '#0057a8' },
        { id: '05', name: 'Thí sinh 05', subtitle: 'Đến từ Huế',       color: '#003d7a' },
        { id: '06', name: 'Thí sinh 06', subtitle: 'Đến từ Nha Trang', color: '#005299' },
      ];
      for (const c of defaults) {
        await client.query(
          'INSERT INTO contestants (id, name, subtitle, color, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
          [c.id, c.name, c.subtitle, c.color, parseInt(c.id)]
        );
      }
      console.log('✅ Seeded default contestants');
    }

    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ Lỗi kết nối / khởi tạo DB:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
