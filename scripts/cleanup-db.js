/**
 * cleanup-db.js — Dọn dẹp ảnh base64 khỏi Neon DB
 * Chạy: node scripts/cleanup-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Không tìm thấy DATABASE_URL trong biến môi trường.');
  console.log('   Hãy tạo file .env với: DATABASE_URL=postgresql://...');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function cleanup() {
  const client = await pool.connect();
  try {
    console.log('🔗 Đã kết nối Neon DB...\n');

    // ── BƯỚC 1: Đếm ảnh base64 còn trong contestants ──
    const { rows: b64Check } = await client.query(`
      SELECT COUNT(*)::int as cnt,
             SUM(LENGTH(photo))::bigint as total_bytes
      FROM contestants
      WHERE photo LIKE 'data:image/%'
    `);
    const base64Count = b64Check[0].cnt;
    const base64MB = ((b64Check[0].total_bytes || 0) / 1024 / 1024).toFixed(2);
    console.log('📊 Ảnh base64 trong bảng contestants: ' + base64Count + ' ảnh (~' + base64MB + ' MB)');

    // ── BƯỚC 2: Đếm ảnh base64 trong vote_archives ──
    const { rows: arcCheck } = await client.query(`
      SELECT COUNT(*)::int as cnt FROM vote_archives
      WHERE contestants_data LIKE '%data:image/%'
    `);
    console.log('📦 Bản lưu trữ có chứa ảnh base64: ' + arcCheck[0].cnt + ' bản\n');

    if (base64Count === 0 && arcCheck[0].cnt === 0) {
      console.log('✅ DB đã sạch! Không còn ảnh base64 nào.');
      return;
    }

    // ── BƯỚC 3: Xóa ảnh base64 trong contestants (giữ URL http/https và /uploads/) ──
    if (base64Count > 0) {
      const { rowCount: cleaned } = await client.query(`
        UPDATE contestants
        SET photo = ''
        WHERE photo LIKE 'data:image/%'
      `);
      console.log('✅ Đã xóa base64 khỏi ' + cleaned + ' thí sinh (giải phóng ~' + base64MB + ' MB trong Neon)');
    }

    // ── BƯỚC 4: Dọn ảnh base64 trong vote_archives.contestants_data ──
    if (arcCheck[0].cnt > 0) {
      const { rows: arcRows } = await client.query(
        "SELECT id, archive_id, contestants_data FROM vote_archives WHERE contestants_data LIKE '%data:image/%'"
      );
      let arcCleaned = 0;
      for (const arc of arcRows) {
        try {
          const list = JSON.parse(arc.contestants_data || '[]');
          let changed = false;
          for (const c of list) {
            if (c.photo && c.photo.startsWith('data:image/')) {
              c.photo = '';
              changed = true;
            }
          }
          if (changed) {
            await client.query(
              'UPDATE vote_archives SET contestants_data = $1 WHERE id = $2',
              [JSON.stringify(list), arc.id]
            );
            arcCleaned++;
          }
        } catch (_) {}
      }
      console.log('✅ Đã dọn ảnh base64 khỏi ' + arcCleaned + ' bản vote_archives');
    }

    // ── BƯỚC 5: Kiểm tra trạng thái sau dọn dẹp ──
    const { rows: remaining } = await client.query(`
      SELECT 
        COUNT(CASE WHEN photo LIKE 'https://res.cloudinary.com/%' THEN 1 END)::int as cloudinary_count,
        COUNT(CASE WHEN photo LIKE '/uploads/%' THEN 1 END)::int as local_count,
        COUNT(CASE WHEN photo = '' OR photo IS NULL THEN 1 END)::int as empty_count
      FROM contestants
    `);
    const r = remaining[0];
    console.log('\n📈 Trạng thái ảnh sau dọn dẹp:');
    console.log('   ☁️  Cloudinary URL : ' + r.cloudinary_count + ' thí sinh');
    console.log('   💾 Local /uploads/ : ' + r.local_count + ' thí sinh');
    console.log('   ⬜ Chưa có ảnh    : ' + r.empty_count + ' thí sinh');

    console.log('\n🎉 Dọn dẹp hoàn tất! Neon Egress sẽ giảm mạnh từ lần tải sau.');
    console.log('   Ảnh đã ở Cloudinary CDN — tải siêu nhanh, không tốn Neon Egress nữa!');

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup().catch(() => process.exit(1));
