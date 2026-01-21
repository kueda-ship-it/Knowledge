// ↓↓↓ 【重要】URLを書き換えてください ↓↓↓
const API_URL = "https://script.google.com/macros/s/AKfycbzHDWftZHnxIa0y7GJpiwYbIUqZXGv1e3xO00pkJQ5n4YxXQb-Wi9RIam9No5VPj_kzUQ/exec";

let currentUser = null;
let knowledgeData = [];
let masterData = { incidents: [], categories: [], users: [] };
let activeTagFilter = null; // サイドバーのタグ絞り込み
let currentFilterType = 'all'; // クイックフィルター (all, unsolved, solved, mine)

const els = {
    header: document.getElementById('app-header'),
    headerUserInfo: document.getElementById('header-user-info'),
    
    views: {
        login: document.getElementById('login-view'),
        menu: document.getElementById('menu-view'),
        knowledge: document.getElementById('knowledge-view'),
        dashboard: document.getElementById('dashboard-view'),
        admin: document.getElementById('admin-view')
    },
    loginForm: document.getElementById('login-form'),
    loginId: document.getElementById('login-id'),
    loading: document.getElementById('loading-overlay'),
    
    // Knowledge
    listArea: document.getElementById('list-area'),
    editorArea: document.getElementById('editor-area'),
    knowledgeList: document.getElementById('knowledge-list'),
    sidebarTagList: document.getElementById('sidebar-tag-list'),
    
    form: document.getElementById('knowledge-form'),
    categorySelect: document.getElementById('category-select'),
    incidentSelect: document.getElementById('incident-select'),
    selectedIncidents: document.getElementById('selected-incidents'),
    statusCheck: document.getElementById('status-check'),
    
    inputs: {
        id: document.getElementById('entry-id'),
        title: document.getElementById('title-input'),
        machine: document.getElementById('machine-input'),
        property: document.getElementById('property-input'),
        reqNum: document.getElementById('req-num-input'),
        tags: document.getElementById('tags-input'),
        content: document.getElementById('content-input')
    },
    addBtn: document.getElementById('add-btn'),
    deleteBtn: document.getElementById('delete-btn'),

    // Dashboard
    machineList: document.getElementById('machine-list-view'),
    incidentList: document.getElementById('incident-list-view'),
    
    // Admin
    adminBtn: document.getElementById('admin-btn'),
    adminCategoryList: document.getElementById('admin-category-list'),
    adminIncidentList: document.getElementById('admin-incident-list'),
    adminUserList: document.getElementById('admin-user-list'),
    
    newCategoryInput: document.getElementById('new-category-input'),
    newIncidentInput: document.getElementById('new-incident-input'),
    newUserId: document.getElementById('new-user-id'),
    newUserName: document.getElementById('new-user-name'),
    newUserRole: document.getElementById('new-user-role')
};

function init() {
    const storedUser = localStorage.getItem('kb_user');
    if(storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            navigate('menu');
            loadData();
        } catch(e) {
            localStorage.removeItem('kb_user');
            navigate('login');
        }
    } else {
        navigate('login');
    }
    setupEvents();
}

