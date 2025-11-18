/* script.js — improved & safer version for SpendCraft */
const STORAGE_KEY = 'spendcraft_v2';
let state = { tx: [], budget: 0, meta: { autoBackup: false } };
let lastDeleted = null;
let autoBackupId = null;
let budgetToastState = { warned90: false, warned100: false };

const q = sel => document.querySelector(sel);
const qa = sel => Array.from(document.querySelectorAll(sel));

/* DOM refs */
const descEl = q('#desc'),
      amountEl = q('#amount'),
      dateEl = q('#date'),
      noteEl = q('#note'),
      categoryEl = q('#category'),
      recurringEl = q('#recurring'),
      addBtn = q('#addBtn'),
      clearBtn = q('#clearBtn');

const txList = q('#txList'),
      totalIncomeEl = q('#totalIncome'),
      totalExpenseEl = q('#totalExpense'),
      lineChartCanvas = q('#lineChart'),
      pieChartCanvas = q('#pieChart');

const searchEl = q('#search'),
      filterCatEl = q('#filterCat'),
      sortByEl = q('#sortBy');

const undoBtn = q('#undoBtn'),
      delAllBtn = q('#delAllBtn'),
      txCountEl = q('#txCount');

const exportCsvBtn = q('#exportCsv'),
      exportJsonBtn = q('#exportJson'),
      importCsvBtn = q('#importCsv'),
      importJsonBtn = q('#importJson'),
      fileInput = q('#fileInput'),
      backupBtn = q('#backupBtn'),
      themeBtn = q('#themeBtn');

const budgetInput = q('#budget'),
      saveBudgetBtn = q('#saveBudget'),
      usedEl = q('#used'),
      budgetLabel = q('#budgetLabel'),
      budgetProgress = q('#budgetProgress');

const autoBackupCheckbox = q('#autoBackup');
const toastRoot = q('#toastRoot');

let lineChart = null, pieChart = null;

/* Helpers */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const nowISO = () => new Date().toISOString();
const nfINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

function formatCurrency(n){
  // ensure number
  const num = Number(n) || 0;
  // Intl already returns a string like "₹1,234.00" or "-₹1,234.00"
  return nfINR.format(num);
}

function toast(text, ms=2800){
  if(!toastRoot) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastRoot.appendChild(el);
  // fade out
  setTimeout(()=> el.style.opacity = '0', Math.max(0, ms - 500));
  setTimeout(()=> el.remove(), ms);
}

/* Charts init */
function initCharts(){
  // defensive: check that canvas elements exist
  if(lineChartCanvas && lineChartCanvas.getContext){
    lineChart = new Chart(lineChartCanvas.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Expense', data: [], backgroundColor:'rgba(96,165,250,0.08)', borderColor:'#60a5fa', tension:0.35, fill:true }]},
      options: { scales:{ y:{ beginAtZero:true }}, plugins:{ legend:{ display:false } } }
    });
  }
  if(pieChartCanvas && pieChartCanvas.getContext){
    pieChart = new Chart(pieChartCanvas.getContext('2d'), {
      type:'pie',
      data:{ labels:[], datasets:[{ data:[], backgroundColor: [] }]},
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });
  }
}

/* Load / Save with normalization */
function normalizeState(obj){
  if(!obj || typeof obj !== 'object') return { tx: [], budget: 0, meta: { autoBackup: false } };
  return {
    tx: Array.isArray(obj.tx) ? obj.tx.map(normalizeTx) : (Array.isArray(obj) ? obj : []),
    budget: Number(obj.budget) || 0,
    meta: obj.meta || { autoBackup: false }
  };
}
function normalizeTx(t){
  if(!t || typeof t !== 'object') return null;
  return {
    id: t.id || uid(),
    desc: String(t.desc || '').slice(0,200),
    amount: Number(t.amount) || 0,
    category: t.category || 'Other',
    date: t.date ? new Date(t.date).toISOString() : nowISO(),
    recurring: t.recurring || 'none',
    note: t.note || ''
  };
}

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      state = normalizeState(parsed);
    } else {
      state = normalizeState(state);
    }
  } catch(e){
    console.error('Error loading state', e);
    state = normalizeState(state);
  }
  // restore autoBackup checkbox & behavior
  if(autoBackupCheckbox){
    autoBackupCheckbox.checked = !!state.meta?.autoBackup;
    if(autoBackupCheckbox.checked){
      startAutoBackup();
    }
  }
}

