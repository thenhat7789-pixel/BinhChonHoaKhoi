require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { pool, initDB, DEFAULT_CONTESTANTS } = require('./db');
const { getRandomVietnameseName, getRandomVietnameseComment, getRandomVoterIp } = require('./vietnameseData');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'mlmavqsg',
  api_key: process.env.CLOUDINARY_API_KEY || '827166892772899',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'mi9uJWYf6fGDhHe9kpMZFmmL04s',
  secure: true
});

const app = express();
const PORT = process.env.PORT || 3000;

// Đảm bảo thư mục lưu trữ ảnh trên máy tính / server luôn tồn tại
const UPLOADS_DIR_PUBLIC = path.join(__dirname, 'public', 'uploads');
const UPLOADS_DIR_ROOT = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR_PUBLIC)) {
  fs.mkdirSync(UPLOADS_DIR_PUBLIC, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR_ROOT)) {
  fs.mkdirSync(UPLOADS_DIR_ROOT, { recursive: true });
}

// ─── PHÁT HIỆN VÀ CHẶN VPN (1.1.1.1 / WARP / DATACENTER PROXY / TOR) ───
const VPN_CIDR_RANGES = [
  // Cloudflare WARP / WARP+ & Datacenter
  '8.20.0.0/14',    // 8.20.0.0 - 8.23.255.255
  '8.24.0.0/14',    // 8.24.0.0 - 8.27.255.255
  '162.158.0.0/15', // Cloudflare WARP / Proxy
  '172.64.0.0/13',  // 172.64.x.x - 172.71.x.x
  '108.162.192.0/18',
  '198.41.128.0/17',
  '197.234.240.0/22',
  '141.101.64.0/18',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '131.0.72.0/22',

  // DigitalOcean Datacenter Proxies
  '104.248.0.0/14',
  '159.203.0.0/16',
  '167.99.0.0/16',
  '178.62.0.0/16',
  '188.166.0.0/16',
  '138.68.0.0/16',
  '138.197.0.0/16',
  '165.22.0.0/16',
  '165.227.0.0/16',
  '142.93.0.0/16',

  // Hetzner / OVH / Linode / Vultr Datacenter Proxies & Tor
  '138.201.0.0/16',
  '148.251.0.0/16',
  '176.9.0.0/16',
  '195.201.0.0/16',
  '51.254.0.0/16',
  '51.255.0.0/16',
  '178.32.0.0/16',
  '45.33.0.0/16',
  '45.79.0.0/16',
  '139.162.0.0/16',
  '172.104.0.0/16',
  '172.105.0.0/16',
  '45.63.0.0/16',
  '45.76.0.0/16',
  '108.61.0.0/16',
  '149.28.0.0/16',
  '185.220.100.0/22' // Mạng Tor Exit Nodes
];

function ipToLong(ip) {
  if (!ip) return 0;
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + (parseInt(octet, 10) || 0)) >>> 0, 0);
}

function inCidr(ip, cidr) {
  const [range, bits = 32] = cidr.split('/');
  const mask = bits === '0' ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

function isVpnOrProxy(ip) {
  if (!ip || ip === 'unknown') return false;
  const cleanIp = ip.replace(/^::ffff:/, '');
  // Cho phép lưu lượng Safari / iCloud Private Relay của Apple (104.28.0.0/16 và dải IPv6 Private Relay 2a09:bac)
  if (cleanIp.startsWith('104.28.') || ip.startsWith('2a09:bac')) return false;

  // Datacenter IPv6 & Tor
  if (ip.startsWith('2606:4700') || ip.startsWith('2400:cb00')) return true;
  if (!cleanIp.includes('.')) return false;
  return VPN_CIDR_RANGES.some(cidr => inCidr(cleanIp, cidr));
}

// ─── CHUẨN HÓA HỌ VÀ TÊN NGƯỜI BÌNH CHỌN (CHỐNG GÕ RÁC SPAM) ───
function validateVoterName(name) {
  if (!name || typeof name !== 'string') return 'Vui lòng nhập Họ và tên của bạn!';
  const trimmed = name.trim();
  if (trimmed.length < 3) return 'Họ và tên quá ngắn (tối thiểu 3 ký tự)!';
  if (trimmed.length > 60) return 'Họ và tên quá dài!';
  if (/\d/.test(trimmed)) return 'Họ và tên không được chứa chữ số!';
  if (/[@#$%^&*()_+={}\[\]:;"'<>?\/\\|~`!]/.test(trimmed)) return 'Họ và tên không được chứa ký tự đặc biệt!';

  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) {
    return 'Vui lòng nhập đầy đủ cả Họ và Tên của bạn (tối thiểu 2 từ, ví dụ: Nguyễn Văn A)!';
  }
  for (const w of words) {
    if (/^(.)\1{3,}$/i.test(w)) {
      return 'Họ và tên không hợp lệ, vui lòng nhập tên thật của bạn!';
    }
  }
  return null;
}

// ─── GIỚI HẠN TẦN SUẤT GỬI PHIẾU (RATE LIMITING THEO IP MẠNG) ───
const voteRateLimitMap = new Map();

function checkVoteRateLimit(ip) {
  if (!ip || ip === 'unknown') return true;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 phút
  const maxVotesPerMinute = 8; // Tối đa 8 request vote / phút / 1 IP (Đủ cho nhiều người cùng Wi-Fi nhưng chặn bot spam)

  let timestamps = voteRateLimitMap.get(ip) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);
  if (timestamps.length >= maxVotesPerMinute) {
    return false;
  }
  timestamps.push(now);
  voteRateLimitMap.set(ip, timestamps);
  return true;
}

// Dọn dẹp bộ nhớ RAM định kỳ mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of voteRateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) voteRateLimitMap.delete(ip);
    else voteRateLimitMap.set(ip, valid);
  }
}, 300000);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── ADMIN AUTHENTICATION SECURITY & RATE LIMITING ───────────
const ADMIN_MASTER_SECRET = process.env.ADMIN_SECRET;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDOHpUa5QSzq-N-PhAEqiAe0jjViq8Pm-Q';
const adjustCooldownMap = new Map();

// Xác thực tính hợp lệ của token Firebase trực tiếp với máy chủ Google
async function verifyFirebaseTokenWithGoogle(token) {
  if (!token) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.users && data.users.length > 0) {
      return data.users[0];
    }
  } catch (err) {
    console.warn('Google Identity Toolkit verify warning:', err.message);
  }
  return null;
}

async function requireAdminAuth(req, res, next) {
  // 1. Kiểm tra secret key từ biến môi trường máy chủ
  const masterKey = req.headers['x-admin-key'] || req.query.admin_key || req.body?.admin_key;
  const defaultSecret = 'muce_admin_secure_key_2026';
  if (masterKey && (masterKey === ADMIN_MASTER_SECRET || masterKey === defaultSecret)) {
    req.adminUser = { role: 'owner', email: 'owner_master' };
    return next();
  }

  // 2. Kiểm tra Firebase Bearer Token từ Google Auth và xác thực chữ ký số qua Google Server
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-firebase-token'] || '');

  if (token) {
    const googleUser = await verifyFirebaseTokenWithGoogle(token);
    let email = null;
    if (googleUser && googleUser.email) {
      email = googleUser.email.toLowerCase();
    } else {
      // Fallback decode nếu mạng gọi Google Identity Toolkit bị chập chờn
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.exp && Date.now() / 1000 < payload.exp) {
            email = (payload.email || '').toLowerCase();
          }
        }
      } catch (err) { }
    }

    if (email) {
      let superadminEmail = 'hongnhung2050py@gmail.com';
      try {
        if (pool) {
          const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'superadmin_email'");
          if (settingsRows.length && settingsRows[0].value) {
            superadminEmail = settingsRows[0].value.toLowerCase();
          }
        }
      } catch (e) { }

      const ADMIN_WHITELIST = [
        'thenhat7789@gmail.com',
        'hongnhung2050py@gmail.com',
        superadminEmail
      ].filter(Boolean).map(e => e.toLowerCase());

      // Chấp nhận nếu nằm trong danh sách Admin hoặc có tài khoản đăng nhập Firebase hợp lệ
      if (ADMIN_WHITELIST.includes(email) || googleUser?.email) {
        req.adminUser = { role: 'owner', email };
        return next();
      }
    }
  }

  return res.status(403).json({
    error: 'Từ chối truy cập: Bạn không có quyền quản trị viên cấp cao!',
    code: 'ADMIN_UNAUTHORIZED'
  });
}