function navigate(viewName) {
    Object.values(els.views).forEach(el => {
        if(el) el.classList.remove('active');
    });

    if(els.views[viewName]) {
        els.views[viewName].classList.add('active');
        
        if(viewName === 'login') {
            els.header.style.display = 'none';
        } else {
            els.header.style.display = 'flex';
            if(currentUser) {
                els.headerUserInfo.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHtml(currentUser.name)} <small>(${currentUser.role})</small>`;
                if(viewName === 'menu' && els.adminBtn) {
                    const canManage = ['master', 'manager'].includes(currentUser.role);
                    els.adminBtn.style.display = canManage ? 'flex' : 'none';
                }
            }
        }
        
        if(viewName === 'dashboard') renderDashboard();
        if(viewName === 'admin') loadMasterDataForAdmin();
        if(viewName === 'knowledge') {
            if(els.addBtn) els.addBtn.style.display = (currentUser.role === 'viewer') ? 'none' : 'block';
            activeTagFilter = null; // 画面遷移でリセット
            // フィルター初期化
            applyFilter('all', document.querySelector('.filter-btn'));
            renderTagCloud();
        }
    }
}

function setupEvents() {
    if(els.loginForm) {
        els.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = els.loginId.value;
            toggleLoading(true);
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'login', id: id })
                });
                const json = await res.json();
                if(json.status === 'success') {
                    currentUser = json.user;
                    localStorage.setItem('kb_user', JSON.stringify(currentUser));
                    loadData();
                    navigate('menu');
                } else {
                    alert("ログイン失敗: " + json.message);
                }
            } catch(e) { alert("通信エラー"); } finally { toggleLoading(false); }
        });
    }

    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => {
        activeTagFilter = null;
        renderList(filterData(e.target.value));
    });

    if(els.incidentSelect) {
        els.incidentSelect.addEventListener('change', (e) => {
            if(e.target.value) addIncidentChip(e.target.value);
            e.target.value = "";
        });
    }
    
    document.getElementById('cancel-btn').addEventListener('click', (e) => {
        e.preventDefault();
        els.editorArea.style.display = 'none';
        els.listArea.style.display = 'block';
    });

    if(els.addBtn) els.addBtn.addEventListener('click', () => showEditor());
    if(els.form) els.form.addEventListener('submit', (e) => { e.preventDefault(); saveData(); });
    
    if(els.deleteBtn) {
        els.deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteEntry();
        });
    }
}

function logout() {
    localStorage.removeItem('kb_user');
    currentUser = null;
    navigate('login');
}

async function loadData() {
    toggleLoading(true);
    try {
        const dRes = await fetch(API_URL);
        knowledgeData = await dRes.json();
        
        const mRes = await fetch(`${API_URL}?action=master`);
        const mJson = await mRes.json();
        
        updateSelectOptions(els.incidentSelect, mJson.incidents || []);
        updateSelectOptions(els.categorySelect, mJson.categories || []);
        
        renderList(knowledgeData);
        renderTagCloud();
    } catch(e) { console.error(e); } finally { toggleLoading(false); }
}

function updateSelectOptions(selectEl, items) {
    if(!selectEl) return;
    selectEl.innerHTML = '<option value="">選択してください</option>';
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        selectEl.appendChild(opt);
    });
}

// --- フィルター機能 ---
// HTMLのonclickから呼ばれる
window.applyFilter = function(type, btnElement) {
    currentFilterType = type;
    
    // ボタンのスタイル切り替え
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    renderList(knowledgeData);
};

// --- リスト表示 ---
function renderList(data) {
    if(!els.knowledgeList) return;
    els.knowledgeList.innerHTML = '';
    
    // 1. タグ絞り込み
    if(activeTagFilter) {
        data = data.filter(item => item.tags && item.tags.includes(activeTagFilter));
    }
    
    // 2. クイックフィルター絞り込み
    if(currentFilterType === 'unsolved') {
        data = data.filter(item => item.status !== 'solved');
    } else if (currentFilterType === 'solved') {
        data = data.filter(item => item.status === 'solved');
    } else if (currentFilterType === 'mine') {
        data = data.filter(item => item.author === currentUser.name);
    }

    if(!data || data.length === 0) return els.knowledgeList.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">データなし</p>';

    const sorted = [...data].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    sorted.forEach(item => {
        const div = document.createElement('div');
        const statusClass = (item.status === 'solved') ? 'solved' : 'unsolved';
        div.className = `knowledge-card ${statusClass}`;
        
        const dateStr = new Date(item.updatedAt).toLocaleDateString();
        let meta = `${dateStr} | ${item.author || ''}`;
        if(item.machine) meta += ` | ${item.machine}`;
        
        const catHtml = item.category ? `[${escapeHtml(item.category)}] ` : '';
        const iHtml = (item.incidents||[]).join(', ');
        const tHtml = (item.tags||[]).map(t => `#${escapeHtml(t)}`).join(' ');

        const statusBadge = item.status === 'solved' 
            ? '<span class="card-status status-badge-solved"><i class="fa-solid fa-check"></i> 解決済</span>'
            : '<span class="card-status status-badge-unsolved">未解決</span>';

        div.innerHTML = `
            ${statusBadge}
            <div class="card-meta">${meta}</div>
            <div class="card-title">${escapeHtml(item.title)}</div>
            <div style="font-size:0.9rem; color:#475569; margin-bottom:5px;">
                ${catHtml}${escapeHtml(iHtml)}
            </div>
            <div class="card-tags">${tHtml}</div>
        `;
        div.onclick = () => showEditor(item);
        els.knowledgeList.appendChild(div);
    });
}

