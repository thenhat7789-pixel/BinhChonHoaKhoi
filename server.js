require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// ─── GET /api/contestants ─────────────────────────
app.get('/api/contestants', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contestants ORDER BY sort_order, id');
    res.json({ contestants: rows });
  } catch (e) {
    console.error('GET /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/contestants ────────────────────────
app.post('/api/contestants', async (req, res) => {
  const { contestants } = req.body;
  if (!Array.isArray(contestants)) return res.status(400).json({ error: 'Invalid data' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Upsert each contestant
    for (let i = 0; i < contestants.length; i++) {
      const c = contestants[i];
      await client.query(`
        INSERT INTO contestants (id, name, subtitle, color, photo, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          color = EXCLUDED.color,
          photo = EXCLUDED.photo,
          sort_order = EXCLUDED.sort_order
      `, [c.id, c.name || '', c.subtitle || '', c.color || '#0057a8', c.photo || '', i]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server' });
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
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, COUNT(v.id)::int as count
      FROM contestants c
      LEFT JOIN votes v ON v.contestant_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.sort_order, c.id
    `);
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

// ─── POST /api/vote ───────────────────────────────
app.post('/api/vote', async (req, res) => {
  const { contestant_id, voter_name, student_id, student_class, faculty, comment, voter_fingerprint } = req.body;
  if (!contestant_id) return res.status(400).json({ error: 'Thiếu contestant_id' });

  const cleanVoterName = (voter_name || '').trim();
  const cleanStudentId = (student_id || '').trim();
  const cleanStudentClass = (student_class || '').trim();
  const cleanFaculty = (faculty || '').trim();

  if (!cleanVoterName) {
    return res.status(400).json({ error: 'Vui lòng nhập Họ và tên của bạn!' });
  }
  if (!cleanStudentId) {
    return res.status(400).json({ error: 'Vui lòng nhập Mã sinh viên (MSSV)!' });
  }
  if (!cleanStudentClass) {
    return res.status(400).json({ error: 'Vui lòng nhập Lớp của bạn!' });
  }
  if (!cleanFaculty) {
    return res.status(400).json({ error: 'Vui lòng nhập Khoa của bạn!' });
  }

  // Lấy IP người dùng (hỗ trợ proxy/Render)
  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  // Dùng fingerprint (nếu có) kết hợp IP để nhận diện voter chính xác hơn
  const voterId = voter_fingerprint ? `${voterIp}_${voter_fingerprint}` : voterIp;

  try {
    // 1. Kiểm tra đã vote cho thí sinh này chưa (chống bình chọn lặp lại 2 lần trở lên)
    let dupeQuery = 'SELECT COUNT(*)::int as cnt FROM votes WHERE contestant_id = $1 AND (voter_ip = $2';
    const dupeParams = [contestant_id, voterId];
    if (cleanStudentId) {
      dupeQuery += ' OR (student_id = $3 AND student_id != \'\'))';
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

    // 2. Kiểm tra tỉ lệ bình chọn (vote_ratio)
    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const voteRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;

    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants');
    const totalContestants = contestantCount[0].cnt || 1;
    const maxAllowed = Math.max(1, Math.round((totalContestants * voteRatio) / 100));

    // Đếm số thí sinh khác nhau mà voter này đã bình chọn
    let quotaQuery = 'SELECT COUNT(DISTINCT contestant_id)::int as cnt FROM votes WHERE voter_ip = $1';
    const quotaParams = [voterId];
    if (cleanStudentId) {
      quotaQuery += ' OR (student_id = $2 AND student_id != \'\')';
      quotaParams.push(cleanStudentId);
    }
    const { rows: voterVotes } = await pool.query(quotaQuery, quotaParams);
    const currentVoteCount = voterVotes[0].cnt;

    if (currentVoteCount >= maxAllowed) {
      return res.status(400).json({
        error: `Bạn đã sử dụng hết ${maxAllowed} lượt bình chọn (${voteRatio}%)! Không thể bình chọn thêm.`,
        code: 'QUOTA_EXCEEDED',
        maxAllowed,
        currentVotes: currentVoteCount,
        voteRatio
      });
    }

    // 3. Ghi phiếu bầu
    const vote_id = 'vote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await pool.query(
      `INSERT INTO votes (vote_id, contestant_id, voter_name, student_id, student_class, faculty, comment, voter_ip) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        vote_id,
        contestant_id,
        cleanVoterName,
        cleanStudentId,
        cleanStudentClass,
        cleanFaculty,
        comment || '',
        voterId
      ]
    );

    // Get contestant name for response
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
// Trả về danh sách thí sinh mà voter hiện tại (theo IP/MSSV) đã bình chọn
app.get('/api/my-votes', async (req, res) => {
  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const fp = req.query.fp || '';
  const voterId = fp ? `${voterIp}_${fp}` : voterIp;
  const studentId = (req.query.student_id || '').trim();

  try {
    let myVotesQuery = 'SELECT DISTINCT contestant_id FROM votes WHERE voter_ip = $1';
    const myVotesParams = [voterId];
    if (studentId) {
      myVotesQuery += ' OR (student_id = $2 AND student_id != \'\')';
      myVotesParams.push(studentId);
    }

    const { rows } = await pool.query(myVotesQuery, myVotesParams);
    const votedIds = rows.map(r => r.contestant_id);

    // Lấy vote_ratio và tổng thí sinh
    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const voteRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;
    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants');
    const totalContestants = contestantCount[0].cnt || 1;
    const maxAllowed = Math.max(1, Math.round((totalContestants * voteRatio) / 100));

    res.json({
      votedIds,
      currentVotes: votedIds.length,
      maxAllowed,
      voteRatio,
      totalContestants
    });
  } catch (e) {
    console.error('GET /api/my-votes error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/vote-log ────────────────────────────
app.get('/api/vote-log', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.vote_id, v.contestant_id as id, c.name, v.voter_name as "voterName",
             COALESCE(v.student_id, '') as "studentId",
             COALESCE(v.student_class, '') as "studentClass",
             COALESCE(v.faculty, '') as "faculty",
             v.comment, v.created_at as ts
      FROM votes v
      JOIN contestants c ON c.id = v.contestant_id
      ORDER BY v.created_at DESC
      LIMIT 10000
    `);
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
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.contestant_id as "contestantId", c.name as "contestantName",
             s.sharer_name as "sharerName", s.platform, s.created_at as ts
      FROM shares s
      LEFT JOIN contestants c ON c.id = s.contestant_id
      ORDER BY s.created_at DESC
      LIMIT 10000
    `);
    res.json({ log: rows, total: rows.length });
  } catch (e) {
    console.error('GET /api/share-log error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── GET /api/shares ──────────────────────────────
app.get('/api/shares', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT contestant_id as id, COUNT(*)::int as count 
      FROM shares 
      WHERE contestant_id IS NOT NULL 
      GROUP BY contestant_id
    `);
    const { rows: totalRow } = await pool.query('SELECT COUNT(*)::int as total FROM shares');
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
    if (contestant_id) { fields.push(`contestant_id = $${idx++}`); values.push(contestant_id); }
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
    const defaults = [
      { id: '01', name: 'Thí sinh 01', subtitle: 'Đến từ Hà Nội',    color: '#0057a8' },
      { id: '02', name: 'Thí sinh 02', subtitle: 'Đến từ TP.HCM',    color: '#003d7a' },
      { id: '03', name: 'Thí sinh 03', subtitle: 'Đến từ Đà Nẵng',   color: '#005299' },
      { id: '04', name: 'Thí sinh 04', subtitle: 'Đến từ Cần Thơ',   color: '#0057a8' },
      { id: '05', name: 'Thí sinh 05', subtitle: 'Đến từ Huế',       color: '#003d7a' },
      { id: '06', name: 'Thí sinh 06', subtitle: 'Đến từ Nha Trang', color: '#005299' },
    ];
    for (let i = 0; i < defaults.length; i++) {
      const c = defaults[i];
      await client.query(
        'INSERT INTO contestants (id, name, subtitle, color, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [c.id, c.name, c.subtitle, c.color, i]
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