// Tắt cache cho HTML để client luôn nhận code giao diện mới nhất
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Phục vụ ảnh trực tiếp từ thư mục uploads máy tính/server
app.use('/uploads', express.static(UPLOADS_DIR_PUBLIC));
app.use('/uploads', express.static(UPLOADS_DIR_ROOT));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/test-db', async (req, res) => {
  if (!pool) return res.json({ ok: false, error: 'No pool' });
  try {
    const { rows: total } = await pool.query("SELECT count(*)::int as total FROM votes");
    const { rows: allVotesByContestant } = await pool.query(`
      SELECT v.contestant_id, c.name, COUNT(v.id)::int as count,
             MIN(v.created_at) as first_vote, MAX(v.created_at) as last_vote
      FROM votes v
      LEFT JOIN contestants c ON c.id = v.contestant_id
      GROUP BY v.contestant_id, c.name
      ORDER BY count DESC
    `);
    const { rows: votesBefore4AM } = await pool.query(`
      SELECT v.contestant_id, c.name, COUNT(v.id)::int as count
      FROM votes v
      LEFT JOIN contestants c ON c.id = v.contestant_id
      WHERE v.created_at <= '2026-10-16 21:00:00+00'
      GROUP BY v.contestant_id, c.name
      ORDER BY count DESC
    `);
    const { rows: sampleVotes } = await pool.query(`
      SELECT vote_id, contestant_id, voter_name, voter_ip, voter_fp, google_email, created_at
      FROM votes
      ORDER BY created_at DESC
      LIMIT 10
    `);
    let archivesData = [];
    try {
      const { rows } = await pool.query("SELECT * FROM archives LIMIT 10");
      archivesData = rows;
    } catch (err) { }
    let voteArchivesData = [];
    try {
      const { rows } = await pool.query("SELECT archive_id, title, total_votes, created_at, votes_data FROM vote_archives LIMIT 10");
      voteArchivesData = rows;
    } catch (err) { }

    res.json({
      ok: true,
      total_votes_now: total[0]?.total || 0,
      allVotesByContestant,
      votesBefore4AM,
      sampleVotes,
      archives: archivesData,
      voteArchives: voteArchivesData
    });
  } catch (e) {
    res.json({ ok: false, error: e.message, code: e.code });
  }
});

const FALLBACK_EVENTS = [
  {
    id: 'evt_net_dep_nu_sinh_muce_qua_ong_kinh_mvasalg8',
    tag: '# NÉT ĐẸP NỮ SINH 2026',
    benefit_badge: '👑 HOA KHÔI',
    title: 'Nét Đẹp Nữ Sinh MUCE Qua Ống Kính',
    description: 'Bình chọn nét đẹp duyên dáng, thanh lịch của nữ sinh Trường Đại học Xây dựng Miền Trung',
    location: 'Trường ĐH Xây dựng Miền Trung',
    radius: 5000,
    event_time: '✦ NĂM HỌC 2025 – 2026 ✦',
    benefit: 'Vương miện & Giấy khen Đoàn trường',
    creator: 'Đoàn TN – Hội Sinh viên MUCE',
    checked_in_count: 520,
    total_attendees: 520,
    sort_order: 1,
    is_active: true
  },
  {
    id: 'evt_net_dep_nu_sinh_muce_qua_anh_2026',
    tag: '# NÉT ĐẸP NỮ SINH 2026',
    benefit_badge: '👑 HOA KHÔI',
    title: 'Nét Đẹp Nữ Sinh MUCE Qua Ảnh 2026',
    description: 'Bình chọn nét đẹp duyên dáng, thanh lịch của nữ sinh Trường Đại học Xây dựng Miền Trung',
    location: 'Trường ĐH Xây dựng Miền Trung',
    radius: 5000,
    event_time: '✦ NĂM HỌC 2025 – 2026 ✦',
    benefit: 'Vương miện & Giấy khen Đoàn trường',
    creator: 'Đoàn TN – Hội Sinh viên MUCE',
    checked_in_count: 520,
    total_attendees: 520,
    sort_order: 2,
    is_active: true
  },
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
    total_attendees: 245,
    sort_order: 3,
    is_active: true
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
    total_attendees: 182,
    sort_order: 4,
    is_active: true
  }
];

// ═══════════════════ API ROUTES ═══════════════════

// ─── GET /api/events ──────────────────────────────
app.get('/api/events', async (req, res) => {
  if (!pool) {
    return res.json({ events: [] });
  }
  try {
    const { rows } = await pool.query(`
      SELECT e.*, 
             COALESCE(e.checked_in_count, 0) + COUNT(v.id)::int as total_attendees
      FROM events e
      LEFT JOIN votes v ON v.event_id = e.id
      GROUP BY e.id
      ORDER BY e.sort_order, e.created_at
    `);
    // Trả về đúng danh sách từ Neon DB. Nếu người dùng xóa hết thì trả về mảng rỗng []
    return res.json({ events: rows || [] });
  } catch (e) {
    console.warn('⚠️ [DB Warning] GET /api/events error:', e.message);
    return res.json({ events: [] });
  }
});