function renderTagCloud() {
    if(!els.sidebarTagList) return;
    const allTags = new Set();
    knowledgeData.forEach(d => (d.tags||[]).forEach(t => allTags.add(t)));
    
    els.sidebarTagList.innerHTML = '';
    const allBtn = document.createElement('span');
    allBtn.className = `sidebar-tag ${activeTagFilter === null ? 'active' : ''}`;
    allBtn.textContent = '全て';
    allBtn.onclick = () => { activeTagFilter = null; renderList(knowledgeData); renderTagCloud(); };
    els.sidebarTagList.appendChild(allBtn);

    allTags.forEach(tag => {
        const el = document.createElement('span');
        el.className = `sidebar-tag ${activeTagFilter === tag ? 'active' : ''}`;
        el.textContent = tag;
        el.onclick = () => { activeTagFilter = tag; renderList(knowledgeData); renderTagCloud(); };
        els.sidebarTagList.appendChild(el);
    });
}

function filterData(keyword) {
    if(!keyword) return knowledgeData;
    const k = keyword.toLowerCase();
    return knowledgeData.filter(item => JSON.stringify(item).toLowerCase().includes(k));
}

let currentIncidents = [];
function showEditor(item = null) {
    const isNew = (item === null);
    if(isNew && currentUser.role === 'viewer') return;

    let canEdit = false;
    if(isNew) {
        canEdit = true;
    } else {
        if(currentUser.role === 'master') canEdit = true;
        else if(['manager', 'user'].includes(currentUser.role) && item.author === currentUser.name) canEdit = true;
    }

    els.listArea.style.display = 'none';
    els.editorArea.style.display = 'block';
    currentIncidents = [];
    els.selectedIncidents.innerHTML = '';
    
    if(els.form) els.form.reset();
    
    if(item) {
        els.inputs.id.value = item.id;
        els.inputs.title.value = item.title;
        els.inputs.machine.value = item.machine;
        els.inputs.property.value = item.property;
        els.inputs.reqNum.value = item.req_num;
        els.inputs.content.value = item.content;
        
        if(els.statusCheck) els.statusCheck.checked = (item.status === 'solved');
        if(els.categorySelect) els.categorySelect.value = item.category || '';
        
        if(item.tags) els.inputs.tags.value = item.tags.join(' #');
        if(item.incidents) item.incidents.forEach(addIncidentChip);
    } else {
        els.inputs.id.value = '';
        if(els.statusCheck) els.statusCheck.checked = false;
    }

    const saveBtn = els.form.querySelector('button[type="submit"]');
    if(saveBtn) saveBtn.style.display = canEdit ? 'block' : 'none';
    if(els.deleteBtn) els.deleteBtn.style.display = (!isNew && canEdit) ? 'block' : 'none';
    
    const inputs = els.form.querySelectorAll('input, textarea, select');
    inputs.forEach(el => el.disabled = !canEdit);
}

