/* script.js - Premium Dashboard Version */
const STORAGE_KEY = 'spendcraft_v3_pro';
let state = { tx: [], budget: 50000, meta: { autoBackup: false } };

/* DOM Selectors */
const q = sel => document.querySelector(sel);
const modalOverlay = q('#modalOverlay');
const addTxBtn = q('#addTxBtn');
const closeModalBtn = q('#closeModal');
const txForm = q('#txForm');

/* Inputs */
const descEl = q('#desc'),
  amountEl = q('#amount'),
  categoryEl = q('#category'),
  dateEl = q('#date');

/* Display Elements */
const totalBalanceEl = q('#totalBalance'),
  totalIncomeEl = q('#totalIncome'),
  totalExpenseEl = q('#totalExpense'),
  txListEl = q('#txList'),
  pctUsedEl = q('#pctUsed');

/* Chart Contexts */
const mainChartCtx = q('#mainChart')?.getContext('2d');
const doughnutChartCtx = q('#doughnutChart')?.getContext('2d');

let mainChartInst = null;
let doughnutInst = null;

const nfINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/* --- INIT --- */
function init() {
  load();
  bindEvents();
  setDefaultDate();
  render();
}

function bindEvents() {
  addTxBtn?.addEventListener('click', () => modalOverlay.classList.add('open'));
  closeModalBtn?.addEventListener('click', () => modalOverlay.classList.remove('open'));

  // Close modal on outside click
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('open');
  });

  q('#addBtnSubmit')?.addEventListener('click', saveTransaction);

  q('#themeBtn')?.addEventListener('click', () => document.documentElement.classList.toggle('light'));

  q('#backupBtn')?.addEventListener('click', () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spendcraft-backup.json';
    a.click();
  });
}

function saveTransaction() {
  const desc = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const category = categoryEl.value;
  const date = dateEl.value;

  if (!desc || isNaN(amount)) {
    alert('Please enter description and valid amount');
    return;
  }

  const newTx = {
    id: Date.now().toString(36),
    desc,
    amount,
    category,
    date: date ? new Date(date).toISOString() : new Date().toISOString()
  };

  state.tx.unshift(newTx);
  save();
  render();

  // Clear and close
  descEl.value = '';
  amountEl.value = '';
  modalOverlay.classList.remove('open');
}

function render() {
  // 1. Calculate stats
  const income = state.tx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = state.tx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = income - expenses;

  totalBalanceEl.textContent = nfINR.format(balance);
  totalIncomeEl.textContent = nfINR.format(income);
  totalExpenseEl.textContent = nfINR.format(expenses);

  const pct = Math.round((expenses / (state.budget || 1)) * 100);
  pctUsedEl.textContent = `${pct}%`;

  // 2. Render List
  renderList();

  // 3. Update Charts
  updateCharts();
}

function renderList() {
  txListEl.innerHTML = '';
  const recent = state.tx.slice(0, 10); // show top 10

  const frag = document.createDocumentFragment();
  recent.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tx-item';

    // Icon based on category (simple map)
    const iconChar = t.category[0] || '?';

    el.innerHTML = `
      <div class="flex" style="align-items:center;">
        <div class="tx-icon">${iconChar}</div>
        <div class="tx-info">
          <h4>${escapeHtml(t.desc)}</h4>
          <span>${new Date(t.date).toLocaleDateString()} • ${t.category}</span>
        </div>
      </div>
      <div class="tx-amount ${t.amount >= 0 ? 'income' : 'expense'}">
        ${t.amount > 0 ? '+' : ''}${nfINR.format(t.amount)}
      </div>
    `;
    frag.appendChild(el);
  });
  txListEl.appendChild(frag);
}

function updateCharts() {
  if (!mainChartCtx || !doughnutChartCtx) return;

  // Prepare data for Main Chart (Last 6 Months Income vs Expense)
  // We'll bucket by month string "YYYY-MM"
  const buckets = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const k = `${d.toLocaleString('default', { month: 'short' })}`; // e.g., "Jan"
    buckets[k] = { expense: 0, income: 0 };
  }

  state.tx.forEach(t => {
    const d = new Date(t.date);
    const k = d.toLocaleString('default', { month: 'short' });
    if (buckets[k]) {
      if (t.amount < 0) buckets[k].expense += Math.abs(t.amount);
      else buckets[k].income += t.amount;
    }
  });

  const labels = Object.keys(buckets);
  const dataExp = labels.map(k => buckets[k].expense);
  const dataInc = labels.map(k => buckets[k].income);

  // Destroy old config
  if (mainChartInst) mainChartInst.destroy();

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

  mainChartInst = new Chart(mainChartCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: dataInc,
          backgroundColor: '#10b981',
          borderRadius: 4
        },
        {
          label: 'Expense',
          data: dataExp,
          backgroundColor: '#f43f5e',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true, grid: { display: true } },
        x: { grid: { display: false } }
      }
    }
  });

  // Doughnut Chart (Expense by Category)
  if (doughnutInst) doughnutInst.destroy();

  const cats = {};
  state.tx.filter(t => t.amount < 0).forEach(t => {
    cats[t.category] = (cats[t.category] || 0) + Math.abs(t.amount);
  });

  doughnutInst = new Chart(doughnutChartCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(cats),
      datasets: [{
        data: Object.values(cats),
        backgroundColor: [
          '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#ec4899', '#8b5cf6', '#14b8a6'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' }
      },
      cutout: '70%'
    }
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.tx = parsed.tx || [];
      state.budget = parsed.budget || 50000;
    }
    // Attempt migration from v2 if empty
    if (state.tx.length === 0) {
      const v2 = localStorage.getItem('spendcraft_v2');
      if (v2) {
        const parsedV2 = JSON.parse(v2);
        state.tx = parsedV2.tx || [];
      }
    }
  } catch (e) { console.error(e); }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setDefaultDate() {
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Boot */
init();

/* Clock */
setInterval(() => {
  const el = q('#clock');
  if (el) el.textContent = new Date().toLocaleTimeString();
}, 1000);
