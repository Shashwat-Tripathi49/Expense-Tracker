/* script.js - Modern Premium Dashboard with Calendar & Advanced Features */
const STORAGE_KEY = 'spendcraft_v3_pro';
let state = { 
  tx: [], 
  budget: 50000, 
  meta: { 
    autoBackup: false,
    autoCleanup: true,
    theme: 'dark'
  },
  calendar: {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDate: null
  }
};

/* DOM Selectors */
const q = sel => document.querySelector(sel);
const qAll = sel => document.querySelectorAll(sel);

// Modals
const modalOverlay = q('#modalOverlay');
const settingsOverlay = q('#settingsOverlay');
const editModalOverlay = q('#editModalOverlay');

// Buttons
const addTxBtn = q('#addTxBtn');
const closeModalBtn = q('#closeModal');
const settingsBtn = q('#settingsBtn');
const closeSettingsBtn = q('#closeSettings');
const closeEditModalBtn = q('#closeEditModal');

// Forms
const txForm = q('#txForm');
const editTxForm = q('#editTxForm');

/* Inputs */
const descEl = q('#desc'),
  amountEl = q('#amount'),
  categoryEl = q('#category'),
  dateEl = q('#date');

// Edit Form Inputs
const editTxIdEl = q('#editTxId'),
  editDescEl = q('#editDesc'),
  editAmountEl = q('#editAmount'),
  editCategoryEl = q('#editCategory'),
  editDateEl = q('#editDate');

// Settings
const budgetInputEl = q('#budgetInput');
const autoCleanupEl = q('#autoCleanup');

/* Display Elements */
const totalBalanceEl = q('#totalBalance'),
  totalIncomeEl = q('#totalIncome'),
  totalExpenseEl = q('#totalExpense'),
  txListEl = q('#txList'),
  pctUsedEl = q('#pctUsed');

// Calendar
const calendarGridEl = q('#calendarGrid');
const currentMonthEl = q('#currentMonth');
const prevMonthBtn = q('#prevMonth');
const nextMonthBtn = q('#nextMonth');

// Filter
const filterPeriodEl = q('#filterPeriod');

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
  applyTheme();
  cleanupOldTransactions();
  render();
  renderCalendar();
}

function bindEvents() {
  // Modal controls
  addTxBtn?.addEventListener('click', () => modalOverlay.classList.add('open'));
  closeModalBtn?.addEventListener('click', () => modalOverlay.classList.remove('open'));
  
  settingsBtn?.addEventListener('click', () => {
    budgetInputEl.value = state.budget;
    autoCleanupEl.checked = state.meta.autoCleanup;
    settingsOverlay.classList.add('open');
  });
  closeSettingsBtn?.addEventListener('click', () => settingsOverlay.classList.remove('open'));
  
  closeEditModalBtn?.addEventListener('click', () => editModalOverlay.classList.remove('open'));

  // Close modals on outside click
  [modalOverlay, settingsOverlay, editModalOverlay].forEach(overlay => {
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Form submissions
  q('#addBtnSubmit')?.addEventListener('click', saveTransaction);
  q('#updateBtnSubmit')?.addEventListener('click', updateTransaction);
  q('#saveBudget')?.addEventListener('click', saveBudgetSettings);

  // Theme toggle
  q('#themeBtn')?.addEventListener('click', toggleTheme);

  // Backup
  q('#backupBtn')?.addEventListener('click', () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spendcraft-backup.json';
    a.click();
    showToast('Backup downloaded successfully', 'success');
  });

  // PDF Export
  q('#exportPdfBtn')?.addEventListener('click', generatePdf);

  // Calendar navigation
  prevMonthBtn?.addEventListener('click', () => {
    state.calendar.currentMonth--;
    if (state.calendar.currentMonth < 0) {
      state.calendar.currentMonth = 11;
      state.calendar.currentYear--;
    }
    renderCalendar();
  });

  nextMonthBtn?.addEventListener('click', () => {
    state.calendar.currentMonth++;
    if (state.calendar.currentMonth > 11) {
      state.calendar.currentMonth = 0;
      state.calendar.currentYear++;
    }
    renderCalendar();
  });

  // Filter
  filterPeriodEl?.addEventListener('change', render);
}

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.classList.toggle('light');
  state.meta.theme = isLight ? 'light' : 'dark';
  save();
  showToast(`Switched to ${state.meta.theme} mode`, 'info');
}

function applyTheme() {
  if (state.meta.theme === 'light') {
    document.documentElement.classList.add('light');
  }
}

