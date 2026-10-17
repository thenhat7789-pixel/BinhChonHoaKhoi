const { Pool } = require('pg');

const OLD_URL = 'postgresql://neondb_owner:npg_jQL71YrvfNcm@ep-royal-math-b5judqxa-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const NEW_URL = 'postgresql://neondb_owner:npg_jyxafF36WLRS@ep-still-bonus-b54rb96t-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function migrateAll() {
  console.log('🔄 Đang kết nối tới chi nhánh "mới" và Database mới...');
  const oldPool = new Pool({ connectionString: OLD_URL, ssl: { rejectUnauthorized: false } });
  const newPool = new Pool({ connectionString: NEW_URL, ssl: { rejectUnauthorized: false } });

  try {
    // 1. Tạo bảng và cập nhật cột đầy đủ trên Database mới
    console.log('📦 Đồng bộ cấu trúc bảng...');
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS contestants (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255) DEFAULT '',
        color VARCHAR(20) DEFAULT '#0057a8',
        photo TEXT DEFAULT '',
        sort_order INT DEFAULT 0,
        faculty VARCHAR(100) DEFAULT '',
        hometown VARCHAR(150) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026'
      );

      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        vote_id VARCHAR(100) UNIQUE NOT NULL,
        contestant_id VARCHAR(100) NOT NULL REFERENCES contestants(id) ON DELETE CASCADE,
        voter_name VARCHAR(255) DEFAULT 'Người ẩn danh',
        comment TEXT DEFAULT '',
        voter_ip VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026',
        student_id VARCHAR(50) DEFAULT '',
        student_class VARCHAR(100) DEFAULT '',
        faculty VARCHAR(100) DEFAULT '',
        voter_fp VARCHAR(100) DEFAULT '',
        google_email VARCHAR(255) DEFAULT '',
        google_uid VARCHAR(128) DEFAULT ''
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
        created_at TIMESTAMP DEFAULT NOW(),
        start_time VARCHAR(100),
        end_time VARCHAR(100),
        vote_ratio INT DEFAULT 1,
        short_url VARCHAR(255),
        slug VARCHAR(100)
      );

      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS faculty VARCHAR(100) DEFAULT '';
      ALTER TABLE contestants ADD COLUMN IF NOT EXISTS hometown VARCHAR(150) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS event_id VARCHAR(50) DEFAULT 'evt_hoakhoi_2026';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_ip VARCHAR(255) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS student_class VARCHAR(100) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS faculty VARCHAR(100) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_fp VARCHAR(100) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS google_email VARCHAR(255) DEFAULT '';
      ALTER TABLE votes ADD COLUMN IF NOT EXISTS google_uid VARCHAR(128) DEFAULT '';

      CREATE INDEX IF NOT EXISTS idx_votes_voter_ip ON votes (voter_ip);
      CREATE INDEX IF NOT EXISTS idx_votes_voter_contestant ON votes (voter_ip, contestant_id);
      CREATE INDEX IF NOT EXISTS idx_votes_voter_fp ON votes (voter_fp);
      CREATE INDEX IF NOT EXISTS idx_votes_fp_contestant ON votes (voter_fp, contestant_id);
      CREATE INDEX IF NOT EXISTS idx_votes_google_email ON votes (google_email);
      CREATE INDEX IF NOT EXISTS idx_votes_google_contestant ON votes (google_email, contestant_id);
      CREATE INDEX IF NOT EXISTS idx_votes_student_id ON votes (student_id);
      CREATE INDEX IF NOT EXISTS idx_votes_event_id ON votes (event_id);
      CREATE INDEX IF NOT EXISTS idx_contestants_event_id ON contestants (event_id);
    `);

    // 2. Chuyển bảng events
    console.log('📋 Đang chuyển bảng events...');
    const { rows: events } = await oldPool.query('SELECT * FROM events');
    for (const e of events) {
      await newPool.query(`
        INSERT INTO events (id, tag, benefit_badge, title, description, location, radius, event_time, benefit, creator, checked_in_count, is_active, sort_order, created_at, start_time, end_time, vote_ratio, short_url, slug)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          is_active = EXCLUDED.is_active,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          vote_ratio = EXCLUDED.vote_ratio,
          slug = EXCLUDED.slug
      `, [e.id, e.tag, e.benefit_badge, e.title, e.description, e.location, e.radius, e.event_time, e.benefit, e.creator, e.checked_in_count, e.is_active, e.sort_order, e.created_at, e.start_time, e.end_time, e.vote_ratio, e.short_url, e.slug]);
    }
    console.log(`✅ Đã đồng bộ ${events.length} cuộc thi.`);

    // 3. Chuyển bảng contestants (tất cả 47 thí sinh)
    console.log('👑 Đang chuyển toàn bộ 47 thí sinh...');
    const { rows: contestants } = await oldPool.query('SELECT * FROM contestants');
    for (const c of contestants) {
      await newPool.query(`
        INSERT INTO contestants (id, name, subtitle, color, photo, sort_order, faculty, hometown, created_at, event_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          color = EXCLUDED.color,
          photo = EXCLUDED.photo,
          sort_order = EXCLUDED.sort_order,
          faculty = EXCLUDED.faculty,
          hometown = EXCLUDED.hometown,
          event_id = EXCLUDED.event_id
      `, [c.id, c.name, c.subtitle, c.color, c.photo || '', c.sort_order, c.faculty, c.hometown, c.created_at, c.event_id || 'evt_hoakhoi_2026']);
    }
    console.log(`✅ Đã đồng bộ ${contestants.length} thí sinh.`);

    // 4. Chuyển bảng votes (tất cả 962 phiếu bầu)
    console.log('🗳️ Đang chuyển toàn bộ 962 phiếu bình chọn (votes)...');
    const { rows: votes } = await oldPool.query('SELECT * FROM votes ORDER BY id ASC');
    
    // Batch insert để tốc độ siêu nhanh
    const batchSize = 100;
    for (let i = 0; i < votes.length; i += batchSize) {
      const batch = votes.slice(i, i + batchSize);
      for (const v of batch) {
        await newPool.query(`
          INSERT INTO votes (vote_id, contestant_id, voter_name, comment, voter_ip, created_at, event_id, student_id, student_class, faculty, voter_fp, google_email, google_uid)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (vote_id) DO NOTHING
        `, [v.vote_id, v.contestant_id, v.voter_name, v.comment, v.voter_ip, v.created_at, v.event_id, v.student_id, v.student_class, v.faculty, v.voter_fp, v.google_email, v.google_uid]);
      }
      console.log(`... Đã chuyển ${Math.min(i + batchSize, votes.length)} / ${votes.length} phiếu.`);
    }
    console.log(`✅ Đã chuyển trọn vẹn ${votes.length} phiếu bầu!`);

    // 5. Chuyển settings
    const { rows: settings } = await oldPool.query('SELECT * FROM settings');
    for (const s of settings) {
      await newPool.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [s.key, s.value, s.updated_at]);
    }

    // 6. KIỂM TRA ĐỐI CHIẾU CUỐI CÙNG
    console.log('\n📊 ─── BÁO CÁO ĐỐI CHIẾU CHÍNH THỨC ───');
    const { rows: checkEvents } = await newPool.query('SELECT COUNT(*)::int as cnt FROM events');
    const { rows: checkContestants } = await newPool.query('SELECT COUNT(*)::int as cnt FROM contestants');
    const { rows: checkVotes } = await newPool.query('SELECT COUNT(*)::int as cnt FROM votes');

    console.log(`• Cuộc thi: ${checkEvents[0].cnt} / ${events.length}`);
    console.log(`• Thí sinh: ${checkContestants[0].cnt} / ${contestants.length}`);
    console.log(`• Phiếu bầu: ${checkVotes[0].cnt} / ${votes.length}`);

    if (checkVotes[0].cnt === votes.length) {
      console.log('🎉 XÁC NHẬN: 100% PHIẾU BẦU ĐÃ ĐƯỢC CHUYỂN HOÀN TẤT KHÔNG THIẾU 1 PHIẾU NÀO!\n');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err);
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

migrateAll();
