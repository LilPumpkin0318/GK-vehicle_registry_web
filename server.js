const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  records: path.join(DATA_DIR, 'records.json'),
  errors: path.join(DATA_DIR, 'server-errors.log')
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

async function ensureStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(PUBLIC_DIR, { recursive: true });

  if (!fs.existsSync(FILES.users)) {
    await fsp.writeFile(FILES.users, JSON.stringify({
      admin: {
        username: 'admin',
        displayName: 'admin',
        role: 'admin',
        passwordHash: hashPassword('admin123'),
        createdAt: new Date().toISOString()
      }
    }, null, 2), 'utf8');
  }

  if (!fs.existsSync(FILES.sessions)) {
    await fsp.writeFile(FILES.sessions, JSON.stringify({}, null, 2), 'utf8');
  }

  if (!fs.existsSync(FILES.records)) {
    await fsp.writeFile(FILES.records, JSON.stringify([], null, 2), 'utf8');
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password ?? '')).digest('hex');
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function logError(context, error) {
  const stamp = new Date().toISOString();
  const detail = [
    `[${stamp}] ${context}`,
    error?.stack || error?.message || String(error),
    ''
  ].join('\n');
  await fsp.appendFile(FILES.errors, detail, 'utf8');
  console.error(detail);
}

function parseCookies(header = '') {
  return header.split(';').reduce((acc, entry) => {
    const index = entry.indexOf('=');
    if (index === -1) {
      return acc;
    }
    const key = entry.slice(0, index).trim();
    const value = decodeURIComponent(entry.slice(index + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.factory_session;
  if (!token) return null;

  const sessions = await readJson(FILES.sessions, {});
  const session = sessions[token];
  if (!session) return null;

  const users = await readJson(FILES.users, {});
  const user = users[session.username];
  if (!user) return null;

  return {
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || (user.username === 'admin' ? 'admin' : 'user'),
    createdAt: user.createdAt
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function extractPlateNumbers(text) {
  const raw = String(text ?? '');
  const strictMatches = Array.from(
    raw.matchAll(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}[A-Z0-9挂学警港澳]?)/gi),
    (match) => match[1].toUpperCase()
  );
  if (strictMatches.length) {
    return Array.from(new Set(strictMatches));
  }

  const fallbackMatches = Array.from(
    raw.matchAll(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{5,6})(?:[^A-Z0-9]|$)/gi),
    (match) => match[1].toUpperCase()
  );
  return Array.from(new Set(fallbackMatches));
}

function normalizePlateList(value) {
  const source = Array.isArray(value) ? value : [value];
  const plates = [];

  for (const item of source) {
    for (const plate of extractPlateNumbers(item)) {
      if (!plates.includes(plate)) {
        plates.push(plate);
      }
    }
  }

  return plates;
}

function todayIsoDateLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateInputLocal(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractPlateNumbersRobust(text) {
  const raw = String(text ?? '');
  const strictMatches = Array.from(
    raw.matchAll(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}[A-Z0-9挂学警港澳]?)/gi),
    (match) => match[1].toUpperCase()
  );
  if (strictMatches.length) {
    return Array.from(new Set(strictMatches));
  }

  const fallbackMatches = Array.from(
    raw.matchAll(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{5,6})(?:[^A-Z0-9]|$)/gi),
    (match) => match[1].toUpperCase()
  );
  return Array.from(new Set(fallbackMatches));
}

function normalizeVehicleRows(body, user) {
  const isNormalUser = user && user.role !== 'admin';
  const shared = {
    deliveryDate: normalizeDateInputLocal(body.deliveryDate) || todayIsoDateLocal(),
    companyName: isNormalUser ? (user.displayName || user.username) : (String(body.companyName ?? '').trim() || user.displayName || user.username),
    contractNo: String(body.contractNo ?? '').trim()
  };

  const fallbackVehicle = {
    driverName: String(body.driverName ?? '').trim(),
    driverIdNo: String(body.driverIdNo ?? '').trim(),
    driverPhone: String(body.driverPhone ?? '').trim(),
    cargoCategory: String(body.cargoCategory ?? '').trim(),
    tonnage: Number(body.tonnage),
    remarks: String(body.remarks ?? '').trim()
  };

  const vehicles = Array.isArray(body.vehicles) && body.vehicles.length
    ? body.vehicles
    : extractPlateNumbersRobust(body.plateNos ?? body.plateNo).map((plateNo) => ({ plateNo }));

  return vehicles
    .map((vehicle) => {
      const vehiclePlates = extractPlateNumbersRobust(vehicle?.plateNos ?? vehicle?.plateNo);
      const plateNo = String(vehicle?.plateNo ?? vehiclePlates[0] ?? '').trim().toUpperCase();
      return {
        ...shared,
        plateNo,
        driverName: String(vehicle?.driverName ?? fallbackVehicle.driverName).trim(),
        driverIdNo: String(vehicle?.driverIdNo ?? fallbackVehicle.driverIdNo).trim(),
        driverPhone: String(vehicle?.driverPhone ?? fallbackVehicle.driverPhone).trim(),
        cargoCategory: String(vehicle?.cargoCategory ?? fallbackVehicle.cargoCategory).trim(),
        tonnage: Number(vehicle?.tonnage ?? fallbackVehicle.tonnage),
        remarks: String(vehicle?.remarks ?? fallbackVehicle.remarks).trim(),
        ownerUsername: user.username,
        ownerDisplayName: user.displayName,
        confirmation: String(vehicle?.confirmation ?? '').trim()
      };
    })
    .filter((vehicle) => String(vehicle.plateNo ?? '').trim());
}

function validateRecord(record) {
  const required = [
    'deliveryDate',
    'companyName',
    'contractNo',
    'plateNo',
    'driverName',
    'driverIdNo',
    'driverPhone',
    'cargoCategory',
    'tonnage'
  ];
  for (const field of required) {
    if (!String(record[field] ?? '').trim()) {
      return `缺少字段：${field}`;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.deliveryDate)) {
    return '提货日期格式不正确';
  }

  if (!Number.isFinite(Number(record.tonnage)) || Number(record.tonnage) <= 0) {
    return '提货吨位必须是大于 0 的数字';
  }

  return null;
}

function withId(record) {
  return {
    id: crypto.randomUUID(),
    ...record,
    tonnage: Number(record.tonnage),
    createdAt: new Date().toISOString()
  };
}

async function handleLogin(req, res) {
  const body = await parseBody(req);
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const displayNameInput = String(body.displayName ?? '').trim();
  const users = await readJson(FILES.users, {});
  const existing = users[username];
  const displayName = displayNameInput || existing?.displayName || username;

  if (!username || !password) {
    return sendJson(res, 400, { error: '请输入用户名和密码。' });
  }

  const passwordHash = hashPassword(password);

  if (!existing) {
    return sendJson(res, 401, { error: '用户不存在，请联系管理员创建账号。' });
  } else if (existing.passwordHash !== passwordHash) {
    return sendJson(res, 401, { error: '用户名或密码不正确。' });
  } else if (displayNameInput && displayNameInput !== existing.displayName) {
    existing.displayName = displayNameInput;
    await writeJson(FILES.users, users);
  }

  const token = createToken();
  const sessions = await readJson(FILES.sessions, {});
  sessions[token] = {
    username,
    createdAt: new Date().toISOString()
  };
  await writeJson(FILES.sessions, sessions);

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': `factory_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  });
  res.end(JSON.stringify({
    user: {
      username,
      displayName: users[username].displayName || username,
      role: users[username].role || (username === 'admin' ? 'admin' : 'user')
    }
  }));
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.factory_session;
  if (token) {
    const sessions = await readJson(FILES.sessions, {});
    delete sessions[token];
    await writeJson(FILES.sessions, sessions);
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': 'factory_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
  });
  res.end(JSON.stringify({ ok: true }));
}