async function generatePdf() {
  const btn = q('#exportPdfBtn');
  const originalText = btn.textContent;
  btn.innerHTML = '<span class="loading"></span> Generating...';

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Capture Main Dashboard
    const dashboard = q('#dashboardMain');
    const canvas = await html2canvas(dashboard, { scale: 2, backgroundColor: '#0f172a' });
    const imgData = canvas.toDataURL('image/png');

    const imgProps = doc.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    // Add Title
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("SpendCraft Financial Report", 14, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

    // Add Image
    doc.addImage(imgData, 'PNG', 0, 40, pageWidth, pdfHeight);

    doc.save(`spendcraft-report-${Date.now()}.pdf`);
    showToast('PDF report generated successfully', 'success');

  } catch (err) {
    console.error(err);
    showToast('Failed to generate PDF', 'error');
  } finally {
    btn.textContent = originalText;
  }
}

function saveBudgetSettings() {
  const budget = parseFloat(budgetInputEl.value);
  if (!isNaN(budget) && budget > 0) {
    state.budget = budget;
  }
  state.meta.autoCleanup = autoCleanupEl.checked;
  save();
  settingsOverlay.classList.remove('open');
  render();
  showToast('Settings saved successfully', 'success');
}

function saveTransaction() {
  const desc = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const category = categoryEl.value;
  const date = dateEl.value;

  if (!desc || isNaN(amount) || amount === 0) {
    showToast('Please enter valid description and amount', 'error');
    return;
  }

  const newTx = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    desc,
    amount,
    category,
    date: date ? new Date(date).toISOString() : new Date().toISOString()
  };

  state.tx.unshift(newTx);
  save();
  render();
  renderCalendar();

  // Clear and close
  descEl.value = '';
  amountEl.value = '';
  modalOverlay.classList.remove('open');
  
  showToast(`Transaction "${desc}" added successfully`, 'success');
}

function editTransaction(id) {
  const tx = state.tx.find(t => t.id === id);
  if (!tx) return;

  editTxIdEl.value = tx.id;
  editDescEl.value = tx.desc;
  editAmountEl.value = tx.amount;
  editCategoryEl.value = tx.category;
  editDateEl.value = new Date(tx.date).toISOString().slice(0, 10);

  editModalOverlay.classList.add('open');
}

function updateTransaction() {
  const id = editTxIdEl.value;
  const desc = editDescEl.value.trim();
  const amount = parseFloat(editAmountEl.value);
  const category = editCategoryEl.value;
  const date = editDateEl.value;

  if (!desc || isNaN(amount) || amount === 0) {
    showToast('Please enter valid description and amount', 'error');
    return;
  }

  const txIndex = state.tx.findIndex(t => t.id === id);
  if (txIndex === -1) return;

  state.tx[txIndex] = {
    ...state.tx[txIndex],
    desc,
    amount,
    category,
    date: date ? new Date(date).toISOString() : state.tx[txIndex].date
  };

  save();
  render();
  renderCalendar();
  editModalOverlay.classList.remove('open');
  
  showToast('Transaction updated successfully', 'success');
}

function deleteTransaction(id) {
  const tx = state.tx.find(t => t.id === id);
  if (!tx) return;

  if (confirm(`Delete transaction "${tx.desc}"?`)) {
    state.tx = state.tx.filter(t => t.id !== id);
    save();
    render();
    renderCalendar();
    showToast('Transaction deleted', 'info');
  }
}

function cleanupOldTransactions() {
  if (!state.meta.autoCleanup) return;

  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const originalCount = state.tx.length;
  state.tx = state.tx.filter(t => new Date(t.date) >= fifteenDaysAgo);

  if (state.tx.length < originalCount) {
    save();
    console.log(`Cleaned up ${originalCount - state.tx.length} old transactions`);
  }
}

function getFilteredTransactions() {
  const filter = filterPeriodEl?.value || '15';
  
  if (filter === 'all') return state.tx;

  const days = parseInt(filter);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return state.tx.filter(t => new Date(t.date) >= cutoffDate);
}

function render() {
  const filteredTx = getFilteredTransactions();

  // 1. Calculate stats
  const income = filteredTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = filteredTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = income - expenses;

  totalBalanceEl.textContent = nfINR.format(balance);
  totalIncomeEl.textContent = nfINR.format(income);
  totalExpenseEl.textContent = nfINR.format(expenses);

  const pct = Math.round((expenses / (state.budget || 1)) * 100);
  pctUsedEl.textContent = `${pct}%`;

  // 2. Render List
  renderList(filteredTx);

  // 3. Update Charts
  updateCharts(filteredTx);
}