function save(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e){
    console.error('save err', e);
  }
}

/* Rendering */
function render(){
  // Filter / search / sort
  const qtxt = (searchEl?.value || '').trim().toLowerCase();
  const cat = filterCatEl?.value || '';
  let list = (state.tx || []).slice();

  if(qtxt) list = list.filter(t => ((t.desc||'') + ' ' + (t.note||'')).toLowerCase().includes(qtxt));
  if(cat) list = list.filter(t => t.category === cat);

  const sortMode = sortByEl?.value || 'date_desc';
  if(sortMode === 'date_desc') list.sort((a,b)=> new Date(b.date) - new Date(a.date));
  else if(sortMode === 'date_asc') list.sort((a,b)=> new Date(a.date) - new Date(b.date));
  else if(sortMode === 'amount_desc') list.sort((a,b)=> Math.abs(b.amount) - Math.abs(a.amount));
  else if(sortMode === 'amount_asc') list.sort((a,b)=> Math.abs(a.amount) - Math.abs(b.amount));

  // Render list
  txList.innerHTML = '';
  if(list.length === 0){
    txList.innerHTML = '<div class="small">No transactions yet — add one to get started.</div>';
  } else {
    const frag = document.createDocumentFragment();
    for(const t of list){
      const el = document.createElement('div'); el.className = 'tx';
      const color = t.amount >= 0 ? 'linear-gradient(180deg,#d1fae5,#bbf7d0)' : 'linear-gradient(180deg,#ffe6e6,#ffdede)';
      el.innerHTML = `
        <div class="tx-left">
          <div class="cat-bubble" style="background:${color};width:56px;height:56px;border-radius:12px">
            ${escapeHtml((t.category||'')[0]||'X')}
          </div>
          <div>
            <div style="font-weight:700">${escapeHtml(t.desc)}</div>
            <div class="meta">${new Date(t.date).toLocaleString()} • ${escapeHtml(t.category)}${t.recurring && t.recurring!=='none' ? ' • recurring':''}</div>
            ${t.note? `<div class="meta">${escapeHtml(t.note)}</div>`: ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="amount ${t.amount>=0? 'positive':'negative'}">${formatCurrency(t.amount)}</div>
          <div class="tx-actions">
            <button class="btn ghost small" data-id="${t.id}" data-action="edit" type="button">Edit</button>
            <button class="btn ghost small" data-id="${t.id}" data-action="del" type="button">Delete</button>
          </div>
        </div>
      `;
      frag.appendChild(el);
    }
    txList.appendChild(frag);
  }

  // Totals
  const totalIncome = (state.tx || []).filter(x=> x.amount>0).reduce((s,x)=> s + Number(x.amount),0);
  const totalExpense = (state.tx || []).filter(x=> x.amount<0).reduce((s,x)=> s + Math.abs(Number(x.amount)),0);
  totalIncomeEl.textContent = formatCurrency(totalIncome);
  totalExpenseEl.textContent = formatCurrency(totalExpense);

  // Budget progress + single-shot toasts
  const used = totalExpense;
  usedEl.textContent = formatCurrency(used);
  budgetLabel.textContent = '/ ' + formatCurrency(state.budget || 0);
  const pct = state.budget > 0 ? Math.min(100, Math.round((used/state.budget)*100)) : 0;
  budgetProgress.style.width = pct + '%';

  // notify only once when thresholds cross
  if(pct >= 90 && pct < 100 && !budgetToastState.warned90){
    toast('You are close to your monthly budget!', 2500);
    budgetToastState.warned90 = true;
    budgetToastState.warned100 = false;
  } else if(pct >= 100 && !budgetToastState.warned100){
    toast('Budget exceeded!', 3600);
    budgetToastState.warned100 = true;
    budgetToastState.warned90 = true;
  } else if(pct < 90){
    // reset if user goes back under 90%
    budgetToastState.warned90 = false;
    budgetToastState.warned100 = false;
  }

  // Line chart — last 12 months expense
  if(lineChart){
    const months = [];
    const mdata = [];
    for(let i=11;i>=0;i--){
      const d = new Date(); d.setMonth(d.getMonth()-i);
      const key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
      months.push(key);
      const total = (state.tx || []).filter(t => {
        const tD = new Date(t.date);
        const k = `${tD.getFullYear()}-${('0'+(tD.getMonth()+1)).slice(-2)}`;
        return k === key && t.amount < 0;
      }).reduce((s,x)=> s + Math.abs(Number(x.amount)), 0);
      mdata.push(total);
    }
    lineChart.data.labels = months;
    lineChart.data.datasets[0].data = mdata;
    lineChart.update();
  }

  // Pie chart by category
  if(pieChart){
    const byCat = {};
    (state.tx || []).filter(t=> t.amount<0).forEach(t => byCat[t.category] = (byCat[t.category]||0) + Math.abs(Number(t.amount)));
    const labels = Object.keys(byCat);
    const vals = labels.map(l=> byCat[l]);
    const colors = labels.map((_,i)=> `hsl(${(i*70) % 360},70%,55%)`);
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = vals;
    pieChart.data.datasets[0].backgroundColor = colors;
    pieChart.update();
  }

  txCountEl.textContent = `${(state.tx||[]).length} transactions`;
  save();
}

