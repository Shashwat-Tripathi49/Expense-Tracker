const STORAGE_KEY = 'spendcraft_v2';
let state = { tx: [], budget: 0 };
let lastDeleted = null;
let autoBackupId = null;
const q = sel => document.querySelector(sel);
const qa = sel => Array.from(document.querySelectorAll(sel));
const descEl = q('#desc'), amountEl = q('#amount'), dateEl = q('#date'), noteEl = q('#note'),
      categoryEl = q('#category'), recurringEl = q('#recurring'), addBtn = q('#addBtn'), clearBtn = q('#clearBtn');
const txList = q('#txList'), totalIncomeEl = q('#totalIncome'), totalExpenseEl = q('#totalExpense'),
      lineChartCanvas = q('#lineChart'), pieChartCanvas = q('#pieChart');
const searchEl = q('#search'), filterCatEl = q('#filterCat'), sortByEl = q('#sortBy');
const undoBtn = q('#undoBtn'), delAllBtn = q('#delAllBtn'), txCountEl = q('#txCount');
const exportBtn = q('#exportBtn'), importBtn = q('#importBtn'), fileInput = q('#fileInput'),
      backupBtn = q('#backupBtn'), themeBtn = q('#themeBtn');
const exportCsvBtn = q('#exportCsv'), exportJsonBtn = q('#exportJson'), importCsvBtn = q('#importCsv'), importJsonBtn = q('#importJson');
const budgetInput = q('#budget'), saveBudgetBtn = q('#saveBudget'), usedEl = q('#used'), budgetLabel = q('#budgetLabel'), budgetProgress = q('#budgetProgress');
const toastRoot = q('#toastRoot');
let lineChart = null, pieChart = null;
function initCharts(){
  lineChart = new Chart(lineChartCanvas.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Expense', data: [], backgroundColor:'rgba(96,165,250,0.08)', borderColor:'#60a5fa', tension:0.35, fill:true }]},
    options: { scales:{ y:{ beginAtZero:true }}, plugins:{ legend:{ display:false } } }
  });
  pieChart = new Chart(pieChartCanvas.getContext('2d'), {
    type:'pie',
    data:{ labels:[], datasets:[{ data:[], backgroundColor: [] }]},
    options:{ plugins:{ legend:{ position:'bottom' } } }
  });
}
function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) state = JSON.parse(raw);
  } catch(e){ console.error('load err',e); }
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const currency = n => '₹' + Number(n).toFixed(2);
const nowISO = () => new Date().toISOString();
const toast = (text, ms=2800) => {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  toastRoot.appendChild(el);
  setTimeout(()=> el.style.opacity=0, ms-500);
  setTimeout(()=> el.remove(), ms);
};
function render(){
  const qtxt = searchEl.value.trim().toLowerCase();
  const cat = filterCatEl.value;
  let list = state.tx.slice();
  if(qtxt) list = list.filter(t => (t.desc + ' ' + (t.note||'')).toLowerCase().includes(qtxt));
  if(cat) list = list.filter(t => t.category === cat);
  if(sortByEl.value === 'date_desc') list.sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(sortByEl.value === 'date_asc') list.sort((a,b)=> new Date(a.date)-new Date(b.date));
  if(sortByEl.value === 'amount_desc') list.sort((a,b)=> Math.abs(b.amount)-Math.abs(a.amount));
  if(sortByEl.value === 'amount_asc') list.sort((a,b)=> Math.abs(a.amount)-Math.abs(b.amount));
  txList.innerHTML = '';
  if(list.length === 0){
    txList.innerHTML = '<div class="small">No transactions yet — add one to get started.</div>';
  } else {
    for(const t of list){
      const el = document.createElement('div'); el.className = 'tx';
      const color = t.amount >= 0 ? 'linear-gradient(180deg,#d1fae5,#bbf7d0)' : 'linear-gradient(180deg,#ffe6e6,#ffdede)';
      el.innerHTML = `
        <div class="tx-left">
          <div class="cat-bubble" style="background:${color};width:56px;height:56px;border-radius:12px">
            ${t.category[0] || 'X'}
          </div>
          <div>
            <div style="font-weight:700">${t.desc}</div>
            <div class="meta">${new Date(t.date).toLocaleString()} • ${t.category}${t.recurring? ' • recurring':''}</div>
            ${t.note? `<div class="meta">${t.note}</div>`: ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="amount ${t.amount>=0? 'positive':'negative'}">${currency(t.amount)}</div>
          <div class="tx-actions">
            <button class="btn ghost small" data-id="${t.id}" data-action="edit">Edit</button>
            <button class="btn ghost small" data-id="${t.id}" data-action="del">Delete</button>
          </div>
        </div>
      `;
      txList.appendChild(el);
    }
  }
  const totalIncome = state.tx.filter(x=> x.amount>0).reduce((s,x)=> s + x.amount,0);
  const totalExpense = state.tx.filter(x=> x.amount<0).reduce((s,x)=> s + Math.abs(x.amount),0);
  totalIncomeEl.textContent = currency(totalIncome);
  totalExpenseEl.textContent = currency(totalExpense);
  const used = totalExpense;
  usedEl.textContent = currency(used);
  budgetLabel.textContent = '/ ' + currency(state.budget || 0);
  const pct = state.budget > 0 ? Math.min(100, Math.round((used/state.budget)*100)) : 0;
  budgetProgress.style.width = pct + '%';
  if(pct >= 90 && pct < 100) toast('You are close to your monthly budget!', 2500);
  if(pct >= 100) toast('Budget exceeded!', 3600);
  const months = [];
  const mdata = [];
  for(let i=11;i>=0;i--){
    const d = new Date(); d.setMonth(d.getMonth()-i);
    const key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
    months.push(key);
    const total = state.tx.filter(t => {
      const k = `${new Date(t.date).getFullYear()}-${('0'+(new Date(t.date).getMonth()+1)).slice(-2)}`;
      return k === key && t.amount < 0;
    }).reduce((s,x)=> s + Math.abs(x.amount), 0);
    mdata.push(total);
  }
  lineChart.data.labels = months;
  lineChart.data.datasets[0].data = mdata;
  lineChart.update();
  const byCat = {};
  state.tx.filter(t=> t.amount<0).forEach(t => byCat[t.category] = (byCat[t.category]||0) + Math.abs(t.amount));
  const labels = Object.keys(byCat);
  const vals = labels.map(l=> byCat[l]);
  const colors = labels.map((_,i)=> `hsl(${i*70%360} 70% 55%)`);
  pieChart.data.labels = labels;
  pieChart.data.datasets[0].data = vals;
  pieChart.data.datasets[0].backgroundColor = colors;
  pieChart.update();
  txCountEl.textContent = `${state.tx.length} transactions`;
  save();
}
function addTransaction(obj){
  const tx = Object.assign({ id: uid(), desc:'', amount:0, category:'Other', date: nowISO(), recurring:'none', note:'' }, obj);
  state.tx.unshift(tx);
  render();
}
addBtn.addEventListener('click', ()=>{
  const desc = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const date = dateEl.value ? new Date(dateEl.value).toISOString() : nowISO();
  const category = categoryEl.value;
  const recurring = recurringEl.value;
  const note = noteEl.value.trim();
  if(!desc || isNaN(amount)){ toast('Enter valid description & amount', 1800); return; }
  addTransaction({ desc, amount, date, category, recurring, note });
  descEl.value=''; amountEl.value=''; noteEl.value=''; dateEl.value='';
  toast('Added', 1200);
});
q('#txList').addEventListener('click', (ev)=>{
  const btn = ev.target.closest('button');
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if(action === 'del'){
    const idx = state.tx.findIndex(t=> t.id === id);
    if(idx === -1) return;
    lastDeleted = state.tx.splice(idx,1)[0];
    render();
    toast('Deleted — click Undo to restore', 2500);
  } else if(action === 'edit'){
    const tx = state.tx.find(t=> t.id === id);
    if(!tx) return;
    descEl.value = tx.desc; amountEl.value = tx.amount; categoryEl.value = tx.category;
    dateEl.value = new Date(tx.date).toISOString().slice(0,10); recurringEl.value = tx.recurring; noteEl.value = tx.note || '';
    state.tx = state.tx.filter(t=> t.id !== id);
    render();
  }
});
undoBtn.addEventListener('click', ()=>{
  if(!lastDeleted) return toast('Nothing to undo',1200);
  state.tx.unshift(lastDeleted);
  lastDeleted = null; render(); toast('Restored',1200);
});
delAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all transactions? This cannot be undone.')) return;
  state.tx = []; render(); toast('Cleared all',1200);
});
searchEl.addEventListener('input', debounce(render, 250));
filterCatEl.addEventListener('change', render);
sortByEl.addEventListener('change', render);
exportCsvBtn.addEventListener('click', ()=>{
  const headers = ['id','desc','amount','category','date','recurring','note'];
  const rows = state.tx.map(t => headers.map(h => JSON.stringify(t[h]||'')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = `spendcraft_${new Date().toISOString().slice(0,10)}.csv`; a.click();
});
exportJsonBtn.addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type:'application/json' }));
  a.download = `spendcraft_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
});
importCsvBtn.addEventListener('click', ()=> fileInput.click());
importJsonBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const txt = e.target.result;
    if(f.name.endsWith('.json')){
      try { const data = JSON.parse(txt); if(data.tx) state = data; else state.tx = JSON.parse(txt); save(); render(); toast('JSON imported',1200);} catch(err){toast('Invalid JSON',1500)}
    } else {
      try {
        const lines = txt.trim().split('\n').map(l=> l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
        const headers = lines.shift().map(h => h.replace(/(^"|"$)/g,''));
        const parsed = lines.map(cols => {
          const obj = {}; headers.forEach((h,i)=> obj[h] = JSON.parse(cols[i]||'""'));
          obj.amount = Number(obj.amount); return obj;
        });
        state.tx = parsed.concat(state.tx); save(); render(); toast('CSV imported',1500);
      } catch(err){ toast('CSV parse failed',1500) }
    }
  };
  reader.readAsText(f);
});
backupBtn.addEventListener('click', ()=> {
  const json = JSON.stringify(state, null, 2);
  navigator.clipboard?.writeText(json).then(()=> toast('Backup copied to clipboard',1400), ()=> { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([json])); a.download='spendcraft_backup.json'; a.click(); });
});
themeBtn.addEventListener('click', () => document.documentElement.classList.toggle('light'));
saveBudgetBtn.addEventListener('click', ()=> { state.budget = Number(budgetInput.value || 0); render(); toast('Budget saved',1200); });
setInterval(()=> q('#clock').textContent = new Date().toLocaleString(), 1000);
q('#autoBackup')?.addEventListener('change', (e)=>{
  if(e.target.checked) autoBackupId = setInterval(()=> localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), 30000);
  else { clearInterval(autoBackupId); autoBackupId = null; }
});
function debounce(fn, ms=200){
  let t; return (...a)=> { clearTimeout(t); t=setTimeout(()=> fn(...a), ms); }
}
load();
initCharts();
render();
if('serviceWorker' in navigator){
  try { navigator.serviceWorker.register('/sw.js').catch(()=>{}); } catch(e){}
}
