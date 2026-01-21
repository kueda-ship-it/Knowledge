// ↓↓↓ 【重要】URL書き換え ↓↓↓
const API_URL = "https://script.google.com/macros/s/AKfycbweVOkWgwta--Who5RLTioSD9_yGFVB7SsyAvGAoQK2TuiLzgaajCIhoo5DorqrDUc4oA/exec";

let currentUser = null;
let knowledgeData = [];
// マスタデータ（編集用）
let masterData = { incidents: [], users: [] };

const els = {
    views: {
        login: document.getElementById('login-view'),
        menu: document.getElementById('menu-view'),
        knowledge: document.getElementById('knowledge-view'),
        dashboard: document.getElementById('dashboard-view'),
        admin: document.getElementById('admin-view')
    },
    loginForm: document.getElementById('login-form'),
    loginId: document.getElementById('login-id'),
    welcomeMsg: document.getElementById('welcome-msg'),
    loading: document.getElementById('loading-overlay'),
    
    // Knowledge
    listArea: document.getElementById('list-area'),
    editorArea: document.getElementById('editor-area'),
    knowledgeList: document.getElementById('knowledge-list'),
    form: document.getElementById('knowledge-form'),
    incidentSelect: document.getElementById('incident-select'),
    selectedIncidents: document.getElementById('selected-incidents'),
    inputs: {
        id: document.getElementById('entry-id'),
        title: document.getElementById('title-input'),
        machine: document.getElementById('machine-input'),
        property: document.getElementById('property-input'),
        reqNum: document.getElementById('req-num-input'),
        tags: document.getElementById('tags-input'),
        content: document.getElementById('content-input')
    },
    // Dashboard
    machineList: document.getElementById('machine-list-view'),
    incidentList: document.getElementById('incident-list-view'),
    
    // Admin
    adminBtn: document.getElementById('admin-btn'),
    adminIncidentList: document.getElementById('admin-incident-list'),
    adminUserList: document.getElementById('admin-user-list'),
    newIncidentInput: document.getElementById('new-incident-input'),
    newUserId: document.getElementById('new-user-id'),
    newUserName: document.getElementById('new-user-name'),
    newUserRole: document.getElementById('new-user-role')
};

// --- 初期化 ---
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

// --- 画面遷移 ---
function navigate(viewName) {
    Object.values(els.views).forEach(el => {
        if(el) el.classList.remove('active');
    });

    if(els.views[viewName]) {
        els.views[viewName].classList.add('active');
        
        if(viewName === 'menu' && currentUser) {
            if(els.welcomeMsg) els.welcomeMsg.textContent = `ようこそ、${currentUser.name} さん`;
            // 管理者ボタン制御
            if(els.adminBtn) els.adminBtn.style.display = (currentUser.role === 'admin') ? 'flex' : 'none';
        }
        
        if(viewName === 'dashboard') {
            renderDashboard();
        }

        // マスタ管理画面を開くとき
        if(viewName === 'admin') {
            loadMasterDataForAdmin();
        }
    }
}

// --- イベント設定 ---
function setupEvents() {
    // ログイン
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

    // ナレッジ関連
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => renderList(filterData(e.target.value)));

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

    document.getElementById('add-btn').addEventListener('click', () => showEditor());
    if(els.form) els.form.addEventListener('submit', (e) => { e.preventDefault(); saveData(); });
}

function logout() {
    localStorage.removeItem('kb_user');
    currentUser = null;
    navigate('login');
}

// --- データ通信 (通常) ---
async function loadData() {
    toggleLoading(true);
    try {
        const dRes = await fetch(API_URL);
        knowledgeData = await dRes.json();
        
        // 通常のマスタ取得（インシデントのみ）
        const mRes = await fetch(`${API_URL}?action=master`);
        const mJson = await mRes.json();
        updateIncidentSelect(mJson.incidents || []);
        
        renderList(knowledgeData);
    } catch(e) { console.error(e); } finally { toggleLoading(false); }
}

function updateIncidentSelect(incidents) {
    if(!els.incidentSelect) return;
    els.incidentSelect.innerHTML = '<option value="">インシデントを追加...</option>';
    incidents.forEach(inc => {
        const opt = document.createElement('option');
        opt.value = inc;
        opt.textContent = inc;
        els.incidentSelect.appendChild(opt);
    });
}

// --- マスタ管理ロジック (Admin) ---

async function loadMasterDataForAdmin() {
    toggleLoading(true);
    try {
        const res = await fetch(`${API_URL}?action=getAllMasters`);
        masterData = await res.json();
        renderAdminLists();
    } catch(e) {
        alert("マスタデータの読み込みに失敗");
    } finally {
        toggleLoading(false);
    }
}

function renderAdminLists() {
    // インシデントリスト
    els.adminIncidentList.innerHTML = '';
    masterData.incidents.forEach((inc, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${escapeHtml(inc)}</span>
            <button onclick="removeIncident(${index})"><i class="fa-solid fa-trash"></i></button>
        `;
        els.adminIncidentList.appendChild(li);
    });

    // ユーザーリスト
    els.adminUserList.innerHTML = '';
    masterData.users.forEach((u, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><b>${escapeHtml(u.id)}</b>: ${escapeHtml(u.name)} (${u.role})</span>
            <button onclick="removeUser(${index})"><i class="fa-solid fa-trash"></i></button>
        `;
        els.adminUserList.appendChild(li);
    });
}

