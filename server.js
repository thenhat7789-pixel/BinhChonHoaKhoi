require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB, DEFAULT_CONTESTANTS } = require('./db');
const { getRandomVietnameseName, getRandomVietnameseComment, getRandomVoterIp } = require('./vietnameseData');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Tắt cache cho HTML để client luôn nhận code giao diện mới nhất
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra DB pool trước khi xử lý API
app.use('/api', (req, res, next) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database chưa được kết nối. Hãy cấu hình DATABASE_URL trong Render Environment.' });
  }
  next();
});

// ═══════════════════ API ROUTES ═══════════════════

// ─── GET /api/events ──────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, 
             COALESCE(e.checked_in_count, 0) + COUNT(v.id)::int as total_attendees
      FROM events e
      LEFT JOIN votes v ON v.event_id = e.id
      GROUP BY e.id
      ORDER BY e.sort_order, e.created_at
    `);
    res.json({ events: rows });
  } catch (e) {
    console.error('GET /api/events error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/events ─────────────────────────────
app.post('/api/events', async (req, res) => {
  const { event, events } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const list = Array.isArray(events) ? events : (event ? [event] : []);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const id = item.id || ('evt_' + Date.now() + '_' + i);
      await client.query(`
        INSERT INTO events (id, tag, benefit_badge, title, description, location, radius, event_time, benefit, creator, checked_in_count, sort_order, start_time, end_time, vote_ratio, short_url, slug, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          tag = EXCLUDED.tag,
          benefit_badge = EXCLUDED.benefit_badge,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          radius = EXCLUDED.radius,
          event_time = EXCLUDED.event_time,
          benefit = EXCLUDED.benefit,
          creator = EXCLUDED.creator,
          checked_in_count = EXCLUDED.checked_in_count,
          sort_order = EXCLUDED.sort_order,
          start_time = COALESCE(EXCLUDED.start_time, events.start_time),
          end_time = COALESCE(EXCLUDED.end_time, events.end_time),
          vote_ratio = COALESCE(EXCLUDED.vote_ratio, events.vote_ratio),
          short_url = COALESCE(EXCLUDED.short_url, events.short_url),
          slug = COALESCE(EXCLUDED.slug, events.slug),
          is_active = COALESCE(EXCLUDED.is_active, events.is_active)
      `, [
        id,
        item.tag || '# CUỘC THI',
        item.benefit_badge || '🟢 ĐANG MỞ',
        item.title || 'Cuộc thi mới',
        item.description || 'Không có mô tả.',
        item.location || 'Trường ĐH Xây dựng Miền Trung',
        parseInt(item.radius) || 5000,
        item.event_time || '08:00 - 22:00',
        item.benefit || '',
        item.creator || 'Đoàn TN – Hội Sinh viên MUCE',
        parseInt(item.checked_in_count) || 0,
        item.sort_order !== undefined ? item.sort_order : i,
        item.start_time || null,
        item.end_time || null,
        parseInt(item.vote_ratio) || 80,
        item.short_url || null,
        item.slug || null,
        item.is_active !== undefined ? Boolean(item.is_active) : true
      ]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/events error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  } finally {
    client.release();
  }
});

// ─── GET /api/create-short-url ────────────────────
app.get('/api/create-short-url', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Thiếu url' });
  try {
    const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`);
    if (!tinyRes.ok) throw new Error('TinyURL API error');
    const shortUrl = (await tinyRes.text()).trim();
    res.json({ success: true, shortUrl });
  } catch (e) {
    console.error('GET /api/create-short-url error:', e);
    res.status(500).json({ error: 'Lỗi tạo link rút gọn TinyURL' });
  }
});

// ─── POST /api/events/:id/toggle ──────────────────
app.post('/api/events/:id/toggle', async (req, res) => {
  try {
    const { is_active } = req.body;
    let nextState;
    if (is_active !== undefined) {
      nextState = Boolean(is_active);
    } else {
      const { rows } = await pool.query('SELECT is_active FROM events WHERE id = $1', [req.params.id]);
      nextState = rows.length ? !(rows[0].is_active !== false) : false;
    }
    await pool.query('UPDATE events SET is_active = $1 WHERE id = $2', [nextState, req.params.id]);
    res.json({ success: true, is_active: nextState });
  } catch (e) {
    console.error('POST /api/events/:id/toggle error:', e);
    res.status(500).json({ error: 'Lỗi bật/tắt bình chọn' });
  }
});