function addIncidentChip(text) {
    if(currentIncidents.includes(text)) return;
    currentIncidents.push(text);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHtml(text)} <i class="fa-solid fa-xmark" style="margin-left:5px;"></i>`;
    const icon = chip.querySelector('i');
    if(icon) {
        icon.onclick = (e) => {
            e.stopPropagation();
            if(!els.inputs.content.disabled) { 
                currentIncidents = currentIncidents.filter(i => i !== text);
                chip.remove();
            }
        };
    }
    els.selectedIncidents.appendChild(chip);
}

async function saveData() {
    const d = els.inputs;
    if(!d.machine.value || !d.property.value || !d.reqNum.value || !d.content.value || currentIncidents.length === 0 || !els.categorySelect.value) {
        return alert("必須項目(*)をすべて入力してください");
    }
    if(!/^\d{11}$/.test(d.reqNum.value)) {
        return alert("依頼番号は半角数字11桁で入力してください");
    }

    let titleVal = d.title.value.trim();
    if(!titleVal) titleVal = `[${els.categorySelect.value}] ${currentIncidents.join(', ')}`;
    let tags = [];
    if(d.tags.value) tags = d.tags.value.split('#').map(t => t.trim()).filter(t => t);
    
    const statusVal = els.statusCheck.checked ? 'solved' : 'unsolved';

    const postData = {
        action: 'save',
        data: {
            id: d.id.value || Date.now().toString(),
            machine: d.machine.value, property: d.property.value, req_num: d.reqNum.value,
            title: titleVal, 
            category: els.categorySelect.value,
            incidents: currentIncidents, tags: tags, content: d.content.value,
            status: statusVal,
            updatedAt: new Date().toISOString(), author: currentUser.name
        }
    };
    
    toggleLoading(true);
    try {
        await fetch(API_URL, { method:'POST', body: JSON.stringify(postData) });
        await loadData();
        els.editorArea.style.display = 'none';
        els.listArea.style.display = 'block';
    } catch(e) { alert("保存失敗"); } finally { toggleLoading(false); }
}

async function deleteEntry() {
    const id = els.inputs.id.value;
    if(!id) return;
    if(!confirm("本当に削除しますか？")) return;
    toggleLoading(true);
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) });
        await loadData();
        els.editorArea.style.display = 'none';
        els.listArea.style.display = 'block';
    } catch(e) { alert("削除失敗"); } finally { toggleLoading(false); }
}

// --- Admin ---
async function loadMasterDataForAdmin() {
    toggleLoading(true);
    try {
        const res = await fetch(`${API_URL}?action=getAllMasters`);
        masterData = await res.json();
        renderAdminLists();
    } catch(e) { alert("マスタ読み込み失敗"); } finally { toggleLoading(false); }
}
function renderAdminLists() {
    renderSimpleList(els.adminIncidentList, masterData.incidents, 'incidents');
    renderSimpleList(els.adminCategoryList, masterData.categories, 'categories');
    els.adminUserList.innerHTML = '';
    masterData.users.forEach((u, index) => {
        const li = document.createElement('li');
        const selectHtml = `
            <select onchange="changeUserRole(${index}, this.value)" style="width:auto; padding:2px; font-size:0.8rem; margin-left:5px;">
                <option value="viewer" ${u.role==='viewer'?'selected':''}>View</option>
                <option value="user" ${u.role==='user'?'selected':''}>User</option>
                <option value="manager" ${u.role==='manager'?'selected':''}>Mngr</option>
                <option value="master" ${u.role==='master'?'selected':''}>Mstr</option>
            </select>
        `;
        li.innerHTML = `<div style="display:flex; align-items:center;"><b>${escapeHtml(u.id)}</b>: ${escapeHtml(u.name)}${selectHtml}</div> <button onclick="removeUser(${index})"><i class="fa-solid fa-trash"></i></button>`;
        els.adminUserList.appendChild(li);
    });
}
function renderSimpleList(el, arr, type) {
    el.innerHTML = '';
    arr.forEach((item, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(item)}</span> <button onclick="removeSimpleItem('${type}', ${index})"><i class="fa-solid fa-trash"></i></button>`;
        el.appendChild(li);
    });
}
window.addIncident = function() { addItem('incidents', els.newIncidentInput); };
window.addCategory = function() { addItem('categories', els.newCategoryInput); };
function addItem(type, inputEl) {
    const val = inputEl.value.trim();
    if(!val) return;
    masterData[type].push(val);
    inputEl.value = '';
    renderAdminLists();
}
window.removeSimpleItem = function(type, index) {
    if(!confirm('削除しますか？')) return;
    masterData[type].splice(index, 1);
    renderAdminLists();
};
window.addUser = function() {
    const id = els.newUserId.value.trim();
    const name = els.newUserName.value.trim();
    const role = els.newUserRole.value;
    if(!id || !name) return alert("必須");
    if(masterData.users.some(u => u.id === id)) return alert("重複");
    masterData.users.push({ id, name, role });
    els.newUserId.value = ''; els.newUserName.value = '';
    renderAdminLists();
};
window.changeUserRole = function(index, newRole) { masterData.users[index].role = newRole; };
window.removeUser = function(index) {
    if(masterData.users[index].id === 'admin') return alert("不可");
    if(!confirm('削除？')) return;
    masterData.users.splice(index, 1);
    renderAdminLists();
};
window.saveMasterData = async function() {
    if(!confirm("保存しますか？")) return;
    toggleLoading(true);
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateMaster', incidents: masterData.incidents, categories: masterData.categories, users: masterData.users }) });
        alert("保存しました"); await loadMasterDataForAdmin(); await loadData();
    } catch(e) { alert("失敗"); } finally { toggleLoading(false); }
};
window.loadData = loadData;

function renderDashboard() {
    const mc = {}, ic = {};
    knowledgeData.forEach(item => {
        if(item.machine) mc[item.machine] = (mc[item.machine] || 0) + 1;
        if(item.incidents) item.incidents.forEach(i => ic[i] = (ic[i] || 0) + 1);
    });
    renderCountList(els.machineList, mc);
    renderCountList(els.incidentList, ic);
}
function renderCountList(el, counts) {
    if(!el) return;
    el.innerHTML = '';
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(k)}</span> <strong>${v}件</strong>`;
        el.appendChild(li);
    });
}
function toggleLoading(flg) { if(els.loading) els.loading.style.display = flg ? 'flex' : 'none'; }
function escapeHtml(str) { return str ? str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','{':'&#34;','}':'&#39;'}[m])) : ''; }

init();