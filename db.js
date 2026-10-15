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

const DEFAULT_CONTESTANTS = [
  // Thí sinh Hoa Khôi
  { id: 'hk_01', event_id: 'evt_hoakhoi_2026', name: 'Nguyễn Thảo Nhi', faculty: 'Khoa Xây dựng', hometown: 'Phú Yên', subtitle: 'Khoa Xây dựng · Phú Yên', color: '#0057a8' },
  { id: 'hk_02', event_id: 'evt_hoakhoi_2026', name: 'Trần Bảo Ngọc', faculty: 'Khoa Kiến trúc', hometown: 'Nha Trang', subtitle: 'Khoa Kiến trúc · Nha Trang', color: '#003d7a' },
  { id: 'hk_03', event_id: 'evt_hoakhoi_2026', name: 'Lê Hoàng Yến', faculty: 'Khoa Kinh tế & QTKD', hometown: 'Bình Định', subtitle: 'Khoa Kinh tế & QTKD · Bình Định', color: '#005299' },
  { id: 'hk_04', event_id: 'evt_hoakhoi_2026', name: 'Phạm Quỳnh Anh', faculty: 'Khoa Công nghệ thông tin', hometown: 'Đà Nẵng', subtitle: 'Khoa Công nghệ thông tin · Đà Nẵng', color: '#0057a8' },
  { id: 'hk_05', event_id: 'evt_hoakhoi_2026', name: 'Đặng Mai Phương', faculty: 'Khoa Kỹ thuật Hạ tầng', hometown: 'Gia Lai', subtitle: 'Khoa Kỹ thuật Hạ tầng · Gia Lai', color: '#003d7a' },
  { id: 'hk_06', event_id: 'evt_hoakhoi_2026', name: 'Vũ Minh Hằng', faculty: 'Khoa Cầu đường', hometown: 'Đắk Lắk', subtitle: 'Khoa Cầu đường · Đắk Lắk', color: '#005299' },

  // Thí sinh Nam Vương
  { id: 'nv_01', event_id: 'evt_namvuong_2026', name: 'Nguyễn Tuấn Kiệt', faculty: 'Khoa Xây dựng', hometown: 'Phú Yên', subtitle: 'Khoa Xây dựng · Phú Yên', color: '#1e3a8a' },
  { id: 'nv_02', event_id: 'evt_namvuong_2026', name: 'Trần Hải Đăng', faculty: 'Khoa Kiến trúc', hometown: 'Khánh Hòa', subtitle: 'Khoa Kiến trúc · Khánh Hòa', color: '#0369a1' },
  { id: 'nv_03', event_id: 'evt_namvuong_2026', name: 'Lê Đức Phúc', faculty: 'Khoa CNTT', hometown: 'Bình Định', subtitle: 'Khoa CNTT · Bình Định', color: '#0f766e' },
  { id: 'nv_04', event_id: 'evt_namvuong_2026', name: 'Phạm Minh Khang', faculty: 'Khoa Kinh tế', hometown: 'Quảng Ngãi', subtitle: 'Khoa Kinh tế · Quảng Ngãi', color: '#1d4ed8' },
  { id: 'nv_05', event_id: 'evt_namvuong_2026', name: 'Đỗ Quốc Bảo', faculty: 'Khoa Cầu đường', hometown: 'Lâm Đồng', subtitle: 'Khoa Cầu đường · Lâm Đồng', color: '#0284c7' },
  { id: 'nv_06', event_id: 'evt_namvuong_2026', name: 'Hoàng Gia Huy', faculty: 'Khoa Cơ khí', hometown: 'Đắk Nông', subtitle: 'Khoa Cơ khí · Đắk Nông', color: '#0f172a' },

  // Tiết mục Tiếng Hát Sinh Viên
  { id: 'th_01', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Khát Vọng Tuổi Trẻ', faculty: 'CLB Âm Nhạc MUCE', hometown: 'Phú Yên', subtitle: 'CLB Âm Nhạc MUCE · Phú Yên', color: '#7c3aed' },
  { id: 'th_02', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Bài Ca Sinh Viên Xây Dựng', faculty: 'Khoa Xây dựng', hometown: 'Đại diện Khoa', subtitle: 'Khoa Xây dựng', color: '#9333ea' },
  { id: 'th_03', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Nơi Đảo Xa', faculty: 'Khoa Công nghệ thông tin', hometown: 'Đại diện Khoa', subtitle: 'Khoa Công nghệ thông tin', color: '#6366f1' },
  { id: 'th_04', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Chiều Lên Bản Thượng', faculty: 'Khoa Kiến trúc', hometown: 'Đại diện Khoa', subtitle: 'Khoa Kiến trúc', color: '#4f46e5' },
  { id: 'th_05', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Tự Hào MUCE', faculty: 'Liên quân Đoàn khoa', hometown: 'Đoàn trường', subtitle: 'Liên quân Đoàn khoa', color: '#2563eb' },
  { id: 'th_06', event_id: 'evt_tienghat_2026', name: 'Tiết mục: Ước Mơ Xanh', faculty: 'Khoa Kinh tế', hometown: 'Đại diện Khoa', subtitle: 'Khoa Kinh tế', color: '#0284c7' },

  // Ứng viên Gương Mặt Đại Sứ
  { id: 'ds_01', event_id: 'evt_daisu_2026', name: 'Nguyễn Hoàng Long', faculty: 'Khoa Xây dựng', hometown: 'Học tập & NCKH', subtitle: 'Đại sứ Học tập & NCKH Xuất sắc', color: '#d97706' },
  { id: 'ds_02', event_id: 'evt_daisu_2026', name: 'Trần Thu Trang', faculty: 'Khoa Kinh tế & QTKD', hometown: 'Phong trào Đoàn', subtitle: 'Đại sứ Hoạt động Phong trào', color: '#b45309' },
  { id: 'ds_03', event_id: 'evt_daisu_2026', name: 'Lê Thanh Tùng', faculty: 'Khoa Kiến trúc', hometown: 'Thể thao & Nghệ thuật', subtitle: 'Đại sứ Thể thao & Nghệ thuật', color: '#ea580c' },
  { id: 'ds_04', event_id: 'evt_daisu_2026', name: 'Phạm Ngọc Linh', faculty: 'Khoa Công nghệ thông tin', hometown: 'Tình nguyện Cộng đồng', subtitle: 'Đại sứ Tình nguyện Vì cộng đồng', color: '#ca8a04' },
  { id: 'ds_05', event_id: 'evt_daisu_2026', name: 'Vũ Đức Trọng', faculty: 'Khoa Kỹ thuật Hạ tầng', hometown: 'Đổi mới Sáng tạo', subtitle: 'Đại sứ Đổi mới Sáng tạo & Khởi nghiệp', color: '#0284c7' },
  { id: 'ds_06', event_id: 'evt_daisu_2026', name: 'Đặng Thanh Tâm', faculty: 'Khoa Cầu đường', hometown: 'Hội nhập Quốc tế', subtitle: 'Đại sứ Hội nhập Quốc tế', color: '#059669' },
];

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
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255) DEFAULT '',
        color VARCHAR(20) DEFAULT '#0057a8',
        photo TEXT DEFAULT '',
        sort_order INT DEFAULT 0,
        faculty VARCHAR(100) DEFAULT '',
        hometown VARCHAR(150) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        vote_id VARCHAR(100) UNIQUE NOT NULL,
        contestant_id VARCHAR(100) NOT NULL REFERENCES contestants(id) ON DELETE CASCADE,
        voter_name VARCHAR(255) DEFAULT 'Người ẩn danh',
        comment TEXT DEFAULT '',
        voter_ip VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        contestant_id VARCHAR(100) REFERENCES contestants(id) ON DELETE CASCADE,
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

      -- Migration: nâng cấp độ dài cột id nếu đang là VARCHAR(10)
      ALTER TABLE contestants ALTER COLUMN id TYPE VARCHAR(100);
      ALTER TABLE votes ALTER COLUMN contestant_id TYPE VARCHAR(100);
      ALTER TABLE shares ALTER COLUMN contestant_id TYPE VARCHAR(100);

      -- Migration: thêm các cột nếu chưa có
      ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS vote_ratio INT DEFAULT 80;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS short_url VARCHAR(255);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS faculty VARCHAR(100) DEFAULT '';
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS hometown VARCHAR(150) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_ip VARCHAR(255) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_class VARCHAR(100) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS faculty VARCHAR(100) DEFAULT '';

      -- Gán slug mặc định cho 4 cuộc thi chính nếu chưa có
      UPDATE events SET slug = 'hoakhoi' WHERE id = 'evt_hoakhoi_2026' AND (slug IS NULL OR slug = '');
      UPDATE events SET slug = 'namvuong' WHERE id = 'evt_namvuong_2026' AND (slug IS NULL OR slug = '');
      UPDATE events SET slug = 'tienghat' WHERE id = 'evt_tienghat_2026' AND (slug IS NULL OR slug = '');
      UPDATE events SET slug = 'daisu' WHERE id = 'evt_daisu_2026' AND (slug IS NULL OR slug = '');

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

    // Đảm bảo tất cả thí sinh mặc định của 4 cuộc thi luôn có trong database
    for (let i = 0; i < DEFAULT_CONTESTANTS.length; i++) {
      const c = DEFAULT_CONTESTANTS[i];
      await client.query(`
        INSERT INTO contestants (id, event_id, name, subtitle, color, sort_order, faculty, hometown)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          event_id = EXCLUDED.event_id,
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          faculty = CASE WHEN contestants.faculty IS NULL OR contestants.faculty = '' THEN EXCLUDED.faculty ELSE contestants.faculty END,
          hometown = CASE WHEN contestants.hometown IS NULL OR contestants.hometown = '' THEN EXCLUDED.hometown ELSE contestants.hometown END
      `, [c.id, c.event_id, c.name, c.subtitle, c.color, i, c.faculty || '', c.hometown || '']);
    }
    console.log('✅ Checked and seeded default contestants across all competitions');

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

module.exports = { pool, initDB, DEFAULT_CONTESTANTS };
