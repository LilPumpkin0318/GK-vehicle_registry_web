const state = {
  user: null,
  records: [],
  filteredRecords: [],
  parserTimer: null,
  vehicles: []
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  authScreen: $('#auth-screen'),
  appScreen: $('#app-screen'),
  loginForm: $('#login-form'),
  loginHint: $('#login-hint'),
  usernameInput: $('#username-input'),
  passwordInput: $('#password-input'),
  displayNameInput: $('#display-name-input'),
  logoutBtn: $('#logout-btn'),
  userLabel: $('#user-label'),
  statUser: $('#stat-user'),
  statCount: $('#stat-count'),
  statParser: $('#stat-parser'),
  sourceText: $('#source-text'),
  parseBtn: $('#parse-btn'),
  addVehicleBtn: $('#add-vehicle-btn'),
  clearBtn: $('#clear-btn'),
  parserFeedback: $('#parser-feedback'),
  fillCompanyBtn: $('#fill-company-btn'),
  recordForm: $('#record-form'),
  recordFilter: $('#record-filter'),
  recordList: $('#record-list'),
  recordTemplate: $('#record-template'),
  vehicleList: $('#vehicle-list'),
  vehicleTemplate: $('#vehicle-template'),
  deliveryDate: $('#deliveryDate'),
  companyName: $('#companyName'),
  contractNo: $('#contractNo')
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
  const fallbackCompany = elements.companyName.value || state.user?.displayName || state.user?.username || '';
  return {
    deliveryDate: findDate(text) || todayIsoDateLocal(),
    companyName: inferCompany(text, fallbackCompany),
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
  if (!elements.companyName.value.trim()) {
    elements.companyName.value = state.user?.displayName || state.user?.username || '';
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
  const filter = elements.recordFilter.value.trim().toLowerCase();
  const source = filter
    ? state.records.filter((record) => {
        const haystack = `${record.deliveryDate} ${record.contractNo} ${record.plateNo}`.toLowerCase();
        return haystack.includes(filter);
      })
    : state.records;

  state.filteredRecords = source;
  elements.recordList.innerHTML = '';

  if (!source.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = filter ? '没有匹配到记录。可以换一个合同号或车牌号试试。' : '这里会展示当前用户提交过的提货记录。';
    elements.recordList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const record of source) {
    const node = elements.recordTemplate.content.cloneNode(true);
    node.querySelector('.record-title').textContent = `${record.deliveryDate} · ${record.contractNo} · ${record.plateNo}`;
    fragment.appendChild(node);
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
    await loadRecords();
  } catch {
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

function wireEvents() {
  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.loginHint.textContent = '正在登录...';
    try {
      const payload = {
        username: elements.usernameInput.value.trim(),
        password: elements.passwordInput.value,
        displayName: elements.displayNameInput.value.trim()
      };
      const result = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      state.user = result.user;
      setScreen(true);
      syncCompanyField();
      elements.loginHint.textContent = '登录成功。你可以开始登记提货车辆信息。';
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
}

function seedDefaults() {
  elements.usernameInput.value = 'admin';
  elements.passwordInput.value = 'admin123';
  elements.displayNameInput.value = 'admin';
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