/* Escape for basic innerHTML usage from data */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* CRUD */
function addTransaction(obj){
  const tx = Object.assign({ id: uid(), desc:'', amount:0, category:'Other', date: nowISO(), recurring:'none', note:'' }, obj);
  // normalize
  const n = normalizeTx(tx);
  state.tx.unshift(n);
  render();
}

addBtn.addEventListener('click', ()=>{
  const desc = (descEl.value || '').trim();
  const amount = parseFloat(amountEl.value);
  const date = dateEl.value ? new Date(dateEl.value).toISOString() : nowISO();
  const category = categoryEl.value || 'Other';
  const recurring = recurringEl.value || 'none';
  const note = (noteEl.value || '').trim();
  if(!desc || isNaN(amount)){ toast('Enter valid description & amount', 1800); return; }
  addTransaction({ desc, amount, date, category, recurring, note });
  // reset form fields
  descEl.value=''; amountEl.value=''; noteEl.value=''; dateEl.value = ''; // keep date blank so default uses nowISO
  toast('Added', 1200);
});

/* delegate edit/delete */
txList.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('button');
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if(action === 'del'){
    const idx = (state.tx || []).findIndex(t=> t.id === id);
    if(idx === -1) return;
    lastDeleted = state.tx.splice(idx,1)[0];
    render();
    toast('Deleted — click Undo to restore', 2500);
  } else if(action === 'edit'){
    const tx = (state.tx || []).find(t=> t.id === id);
    if(!tx) return;
    // populate form for editing
    descEl.value = tx.desc; amountEl.value = tx.amount; categoryEl.value = tx.category;
    dateEl.value = new Date(tx.date).toISOString().slice(0,10);
    recurringEl.value = tx.recurring || 'none'; noteEl.value = tx.note || '';
    // remove original and let add reinsert
    state.tx = (state.tx || []).filter(t=> t.id !== id);
    render();
    // focus description for quick edit
    descEl.focus();
  }
});

undoBtn.addEventListener('click', ()=>{
  if(!lastDeleted) return toast('Nothing to undo',1200);
  state.tx.unshift(lastDeleted);
  lastDeleted = null;
  render();
  toast('Restored',1200);
});

delAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all transactions? This cannot be undone.')) return;
  state.tx = []; render(); toast('Cleared all',1200);
});

/* search / filters */
searchEl?.addEventListener('input', debounce(render, 250));
filterCatEl?.addEventListener('change', render);
sortByEl?.addEventListener('change', render);