// ─── POST /api/events/:id/time-ratio ──────────────
app.post('/api/events/:id/time-ratio', async (req, res) => {
  const { start_time, end_time, vote_ratio, is_active } = req.body;
  try {
    await pool.query(`
      UPDATE events 
      SET start_time = COALESCE($1, start_time),
          end_time = COALESCE($2, end_time),
          vote_ratio = COALESCE($3, vote_ratio),
          is_active = CASE WHEN $4::text IS NOT NULL THEN $5::boolean ELSE is_active END
      WHERE id = $6
    `, [
      start_time !== undefined ? (start_time || null) : null,
      end_time !== undefined ? (end_time || null) : null,
      vote_ratio ? parseInt(vote_ratio) : null,
      is_active !== undefined ? String(is_active) : null,
      is_active !== undefined ? Boolean(is_active) : true,
      req.params.id
    ]);
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/events/:id/time-ratio error:', e);
    res.status(500).json({ error: 'Lỗi cập nhật thời gian & tỉ lệ' });
  }
});

// ─── DELETE /api/events/:id ───────────────────────
app.delete('/api/events/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/events/:id error:', e);
    res.status(500).json({ error: 'Lỗi xóa sự kiện' });
  }
});

// ─── POST /api/check-in ───────────────────────────
app.post('/api/check-in', async (req, res) => {
  const { event_id, voter_name, student_id, student_class, faculty, comment, voter_fingerprint } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Thiếu mã sự kiện (event_id)' });

  const cleanVoterName = (voter_name || '').trim();
  const cleanStudentId = (student_id || '').trim();
  const cleanStudentClass = (student_class || '').trim();
  const cleanFaculty = (faculty || '').trim();

  if (!cleanVoterName) return res.status(400).json({ error: 'Vui lòng nhập Họ và tên của bạn!' });
  if (!cleanStudentId) return res.status(400).json({ error: 'Vui lòng nhập Mã sinh viên (MSSV)!' });
  if (!cleanStudentClass) return res.status(400).json({ error: 'Vui lòng nhập Lớp của bạn!' });
  if (!cleanFaculty) return res.status(400).json({ error: 'Vui lòng nhập Khoa của bạn!' });

  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const voterId = voter_fingerprint ? `${voterIp}_${voter_fingerprint}` : voterIp;

  try {
    const dupeQuery = 'SELECT COUNT(*)::int as cnt FROM votes WHERE contestant_id = $1 AND (student_id = $2 OR voter_ip = $3)';
    const { rows: dupeCheck } = await pool.query(dupeQuery, [event_id, cleanStudentId, voterId]);
    if (dupeCheck[0].cnt >= 1) {
      return res.status(400).json({
        error: 'Bạn hoặc mã sinh viên này đã điểm danh cho sự kiện này rồi!',
        code: 'DUPLICATE_CHECKIN'
      });
    }

    const vote_id = 'chk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await pool.query(
      `INSERT INTO votes (vote_id, contestant_id, voter_name, student_id, student_class, faculty, comment, voter_ip) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [vote_id, event_id, cleanVoterName, cleanStudentId, cleanStudentClass, cleanFaculty, comment || '', voterId]
    );

    const { rows: evRows } = await pool.query('SELECT title FROM events WHERE id = $1', [event_id]);
    const eventTitle = evRows.length ? evRows[0].title : event_id;

    res.json({
      success: true,
      checkin_id: vote_id,
      event_id,
      event_title: eventTitle
    });
  } catch (e) {
    console.error('POST /api/check-in error:', e);
    res.status(500).json({ error: 'Lỗi ghi nhận điểm danh' });
  }
});

// ─── GET /api/contestants ─────────────────────────
app.get('/api/contestants', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  try {
    let query = 'SELECT * FROM contestants';
    let params = [];
    if (eventId) {
      query += ' WHERE event_id = $1';
      params.push(eventId);
    }
    query += ' ORDER BY sort_order, id';
    let { rows } = await pool.query(query, params);

    res.json({ contestants: rows });
  } catch (e) {
    console.error('GET /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/contestants ────────────────────────
app.post('/api/contestants', async (req, res) => {
  const { contestants, event_id } = req.body;
  if (!Array.isArray(contestants)) return res.status(400).json({ error: 'Invalid data' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Upsert each contestant
    for (let i = 0; i < contestants.length; i++) {
      const c = contestants[i];
      await client.query(`
        INSERT INTO contestants (id, event_id, name, subtitle, color, photo, sort_order, faculty, hometown)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          event_id = EXCLUDED.event_id,
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          color = EXCLUDED.color,
          photo = EXCLUDED.photo,
          sort_order = EXCLUDED.sort_order,
          faculty = EXCLUDED.faculty,
          hometown = EXCLUDED.hometown
      `, [c.id, c.event_id || event_id || 'evt_hoakhoi_2026', c.name || '', c.subtitle || '', c.color || '#0057a8', c.photo || '', i, c.faculty || '', c.hometown || '']);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server: ' + (e.message || '') });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/contestants/:id ──────────────────
app.delete('/api/contestants/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contestants WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/votes ───────────────────────────────
app.get('/api/votes', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  try {
    let query = `
      SELECT c.id, c.name, COUNT(v.id)::int as count
      FROM contestants c
      LEFT JOIN votes v ON v.contestant_id = c.id
    `;
    let params = [];
    if (eventId && eventId !== 'all') {
      query = `
        SELECT c.id, c.name, COUNT(v.id)::int as count
        FROM contestants c
        LEFT JOIN votes v ON v.contestant_id = c.id AND (v.event_id = $1 OR v.event_id IS NULL)
        WHERE (c.event_id = $1 OR (c.event_id IS NULL AND $1 = 'evt_hoakhoi_2026'))
      `;
      params.push(eventId);
    }
    query += `
      GROUP BY c.id, c.name
      ORDER BY c.sort_order, c.id
    `;
    const { rows } = await pool.query(query, params);
    const votes = {};
    let total = 0;
    rows.forEach(r => {
      votes[r.id] = r.count;
      total += r.count;
    });
    res.json({ votes, total });
  } catch (e) {
    console.error('GET /api/votes error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/votes/adjust (Dành riêng cho Chủ hệ thống tăng/giảm vote) ───
app.post('/api/votes/adjust', async (req, res) => {
  const { contestant_id, amount, event_id } = req.body;
  if (!contestant_id) return res.status(400).json({ error: 'Thiếu contestant_id' });
  const delta = parseInt(amount, 10);
  if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'Số lượng điều chỉnh không hợp lệ' });

  const currentEventId = event_id || 'evt_hoakhoi_2026';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra thí sinh tồn tại, nếu chưa có tạo từ default hoặc nạp
    let { rows: contestantExists } = await client.query(
      'SELECT id, name, event_id, faculty FROM contestants WHERE id = $1',
      [contestant_id]
    );
    if (contestantExists.length === 0) {
      const def = Array.isArray(DEFAULT_CONTESTANTS) ? DEFAULT_CONTESTANTS.find(d => d.id === contestant_id) : null;
      if (def) {
        await client.query(
          'INSERT INTO contestants (id, event_id, name, subtitle, color, sort_order, faculty, hometown) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING',
          [def.id, def.event_id, def.name, def.subtitle, def.color, 0, def.faculty || '', def.hometown || '']
        );
        contestantExists = [{ id: def.id, name: def.name, event_id: def.event_id, faculty: def.faculty || '' }];
      }
    }

    const contestantFaculty = contestantExists[0]?.faculty || '';

    if (delta > 0) {
      // Tăng vote: chèn delta phiếu với người bình chọn Việt Nam & lời chúc ngẫu nhiên (không còn MSSV, Lớp, Khoa)
      // Giãn cách thời gian mỗi lượt bình chọn cách nhau 3 giây (tổng 15 giây cho 5 phiếu) để tự nhiên
      const baseNow = Date.now();
      for (let i = 0; i < delta; i++) {
        // Mỗi lượt cách nhau 3 giây (lượt cuối cùng là hiện tại, các lượt trước lùi 3s, 6s, 9s, 12s...)
        const voteTs = new Date(baseNow - (delta - 1 - i) * 3000);
        const vote_id = 'v_' + voteTs.getTime() + '_' + Math.random().toString(36).substr(2, 6) + '_' + i;
        const voterName = getRandomVietnameseName();
        const comment = getRandomVietnameseComment();
        const voterIp = getRandomVoterIp();

        await client.query(
          `INSERT INTO votes (vote_id, contestant_id, event_id, voter_name, student_id, student_class, faculty, comment, voter_ip, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [vote_id, contestant_id, currentEventId, voterName, '', '', '', comment, voterIp, voteTs]
        );
      }
    } else {
      // Giảm vote: xóa ngẫu nhiên |delta| phiếu đã có trước đó của thí sinh
      const countToDelete = Math.abs(delta);
      await client.query(
        `DELETE FROM votes WHERE id IN (
           SELECT id FROM votes WHERE contestant_id = $1 ORDER BY RANDOM() LIMIT $2
         )`,
        [contestant_id, countToDelete]
      );
    }

    await client.query('COMMIT');

    // Lấy số phiếu mới nhất của thí sinh
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int as count FROM votes WHERE contestant_id = $1',
      [contestant_id]
    );
    const newCount = countRows[0]?.count || 0;

    // Lấy tổng số phiếu toàn cuộc thi
    const { rows: totalRows } = await pool.query(
      'SELECT COUNT(*)::int as total FROM votes WHERE event_id = $1 OR event_id IS NULL',
      [currentEventId]
    );
    const totalVotes = totalRows[0]?.total || 0;

    res.json({
      success: true,
      contestant_id,
      amount: delta,
      new_count: newCount,
      total_votes: totalVotes
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/votes/adjust error:', e);
    res.status(500).json({ error: 'Lỗi khi điều chỉnh số phiếu: ' + e.message });
  } finally {
    client.release();
  }
});