function renderList(transactions = state.tx) {
  txListEl.innerHTML = '';

  if (transactions.length === 0) {
    txListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h3>No transactions yet</h3>
        <p>Start tracking your expenses by adding your first transaction</p>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  transactions.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tx-item';

    // Icon based on category
    const iconMap = {
      'Food': '🍔',
      'Transport': '🚗',
      'Shopping': '🛍️',
      'Entertainment': '🎬',
      'Bills': '💡',
      'Income': '💰',
      'Other': '📌'
    };
    const iconChar = iconMap[t.category] || '?';

    el.innerHTML = `
      <div class="flex" style="align-items:center;">
        <div class="tx-icon">${iconChar}</div>
        <div class="tx-info">
          <h4>${escapeHtml(t.desc)}</h4>
          <span>${new Date(t.date).toLocaleDateString()} • ${t.category}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 16px;">
        <div class="tx-amount ${t.amount >= 0 ? 'income' : 'expense'}">
          ${t.amount > 0 ? '+' : ''}${nfINR.format(t.amount)}
        </div>
        <div class="tx-actions">
          <button class="action-btn" onclick="editTransaction('${t.id}')" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="deleteTransaction('${t.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `;
    frag.appendChild(el);
  });
  txListEl.appendChild(frag);
}

function renderCalendar() {
  const { currentMonth, currentYear } = state.calendar;
  
  // Update month display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  currentMonthEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  // Get first day of month and number of days
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  calendarGridEl.innerHTML = '';

  // Day labels
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayLabels.forEach(label => {
    const labelEl = document.createElement('div');
    labelEl.className = 'calendar-day-label';
    labelEl.textContent = label;
    calendarGridEl.appendChild(labelEl);
  });

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dayEl = createCalendarDay(day, currentMonth - 1, currentYear, true);
    calendarGridEl.appendChild(dayEl);
  }

  // Current month days
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === today.getDate() && 
                    currentMonth === today.getMonth() && 
                    currentYear === today.getFullYear();
    const dayEl = createCalendarDay(day, currentMonth, currentYear, false, isToday);
    calendarGridEl.appendChild(dayEl);
  }

  // Next month days
  const remainingCells = 42 - (firstDay + daysInMonth);
  for (let day = 1; day <= remainingCells; day++) {
    const dayEl = createCalendarDay(day, currentMonth + 1, currentYear, true);
    calendarGridEl.appendChild(dayEl);
  }
}

function createCalendarDay(day, month, year, isOtherMonth = false, isToday = false) {
  const dayEl = document.createElement('div');
  dayEl.className = 'calendar-day';
  
  if (isOtherMonth) dayEl.classList.add('other-month');
  if (isToday) dayEl.classList.add('today');

  // Check if this day has transactions
  const dateStr = new Date(year, month, day).toISOString().slice(0, 10);
  const hasTransactions = state.tx.some(t => t.date.slice(0, 10) === dateStr);
  if (hasTransactions) dayEl.classList.add('has-transactions');

  dayEl.innerHTML = `<div class="calendar-day-number">${day}</div>`;

  dayEl.addEventListener('click', () => {
    // Filter transactions for this day
    const clickedDate = new Date(year, month, day);
    state.calendar.selectedDate = clickedDate;
    
    // Highlight selected day
    qAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    dayEl.classList.add('selected');

    // Show transactions for this day
    const dayTransactions = state.tx.filter(t => {
      const txDate = new Date(t.date);
      return txDate.getDate() === day &&
             txDate.getMonth() === month &&
             txDate.getFullYear() === year;
    });

    if (dayTransactions.length > 0) {
      renderList(dayTransactions);
      showToast(`Showing ${dayTransactions.length} transaction(s) for ${clickedDate.toLocaleDateString()}`, 'info');
    } else {
      renderList([]);
    }
  });

  return dayEl;
}

function updateCharts(transactions = state.tx) {
  if (!mainChartCtx || !doughnutChartCtx) return;

  // Prepare data for Main Chart (Last 6 Months Income vs Expense)
  const buckets = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const k = `${d.toLocaleString('default', { month: 'short' })}`;
    buckets[k] = { expense: 0, income: 0 };
  }

  transactions.forEach(t => {
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

  // Destroy old chart
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
  transactions.filter(t => t.amount < 0).forEach(t => {
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

function showToast(message, type = 'info') {
  const toastRoot = q('#toastRoot');
  if (!toastRoot) return;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-message">${escapeHtml(message)}</div>
  `;

  toastRoot.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.tx = parsed.tx || [];
      state.budget = parsed.budget || 50000;
      state.meta = { ...state.meta, ...(parsed.meta || {}) };
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