/* export */
exportCsvBtn?.addEventListener('click', ()=>{
  const headers = ['id','desc','amount','category','date','recurring','note'];
  const rows = (state.tx || []).map(t => headers.map(h => JSON.stringify(t[h]||'')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = `spendcraft_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});

exportJsonBtn?.addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type:'application/json' }));
  a.download = `spendcraft_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
});

/* import (CSV/JSON) */
importCsvBtn?.addEventListener('click', ()=> fileInput.click());
importJsonBtn?.addEventListener('click', ()=> fileInput.click());

fileInput?.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const txt = e.target.result;
    if(f.name.toLowerCase().endsWith('.json')){
      try {
        const data = JSON.parse(txt);
        // accept either whole state or just tx array
        if(data.tx) state = normalizeState(data);
        else state.tx = Array.isArray(data) ? data.map(normalizeTx).filter(Boolean) : state.tx;
        save(); render(); toast('JSON imported',1200);
      } catch(err){ toast('Invalid JSON',1500); }
    } else {
      // CSV parsing: try to handle CSVs exported by this app (JSON-escaped cells),
      // otherwise try a simple CSV parse. For robust CSV support, consider PapaParse.
      try {
        const lines = txt.trim().split('\n').map(l=> l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
        const headers = lines.shift().map(h => h.replace(/(^"|"$)/g,''));
        const parsed = lines.map(cols => {
          const obj = {};
          headers.forEach((h,i)=> {
            const cell = (cols[i] || '').trim();
            // if cell begins and ends with quotes, parse as JSON string to unescape
            try { obj[h] = JSON.parse(cell || '""'); } catch(e){ obj[h] = cell.replace(/^"|"$/g,''); }
          });
          obj.amount = Number(obj.amount) || 0;
          obj.date = obj.date ? new Date(obj.date).toISOString() : nowISO();
          return normalizeTx(obj);
        }).filter(Boolean);
        state.tx = parsed.concat(state.tx || []);
        save(); render(); toast('CSV imported',1500);
      } catch(err){
        console.error('CSV parse failed', err);
        toast('CSV parse failed. Try exporting from SpendCraft or use PapaParse for complex CSVs.', 2500);
      }
    }
  };
  reader.readAsText(f);
  // clear input so same file can be re-selected later
  fileInput.value = '';
});

/* backup to clipboard or fallback to download */
backupBtn?.addEventListener('click', ()=> {
  const json = JSON.stringify(state, null, 2);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(json).then(()=> toast('Backup copied to clipboard',1400), ()=>{
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'spendcraft_backup.json'; a.click();
    });
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'spendcraft_backup.json'; a.click();
  }
});

/* theme toggle (note: still need to provide .light variables in CSS) */
themeBtn?.addEventListener('click', () => document.documentElement.classList.toggle('light'));

/* budget */
saveBudgetBtn?.addEventListener('click', ()=> {
  state.budget = Number(budgetInput.value || 0);
  state.meta = state.meta || {};
  state.meta.autoBackup = !!autoBackupCheckbox?.checked;
  render(); toast('Budget saved',1200);
});

/* auto-backup checkbox */
autoBackupCheckbox?.addEventListener('change', (e)=>{
  state.meta = state.meta || {};
  state.meta.autoBackup = e.target.checked;
  if(e.target.checked) startAutoBackup();
  else stopAutoBackup();
  save();
});

function startAutoBackup(){
  if(autoBackupId) return;
  autoBackupId = setInterval(()=> {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){ console.error('autobackup err', e); }
  }, 30000);
}
function stopAutoBackup(){
  if(!autoBackupId) return;
  clearInterval(autoBackupId);
  autoBackupId = null;
}

/* clock */
setInterval(()=> q('#clock').textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), 1000);

/* debounce */
function debounce(fn, ms=200){
  let t; return (...a)=> { clearTimeout(t); t=setTimeout(()=> fn(...a), ms); }
}

/* small helper to set default date input if empty */
function setDefaultDate(){
  if(dateEl && !dateEl.value){
    const today = new Date().toISOString().slice(0,10);
    dateEl.value = today;
  }
}

/* initial boot */
load();
initCharts();
setDefaultDate();
render();

/* service worker optional */
if('serviceWorker' in navigator){
  try { navigator.serviceWorker.register('/sw.js').catch(()=>{}); } catch(e){}
}