async function handleGetMe(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return sendJson(res, 401, { error: '未登录。' });
  }
  return sendJson(res, 200, { user });
}

async function handleGetRecords(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return sendJson(res, 401, { error: '未登录。' });
  }

  const records = await readJson(FILES.records, []);
  const mine = records
    .filter((record) => record.ownerUsername === user.username)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return sendJson(res, 200, { records: mine });
}

async function handleCreateRecord(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return sendJson(res, 401, { error: '未登录。' });
  }

  const body = await parseBody(req);
  const normalizedDeliveryDate = normalizeDateInputLocal(body.deliveryDate);
  if (String(body.deliveryDate ?? '').trim() && normalizedDeliveryDate === null) {
    return sendJson(res, 400, { error: '提货日期格式不正确' });
  }

  const vehicleRows = normalizeVehicleRows({
    ...body,
    deliveryDate: normalizedDeliveryDate || todayIsoDateLocal()
  }, user);

  if (!vehicleRows.length) {
    return sendJson(res, 400, { error: '请至少填写一个车牌号。' });
  }

  const records = await readJson(FILES.records, []);
  const createdRecords = [];

  for (const vehicle of vehicleRows) {
    const record = {
      ...vehicle,
      deliveryDate: vehicle.deliveryDate || todayIsoDateLocal(),
      companyName: vehicle.companyName || user.displayName || user.username,
      contractNo: vehicle.contractNo || String(body.contractNo ?? '').trim(),
      tonnage: Number(vehicle.tonnage)
    };

    const validationError = validateRecord(record);
    if (validationError) {
      return sendJson(res, 400, { error: validationError });
    }

    createdRecords.push(withId(record));
  }

  records.push(...createdRecords);
  await writeJson(FILES.records, records);

  return sendJson(res, 201, {
    record: createdRecords[0] || null,
    records: createdRecords
  });
}