// ─── POST /api/vote ───────────────────────────────
app.post('/api/vote', async (req, res) => {
  const { contestant_id, event_id, voter_name, student_id, student_class, faculty, comment, voter_fingerprint } = req.body;
  if (!contestant_id) return res.status(400).json({ error: 'Thiếu contestant_id' });

  const currentEventId = event_id || 'evt_hoakhoi_2026';
  const cleanVoterName = (voter_name || '').trim();
  const cleanStudentId = (student_id || '').trim();
  const cleanStudentClass = (student_class || '').trim();
  const cleanFaculty = (faculty || '').trim();

  if (!cleanVoterName) return res.status(400).json({ error: 'Vui lòng nhập Họ và tên của bạn!' });

  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const voterId = voter_fingerprint ? `${voterIp}_${voter_fingerprint}` : voterIp;

  try {
    // 0. Kiểm tra thí sinh có tồn tại trong database không
    let { rows: contestantExists } = await pool.query(
      'SELECT id, name, event_id FROM contestants WHERE id = $1',
      [contestant_id]
    );
    if (contestantExists.length === 0) {
      // Tự động nạp nếu là thí sinh mặc định của hệ thống
      const def = Array.isArray(DEFAULT_CONTESTANTS) ? DEFAULT_CONTESTANTS.find(d => d.id === contestant_id) : null;
      if (def) {
        await pool.query(
          'INSERT INTO contestants (id, event_id, name, subtitle, color, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
          [def.id, def.event_id, def.name, def.subtitle, def.color, 0]
        );
        contestantExists = [{ id: def.id, name: def.name, event_id: def.event_id }];
      } else {
        return res.status(400).json({
          error: `Thí sinh này (SBD ${contestant_id}) chưa được tạo trong cuộc thi trên hệ thống! Ban tổ chức vui lòng vào trang Quản trị để thêm thí sinh trước khi bình chọn.`,
          code: 'CONTESTANT_NOT_FOUND'
        });
      }
    }

    // 1. Kiểm tra đã vote cho thí sinh này chưa
    let dupeQuery = 'SELECT COUNT(*)::int as cnt FROM votes WHERE contestant_id = $1 AND (event_id = $2 OR event_id IS NULL) AND (voter_ip = $3';
    const dupeParams = [contestant_id, currentEventId, voterId];
    if (cleanStudentId) {
      dupeQuery += ' OR (student_id = $4 AND student_id != \'\'))';
      dupeParams.push(cleanStudentId);
    } else {
      dupeQuery += ')';
    }

    const { rows: dupeCheck } = await pool.query(dupeQuery, dupeParams);
    if (dupeCheck[0].cnt >= 1) {
      return res.status(400).json({
        error: 'Bạn hoặc mã sinh viên này đã bình chọn cho thí sinh này rồi, không thể bình chọn lần 2!',
        code: 'DUPLICATE_VOTE'
      });
    }

    // 2. Kiểm tra trạng thái bật/tắt, thời gian mở/kết thúc và tỉ lệ bình chọn của cuộc thi này
    const { rows: eventRow } = await pool.query("SELECT is_active, vote_ratio, end_time, start_time FROM events WHERE id = $1", [currentEventId]);
    if (eventRow.length && eventRow[0].is_active === false) {
      return res.status(400).json({
        error: 'Cổng bình chọn cho cuộc thi này hiện đang tắt (tạm đóng)!',
        code: 'VOTING_DISABLED'
      });
    }

    if (eventRow.length && eventRow[0].start_time) {
      const startTime = new Date(eventRow[0].start_time).getTime();
      if (!isNaN(startTime) && Date.now() < startTime) {
        return res.status(400).json({
          error: 'Cuộc thi này chưa tới thời gian mở bình chọn!',
          code: 'VOTING_NOT_STARTED'
        });
      }
    }

    if (eventRow.length && eventRow[0].end_time) {
      const endTime = new Date(eventRow[0].end_time).getTime();
      if (!isNaN(endTime) && Date.now() > endTime) {
        return res.status(400).json({
          error: 'Thời gian bình chọn cho cuộc thi này đã kết thúc!',
          code: 'VOTING_ENDED'
        });
      }
    }

    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const globalRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;
    const voteRatio = (eventRow.length && eventRow[0].vote_ratio) ? parseInt(eventRow[0].vote_ratio) : globalRatio;

    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants WHERE (event_id = $1 OR event_id IS NULL)', [currentEventId]);
    const totalContestants = contestantCount[0].cnt || 0;
    const maxAllowed = Math.max(1, Math.round((totalContestants * voteRatio) / 100));

    let quotaQuery = 'SELECT COUNT(DISTINCT contestant_id)::int as cnt FROM votes WHERE (event_id = $1 OR event_id IS NULL) AND (voter_ip = $2';
    const quotaParams = [currentEventId, voterId];
    if (cleanStudentId) {
      quotaQuery += ' OR (student_id = $3 AND student_id != \'\'))';
      quotaParams.push(cleanStudentId);
    } else {
      quotaQuery += ')';
    }
    const { rows: voterVotes } = await pool.query(quotaQuery, quotaParams);
    const currentVoteCount = voterVotes[0].cnt;

    if (currentVoteCount >= maxAllowed) {
      return res.status(400).json({
        error: `Bạn đã sử dụng hết ${maxAllowed} lượt bình chọn (${voteRatio}%) cho cuộc thi này!`,
        code: 'QUOTA_EXCEEDED',
        maxAllowed,
        currentVotes: currentVoteCount,
        voteRatio
      });
    }

    // 3. Ghi phiếu bầu
    const vote_id = 'vote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await pool.query(
      `INSERT INTO votes (vote_id, contestant_id, event_id, voter_name, student_id, student_class, faculty, comment, voter_ip) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [vote_id, contestant_id, currentEventId, cleanVoterName, cleanStudentId, cleanStudentClass, cleanFaculty, comment || '', voterId]
    );

    const { rows } = await pool.query('SELECT name FROM contestants WHERE id = $1', [contestant_id]);
    const name = rows.length ? rows[0].name : contestant_id;
    const remaining = maxAllowed - (currentVoteCount + 1);

    res.json({
      success: true,
      vote_id,
      contestant_name: name,
      remaining,
      maxAllowed,
      voteRatio
    });
  } catch (e) {
    console.error('POST /api/vote error:', e);
    res.status(500).json({ error: 'Lỗi ghi phiếu bầu' });
  }
});

// ─── GET /api/my-votes ────────────────────────────
app.get('/api/my-votes', async (req, res) => {
  const eventId = req.query.event || req.query.event_id || 'evt_hoakhoi_2026';
  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const fp = req.query.fp || '';
  const voterId = fp ? `${voterIp}_${fp}` : voterIp;
  const studentId = (req.query.student_id || '').trim();

  try {
    let myVotesQuery = 'SELECT DISTINCT contestant_id FROM votes WHERE (event_id = $1 OR event_id IS NULL) AND (voter_ip = $2';
    const myVotesParams = [eventId, voterId];
    if (studentId) {
      myVotesQuery += ' OR (student_id = $3 AND student_id != \'\'))';
      myVotesParams.push(studentId);
    } else {
      myVotesQuery += ')';
    }

    const { rows } = await pool.query(myVotesQuery, myVotesParams);
    const votedIds = rows.map(r => r.contestant_id);

    const { rows: eventRow } = await pool.query("SELECT is_active, vote_ratio, end_time, start_time FROM events WHERE id = $1", [eventId]);
    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const globalRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;
    const voteRatio = (eventRow.length && eventRow[0].vote_ratio) ? parseInt(eventRow[0].vote_ratio) : globalRatio;
    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants WHERE (event_id = $1 OR event_id IS NULL)', [eventId]);
    const totalContestants = contestantCount[0].cnt || 0;
    const maxAllowed = Math.max(1, Math.round((totalContestants * voteRatio) / 100));

    res.json({
      votedIds,
      currentVotes: votedIds.length,
      maxAllowed,
      voteRatio,
      totalContestants,
      is_active: eventRow.length ? (eventRow[0].is_active !== false) : true,
      start_time: eventRow.length ? eventRow[0].start_time : null,
      end_time: eventRow.length ? eventRow[0].end_time : null
    });
  } catch (e) {
    console.error('GET /api/my-votes error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/vote-log ────────────────────────────
app.get('/api/vote-log', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  try {
    let query = `
      SELECT v.vote_id, v.contestant_id as id, 
             COALESCE(c.name, v.contestant_id) as name,
             COALESCE(c.subtitle, '') as "contestantSubtitle",
             v.voter_name as "voterName",
             COALESCE(v.student_id, '') as "studentId",
             COALESCE(v.student_class, '') as "studentClass",
             COALESCE(v.faculty, '') as "faculty",
             v.comment, v.created_at as ts,
             COALESCE(v.event_id, c.event_id, 'evt_hoakhoi_2026') as "eventId",
             COALESCE(ev.title, 'Bình Chọn Hoa Khôi 2026') as "eventTitle",
             COALESCE(ev.tag, '# CUỘC THI') as "eventTag"
      FROM votes v
      LEFT JOIN contestants c ON c.id = v.contestant_id
      LEFT JOIN events ev ON ev.id = COALESCE(v.event_id, c.event_id, 'evt_hoakhoi_2026')
    `;
    const params = [];
    if (eventId && eventId !== 'all') {
      query += ` WHERE (v.event_id = $1 OR (v.event_id IS NULL AND c.event_id = $1)) `;
      params.push(eventId);
    }
    query += ` ORDER BY v.created_at DESC LIMIT 10000 `;

    const { rows } = await pool.query(query, params);
    res.json({ log: rows, total: rows.length });
  } catch (e) {
    console.error('GET /api/vote-log error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/share ──────────────────────────────
app.post('/api/share', async (req, res) => {
  const { contestant_id, sharer_name, platform } = req.body;
  try {
    await pool.query(
      'INSERT INTO shares (contestant_id, sharer_name, platform) VALUES ($1, $2, $3)',
      [contestant_id || null, sharer_name || 'Người dùng', platform || 'facebook']
    );
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/share error:', e);
    res.status(500).json({ error: 'Lỗi ghi lượt chia sẻ' });
  }
});

// ─── GET /api/share-log ───────────────────────────
app.get('/api/share-log', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  try {
    let query = `
      SELECT s.id, s.contestant_id as "contestantId", c.name as "contestantName",
             s.sharer_name as "sharerName", s.platform, s.created_at as ts,
             COALESCE(c.event_id, 'evt_hoakhoi_2026') as "eventId",
             COALESCE(ev.title, 'Bình Chọn Hoa Khôi 2026') as "eventTitle"
      FROM shares s
      LEFT JOIN contestants c ON c.id = s.contestant_id
      LEFT JOIN events ev ON ev.id = c.event_id
    `;
    const params = [];
    if (eventId && eventId !== 'all') {
      query += ` WHERE c.event_id = $1 `;
      params.push(eventId);
    }
    query += ` ORDER BY s.created_at DESC LIMIT 10000 `;

    const { rows } = await pool.query(query, params);
    res.json({ log: rows, total: rows.length });
  } catch (e) {
    console.error('GET /api/share-log error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/shares ──────────────────────────────
app.get('/api/shares', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  try {
    let query = `
      SELECT s.contestant_id as id, COUNT(*)::int as count 
      FROM shares s
      LEFT JOIN contestants c ON c.id = s.contestant_id
      WHERE s.contestant_id IS NOT NULL 
    `;
    const params = [];
    if (eventId && eventId !== 'all') {
      query += ` AND c.event_id = $1 `;
      params.push(eventId);
    }
    query += ` GROUP BY s.contestant_id `;
    const { rows } = await pool.query(query, params);

    let totalQuery = `
      SELECT COUNT(*)::int as total 
      FROM shares s
      LEFT JOIN contestants c ON c.id = s.contestant_id
    `;
    const totalParams = [];
    if (eventId && eventId !== 'all') {
      totalQuery += ` WHERE c.event_id = $1 `;
      totalParams.push(eventId);
    }
    const { rows: totalRow } = await pool.query(totalQuery, totalParams);

    const shares = {};
    rows.forEach(r => { shares[r.id] = r.count; });
    res.json({ shares, total: totalRow[0]?.total || 0 });
  } catch (e) {
    console.error('GET /api/shares error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── PUT /api/vote/:voteId ────────────────────────
app.put('/api/vote/:voteId', async (req, res) => {
  const { contestant_id, voter_name, student_id, student_class, faculty, comment } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (contestant_id) {
      fields.push(`contestant_id = $${idx++}`);
      values.push(contestant_id);
      // Đồng bộ event_id tương ứng với thí sinh
      const { rows: cRows } = await pool.query('SELECT event_id FROM contestants WHERE id = $1', [contestant_id]);
      if (cRows.length && cRows[0].event_id) {
        fields.push(`event_id = $${idx++}`);
        values.push(cRows[0].event_id);
      }
    }
    if (voter_name !== undefined) { fields.push(`voter_name = $${idx++}`); values.push(voter_name); }
    if (student_id !== undefined) { fields.push(`student_id = $${idx++}`); values.push(student_id); }
    if (student_class !== undefined) { fields.push(`student_class = $${idx++}`); values.push(student_class); }
    if (faculty !== undefined) { fields.push(`faculty = $${idx++}`); values.push(faculty); }
    if (comment !== undefined) { fields.push(`comment = $${idx++}`); values.push(comment); }
    values.push(req.params.voteId);

    if (fields.length > 0) {
      await pool.query(`UPDATE votes SET ${fields.join(', ')} WHERE vote_id = $${idx}`, values);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /api/vote error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── DELETE /api/vote/:voteId ─────────────────────
app.delete('/api/vote/:voteId', async (req, res) => {
  try {
    await pool.query('DELETE FROM votes WHERE vote_id = $1', [req.params.voteId]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/vote error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/settings ────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (e) {
    console.error('GET /api/settings error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/settings ───────────────────────────
app.post('/api/settings', async (req, res) => {
  const entries = req.body; // { key: value, key2: value2 }
  try {
    for (const [key, value] of Object.entries(entries)) {
      await pool.query(`
        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [key, value]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/settings error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/archives ───────────────────────────
// Lưu trữ đợt bình chọn hiện tại vào kho lịch sử
app.post('/api/archives', async (req, res) => {
  const { title, notes } = req.body;
  try {
    const archive_id = 'arc_' + Date.now();
    const finalTitle = (title || '').trim() || ('Đợt bình chọn ' + new Date().toLocaleString('vi-VN'));

    const { rows: contestants } = await pool.query('SELECT * FROM contestants ORDER BY sort_order, id');
    const { rows: votesData } = await pool.query(`
      SELECT contestant_id as id, COUNT(*)::int as count 
      FROM votes GROUP BY contestant_id
    `);
    const votes = {};
    let totalVotes = 0;
    votesData.forEach(r => {
      votes[r.id] = r.count;
      totalVotes += r.count;
    });

    const { rows: voteLog } = await pool.query(`
      SELECT v.vote_id, v.contestant_id as id, c.name, v.voter_name as "voterName",
             COALESCE(v.student_id, '') as "studentId",
             COALESCE(v.student_class, '') as "studentClass",
             COALESCE(v.faculty, '') as "faculty",
             v.comment, v.created_at as ts
      FROM votes v
      LEFT JOIN contestants c ON c.id = v.contestant_id
      ORDER BY v.created_at ASC
    `);

    await pool.query(`
      INSERT INTO vote_archives (archive_id, title, notes, total_votes, contestants_data, votes_data, vote_log_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      archive_id,
      finalTitle,
      notes || '',
      totalVotes,
      JSON.stringify(contestants),
      JSON.stringify(votes),
      JSON.stringify(voteLog)
    ]);

    res.json({ success: true, archive_id, totalVotes, title: finalTitle });
  } catch (e) {
    console.error('POST /api/archives error:', e);
    res.status(500).json({ error: 'Lỗi lưu trữ đợt bình chọn' });
  }
});

// ─── GET /api/archives ────────────────────────────
// Danh sách các đợt đã lưu trữ
app.get('/api/archives', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT archive_id, title, notes, total_votes, created_at
      FROM vote_archives
      ORDER BY created_at DESC
    `);
    res.json({ archives: rows });
  } catch (e) {
    console.error('GET /api/archives error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/archives/:id ────────────────────────
// Chi tiết 1 đợt lưu trữ (bảng xếp hạng & danh sách người bình chọn)
app.get('/api/archives/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM vote_archives WHERE archive_id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy bản lưu' });
    const arc = rows[0];
    res.json({
      archive_id: arc.archive_id,
      title: arc.title,
      notes: arc.notes,
      total_votes: arc.total_votes,
      contestants: JSON.parse(arc.contestants_data || '[]'),
      votes: JSON.parse(arc.votes_data || '{}'),
      voteLog: JSON.parse(arc.vote_log_data || '[]'),
      created_at: arc.created_at
    });
  } catch (e) {
    console.error('GET /api/archives/:id error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── DELETE /api/archives/:id ─────────────────────
app.delete('/api/archives/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM vote_archives WHERE archive_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/archives/:id error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/reset-votes ───────────────────────
app.post('/api/reset-votes', async (req, res) => {
  const { auto_archive, title, notes } = req.body || {};
  try {
    // Tự động lưu trữ vào kho trước khi xóa phiếu
    if (auto_archive !== false) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*)::int as c FROM votes');
      if (cnt[0].c > 0) {
        const archive_id = 'arc_' + Date.now();
        const finalTitle = title || ('Đợt trước khi Reset (' + new Date().toLocaleString('vi-VN') + ')');
        const { rows: contestants } = await pool.query('SELECT * FROM contestants ORDER BY sort_order, id');
        const { rows: votesData } = await pool.query(`
          SELECT contestant_id as id, COUNT(*)::int as count 
          FROM votes GROUP BY contestant_id
        `);
        const votes = {};
        votesData.forEach(r => { votes[r.id] = r.count; });
        const { rows: voteLog } = await pool.query(`
          SELECT v.vote_id, v.contestant_id as id, c.name, v.voter_name as "voterName",
                 COALESCE(v.student_id, '') as "studentId",
                 COALESCE(v.student_class, '') as "studentClass",
                 COALESCE(v.faculty, '') as "faculty",
                 v.comment, v.created_at as ts
          FROM votes v
          LEFT JOIN contestants c ON c.id = v.contestant_id
          ORDER BY v.created_at ASC
        `);
        await pool.query(`
          INSERT INTO vote_archives (archive_id, title, notes, total_votes, contestants_data, votes_data, vote_log_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          archive_id,
          finalTitle,
          notes || 'Tự động lưu trữ trước khi đặt lại số phiếu',
          cnt[0].c,
          JSON.stringify(contestants),
          JSON.stringify(votes),
          JSON.stringify(voteLog)
        ]);
      }
    }
    await pool.query('DELETE FROM votes');
    await pool.query('DELETE FROM shares');
    res.json({ success: true, archived: true });
  } catch (e) {
    console.error('POST /api/reset-votes error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/reset-all ─────────────────────────
app.post('/api/reset-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM votes');
    await client.query('DELETE FROM shares');
    await client.query('DELETE FROM settings');
    // Reset contestants to defaults
    await client.query('DELETE FROM contestants');
    for (let i = 0; i < DEFAULT_CONTESTANTS.length; i++) {
      const c = DEFAULT_CONTESTANTS[i];
      await client.query(
        'INSERT INTO contestants (id, event_id, name, subtitle, color, sort_order, faculty, hometown) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [c.id, c.event_id, c.name, c.subtitle, c.color, i, c.faculty || '', c.hometown || '']
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/reset-all error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  } finally {
    client.release();
  }
});

// ─── Catch-all: Serve index.html ──────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ─────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('❌ Failed to start server:', e);
    process.exit(1);
  }
}

start();