// グローバル関数（HTMLのonclickから呼ぶため）
window.addIncident = function() {
    const val = els.newIncidentInput.value.trim();
    if(!val) return;
    masterData.incidents.push(val);
    els.newIncidentInput.value = '';
    renderAdminLists();
};

window.removeIncident = function(index) {
    if(!confirm('削除しますか？')) return;
    masterData.incidents.splice(index, 1);
    renderAdminLists();
};

window.addUser = function() {
    const id = els.newUserId.value.trim();
    const name = els.newUserName.value.trim();
    const role = els.newUserRole.value;
    
    if(!id || !name) return alert("IDと名前は必須です");
    // ID重複チェック
    if(masterData.users.some(u => u.id === id)) return alert("そのIDは既に存在します");

    masterData.users.push({ id, name, role });
    els.newUserId.value = '';
    els.newUserName.value = '';
    renderAdminLists();
};

window.removeUser = function(index) {
    const target = masterData.users[index];
    if(target.id === 'admin') return alert("adminユーザーは削除できません");
    if(!confirm('削除しますか？')) return;
    masterData.users.splice(index, 1);
    renderAdminLists();
};

// マスタの一括保存
window.saveMasterData = async function() {
    if(!confirm("現在の状態でマスタを上書き保存しますか？")) return;
    toggleLoading(true);
    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateMaster',
                incidents: masterData.incidents,
                users: masterData.users
            })
        });
        alert("保存しました");
        // 最新データを再取得してリロード
        await loadMasterDataForAdmin();
        await loadData(); // 通常データ側にも反映
    } catch(e) {
        alert("保存に失敗しました");
    } finally {
        toggleLoading(false);
    }
};

// グローバル公開 (loadData)
window.loadData = loadData;

// --- 以下、通常ロジック（表示・保存など） ---
function renderList(data) {
    if(!els.knowledgeList) return;
    els.knowledgeList.innerHTML = '';
    if(!data || data.length === 0) return els.knowledgeList.innerHTML = '<p style="text-align:center;color:#999;">データなし</p>';

    const sorted = [...data].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    sorted.forEach(item => {
        const div = document.createElement('div');
        div.className = 'knowledge-card';
        const dateStr = new Date(item.updatedAt).toLocaleDateString();
        let meta = `${dateStr} | ${item.author || ''}`;
        if(item.machine) meta += ` | ${item.machine}`;
        const iHtml = (item.incidents||[]).map(i => `[${escapeHtml(i)}]`).join(' ');
        const tHtml = (item.tags||[]).map(t => `#${escapeHtml(t)}`).join(' ');

        div.innerHTML = `<div class="card-meta">${meta}</div><div class="card-title">${escapeHtml(item.title)}</div><div class="card-tags">${iHtml} ${tHtml}</div>`;
        div.onclick = () => showEditor(item);
        els.knowledgeList.appendChild(div);
    });
}

function filterData(keyword) {
    if(!keyword) return knowledgeData;
    const k = keyword.toLowerCase();
    return knowledgeData.filter(item => JSON.stringify(item).toLowerCase().includes(k));
}

let currentIncidents = [];
function showEditor(item = null) {
    els.listArea.style.display = 'none';
    els.editorArea.style.display = 'block';
    currentIncidents = [];
    els.selectedIncidents.innerHTML = '';
    
    if(item) {
        els.inputs.id.value = item.id;
        els.inputs.title.value = item.title;
        els.inputs.machine.value = item.machine;
        els.inputs.property.value = item.property;
        els.inputs.reqNum.value = item.req_num;
        els.inputs.content.value = item.content;
        if(item.tags) els.inputs.tags.value = item.tags.join(' #');
        if(item.incidents) item.incidents.forEach(addIncidentChip);
    } else {
        els.form.reset();
        els.inputs.id.value = '';
    }
}

function addIncidentChip(text) {
    if(currentIncidents.includes(text)) return;
    currentIncidents.push(text);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHtml(text)} <i class="fa-solid fa-xmark" style="margin-left:5px;"></i>`;
    chip.querySelector('i').onclick = (e) => {
        e.stopPropagation();
        currentIncidents = currentIncidents.filter(i => i !== text);
        chip.remove();
    };
    els.selectedIncidents.appendChild(chip);
}

async function saveData() {
    const d = els.inputs;
    let tags = [];
    if(d.tags.value) tags = d.tags.value.split('#').map(t => t.trim()).filter(t => t);
    const postData = {
        action: 'save',
        data: {
            id: d.id.value || Date.now().toString(),
            machine: d.machine.value, property: d.property.value, req_num: d.reqNum.value,
            title: d.title.value, incidents: currentIncidents, tags: tags, content: d.content.value,
            updatedAt: new Date().toISOString(), author: currentUser ? currentUser.name : 'Unknown'
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