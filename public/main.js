const state = {
  user: null,
  records: [],
  filteredRecords: [],
  parserTimer: null,
  vehicles: [],
  adminUsers: [],
  adminRecords: [],
  adminRecordFilter: 'all',
  activeTab: 'registry'
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  authScreen: $('#auth-screen'),
  appScreen: $('#app-screen'),
  loginForm: $('#login-form'),
  loginHint: $('#login-hint'),
  usernameInput: $('#username-input'),
  passwordInput: $('#password-input'),
  logoutBtn: $('#logout-btn'),
  parseBtn: $('#parse-btn'),
  clearBtn: $('#clear-btn'),
  parserFeedback: $('#parser-feedback'),
  sourceText: $('#source-text'),
  deliveryDate: $('#deliveryDate'),
  companyName: $('#companyName'),
  contractNo: $('#contractNo'),
  fillCompanyBtn: $('#fill-company-btn'),
  addVehicleBtn: $('#add-vehicle-btn'),
  vehicleList: $('#vehicle-list'),
  vehicleTemplate: $('#vehicle-template'),
  recordForm: $('#record-form'),
  recordList: $('#record-list'),
  recordFilter: $('#record-filter'),
  recordDateFilter: $('#record-date-filter'),
  adminNav: $('#admin-nav'),
  navRegistryBtn: $('#nav-registry-btn'),
  navAdminBtn: $('#nav-admin-btn'),
  adminPanel: $('#admin-panel'),
  registryDesk: $('#registry-desk'),
  adminUserList: $('#admin-user-list'),
  adminRecordList: $('#admin-record-list'),
  adminFilterAll: $('#admin-filter-all'),
  adminFilterPending: $('#admin-filter-pending'),
  adminFilterConfirmed: $('#admin-filter-confirmed'),
  adminCreateUserForm: $('#admin-create-user-form'),
  adminNewUsername: $('#admin-new-username'),
  adminNewPassword: $('#admin-new-password'),
  adminNewDisplayname: $('#admin-new-displayname'),
  adminCreateUserHint: $('#admin-create-user-hint'),
  statUser: $('#stat-user'),
  statCount: $('#stat-count'),
  statParser: $('#stat-parser'),
  userLabel: $('#user-label')
};


function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setScreen(loggedIn) {
  elements.authScreen.classList.toggle('hidden', loggedIn);
  elements.appScreen.classList.toggle('hidden', !loggedIn);
}

function todayIsoDateLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAfterLabel(text, labels) {
  const source = String(text ?? '');
  for (const label of labels) {
    const pattern = new RegExp(`(?:${escapeRegExp(label)})\\s*[:：\\-]?\\s*([^\\n，,;；。]+)`, 'i');
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function findDate(text) {
  const source = String(text ?? '');
  const patterns = [
    /(\d{4})[年\/.\-](\d{1,2})[月\/.\-](\d{1,2})日?/,
    /(\d{4})(\d{2})(\d{2})/,
    /(\d{4})年(\d{1,2})月(\d{1,2})日?/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const year = match[1];
      const month = String(match[2]).padStart(2, '0');
      const day = String(match[3]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  if (source.includes('今天')) {
    return todayIsoDateLocal();
  }

  if (source.includes('明天')) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

function findPhone(text) {
  const match = String(text ?? '').match(/\b1[3-9]\d{9}\b/);
  return match ? match[0] : '';
}

function findIdCard(text) {
  const match = String(text ?? '').match(/\b\d{17}[\dXx]\b/);
  return match ? match[0].toUpperCase() : '';
}

function findTonnage(text) {
  const source = String(text ?? '');
  const match = source.match(/(\d+(?:\.\d+)?)\s*(?:吨|t|T)\b/);
  if (match) return match[1];

  const labelMatch = source.match(/(?:提货吨位|吨位|数量|重量|装)\s*[:：\-\s]*([0-9]+(?:\.[0-9]+)?)/i);
  return labelMatch ? labelMatch[1] : '';
}

function findCargoCategory(text) {
  const source = String(text ?? '');
  if (source.includes('碳锰') || source.includes('高碳') || source.includes('高碳锰铁')||source.includes('高锰')) return '碳锰';
  if (source.includes('硅锰') || source.includes('硅锰合金')||source.includes('锰硅')) return '硅锰';
  if (source.includes('其它') || source.includes('其他')||source.includes('渣')||source.includes('废砖')) return '其它';
  return '';
}

function extractPlateNumbers(text) {
  const source = String(text ?? '');
  const strictMatches = Array.from(
    source.matchAll(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}[A-Z0-9挂学警港澳]?)/gi),
    (match) => match[1].toUpperCase()
  );
  if (strictMatches.length) {
    return Array.from(new Set(strictMatches));
  }

  const fallbackMatches = Array.from(
    source.matchAll(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{5,6})(?:[^A-Z0-9]|$)/gi),
    (match) => match[1].toUpperCase()
  );
  return Array.from(new Set(fallbackMatches));
}

function inferCompany(text, fallback) {
  const source = String(text ?? '');
  const labelMatch = extractAfterLabel(source, ['提货公司', '公司名称', '单位', '客户', '提货单位', '收货单位']);
  if (labelMatch) return labelMatch;

  const candidates = [
    ...source.split(/\n+/).map((line) => line.trim()),
    ...source.split(/[，,；;。]/).map((chunk) => chunk.trim())
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.length >= 3 && candidate.length <= 24 && /公司|贸易|国贸|冶金|物流|商贸|工贸|实业|能源|材料|工厂|集团|供应链/.test(candidate)) {
      return candidate;
    }
  }

  return fallback || '';
}

function splitVehicleSegments(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  if (!source.includes('//')) return [source];
  return source.split('//').map((item) => item.trim()).filter(Boolean);
}

function parseSharedFields(text) {
  const fallbackCompany = state.user?.displayName || elements.companyName.value || '';
  const isNormalUser = state.user && state.user.role !== 'admin';
  return {
    deliveryDate: findDate(text) || todayIsoDateLocal(),
    companyName: isNormalUser ? (state.user?.displayName || '') : inferCompany(text, fallbackCompany),
    contractNo: extractAfterLabel(text, ['合同号', '合同编号', '合同']) || ''
  };
}

function parseVehicleFields(text) {
  const plates = extractPlateNumbers(text);
  return plates.length
    ? plates.map((plateNo) => ({
        plateNo,
        driverName: extractAfterLabel(text, ['司机姓名', '司机', '姓名']) || '',
        driverIdNo: extractAfterLabel(text, ['司机身份证号', '身份证号', '身份证']) || findIdCard(text) || '',
        driverPhone: extractAfterLabel(text, ['司机电话号码', '电话号码', '手机号', '电话']) || findPhone(text) || '',
        cargoCategory: findCargoCategory(text) || extractAfterLabel(text, ['货物品类', '品类', '货物']) || '',
        tonnage: findTonnage(text) || extractAfterLabel(text, ['提货吨位', '吨位']) || '',
        remarks: extractAfterLabel(text, ['备注']) || ''
      }))
    : [{
        plateNo: '',
        driverName: extractAfterLabel(text, ['司机姓名', '司机', '姓名']) || '',
        driverIdNo: extractAfterLabel(text, ['司机身份证号', '身份证号', '身份证']) || findIdCard(text) || '',
        driverPhone: extractAfterLabel(text, ['司机电话号码', '电话号码', '手机号', '电话']) || findPhone(text) || '',
        cargoCategory: findCargoCategory(text) || extractAfterLabel(text, ['货物品类', '品类', '货物']) || '',
        tonnage: findTonnage(text) || extractAfterLabel(text, ['提货吨位', '吨位']) || '',
        remarks: extractAfterLabel(text, ['备注']) || ''
      }];
}

function createBlankVehicle() {
  return {
    _id: makeId(),
    plateNo: '',
    driverName: '',
    driverIdNo: '',
    driverPhone: '',
    cargoCategory: '',
    tonnage: '',
    remarks: ''
  };
}

function prepareVehicle(vehicle) {
  return {
    _id: makeId(),
    plateNo: vehicle.plateNo || '',
    driverName: vehicle.driverName || '',
    driverIdNo: vehicle.driverIdNo || '',
    driverPhone: vehicle.driverPhone || '',
    cargoCategory: vehicle.cargoCategory || '',
    tonnage: vehicle.tonnage || '',
    remarks: vehicle.remarks || ''
  };
}

function parseBatch(text) {
  const source = String(text ?? '').trim();
  if (!source) return null;

  const segments = splitVehicleSegments(source);
  const shared = parseSharedFields(source);
  const vehicles = segments.flatMap((segment) => parseVehicleFields(segment));
  return { shared, vehicles };
}

function setCommonFields(shared) {
  elements.deliveryDate.value = shared.deliveryDate || elements.deliveryDate.value || todayIsoDateLocal();
  elements.companyName.value = shared.companyName || elements.companyName.value || state.user?.displayName || state.user?.username || '';
  elements.contractNo.value = shared.contractNo || elements.contractNo.value || '';
}

function setFeedback(message, tone = 'normal') {
  elements.parserFeedback.classList.toggle('error-text', tone === 'error');
  elements.parserFeedback.textContent = message;
}

function updateStats() {
  elements.statUser.textContent = state.user?.displayName || state.user?.username || '-';
  elements.statCount.textContent = String(state.records.length);
  elements.statParser.textContent = state.vehicles.length ? `已拆分 ${state.vehicles.length} 个表单` : '待输入文本';
  elements.userLabel.textContent = state.user?.displayName || state.user?.username || '未登录';
}

function renderVehicleList() {
  elements.vehicleList.innerHTML = '';
  if (!state.vehicles.length) {
    state.vehicles = [createBlankVehicle()];
  }

  state.vehicles.forEach((vehicle, index) => {
    const fragment = elements.vehicleTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.vehicle-card');
    const title = fragment.querySelector('.vehicle-title');
    const removeBtn = fragment.querySelector('.vehicle-remove');

    title.textContent = `车辆 ${index + 1}`;
    removeBtn.addEventListener('click', () => {
      state.vehicles.splice(index, 1);
      renderVehicleList();
      updateStats();
    });

    const fields = fragment.querySelectorAll('[data-field]');
    fields.forEach((input) => {
      const field = input.getAttribute('data-field');
      input.value = vehicle[field] ?? '';
    });

    card.dataset.index = String(index);
    elements.vehicleList.appendChild(fragment);
  });

  updateStats();
}

function collectVehicleRows() {
  const cards = Array.from(elements.vehicleList.querySelectorAll('.vehicle-card'));
  return cards
    .map((card) => {
      const read = (field) => card.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
      return {
        plateNo: read('plateNo').toUpperCase(),
        driverName: read('driverName'),
        driverIdNo: read('driverIdNo').toUpperCase(),
        driverPhone: read('driverPhone'),
        cargoCategory: read('cargoCategory'),
        tonnage: read('tonnage'),
        remarks: read('remarks')
      };
    })
    .filter((vehicle) => Object.values(vehicle).some(Boolean));
}

function applyParsedBatch(rawText) {
  const parsed = parseBatch(rawText);
  if (!parsed) {
    setFeedback('把车辆信息粘贴进来后，系统会自动拆分成多个表单。');
    elements.statParser.textContent = '待输入文本';
    return;
  }

  setCommonFields(parsed.shared);
  state.vehicles = parsed.vehicles.length ? parsed.vehicles.map(prepareVehicle) : [createBlankVehicle()];
  renderVehicleList();

  const segmentCount = splitVehicleSegments(rawText).length;
  if (segmentCount > 1) {
    setFeedback(`已按 // 拆分成 ${segmentCount} 个车辆信息块，并生成对应表单。`);
  } else if (state.vehicles.length > 1) {
    setFeedback(`已识别到 ${state.vehicles.length} 个车牌号，已拆成多个表单。`);
  } else {
    setFeedback('已识别并生成 1 个车辆表单。');
  }

  elements.statParser.textContent = `已拆分 ${state.vehicles.length} 个表单`;
}

function shouldAutoParse(text) {
  const source = String(text ?? '').trim();
  if (!source) return false;
  return source.includes('//') || source.length > 40 || extractPlateNumbers(source).length > 0;
}

function syncCompanyField() {
  if (!state.user) return;
  // For normal users (non-admin), always show the display name as the company name.
  if (state.user.role !== 'admin') {
    elements.companyName.value = state.user.displayName || '';
  } else {
    // Admin users may edit the field; only set if empty.
    if (!elements.companyName.value.trim()) {
      elements.companyName.value = '';
    }
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include',
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

function renderRecords() {
  const textFilter = elements.recordFilter.value.trim().toLowerCase();
  const dateFilter = elements.recordDateFilter.value;
  let source = state.records;
  if (dateFilter) {
    source = source.filter(record => record.deliveryDate === dateFilter);
  }
  if (textFilter) {
    source = source.filter(record => {
      const haystack = `${record.deliveryDate} ${record.contractNo} ${record.plateNo}`.toLowerCase();
      return haystack.includes(textFilter);
    });
  }
  state.filteredRecords = source;
  elements.recordList.innerHTML = '';

  if (!source.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = textFilter ? '没有匹配到记录。可以换一个合同号或车牌号试试。' : '这里会展示当前用户提交过的提货记录。';
    elements.recordList.appendChild(empty);
    return;
  }

  // Group records by deliveryDate + contractNo, preserving insertion order
  const groups = [];
  const groupIndex = {};
  for (const record of source) {
    const key = `${record.deliveryDate}__${record.contractNo}`;
    if (groupIndex[key] === undefined) {
      groupIndex[key] = groups.length;
      groups.push({ deliveryDate: record.deliveryDate, contractNo: record.contractNo, vehicles: [] });
    }
    groups[groupIndex[key]].vehicles.push(record);
  }

  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const card = document.createElement('div');
    card.className = 'record-item record-group';

    // Header: Date · Contract No
    const header = document.createElement('div');
    header.className = 'record-group-header';
    header.textContent = `${group.deliveryDate} · ${group.contractNo}`;
    card.appendChild(header);

    // One row per vehicle plate
    for (const record of group.vehicles) {
      const row = document.createElement('div');
      row.className = 'record-plate-row';

      const plate = document.createElement('span');
      plate.className = 'record-plate-no';
      plate.textContent = record.plateNo;
      row.appendChild(plate);

      const badge = document.createElement('span');
      if (record.confirmation === 'confirmed') {
        badge.className = 'badge badge-success';
        badge.textContent = '已确认';
      } else {
        badge.className = 'badge badge-warning';
        badge.textContent = '待确认';
      }
      row.appendChild(badge);

      card.appendChild(row);
    }

    fragment.appendChild(card);
  }

  elements.recordList.appendChild(fragment);
}

function resetComposerAfterSubmit() {
  state.vehicles = [createBlankVehicle()];
  renderVehicleList();
  elements.sourceText.value = '';
  elements.statParser.textContent = '已保存';
  syncCompanyField();
}

async function loadSession() {
  try {
    const { user } = await api('/api/me', { method: 'GET' });
    state.user = user;
    setScreen(true);
    syncCompanyField();

    const isAdmin = state.user?.role === 'admin';
    elements.adminNav.classList.toggle('hidden', !isAdmin);

    if (!isAdmin) {
      elements.companyName.setAttribute('readonly', 'true');
      elements.companyName.style.background = 'rgba(15, 23, 42, 0.02)';
      elements.companyName.style.cursor = 'not-allowed';
      elements.fillCompanyBtn.classList.add('hidden');
    } else {
      elements.companyName.removeAttribute('readonly');
      elements.companyName.style.background = '';
      elements.companyName.style.cursor = '';
      elements.fillCompanyBtn.classList.remove('hidden');
    }

    if (isAdmin) {
      switchTab(state.activeTab || 'registry');
      await loadAdminDashboard();
    } else {
      switchTab('registry');
    }

    await loadRecords();
  } catch (error) {
    console.error("loadSession failed:", error);
    state.user = null;
    setScreen(false);
  }
  updateStats();
}

async function loadRecords() {
  const { records } = await api('/api/records', { method: 'GET' });
  state.records = records;
  renderRecords();
}

function switchTab(tabName) {
  state.activeTab = tabName;
  if (tabName === 'registry') {
    elements.navRegistryBtn.classList.add('active');
    elements.navAdminBtn.classList.remove('active');
    elements.registryDesk.classList.remove('hidden');
    elements.adminPanel.classList.add('hidden');
  } else if (tabName === 'admin') {
    elements.navRegistryBtn.classList.remove('active');
    elements.navAdminBtn.classList.add('active');
    elements.registryDesk.classList.add('hidden');
    elements.adminPanel.classList.remove('hidden');
    loadAdminDashboard();
  }
}

async function loadAdminDashboard() {
  try {
    const [usersResponse, recordsResponse] = await Promise.all([
      api('/api/admin/users', { method: 'GET' }),
      api('/api/admin/records', { method: 'GET' })
    ]);
    state.adminUsers = usersResponse.users || [];
    state.adminRecords = recordsResponse.records || [];
    
    renderAdminUsers();
    renderAdminRecords();
  } catch (error) {
    console.error("加载管理后台数据失败:", error);
  }
}

function renderAdminUsers() {
  elements.adminUserList.innerHTML = '';
  if (!state.adminUsers.length) {
    elements.adminUserList.innerHTML = '<div class="empty-state">暂无其他用户账号。</div>';
    return;
  }

  state.adminUsers.forEach((user) => {
    const isSelfOrAdmin = user.username === 'admin' || user.username === state.user?.username;
    
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <div class="user-info-block">
        <span class="user-name-label">${user.displayName} (${user.username})</span>
        <span class="user-role-badge">${user.role === 'admin' ? '系统管理员' : '普通用户'}</span>
      </div>
      <div class="user-actions">
        <button class="user-action-btn btn-reset" type="button">重置密码</button>
        ${!isSelfOrAdmin ? `<button class="user-action-btn btn-delete" type="button">删除</button>` : ''}
      </div>
    `;

    item.querySelector('.btn-reset').addEventListener('click', () => {
      const newPassword = prompt(`请输入用户 [${user.username}] 的新密码:`);
      if (newPassword === null) return;
      if (!newPassword.trim()) {
        alert('密码不能为空！');
        return;
      }
      resetUserPassword(user.username, newPassword.trim());
    });

    if (!isSelfOrAdmin) {
      item.querySelector('.btn-delete').addEventListener('click', () => {
        if (confirm(`确认要删除用户账号 [${user.username}] 吗？该操作不可恢复。`)) {
          deleteUserAccount(user.username);
        }
      });
    }

    elements.adminUserList.appendChild(item);
  });
}

function renderAdminRecords() {
  const filter = state.adminRecordFilter;
  const filtered = state.adminRecords.filter((record) => {
    if (filter === 'pending') return record.confirmation !== 'confirmed';
    if (filter === 'confirmed') return record.confirmation === 'confirmed';
    return true;
  });

  elements.adminRecordList.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = filter === 'pending' ? '没有待确认的车辆记录。' : 
                        filter === 'confirmed' ? '没有已确认的车辆记录。' : '暂无任何提货记录。';
    elements.adminRecordList.appendChild(empty);
    return;
  }

  filtered.forEach((record) => {
    const card = document.createElement('div');
    const isConfirmed = record.confirmation === 'confirmed';
    card.className = `admin-record-card ${isConfirmed ? 'confirmed-card' : 'pending-card'}`;
    
    card.innerHTML = `
      <div class="admin-record-meta-top">
        <div class="admin-record-user-info">
          <span class="admin-record-user-dot"></span>
          <span>提交人: <strong>${record.ownerDisplayName || record.ownerUsername}</strong></span>
        </div>
        <span class="badge ${isConfirmed ? 'badge-success' : 'badge-warning'}">
          ${isConfirmed ? '管理员已确认' : '待确认'}
        </span>
      </div>
      <div class="admin-record-details">
        <div class="admin-detail-item">
          <span class="admin-detail-label">提货日期</span>
          <span class="admin-detail-value">${record.deliveryDate}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">提货公司</span>
          <span class="admin-detail-value">${record.companyName}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">合同号</span>
          <span class="admin-detail-value">${record.contractNo}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">车牌号</span>
          <span class="admin-detail-value">${record.plateNo}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">司机姓名</span>
          <span class="admin-detail-value">${record.driverName || '-'}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">手机号码</span>
          <span class="admin-detail-value">${record.driverPhone || '-'}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">身份证号</span>
          <span class="admin-detail-value">${record.driverIdNo || '-'}</span>
        </div>
        <div class="admin-detail-item">
          <span class="admin-detail-label">品类 / 吨位</span>
          <span class="admin-detail-value">${record.cargoCategory || '-'} / ${record.tonnage} 吨</span>
        </div>
        <div class="admin-detail-item" style="grid-column: 1 / -1;">
          <span class="admin-detail-label">备注</span>
          <span class="admin-detail-value" style="font-weight: normal; color: var(--muted);">${record.remarks || '无'}</span>
        </div>
      </div>
      ${!isConfirmed ? `
      <div class="admin-record-actions">
        <button class="primary-btn btn-confirm-record" type="button" style="min-height: 38px; padding: 0.4rem 1rem; font-size: 0.88rem;">确认</button>
      </div>
      ` : ''}
    `;

    if (!isConfirmed) {
      card.querySelector('.btn-confirm-record').addEventListener('click', () => {
        confirmRecord(record.id);
      });
    }

    elements.adminRecordList.appendChild(card);
  });
}

async function resetUserPassword(username, newPassword) {
  try {
    await api('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, newPassword })
    });
    alert(`用户 [${username}] 密码重置成功！`);
  } catch (error) {
    alert(`密码重置失败: ${error.message}`);
  }
}

async function deleteUserAccount(username) {
  try {
    await api('/api/admin/users/delete', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
    alert(`用户账号 [${username}] 已成功删除！`);
    await loadAdminDashboard();
  } catch (error) {
    alert(`账号删除失败: ${error.message}`);
  }
}

async function confirmRecord(recordId) {
  try {
    await api('/api/admin/records/confirm', {
      method: 'POST',
      body: JSON.stringify({ recordId })
    });
    const rec = state.adminRecords.find(r => r.id === recordId);
    if (rec) {
      rec.confirmation = 'confirmed';
    }
    renderAdminRecords();
    await loadRecords();
  } catch (error) {
    alert(`确认记录失败: ${error.message}`);
  }
}

async function handleCreateUserSubmit(event) {
  event.preventDefault();
  const username = elements.adminNewUsername.value.trim();
  const password = elements.adminNewPassword.value;
  const displayName = elements.adminNewDisplayname.value.trim() || username;
  
  elements.adminCreateUserHint.textContent = '正在创建...';
  elements.adminCreateUserHint.className = 'hint';
  
  try {
    await api('/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, role: 'user' })
    });
    
    elements.adminCreateUserHint.textContent = `成功创建账号 [${username}]！`;
    elements.adminCreateUserHint.className = 'hint success-text';
    elements.adminCreateUserForm.reset();
    
    await loadAdminDashboard();
  } catch (error) {
    elements.adminCreateUserHint.textContent = error.message;
    elements.adminCreateUserHint.className = 'hint error-text';
  }
}

function wireEvents() {
  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.loginHint.textContent = '正在登录...';
    try {
      const payload = {
        username: elements.usernameInput.value.trim(),
        password: elements.passwordInput.value
      };
      const result = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      state.user = result.user;
      setScreen(true);
      syncCompanyField();
      elements.loginHint.textContent = '登录成功。您可以开始登记提货车辆信息。';
      
      const isAdmin = state.user?.role === 'admin';
      elements.adminNav.classList.toggle('hidden', !isAdmin);
      if (isAdmin) {
        switchTab('registry');
        await loadAdminDashboard();
      }

      await loadRecords();
      updateStats();
    } catch (error) {
      elements.loginHint.textContent = error.message;
      elements.loginHint.classList.add('error-text');
      setTimeout(() => elements.loginHint.classList.remove('error-text'), 1600);
    }
  });

  elements.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST', body: '{}' });
    } finally {
      state.user = null;
      state.records = [];
      state.vehicles = [createBlankVehicle()];
      state.adminUsers = [];
      state.adminRecords = [];
      state.activeTab = 'registry';
      
      elements.adminNav.classList.add('hidden');
      switchTab('registry');
      
      renderVehicleList();
      renderRecords();
      setScreen(false);
      elements.sourceText.value = '';
      elements.recordForm.reset();
      elements.loginForm.reset();
      elements.loginHint.textContent = '已退出登录，可以换账号重新登录。';
      updateStats();
    }
  });

  elements.parseBtn.addEventListener('click', () => {
    applyParsedBatch(elements.sourceText.value);
  });

  elements.addVehicleBtn.addEventListener('click', () => {
    state.vehicles.push(createBlankVehicle());
    renderVehicleList();
    setFeedback('已新增一个车辆表单。');
  });

  elements.clearBtn.addEventListener('click', () => {
    elements.sourceText.value = '';
    state.vehicles = [createBlankVehicle()];
    renderVehicleList();
    setFeedback('文本已清空，可以重新粘贴。');
    elements.statParser.textContent = '待输入文本';
  });

  elements.fillCompanyBtn.addEventListener('click', syncCompanyField);
  elements.recordFilter.addEventListener('input', renderRecords);
  elements.recordDateFilter.addEventListener('input', renderRecords);

  elements.sourceText.addEventListener('input', () => {
    clearTimeout(state.parserTimer);
    state.parserTimer = setTimeout(() => {
      if (shouldAutoParse(elements.sourceText.value)) {
        applyParsedBatch(elements.sourceText.value);
      }
    }, 350);
  });

  elements.sourceText.addEventListener('paste', () => {
    setTimeout(() => {
      if (shouldAutoParse(elements.sourceText.value)) {
        applyParsedBatch(elements.sourceText.value);
      }
    }, 0);
  });

  elements.recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const deliveryDate = elements.deliveryDate.value || todayIsoDateLocal();
      const companyName = elements.companyName.value.trim() || state.user?.displayName || state.user?.username || '';
      const contractNo = elements.contractNo.value.trim();
      const vehicles = collectVehicleRows();

      if (!vehicles.length) {
        throw new Error('请至少新增一张车辆表单。');
      }

      if (!contractNo) {
        throw new Error('请先填写合同号。');
      }

      const payload = {
        deliveryDate,
        companyName,
        contractNo,
        vehicles
      };

      const result = await api('/api/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const savedRecords = result.records || (result.record ? [result.record] : []);
      state.records = [...savedRecords, ...state.records];
      renderRecords();

      if (savedRecords.length > 1) {
        setFeedback(`已保存 ${savedRecords.length} 条车辆记录：${savedRecords.map((record) => record.plateNo).join('、')}`);
      } else if (savedRecords[0]) {
        const record = savedRecords[0];
        setFeedback(`已保存：${record.plateNo} / ${record.driverName} / ${record.tonnage} 吨`);
      } else {
        setFeedback('已保存提交记录。');
      }

      resetComposerAfterSubmit();
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  });

  // Admin Tab events
  elements.navRegistryBtn.addEventListener('click', () => switchTab('registry'));
  elements.navAdminBtn.addEventListener('click', () => switchTab('admin'));

  // Admin filter events
  elements.adminFilterAll.addEventListener('click', () => {
    state.adminRecordFilter = 'all';
    elements.adminFilterAll.classList.add('active');
    elements.adminFilterPending.classList.remove('active');
    elements.adminFilterConfirmed.classList.remove('active');
    renderAdminRecords();
  });
  elements.adminFilterPending.addEventListener('click', () => {
    state.adminRecordFilter = 'pending';
    elements.adminFilterAll.classList.remove('active');
    elements.adminFilterPending.classList.add('active');
    elements.adminFilterConfirmed.classList.remove('active');
    renderAdminRecords();
  });
  elements.adminFilterConfirmed.addEventListener('click', () => {
    state.adminRecordFilter = 'confirmed';
    elements.adminFilterAll.classList.remove('active');
    elements.adminFilterPending.classList.remove('active');
    elements.adminFilterConfirmed.classList.add('active');
    renderAdminRecords();
  });

  // Admin user creation event
  elements.adminCreateUserForm.addEventListener('submit', handleCreateUserSubmit);
}

function seedDefaults() {
  elements.usernameInput.value = 'admin';
  elements.passwordInput.value = 'admin123';
}

async function boot() {
  wireEvents();
  seedDefaults();
  state.vehicles = [createBlankVehicle()];
  renderVehicleList();
  syncCompanyField();
  await loadSession();
  renderRecords();
}

boot().catch((error) => {
  console.error(error);
  setFeedback('页面初始化失败，请刷新重试。', 'error');
});
