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
        voter_ip VARCHAR(255) DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS vote_archives (
        id SERIAL PRIMARY KEY,
        archive_id VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        notes TEXT DEFAULT '',
        total_votes INT DEFAULT 0,
        contestants_data TEXT,
        votes_data TEXT,
        vote_log_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(50) PRIMARY KEY,
        tag VARCHAR(150) DEFAULT '',
        benefit_badge VARCHAR(50) DEFAULT '',
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT 'Không có mô tả.',
        location VARCHAR(255) DEFAULT '',
        radius INT DEFAULT 5000,
        event_time VARCHAR(100) DEFAULT '',
        benefit VARCHAR(100) DEFAULT '',
        creator VARCHAR(100) DEFAULT 'hongnhung',
        checked_in_count INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Migration: thêm các cột nếu chưa có
      ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS vote_ratio INT DEFAULT 80;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS short_url VARCHAR(255);
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_ip VARCHAR(255) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_class VARCHAR(100) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS faculty VARCHAR(100) DEFAULT '';

      -- Xóa bỏ TinyURL để người dùng vào thẳng trang web siêu tốc 0s, không qua trang trung gian quảng cáo
      UPDATE events SET short_url = NULL WHERE short_url ILIKE '%tinyurl.com%';

      -- Xóa bỏ tàn dư NCTXH và bán kính điểm danh cũ trong DB
      UPDATE events SET benefit_badge = '', benefit = '' WHERE benefit_badge ILIKE '%nctxh%' OR benefit ILIKE '%nctxh%';
      UPDATE events SET location = REPLACE(location, ' (Bán kính: 5000m)', '') WHERE location ILIKE '%5000m%';

      -- Index để kiểm tra duplicate vote và quota nhanh hơn
      CREATE INDEX IF NOT EXISTS idx_votes_voter_ip ON votes (voter_ip);
      CREATE INDEX IF NOT EXISTS idx_votes_voter_contestant ON votes (voter_ip, contestant_id);
      CREATE INDEX IF NOT EXISTS idx_votes_student_id ON votes (student_id);
      CREATE INDEX IF NOT EXISTS idx_votes_event_id ON votes (event_id);
      CREATE INDEX IF NOT EXISTS idx_contestants_event_id ON contestants (event_id);
    `);

    // Seed default contestants nếu bảng trống
    const { rows } = await client.query('SELECT COUNT(*) as cnt FROM contestants');
    if (parseInt(rows[0].cnt) === 0) {
      const defaults = [
        // Thí sinh Hoa Khôi
        { id: 'hk_01', event_id: 'evt_hoakhoi_2026', name: 'Nguyễn Thảo Nhi', subtitle: 'Khoa Xây dựng · SBD 01', color: '#0057a8' },
        { id: 'hk_02', event_id: 'evt_hoakhoi_2026', name: 'Trần Bảo Ngọc', subtitle: 'Khoa Kiến trúc · SBD 02', color: '#003d7a' },
        { id: 'hk_03', event_id: 'evt_hoakhoi_2026', name: 'Lê Hoàng Yến', subtitle: 'Khoa Kinh tế & QTKD · SBD 03', color: '#005299' },
        { id: 'hk_04', event_id: 'evt_hoakhoi_2026', name: 'Phạm Quỳnh Anh', subtitle: 'Khoa Công nghệ thông tin · SBD 04', color: '#0057a8' },
        { id: 'hk_05', event_id: 'evt_hoakhoi_2026', name: 'Đặng Mai Phương', subtitle: 'Khoa Kỹ thuật Hạ tầng · SBD 05', color: '#003d7a' },
        { id: 'hk_06', event_id: 'evt_hoakhoi_2026', name: 'Vũ Minh Hằng', subtitle: 'Khoa Cầu đường · SBD 06', color: '#005299' },

        // Thí sinh Nam Vương
        { id: 'nv_01', event_id: 'evt_namvuong_2026', name: 'Nguyễn Tuấn Kiệt', subtitle: 'Khoa Xây dựng · SBD 01', color: '#1e3a8a' },
        { id: 'nv_02', event_id: 'evt_namvuong_2026', name: 'Trần Hải Đăng', subtitle: 'Khoa Kiến trúc · SBD 02', color: '#0369a1' },
        { id: 'nv_03', event_id: 'evt_namvuong_2026', name: 'Lê Đức Phúc', subtitle: 'Khoa CNTT · SBD 03', color: '#0f766e' },
        { id: 'nv_04', event_id: 'evt_namvuong_2026', name: 'Phạm Minh Khang', subtitle: 'Khoa Kinh tế · SBD 04', color: '#1d4ed8' },
        { id: 'nv_05', event_id: 'evt_namvuong_2026', name: 'Đỗ Quốc Bảo', subtitle: 'Khoa Cầu đường · SBD 05', color: '#0284c7' },
        { id: 'nv_06', event_id: 'evt_namvuong_2026', name: 'Hoàng Gia Huy', subtitle: 'Khoa Cơ khí · SBD 06', color: '#0f172a' },

        // Tiết mục Tiếng Hát Sinh Viên
        { id: 'th_01', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Khát Vọng Tuổi Trẻ', subtitle: 'CLB Âm Nhạc MUCE · SBD 01', color: '#7c3aed' },
        { id: 'th_02', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Bài Ca Sinh Viên Xây Dựng', subtitle: 'Khoa Xây dựng · SBD 02', color: '#9333ea' },
        { id: 'th_03', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Nơi Đảo Xa', subtitle: 'Khoa Công nghệ thông tin · SBD 03', color: '#6366f1' },
        { id: 'th_04', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Chiều Lên Bản Thượng', subtitle: 'Khoa Kiến trúc · SBD 04', color: '#4f46e5' },
        { id: 'th_05', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Tự Hào MUCE', subtitle: 'Liên quân Đoàn khoa · SBD 05', color: '#2563eb' },
        { id: 'th_06', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Ước Mơ Xanh', subtitle: 'Khoa Kinh tế · SBD 06', color: '#0284c7' },

        // Ứng viên Gương Mặt Đại Sứ
        { id: 'ds_01', event_id: 'evt_daisu_2026', name: 'Nguyễn Hoàng Long', subtitle: 'Đại sứ Học tập & NCKH Xuất sắc · SBD 01', color: '#d97706' },
        { id: 'ds_02', event_id: 'evt_daisu_2026', name: 'Trần Thu Trang', subtitle: 'Đại sứ Hoạt động Phong trào · SBD 02', color: '#b45309' },
        { id: 'ds_03', event_id: 'evt_daisu_2026', name: 'Lê Thanh Tùng', subtitle: 'Đại sứ Thể thao & Nghệ thuật · SBD 03', color: '#ea580c' },
        { id: 'ds_04', event_id: 'evt_daisu_2026', name: 'Phạm Ngọc Linh', subtitle: 'Đại sứ Tình nguyện Vì cộng đồng · SBD 04', color: '#ca8a04' },
        { id: 'ds_05', event_id: 'evt_daisu_2026', name: 'Vũ Đức Trọng', subtitle: 'Đại sứ Đổi mới Sáng tạo & Khởi nghiệp · SBD 05', color: '#0284c7' },
        { id: 'ds_06', event_id: 'evt_daisu_2026', name: 'Đặng Thanh Tâm', subtitle: 'Đại sứ Hội nhập Quốc tế · SBD 06', color: '#059669' },
      ];
      for (let i = 0; i < defaults.length; i++) {
        const c = defaults[i];
        await client.query(
          'INSERT INTO contestants (id, event_id, name, subtitle, color, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
          [c.id, c.event_id, c.name, c.subtitle, c.color, i]
        );
      }
      console.log('✅ Seeded default contestants across events');
    }

    // Seed default competitions/events nếu bảng events trống
    const { rows: eventRows } = await client.query('SELECT COUNT(*) as cnt FROM events');
    if (parseInt(eventRows[0].cnt) === 0) {
      const defaultEvents = [
        {
          id: 'evt_hoakhoi_2026',
          tag: '# HOA KHÔI 2026',
          benefit_badge: '👑 VƯƠNG MIỆN',
          title: 'Bình Chọn Hoa Khôi',
          description: 'Chạm để trao vương miện cho thí sinh bạn yêu thích nhất',
          location: 'Hội trường A – Trường ĐH Xây dựng Miền Trung',
          radius: 5000,
          event_time: '✦ NĂM HỌC 2025 – 2026 ✦',
          benefit: 'Vương miện Hoa khôi & Kỷ niệm chương',
          creator: 'Đoàn TN – Hội Sinh viên MUCE',
          checked_in_count: 245,
          sort_order: 1
        },
        {
          id: 'evt_namvuong_2026',
          tag: '# NAM VƯƠNG 2026',
          benefit_badge: '🏆 CÚP VÀNG',
          title: 'Bình Chọn Nam Vương',
          description: 'Bình chọn nam sinh tài năng, phong cách và ưu tú nhất',
          location: 'Hội trường A – Trường ĐH Xây dựng Miền Trung',
          radius: 5000,
          event_time: '✦ NĂM HỌC 2025 – 2026 ✦',
          benefit: 'Danh hiệu Nam Vương & Cúp Vàng',
          creator: 'Đoàn TN – Hội Sinh viên MUCE',
          checked_in_count: 182,
          sort_order: 2
        },
        {
          id: 'evt_tienghat_2026',
          tag: '# TIẾNG HÁT 2026',
          benefit_badge: '🎤 GIỌNG CA VÀNG',
          title: 'Bình Chọn Tiếng Hát Sinh Viên',
          description: 'Bình chọn tiết mục và giọng ca vàng xuất sắc nhất',
          location: 'Hội trường Khu B – Trường ĐH Xây dựng Miền Trung',
          radius: 5000,
          event_time: '✦ HỘI THI 2026 ✦',
          benefit: 'Giải thưởng Giọng ca vàng',
          creator: 'Đoàn TN – Hội Sinh viên MUCE',
          checked_in_count: 310,
          sort_order: 3
        },
        {
          id: 'evt_daisu_2026',
          tag: '# ĐẠI SỨ 2026',
          benefit_badge: '⭐ ĐẠI SỨ',
          title: 'Bình Chọn Gương Mặt Đại Sứ',
          description: 'Tôn vinh gương mặt đại diện và nét đẹp sinh viên tiêu biểu',
          location: 'Trụ sở chính – Trường ĐH Xây dựng Miền Trung',
          radius: 5000,
          event_time: '✦ NHIỆM KỲ 2026 – 2027 ✦',
          benefit: 'Gương mặt đại diện MUCE',
          creator: 'Đoàn TN – Hội Sinh viên MUCE',
          checked_in_count: 156,
          sort_order: 4
        }
      ];
      for (const e of defaultEvents) {
        await client.query(`
          INSERT INTO events (id, tag, benefit_badge, title, description, location, radius, event_time, benefit, creator, checked_in_count, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
        `, [e.id, e.tag, e.benefit_badge, e.title, e.description, e.location, e.radius, e.event_time, e.benefit, e.creator, e.checked_in_count, e.sort_order]);
      }
      console.log('✅ Seeded default competition events');
    }

    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ Lỗi kết nối / khởi tạo DB:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