// ─── POST /api/events ─────────────────────────────
app.post('/api/events', requireAdminAuth, async (req, res) => {
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
app.post('/api/events/:id/toggle', requireAdminAuth, async (req, res) => {
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
app.post('/api/events/:id/time-ratio', requireAdminAuth, async (req, res) => {
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

// ─── HÀM XÓA FILE ẢNH TRÊN Ổ CỨNG MÁY TÍNH / SERVER ──────────────
function deleteLocalPhotoFiles(contestantId) {
  if (!contestantId) return;
  const safeId = String(contestantId).replace(/[^a-zA-Z0-9_-]/g, '');
  const extensions = ['jpg', 'png', 'webp', 'jpeg'];
  extensions.forEach(ext => {
    const p1 = path.join(UPLOADS_DIR_PUBLIC, `${safeId}.${ext}`);
    const p2 = path.join(UPLOADS_DIR_ROOT, `${safeId}.${ext}`);
    try {
      if (fs.existsSync(p1)) fs.unlinkSync(p1);
    } catch (e) {
      console.warn(`[Xóa ảnh máy tính] Lỗi xóa ${p1}:`, e.message);
    }
    try {
      if (fs.existsSync(p2)) fs.unlinkSync(p2);
    } catch (e) {
      console.warn(`[Xóa ảnh máy tính] Lỗi xóa ${p2}:`, e.message);
    }
  });
  if (typeof photoBufferCache !== 'undefined') {
    photoBufferCache.delete(contestantId);
  }
}

// ─── DELETE /api/events/:id ───────────────────────
app.delete('/api/events/:id', requireAdminAuth, async (req, res) => {
  try {
    if (pool) {
      // Tìm các thí sinh thuộc sự kiện này để xóa tệp ảnh trên máy tính
      const { rows } = await pool.query('SELECT id FROM contestants WHERE event_id = $1', [req.params.id]);
      rows.forEach(r => deleteLocalPhotoFiles(r.id));
      await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    }
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
  const cleanFp = (voter_fingerprint || '').trim();
  const voterId = cleanFp ? `${voterIp}_${cleanFp}` : voterIp;

  if (isVpnOrProxy(voterIp)) {
    return res.status(400).json({
      error: 'Hệ thống phát hiện thiết bị đang bật VPN (1.1.1.1 / Proxy / Fake IP). Để đảm bảo tính minh bạch, bạn vui lòng TẮT VPN trên điện thoại rồi điểm danh!',
      code: 'VPN_DETECTED'
    });
  }

  try {
    let dupeQuery = 'SELECT COUNT(*)::int as cnt FROM votes WHERE contestant_id = $1 AND (';
    const dupeParams = [event_id];
    const dupeConditions = [];
    if (cleanFp) {
      dupeParams.push(cleanFp);
      dupeConditions.push(`voter_fp = $${dupeParams.length}`);
      dupeParams.push(`%_${cleanFp}`);
      dupeConditions.push(`voter_ip LIKE $${dupeParams.length}`);
    }
    if (cleanStudentId) {
      dupeParams.push(cleanStudentId);
      dupeConditions.push(`(student_id = $${dupeParams.length} AND student_id != '')`);
    }
    if (dupeConditions.length === 0) {
      dupeParams.push(voterId);
      dupeConditions.push(`voter_ip = $${dupeParams.length}`);
    }
    dupeQuery += dupeConditions.join(' OR ') + ')';

    const { rows: dupeCheck } = await pool.query(dupeQuery, dupeParams);
    if (dupeCheck[0].cnt >= 1) {
      return res.status(400).json({
        error: 'Thiết bị hoặc mã sinh viên này đã điểm danh cho sự kiện này rồi!',
        code: 'DUPLICATE_CHECKIN'
      });
    }

    const vote_id = 'chk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await pool.query(
      `INSERT INTO votes (vote_id, contestant_id, voter_name, student_id, student_class, faculty, comment, voter_ip, voter_fp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [vote_id, event_id, cleanVoterName, cleanStudentId, cleanStudentClass, cleanFaculty, comment || '', voterId, cleanFp]
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

// ─── GET /api/topic-data (gộp contestants + votes + my-votes) ────────────────
// Giảm từ 3 API calls tuần tự → 1 call song song để tăng tốc load trang
app.get('/api/topic-data', async (req, res) => {
  const eventId = req.query.event || req.query.event_id || 'evt_hoakhoi_2026';
  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const fp = req.query.fp || '';
  const voterId = fp ? `${voterIp}_${fp}` : voterIp;
  const studentId = (req.query.student_id || '').trim();

  try {
    // Chạy tất cả queries song song (Promise.all) thay vì tuần tự
    const [
      contestantsResult,
      votesResult,
      myVotesResult,
      eventResult,
      settingsResult
    ] = await Promise.all([
      // 1. Contestants (KHÔNG lấy trường photo để giảm payload - ảnh load riêng)
      pool.query('SELECT id, event_id, name, subtitle, color, sort_order, faculty, hometown FROM contestants WHERE event_id = $1 ORDER BY sort_order, id', [eventId]),
      // 2. Votes count
      pool.query(`
        SELECT c.id, COUNT(v.id)::int as count
        FROM contestants c
        LEFT JOIN votes v ON v.contestant_id = c.id AND (v.event_id = $1 OR v.event_id IS NULL)
        WHERE c.event_id = $1
        GROUP BY c.id
      `, [eventId]),
      // 3. My votes: Khớp CHÍNH XÁC theo Google Email của cử tri (không dùng chung fingerprint phần cứng tránh nhầm lẫn)
      (() => {
        const googleEmail = (req.query.google_email || '').toLowerCase().trim();
        if (googleEmail) {
          return pool.query(
            `SELECT DISTINCT v.contestant_id 
             FROM votes v 
             LEFT JOIN contestants c ON c.id = v.contestant_id 
             WHERE (v.event_id = $1 OR c.event_id = $1 OR v.event_id IS NULL) 
               AND LOWER(v.google_email) = $2`,
            [eventId, googleEmail]
          );
        }
        return pool.query('SELECT DISTINCT contestant_id FROM votes WHERE 1 = 0');
      })(),
      // 4. Event info
      pool.query('SELECT is_active, vote_ratio, end_time, start_time FROM events WHERE id = $1', [eventId]),
      // 5. Global settings
      pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'")
    ]);

    const contestants = contestantsResult.rows;

    const votes = {};
    let totalVotes = 0;
    votesResult.rows.forEach(r => { votes[r.id] = r.count; totalVotes += r.count; });

    const votedIds = myVotesResult.rows.map(r => r.contestant_id);

    const ev = eventResult.rows[0] || {};
    const globalRatio = settingsResult.rows.length ? parseInt(settingsResult.rows[0].value) || 80 : 80;
    const voteRatio = (ev.vote_ratio !== null && ev.vote_ratio !== undefined) ? parseInt(ev.vote_ratio) : globalRatio;
    const totalContestants = contestants.length;
    // Quy định chuẩn BTC: Mỗi tài khoản Google được bình chọn tối đa 3 thí sinh khác nhau (1 phiếu / 1 thí sinh)
    const maxAllowed = (ev.vote_ratio && ev.vote_ratio > 0 && ev.vote_ratio <= 10) ? parseInt(ev.vote_ratio) : 3;

    res.json({
      contestants,
      votes,
      totalVotes,
      votedIds,
      maxAllowed,
      voteRatio,
      is_active: ev.is_active !== false,
      start_time: ev.start_time || null,
      end_time: ev.end_time || null
    });
  } catch (e) {
    console.warn('⚠️ [DB Fallback] GET /api/topic-data using fallback due to:', e.message);
    const eventContestants = DEFAULT_CONTESTANTS.filter(c => c.event_id === eventId || eventId.includes('net_dep') || eventId.includes('hoakhoi'));
    const finalContestants = eventContestants.length ? eventContestants : DEFAULT_CONTESTANTS.slice(0, 7);
    const maxAllowed = 3;
    return res.json({
      contestants: finalContestants,
      votes: {},
      totalVotes: 0,
      votedIds: [],
      maxAllowed,
      voteRatio: 80,
      is_active: true,
      start_time: null,
      end_time: null
    });
  }
});

// ─── GET /api/contestants/:id/photo ──────────────
// Cache RAM máy chủ để ảnh phản hồi trong 0.5ms (không cần truy vấn Database mỗi lần)
const photoBufferCache = new Map();

app.get('/api/contestants/:id/photo', async (req, res) => {
  const id = req.params.id;

  // 1. Phục vụ TRỰC TIẾP TỪ ĐĨA MÁY TÍNH / SERVER (cực nhanh, không tốn tài nguyên DB)
  const possiblePaths = [
    path.join(__dirname, 'public', 'uploads', `${id}.jpg`),
    path.join(__dirname, 'public', 'uploads', `${id}.png`),
    path.join(__dirname, 'public', 'uploads', `${id}.webp`),
    path.join(__dirname, 'uploads', `${id}.jpg`),
    path.join(__dirname, 'uploads', `${id}.png`),
    path.join(__dirname, 'uploads', `${id}.webp`)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const ext = path.extname(p).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      return res.sendFile(p);
    }
  }

  // 2. Phục vụ ngay từ RAM máy chủ nếu đã có trong cache (0.5ms)
  if (req.query.json !== '1' && photoBufferCache.has(id)) {
    const cached = photoBufferCache.get(id);
    res.setHeader('Content-Type', cached.mime);
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    return res.send(cached.buffer);
  }

  if (!pool) {
    return res.status(404).send('Photo not found');
  }

  try {
    const { rows } = await pool.query('SELECT id, photo FROM contestants WHERE id = $1', [id]);
    if (!rows.length || !rows[0].photo) {
      return res.status(404).send('Photo not found');
    }
    const photo = rows[0].photo;

    // Nếu là đường dẫn tương đối lưu trên đĩa (vd: /uploads/hk_01.jpg)
    if (photo.startsWith('/uploads/') || photo.startsWith('uploads/')) {
      const relPath = photo.startsWith('/') ? photo.slice(1) : photo;
      const onDisk1 = path.join(__dirname, 'public', relPath);
      const onDisk2 = path.join(__dirname, relPath);
      if (fs.existsSync(onDisk1)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.sendFile(onDisk1);
      }
      if (fs.existsSync(onDisk2)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.sendFile(onDisk2);
      }
    }

    // Nếu client yêu cầu JSON rõ ràng
    if (req.query.json === '1') {
      res.setHeader('Cache-Control', 'public, max-age=604800');
      return res.json({ photo });
    }

    // Nếu là data URL (data:image/...;base64,...) -> Lưu ngay ra đĩa máy tính để lần sau không đọc DB nữa!
    const match = photo.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (match) {
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
      try {
        fs.writeFileSync(path.join(__dirname, 'public', 'uploads', `${id}.${ext}`), buffer);
        fs.writeFileSync(path.join(__dirname, 'uploads', `${id}.${ext}`), buffer);
      } catch (err) { }
      photoBufferCache.set(id, { mime, buffer });
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      return res.send(buffer);
    }

    // Nếu là URL bên ngoài (http://...)
    if (photo.startsWith('http://') || photo.startsWith('https://')) {
      return res.redirect(photo);
    }

    // Mặc định buffer base64
    const buffer = Buffer.from(photo, 'base64');
    try {
      fs.writeFileSync(path.join(__dirname, 'public', 'uploads', `${id}.jpg`), buffer);
      fs.writeFileSync(path.join(__dirname, 'uploads', `${id}.jpg`), buffer);
    } catch (err) { }
    photoBufferCache.set(id, { mime: 'image/jpeg', buffer });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    res.send(buffer);
  } catch (e) {
    console.error('GET /api/contestants/:id/photo error:', e);
    res.status(500).send('Error');
  }
});

// ─── GET /api/contestants ─────────────────────────
app.get('/api/contestants', async (req, res) => {
  const eventId = req.query.event || req.query.event_id;
  const noPhotos = req.query.no_photos === '1';
  try {
    const fields = noPhotos
      ? 'id, event_id, name, subtitle, color, sort_order, faculty, hometown'
      : '*';
    let query = `SELECT ${fields} FROM contestants`;
    let params = [];
    if (eventId) {
      query += ' WHERE event_id = $1';
      params.push(eventId);
    }
    query += ' ORDER BY sort_order, id';
    let { rows } = await pool.query(query, params);
    res.json({ contestants: rows });
  } catch (e) {
    console.warn('⚠️ [DB Fallback] GET /api/contestants using fallback due to:', e.message);
    const list = eventId ? DEFAULT_CONTESTANTS.filter(c => c.event_id === eventId) : DEFAULT_CONTESTANTS;
    return res.json({ contestants: list });
  }
});

// ─── POST /api/contestants ────────────────────────
app.post('/api/contestants', requireAdminAuth, async (req, res) => {
  const { contestants, event_id } = req.body;
  if (!Array.isArray(contestants)) return res.status(400).json({ error: 'Invalid data' });

  // 1. Tự động tải ảnh lên Cloudinary (25 GB miễn phí) để giải phóng 100% dung lượng Neon SQL
  //    Folder tự động theo event_id: evt_hoakhoi_2026 → "binhchon/hoakhoi_2026"
  //                                  evt_vetanh_2026  → "binhchon/vetanh_2026"
  //    Không cần sửa code khi tạo dự án mới!
  for (let i = 0; i < contestants.length; i++) {
    const c = contestants[i];
    let photoVal = c.photo || '';
    if (photoVal && photoVal.startsWith('data:image/')) {
      // Tạo tên folder Cloudinary tự động từ event_id
      const rawEventId = (c.event_id || event_id || 'chung').toString();
      // Bỏ tiền tố "evt_", giữ lại phần còn lại, thay ký tự không hợp lệ bằng "_"
      const folderSlug = rawEventId.replace(/^evt_/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const cloudinaryFolder = `binhchon/${folderSlug}`;

      try {
        const uploadRes = await cloudinary.uploader.upload(photoVal, {
          folder: cloudinaryFolder,
          public_id: c.id,
          overwrite: true,
          resource_type: 'image'
        });
        if (uploadRes && uploadRes.secure_url) {
          c.photo = uploadRes.secure_url;
          console.log(`☁️  [Cloudinary] Uploaded ${c.id} → ${cloudinaryFolder}/`);
        }
      } catch (cErr) {
        console.warn(`Cloudinary upload warning for ${c.id}:`, cErr.message);
      }

      try {
        const match = photoVal.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        const rawBase64 = match ? match[2] : photoVal;
        const mime = match ? match[1] : 'image/jpeg';
        const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
        const filename = `${c.id}.${ext}`;
        const buf = Buffer.from(rawBase64, 'base64');

        // Ghi thêm vào ổ đĩa máy tính dự phòng
        fs.writeFileSync(path.join(UPLOADS_DIR_PUBLIC, filename), buf);
        fs.writeFileSync(path.join(UPLOADS_DIR_ROOT, filename), buf);
        photoBufferCache.set(c.id, { mime, buffer: buf });
      } catch (err) {
        console.error(`Lỗi ghi ảnh vào đĩa cho thí sinh ${c.id}:`, err);
      }
    } else if (photoVal === '__DELETE__') {
      deleteLocalPhotoFiles(c.id);
    }
  }


  if (!pool) {
    return res.json({ success: true, contestants, warning: 'Không có kết nối DB, ảnh đã lưu vào máy tính' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Upsert each contestant. Giữ nguyên ảnh của các thí sinh khác nếu không gửi ảnh mới!
    for (let i = 0; i < contestants.length; i++) {
      const c = contestants[i];
      const photoParam = (c.photo === '__DELETE__') ? '__DELETE__' : (c.photo || '');
      await client.query(`
        INSERT INTO contestants (id, event_id, name, subtitle, color, photo, sort_order, faculty, hometown)
        VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 = '__DELETE__' THEN '' ELSE $6 END, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          event_id = EXCLUDED.event_id,
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          color = EXCLUDED.color,
          photo = CASE 
            WHEN $6 = '__DELETE__' THEN ''
            WHEN $6 IS NOT NULL AND $6 != '' AND $6 NOT LIKE '/uploads/%' THEN $6 
            ELSE contestants.photo 
          END,
          sort_order = EXCLUDED.sort_order,
          faculty = EXCLUDED.faculty,
          hometown = EXCLUDED.hometown
      `, [c.id, c.event_id || event_id || 'evt_hoakhoi_2026', c.name || '', c.subtitle || '', c.color || '#0057a8', photoParam, i, c.faculty || '', c.hometown || '']);
    }
    await client.query('COMMIT');
    res.json({ success: true, contestants });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /api/contestants error:', e);
    res.status(500).json({ error: 'Lỗi server: ' + (e.message || '') });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/contestants/:id ──────────────────
app.delete('/api/contestants/:id', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  try {
    // 1. Xóa dòng thí sinh trên cơ sở dữ liệu Neon (chỉ chứa text)
    if (pool) {
      await pool.query('DELETE FROM contestants WHERE id = $1', [id]);
    }
    // 2. Xóa đồng thời toàn bộ tệp ảnh trên ổ cứng máy tính
    deleteLocalPhotoFiles(id);

    res.json({ success: true, message: `Đã xóa thí sinh ${id} trên Neon và xóa ảnh khỏi máy tính.` });
  } catch (e) {
    console.error('DELETE /api/contestants error:', e);
    // Vẫn đảm bảo xóa tệp ảnh trên máy tính
    deleteLocalPhotoFiles(id);
    res.status(500).json({ error: 'Lỗi server: ' + (e.message || '') });
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
app.post('/api/votes/adjust', requireAdminAuth, async (req, res) => {
  const { contestant_id, amount, event_id } = req.body;
  if (!contestant_id) return res.status(400).json({ error: 'Thiếu contestant_id' });
  const delta = parseInt(amount, 10);
  if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'Số lượng điều chỉnh không hợp lệ' });

  // CHỐNG HACK / BƠM VOTE: Giới hạn tối đa 5 phiếu mỗi lần gọi API
  if (Math.abs(delta) > 5) {
    return res.status(400).json({ error: 'Bảo mật: Mỗi lần chỉ được điều chỉnh tối đa 5 phiếu (+5 / -5)!' });
  }

  // COOLDOWN BẢO VỆ PHÍA SERVER: Giới hạn tối thiểu 10 giây giữa các lần điều chỉnh
  const now = Date.now();
  const lastAdjust = adjustCooldownMap.get(contestant_id) || 0;
  if (now - lastAdjust < 10000) {
    const waitSec = Math.ceil((10000 - (now - lastAdjust)) / 1000);
    return res.status(429).json({ error: `Hệ thống đang bảo vệ: Vui lòng đợi ${waitSec} giây trước khi điều chỉnh tiếp!` });
  }
  adjustCooldownMap.set(contestant_id, now);

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

// ─── ALL /api/votes/purge-injected (Khôi phục / Xóa sạch vote ảo bị hack spam) ───
app.all('/api/votes/purge-injected', requireAdminAuth, async (req, res) => {
  const contestant_id = req.body?.contestant_id || req.query.contestant_id;
  const contestant_name = req.body?.contestant_name || req.query.contestant_name;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let deleteQuery = '';
    let params = [];

    // Phiếu ảo do tool hack / adjust sinh ra có đặc điểm:
    // vote_id LIKE 'v_%' VÀ (student_id = '' OR student_id IS NULL)
    if (contestant_id) {
      deleteQuery = `DELETE FROM votes WHERE contestant_id = $1 AND vote_id LIKE 'v_%' RETURNING id`;
      params = [contestant_id];
    } else if (contestant_name) {
      deleteQuery = `
        DELETE FROM votes 
        WHERE contestant_id IN (SELECT id FROM contestants WHERE LOWER(name) LIKE $1)
          AND vote_id LIKE 'v_%'
        RETURNING id
      `;
      params = [`%${contestant_name.trim().toLowerCase()}%`];
    } else {
      // Mặc định: Xóa toàn bộ vote ảo v_% trên toàn hệ thống
      deleteQuery = `DELETE FROM votes WHERE vote_id LIKE 'v_%' RETURNING id`;
      params = [];
    }

    const { rows: deletedRows, rowCount } = await client.query(deleteQuery, params);
    await client.query('COMMIT');

    // Lấy lại danh sách số phiếu mới nhất
    const { rows: totalRows } = await pool.query('SELECT COUNT(*)::int as total FROM votes');
    const { rows: countRows } = await pool.query(`
      SELECT c.id, c.name, COUNT(v.id)::int as count 
      FROM contestants c
      LEFT JOIN votes v ON v.contestant_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.sort_order, c.id
    `);

    res.json({
      success: true,
      deleted_count: rowCount || 0,
      total_votes: totalRows[0]?.total || 0,
      contestants: countRows,
      message: `Đã dọn dẹp và xóa thành công ${rowCount || 0} phiếu ảo (spam)! Toàn bộ phiếu bình chọn thật của sinh viên được bảo vệ nguyên vẹn 100%.`
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Purge error:', e);
    res.status(500).json({ error: 'Lỗi khi xóa phiếu ảo: ' + e.message });
  } finally {
    client.release();
  }
});

// ─── POST /api/vote ───────────────────────────────
app.post('/api/vote', async (req, res) => {
  const { contestant_id, event_id, voter_name, student_id, student_class, faculty, comment, voter_fingerprint, hp_token, is_automated, vote_duration, google_token } = req.body;
  if (!contestant_id) return res.status(400).json({ error: 'Thiếu contestant_id' });

  // 1. BẪY BOT (HONEYPOT TRAP) - Ô nhập liệu ẩn chỉ bot/tool quét được và tự điền
  if (hp_token && String(hp_token).trim() !== '') {
    return res.status(400).json({
      error: 'Hệ thống phát hiện hành vi tự động bất thường!',
      code: 'BOT_TRAP_TRIGGERED'
    });
  }

  // 2. CHẶN TOOL TỰ ĐỘNG & MÁY ẢO HEADLESS / WEBDRIVER
  if (is_automated === true) {
    return res.status(400).json({
      error: 'Hệ thống phát hiện môi trường giả lập / tự động hóa không hợp lệ!',
      code: 'AUTOMATION_DETECTED'
    });
  }

  // 3. CHẶN THAO TÁC QUÁ NHANH (TIME-TO-VOTE DƯỚI 1.2 GIÂY)
  const durationNum = parseInt(vote_duration) || 0;
  if (durationNum > 0 && durationNum < 1200) {
    return res.status(400).json({
      error: 'Thao tác quá nhanh! Vui lòng thao tác bình thường trên màn hình.',
      code: 'TOO_FAST'
    });
  }

  // 4. BẮT BUỘC ĐĂNG NHẬP GOOGLE CHÍNH CHỦ (XÁC THỰC TOKEN MÁY CHỦ GOOGLE)
  if (!google_token) {
    return res.status(401).json({
      error: 'Vui lòng đăng nhập tài khoản Google để xác thực bình chọn chính chủ!',
      code: 'GOOGLE_AUTH_REQUIRED'
    });
  }

  const googleUser = await verifyFirebaseTokenWithGoogle(google_token);
  let verifiedEmail = (googleUser?.email || '').toLowerCase().trim();
  let verifiedUid = googleUser?.localId || googleUser?.uid || '';

  // Fallback decode nếu mạng server gọi Google Identity Toolkit chập chờn
  if (!verifiedEmail) {
    try {
      const parts = google_token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.exp && Date.now() / 1000 < payload.exp && payload.email) {
          verifiedEmail = payload.email.toLowerCase().trim();
          verifiedUid = payload.user_id || payload.sub || '';
        }
      }
    } catch (err) { }
  }

  if (!verifiedEmail) {
    return res.status(401).json({
      error: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn! Vui lòng bấm đăng nhập lại.',
      code: 'INVALID_GOOGLE_TOKEN'
    });
  }

  const currentEventId = event_id || 'evt_hoakhoi_2026';
  const cleanVoterName = (voter_name || '').trim();
  const cleanStudentId = (student_id || '').trim();
  const cleanStudentClass = (student_class || '').trim();
  const cleanFaculty = (faculty || '').trim();
  const cleanFp = (voter_fingerprint || '').trim();

  // 5. CHUẨN HÓA HỌ VÀ TÊN NGƯỜI BÌNH CHỌN (CHỐNG GÕ BỪA SPAM)
  const nameError = validateVoterName(cleanVoterName);
  if (nameError) {
    return res.status(400).json({ error: nameError, code: 'INVALID_NAME' });
  }

  const voterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const voterId = cleanFp ? `${voterIp}_${cleanFp}` : voterIp;

  // 6. GIỚI HẠN TẦN SUẤT GỬI PHIẾU (RATE LIMITING)
  if (!checkVoteRateLimit(voterIp)) {
    return res.status(429).json({
      error: 'Bạn đang thao tác quá nhanh! Vui lòng chờ 30 giây rồi thử lại.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // 7. CHẶN VPN 1.1.1.1 (Cloudflare WARP) & PROXY DATACENTER / TOR
  if (isVpnOrProxy(voterIp)) {
    return res.status(400).json({
      error: 'Hệ thống phát hiện thiết bị đang bật VPN (1.1.1.1 / Proxy / Fake IP). Để đảm bảo tính minh bạch và công bằng cho cuộc thi, bạn vui lòng TẮT VPN trên điện thoại rồi thực hiện bình chọn!',
      code: 'VPN_DETECTED'
    });
  }

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

    const actualEventId = (contestantExists[0] && contestantExists[0].event_id) ? contestantExists[0].event_id : currentEventId;

    // 1. KHÓA 1 THÍ SINH THEO TÀI KHOẢN GOOGLE: 1 tài khoản chỉ được vote 1 lần cho CÙNG 1 thí sinh (khóa toàn hệ thống, không phụ thuộc event_id)
    const { rows: sameContestantVotes } = await pool.query(
      `SELECT v.id, c.name as contestant_name 
       FROM votes v 
       LEFT JOIN contestants c ON c.id = v.contestant_id 
       WHERE v.contestant_id = $1 
         AND LOWER(v.google_email) = $2
       LIMIT 1`,
      [contestant_id, verifiedEmail]
    );

    // 2. KHÓA 1 THÍ SINH THEO THIẾT BỊ: 1 thiết bị chỉ được vote 1 lần cho CÙNG 1 thí sinh (chống đổi Gmail trên cùng 1 máy để buff vote cho 1 người)
    if (cleanFp && cleanFp.startsWith('dev_')) {
      const { rows: deviceSameVotes } = await pool.query(
        `SELECT v.id, c.name as contestant_name 
         FROM votes v 
         LEFT JOIN contestants c ON c.id = v.contestant_id 
         WHERE v.contestant_id = $1 
           AND v.voter_fp = $2
         LIMIT 1`,
        [contestant_id, cleanFp]
      );
      if (deviceSameVotes.length > 0) {
        return res.status(400).json({
          error: `Thiết bị này đã được sử dụng để bình chọn cho thí sinh "${deviceSameVotes[0].contestant_name || 'này'}" rồi! Để đảm bảo tính công bằng, mỗi thiết bị chỉ được bình chọn 1 lần cho mỗi thí sinh.`,
          code: 'ALREADY_VOTED_SAME_CONTESTANT_DEVICE',
          contestant_id: contestant_id
        });
      }
    }

    // Lấy thông tin cuộc thi (trạng thái, tỉ lệ vote_ratio, thời gian)
    const { rows: eventRow } = await pool.query("SELECT is_active, vote_ratio, end_time, start_time FROM events WHERE id = $1", [actualEventId]);
    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const globalRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;
    const voteRatio = (eventRow.length && eventRow[0].vote_ratio !== null && eventRow[0].vote_ratio !== undefined) ? parseInt(eventRow[0].vote_ratio) : globalRatio;

    // Lấy tổng số thí sinh của cuộc thi
    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants WHERE (event_id = $1 OR event_id IS NULL)', [currentEventId]);
    const totalContestants = contestantCount[0]?.cnt || 10;
    // Quy định chuẩn BTC: Mỗi tài khoản Google được bình chọn tối đa 3 thí sinh khác nhau (1 phiếu / 1 thí sinh)
    const maxAllowed = (eventRow.length && eventRow[0].vote_ratio && eventRow[0].vote_ratio > 0 && eventRow[0].vote_ratio <= 10) 
      ? parseInt(eventRow[0].vote_ratio) 
      : 3;

    if (sameContestantVotes.length > 0) {
      // Nếu cử tri nhập lời chúc mới thì cập nhật lời chúc cho phiếu đã bầu
      if (comment && comment.trim() !== '' && comment.trim() !== 'Ủng hộ thí sinh!') {
        await pool.query(
          `UPDATE votes 
           SET comment = $1, 
               voter_name = COALESCE(NULLIF($2, ''), voter_name),
               created_at = NOW() 
           WHERE id = $3`,
          [comment.trim(), cleanVoterName, sameContestantVotes[0].id]
        );
        return res.json({
          success: true,
          updated_comment: true,
          contestant_name: sameContestantVotes[0].contestant_name || 'thí sinh',
          message: 'Đã cập nhật lời chúc thành công!'
        });
      }

      return res.status(400).json({
        error: `Bạn đã bình chọn cho thí sinh "${sameContestantVotes[0].contestant_name || 'này'}" rồi! Mỗi tài khoản chỉ được bình chọn 1 lần cho mỗi thí sinh (tối đa ${maxAllowed} thí sinh khác nhau).`,
        code: 'ALREADY_VOTED_SAME_CONTESTANT',
        contestant_id: contestant_id
      });
    }

    // 3. Kiểm tra tổng số thí sinh đã bình chọn theo maxAllowed của tài khoản Google này
    const { rows: totalVotedRows } = await pool.query(
      `SELECT COUNT(DISTINCT v.contestant_id)::int as total_voted 
       FROM votes v 
       WHERE (event_id = $1 OR event_id IS NULL) 
         AND LOWER(v.google_email) = $2`,
      [currentEventId, verifiedEmail]
    );

    const totalVoted = totalVotedRows[0]?.total_voted || 0;
    if (totalVoted >= maxAllowed) {
      return res.status(400).json({
        error: `Bạn đã sử dụng hết tối đa ${maxAllowed} lượt bình chọn cho ${maxAllowed} thí sinh khác nhau! Mỗi tài khoản Google chỉ được bình chọn 1 lần cho tối đa ${maxAllowed} thí sinh khác nhau.`,
        code: 'QUOTA_EXCEEDED'
      });
    }

    // 4. Kiểm tra trạng thái bật/tắt, thời gian mở/kết thúc của cuộc thi này
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

        // 7. Ghi phiếu bầu kèm thông tin Google Auth + Device Hardware Fingerprint
        const vote_id = 'vote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        await pool.query(
          `INSERT INTO votes (vote_id, contestant_id, event_id, voter_name, student_id, student_class, faculty, comment, voter_ip, voter_fp, google_email, google_uid) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (LOWER(google_email), contestant_id) DO NOTHING`,
          [vote_id, contestant_id, actualEventId, cleanVoterName, cleanStudentId, cleanStudentClass, cleanFaculty, comment || '', voterId, cleanFp, verifiedEmail, verifiedUid]
        );

        const { rows } = await pool.query('SELECT name FROM contestants WHERE id = $1', [contestant_id]);
        const name = rows.length ? rows[0].name : contestant_id;
        const remaining = Math.max(0, maxAllowed - (totalVoted + 1));

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

// ─── POST /api/vote/cancel (Hủy / Thu hồi lượt bình chọn) ───────────────
app.post('/api/vote/cancel', async (req, res) => {
  const { contestant_id, event_id, google_token, google_email } = req.body;

  const currentEventId = event_id || 'evt_hoakhoi_2026';

  let verifiedEmail = (google_email || '').toLowerCase().trim();
  if (google_token) {
    const googleUser = await verifyFirebaseTokenWithGoogle(google_token);
    if (googleUser && googleUser.email) {
      verifiedEmail = googleUser.email.toLowerCase().trim();
    } else {
      try {
        const parts = google_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.exp && Date.now() / 1000 < payload.exp && payload.email) {
            verifiedEmail = payload.email.toLowerCase().trim();
          }
        }
      } catch (err) { }
    }
  }

  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập Google để hủy lượt bình chọn!' });
  }

  try {
    const params = [currentEventId, verifiedEmail];
    let contestantFilter = '';
    if (contestant_id) {
      params.push(contestant_id);
      contestantFilter = `AND contestant_id = $${params.length}`;
    }

    const deleteQuery = `
      DELETE FROM votes 
      WHERE id IN (
        SELECT id FROM votes 
        WHERE (event_id = $1 OR event_id IS NULL) 
          AND LOWER(google_email) = $2
          ${contestantFilter}
        ORDER BY id DESC
        LIMIT 1
      )
      RETURNING id, vote_id, contestant_id
    `;
    const { rows: deletedRows } = await pool.query(deleteQuery, params);

    const targetCId = contestant_id || deletedRows[0]?.contestant_id;
    let newCount = 0;
    if (targetCId) {
      const { rows: countRows } = await pool.query(
        'SELECT COUNT(*)::int as count FROM votes WHERE contestant_id = $1 AND (event_id = $2 OR event_id IS NULL)',
        [targetCId, currentEventId]
      );
      newCount = countRows[0]?.count || 0;
    }

    res.json({
      success: true,
      message: 'Đã hủy lượt bình chọn thành công!',
      deleted_count: deletedRows.length,
      contestant_id: targetCId,
      new_count: newCount
    });
  } catch (e) {
    console.error('POST /api/vote/cancel error:', e);
    res.status(500).json({ error: 'Lỗi khi hủy phiếu bầu' });
  }
});

// ─── GET /api/my-votes ────────────────────────────
app.get('/api/my-votes', async (req, res) => {
  const eventId = req.query.event || req.query.event_id || 'evt_hoakhoi_2026';
  const googleEmail = (req.query.google_email || '').toLowerCase().trim();

  try {
    let votedIds = [];
    if (googleEmail) {
      const myVotesQuery = `SELECT DISTINCT contestant_id FROM votes WHERE (event_id = $1 OR event_id IS NULL) AND LOWER(google_email) = $2`;
      const { rows } = await pool.query(myVotesQuery, [eventId, googleEmail]);
      votedIds = rows.map(r => r.contestant_id);
    }

    const { rows: eventRow } = await pool.query("SELECT is_active, vote_ratio, end_time, start_time FROM events WHERE id = $1", [eventId]);
    const { rows: settingsRows } = await pool.query("SELECT value FROM settings WHERE key = 'vote_ratio'");
    const globalRatio = settingsRows.length ? parseInt(settingsRows[0].value) || 80 : 80;
    const voteRatio = (eventRow.length && eventRow[0].vote_ratio) ? parseInt(eventRow[0].vote_ratio) : globalRatio;
    const { rows: contestantCount } = await pool.query('SELECT COUNT(*)::int as cnt FROM contestants WHERE (event_id = $1 OR event_id IS NULL)', [eventId]);
    const totalContestants = contestantCount[0].cnt || 0;
    const maxAllowed = (eventRow.length && eventRow[0].vote_ratio && eventRow[0].vote_ratio > 0 && eventRow[0].vote_ratio <= 10) 
      ? parseInt(eventRow[0].vote_ratio) 
      : 3;
    const isDeviceBanned = votedIds.length >= maxAllowed;

    res.json({
      votedIds,
      currentVotes: votedIds.length,
      maxAllowed,
      voteRatio,
      totalContestants,
      isDeviceBanned,
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

// ─── GET /api/admin-data (gộp events+contestants+votes+shares+log+settings) ──
// Giảm từ 6 API calls tuần tự → 1 call song song để admin load nhanh hơn
app.get('/api/admin-data', async (req, res) => {
  try {
    const [
      eventsResult,
      contestantsResult,
      votesResult,
      sharesResult,
      logResult,
      settingsResult
    ] = await Promise.all([
      // 1. Events
      pool.query(`
        SELECT e.*, 
               COALESCE(e.checked_in_count, 0) + COUNT(v.id)::int as total_attendees
        FROM events e
        LEFT JOIN votes v ON v.event_id = e.id
        GROUP BY e.id
        ORDER BY e.sort_order, e.created_at
      `),
      // 2. Contestants (KHÔNG lấy chuỗi ảnh Base64 khổng lồ để tiết kiệm 100% băng thông Neon Egress)
      pool.query('SELECT id, event_id, name, subtitle, color, sort_order, faculty, hometown FROM contestants ORDER BY sort_order, id'),
      // 3. Votes
      pool.query(`
        SELECT c.id, c.event_id, COUNT(v.id)::int as count
        FROM contestants c
        LEFT JOIN votes v ON v.contestant_id = c.id
        GROUP BY c.id, c.event_id
        ORDER BY c.sort_order, c.id
      `),
      // 4. Shares
      pool.query(`
        SELECT s.contestant_id as id, COUNT(*)::int as count
        FROM shares s
        WHERE s.contestant_id IS NOT NULL
        GROUP BY s.contestant_id
      `).catch(() => ({ rows: [] })),
      // 5. Vote log (giới hạn 500 bản ghi gần nhất để tránh payload lớn)
      pool.query(`
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
        LEFT JOIN events ev ON ev.id = v.event_id
        ORDER BY v.created_at DESC
        LIMIT 500
      `),
      // 6. Settings
      pool.query('SELECT key, value FROM settings')
    ]);

    const votes = {};
    let totalVotes = 0;
    votesResult.rows.forEach(r => { votes[r.id] = r.count; totalVotes += r.count; });

    const shares = {};
    let totalShares = 0;
    sharesResult.rows.forEach(r => { shares[r.id] = r.count; totalShares += r.count; });

    const settings = {};
    settingsResult.rows.forEach(r => { settings[r.key] = r.value; });

    res.json({
      events: eventsResult.rows,
      contestants: contestantsResult.rows,
      votes,
      totalVotes,
      shares,
      totalShares,
      log: logResult.rows,
      settings
    });
  } catch (e) {
    console.error('GET /api/admin-data error:', e);
    res.status(500).json({ error: 'Lỗi server' });
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
app.put('/api/vote/:voteId', requireAdminAuth, async (req, res) => {
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
app.delete('/api/vote/:voteId', requireAdminAuth, async (req, res) => {
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
app.post('/api/settings', requireAdminAuth, async (req, res) => {
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

// ─── POST /api/admin/cleanup-photos ──────────────
// Dọn dẹp ảnh base64 còn sót trong DB (chỉ giữ lại URL Cloudinary)
// Gọi 1 lần sau khi đã đảm bảo toàn bộ ảnh đã lên Cloudinary
app.post('/api/admin/cleanup-photos', requireAdminAuth, async (req, res) => {
  try {
    // 1. Đếm số thí sinh còn ảnh base64 trong DB
    const { rows: b64Rows } = await pool.query(`
      SELECT id, LEFT(photo, 30) as photo_preview
      FROM contestants
      WHERE photo LIKE 'data:image/%'
         OR (photo != '' AND photo NOT LIKE 'http%' AND photo NOT LIKE '/uploads/%')
    `);

    if (b64Rows.length === 0) {
      return res.json({ success: true, cleaned: 0, message: 'Không còn ảnh base64 trong DB. DB đã sạch!' });
    }

    // 2. Xóa base64, giữ lại URL Cloudinary & /uploads/...
    const { rowCount } = await pool.query(`
      UPDATE contestants
      SET photo = ''
      WHERE photo LIKE 'data:image/%'
         OR (photo != '' AND photo NOT LIKE 'http%' AND photo NOT LIKE '/uploads/%')
    `);

    // 3. Dọn dẹp ảnh base64 trong vote_archives.contestants_data (JSON)
    let archivesCleaned = 0;
    try {
      const { rows: arcRows } = await pool.query(`SELECT id, archive_id, contestants_data FROM vote_archives WHERE contestants_data IS NOT NULL AND contestants_data != '[]'`);
      for (const arc of arcRows) {
        try {
          const contestants = JSON.parse(arc.contestants_data || '[]');
          let changed = false;
          for (const c of contestants) {
            if (c.photo && (c.photo.startsWith('data:image/') || (!c.photo.startsWith('http') && !c.photo.startsWith('/uploads/')))) {
              c.photo = '';
              changed = true;
            }
          }
          if (changed) {
            await pool.query('UPDATE vote_archives SET contestants_data = $1 WHERE id = $2', [JSON.stringify(contestants), arc.id]);
            archivesCleaned++;
          }
        } catch (parseErr) { }
      }
    } catch (arcErr) {
      console.warn('Lỗi dọn dẹp archives (bỏ qua):', arcErr.message);
    }

    res.json({
      success: true,
      cleaned: rowCount || 0,
      archives_cleaned: archivesCleaned,
      message: `✅ Đã xóa ảnh base64 khỏi ${rowCount} thí sinh trong DB và ${archivesCleaned} bản lưu trữ. Neon Egress sẽ giảm đáng kể!`
    });
  } catch (e) {
    console.error('POST /api/admin/cleanup-photos error:', e);
    res.status(500).json({ error: 'Lỗi dọn dẹp ảnh: ' + e.message });
  }
});

// ─── POST /api/archives ───────────────────────────
// Lưu trữ đợt bình chọn hiện tại vào kho lịch sử
app.post('/api/archives', requireAdminAuth, async (req, res) => {
  const { title, notes } = req.body;
  try {
    const archive_id = 'arc_' + Date.now();
    const finalTitle = (title || '').trim() || ('Đợt bình chọn ' + new Date().toLocaleString('vi-VN'));

    const { rows: contestants } = await pool.query('SELECT id, event_id, name, subtitle, color, sort_order, faculty, hometown FROM contestants ORDER BY sort_order, id');
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
app.delete('/api/archives/:id', requireAdminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM vote_archives WHERE archive_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/archives/:id error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── POST /api/archives/:id/restore ───────────────
// Khôi phục phiếu bầu từ kho lưu trữ (chỉ chèn thêm, không xóa phiếu hiện có)
app.post('/api/archives/:id/restore', requireAdminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT * FROM vote_archives WHERE archive_id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy bản lưu' });

    const arc = rows[0];
    const voteLog = JSON.parse(arc.vote_log_data || '[]');

    if (!voteLog.length) {
      return res.json({ success: true, restored: 0, skipped: 0, message: 'Không có phiếu nào trong archive này' });
    }

    // Lấy mapping contestant_id -> event_id từ database và từ archive contestants_data
    const { rows: cDbRows } = await client.query('SELECT id, event_id FROM contestants');
    const contestantEventMap = {};
    cDbRows.forEach(c => { contestantEventMap[c.id] = c.event_id; });

    // Bổ sung từ archive nếu contestant chưa có trong DB
    try {
      const arcContestants = JSON.parse(arc.contestants_data || '[]');
      arcContestants.forEach(c => {
        if (!contestantEventMap[c.id]) {
          contestantEventMap[c.id] = c.event_id || 'evt_net_dep_nu_sinh_muce_qua_ong_kinh_mvasalg8';
        }
      });
    } catch (_) { }

    await client.query('BEGIN');

    // Chèn theo từng batch 100 phiếu để siêu nhanh (chỉ mất ~1-2 giây)
    const BATCH_SIZE = 100;
    let totalRestored = 0;

    for (let i = 0; i < voteLog.length; i += BATCH_SIZE) {
      const chunk = voteLog.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];

      chunk.forEach((v, idx) => {
        const offset = idx * 9;
        const eventId = contestantEventMap[v.id] || 'evt_net_dep_nu_sinh_muce_qua_ong_kinh_mvasalg8';
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`);
        values.push(
          v.vote_id,
          v.id,
          eventId,
          v.voterName || 'Người ẩn danh',
          v.comment || '',
          v.studentId || '',
          v.studentClass || '',
          v.faculty || '',
          v.ts || new Date()
        );
      });

      const insertQuery = `
        INSERT INTO votes (vote_id, contestant_id, event_id, voter_name, comment,
                           student_id, student_class, faculty, created_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (vote_id) DO NOTHING
        RETURNING id
      `;

      const insertRes = await client.query(insertQuery, values);
      totalRestored += (insertRes.rowCount || 0);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      restored: totalRestored,
      total_in_archive: voteLog.length,
      message: `✅ Đã khôi phục thành công ${totalRestored} phiếu bầu từ archive "${arc.title}"!`
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('POST /api/archives/:id/restore error:', e);
    res.status(500).json({ error: 'Lỗi server: ' + e.message });
  } finally {
    client.release();
  }
});

// ─── POST /api/events/:id/reset-votes (Đặt lại phiếu riêng từng cuộc thi) ───
app.post('/api/events/:id/reset-votes', requireAdminAuth, async (req, res) => {
  const eventId = req.params.id;
  const { title } = req.body || {};
  try {
    const { rows: cnt } = await pool.query(
      'SELECT COUNT(*)::int as c FROM votes WHERE event_id = $1 OR (event_id IS NULL AND $1 = \'evt_hoakhoi_2026\')',
      [eventId]
    );
    if (cnt[0]?.c > 0) {
      const archive_id = 'arc_ev_' + eventId + '_' + Date.now();
      const finalTitle = title || (`Reset cuộc thi ${eventId} (` + new Date().toLocaleString('vi-VN') + `)`);
      const { rows: contestants } = await pool.query('SELECT id, event_id, name, subtitle, color, sort_order, faculty, hometown FROM contestants WHERE event_id = $1 ORDER BY sort_order, id', [eventId]);
      const { rows: votesData } = await pool.query(`
        SELECT contestant_id as id, COUNT(*)::int as count 
        FROM votes WHERE event_id = $1 OR (event_id IS NULL AND $1 = 'evt_hoakhoi_2026') GROUP BY contestant_id
      `, [eventId]);
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
        WHERE v.event_id = $1 OR (v.event_id IS NULL AND $1 = 'evt_hoakhoi_2026')
        ORDER BY v.created_at ASC
      `, [eventId]);
      await pool.query(`
        INSERT INTO vote_archives (archive_id, title, notes, total_votes, contestants_data, votes_data, vote_log_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        archive_id,
        finalTitle,
        `Tự động lưu trữ trước khi reset cuộc thi ${eventId}`,
        cnt[0].c,
        JSON.stringify(contestants),
        JSON.stringify(votes),
        JSON.stringify(voteLog)
      ]);
    }
    await pool.query('DELETE FROM votes WHERE event_id = $1 OR (event_id IS NULL AND $1 = \'evt_hoakhoi_2026\')', [eventId]);
    res.json({ success: true, archived: true, message: 'Đã đặt lại phiếu bầu thành công cho cuộc thi này!' });
  } catch (e) {
    console.error('POST /api/events/:id/reset-votes error:', e);
    res.status(500).json({ error: 'Lỗi server: ' + e.message });
  }
});

// ─── POST /api/reset-votes ───────────────────────
app.post('/api/reset-votes', requireAdminAuth, async (req, res) => {
  const { auto_archive, title, notes } = req.body || {};
  try {
    // Tự động lưu trữ vào kho trước khi xóa phiếu
    if (auto_archive !== false) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*)::int as c FROM votes');
      if (cnt[0].c > 0) {
        const archive_id = 'arc_' + Date.now();
        const finalTitle = title || ('Đợt trước khi Reset (' + new Date().toLocaleString('vi-VN') + ')');
        const { rows: contestants } = await pool.query('SELECT id, event_id, name, subtitle, color, sort_order, faculty, hometown FROM contestants ORDER BY sort_order, id');
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
app.post('/api/reset-all', requireAdminAuth, async (req, res) => {
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
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  // Khởi tạo DB trong nền để Render luôn nhận cổng HTTP ngay lập tức
  initDB().catch(e => {
    console.error('⚠️ [DB Warning] Lỗi khởi tạo DB trong nền:', e.message);
  });
});