async function getAdminUser(req) {
  const user = await getSessionUser(req);
  if (!user) return null;
  if (user.role === 'admin' || user.username === 'admin') {
    return user;
  }
  return null;
}

async function handleAdminGetUsers(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const users = await readJson(FILES.users, {});
  const list = Object.values(users).map(u => ({
    username: u.username,
    displayName: u.displayName || u.username,
    role: u.role || (u.username === 'admin' ? 'admin' : 'user'),
    createdAt: u.createdAt
  }));
  return sendJson(res, 200, { users: list });
}

async function handleAdminCreateUser(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const body = await parseBody(req);
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const displayName = String(body.displayName ?? '').trim() || username;
  const role = String(body.role ?? 'user').trim();

  if (!username || !password) {
    return sendJson(res, 400, { error: '请输入用户名和密码。' });
  }

  const users = await readJson(FILES.users, {});
  if (users[username]) {
    return sendJson(res, 400, { error: '用户已存在。' });
  }

  users[username] = {
    username,
    displayName,
    role,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  await writeJson(FILES.users, users);

  return sendJson(res, 201, {
    user: {
      username,
      displayName,
      role
    }
  });
}

async function handleAdminResetPassword(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const body = await parseBody(req);
  const username = String(body.username ?? '').trim();
  const newPassword = String(body.newPassword ?? '');

  if (!username || !newPassword) {
    return sendJson(res, 400, { error: '请输入用户名和新密码。' });
  }

  const users = await readJson(FILES.users, {});
  if (!users[username]) {
    return sendJson(res, 400, { error: '用户不存在。' });
  }

  users[username].passwordHash = hashPassword(newPassword);
  await writeJson(FILES.users, users);

  return sendJson(res, 200, { ok: true });
}

async function handleAdminDeleteUser(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const body = await parseBody(req);
  const username = String(body.username ?? '').trim();

  if (!username) {
    return sendJson(res, 400, { error: '请输入要删除的用户名。' });
  }

  if (username === 'admin') {
    return sendJson(res, 400, { error: '无法删除默认管理员账号。' });
  }

  const users = await readJson(FILES.users, {});
  if (!users[username]) {
    return sendJson(res, 400, { error: '用户不存在。' });
  }

  delete users[username];
  await writeJson(FILES.users, users);

  const sessions = await readJson(FILES.sessions, {});
  for (const token of Object.keys(sessions)) {
    if (sessions[token].username === username) {
      delete sessions[token];
    }
  }
  await writeJson(FILES.sessions, sessions);

  return sendJson(res, 200, { ok: true });
}

async function handleAdminGetRecords(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const records = await readJson(FILES.records, []);
  const sorted = records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sendJson(res, 200, { records: sorted });
}

async function handleAdminConfirmRecord(req, res) {
  const admin = await getAdminUser(req);
  if (!admin) return sendJson(res, 403, { error: '权限不足。' });

  const body = await parseBody(req);
  const recordId = String(body.recordId ?? '').trim();

  if (!recordId) {
    return sendJson(res, 400, { error: '缺少记录 ID。' });
  }

  const records = await readJson(FILES.records, []);
  const record = records.find(r => r.id === recordId);

  if (!record) {
    return sendJson(res, 404, { error: '找不到对应的车辆记录。' });
  }

  record.confirmation = 'confirmed';
  await writeJson(FILES.records, records);

  return sendJson(res, 200, { record });
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, 'Forbidden');
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      return serveStatic(req, res, path.join(pathname, 'index.html'));
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const buffer = await fsp.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(buffer);
  } catch {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    const buffer = await fsp.readFile(indexPath);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(buffer);
  }
}

async function router(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/me') {
    return handleGetMe(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    return handleLogin(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    return handleLogout(req, res);
  }

  if (req.method === 'GET' && pathname === '/api/records') {
    return handleGetRecords(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/records') {
    return handleCreateRecord(req, res);
  }

  // Admin routes
  if (req.method === 'GET' && pathname === '/api/admin/users') {
    return handleAdminGetUsers(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/admin/users/create') {
    return handleAdminCreateUser(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/admin/users/reset-password') {
    return handleAdminResetPassword(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/admin/users/delete') {
    return handleAdminDeleteUser(req, res);
  }

  if (req.method === 'GET' && pathname === '/api/admin/records') {
    return handleAdminGetRecords(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/admin/records/confirm') {
    return handleAdminConfirmRecord(req, res);
  }

  if (req.method === 'GET' && pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: '接口不存在。' });
  }

  return serveStatic(req, res, pathname);
}

async function main() {
  await ensureStore();

  const server = http.createServer((req, res) => {
    router(req, res).catch((error) => {
      logError(`${req.method} ${req.url}`, error).catch(() => {});
      sendJson(res, 500, { error: '服务器内部错误。' });
    });
  });

  const port = Number(globalThis.__PORT_OVERRIDE__ || process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Factory vehicle registry running at http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
