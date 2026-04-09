// --- Initial State ---
let state = {
    initialValue: 0,
    expenses: []
};

let chartInstance = null;

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    lucide.createIcons(); // Initialize Icons
    setupEventListeners();
    renderAll();
});

// --- Data Persistence ---
function loadData() {
    const oldSaved = localStorage.getItem('finanzflow_data');
    const saved = localStorage.getItem('tatehirapay_data');
    
    if (saved) {
        state = JSON.parse(saved);
    } else if (oldSaved) {
        // Migration
        state = JSON.parse(oldSaved);
        saveData();
    }
}

function saveData() {
    localStorage.setItem('tatehirapay_data', JSON.stringify(state));
}

// --- Logic ---
function calculateTotals() {
    const totalExpenses = state.expenses.reduce((sum, exp) => sum + parseFloat(exp.value), 0);
    const paidTotal = state.expenses.filter(e => e.isPaid).reduce((sum, exp) => sum + parseFloat(exp.value), 0);
    const unpaidTotal = totalExpenses - paidTotal;
    const balance = state.initialValue - totalExpenses;
    
    return {
        totalExpenses,
        paidTotal,
        unpaidTotal,
        balance,
        percentageUsed: state.initialValue > 0 ? (totalExpenses / state.initialValue) * 100 : 0
    };
}

// --- Render Functions ---
function renderAll() {
    const totals = calculateTotals();
    
    // Update Top Cards
    document.getElementById('val-initial').textContent = formatCurrency(state.initialValue);
    document.getElementById('val-total-expenses').textContent = formatCurrency(totals.totalExpenses);
    document.getElementById('val-balance').textContent = formatCurrency(totals.balance);
    document.getElementById('val-paid').textContent = formatCurrency(totals.paidTotal);
    document.getElementById('val-unpaid').textContent = formatCurrency(totals.unpaidTotal);

    // Update Progress Bar
    const progressBar = document.getElementById('budget-progress');
    const budgetText = document.getElementById('budget-text');
    const percent = Math.min(totals.percentageUsed, 100).toFixed(1);
    progressBar.style.width = `${percent}%`;
    budgetText.textContent = `${percent}% do limite mensal utilizado`;
    
    // Mood color for progress
    if (percent > 90) progressBar.style.background = 'var(--expense)';
    else if (percent > 70) progressBar.style.background = 'orange';
    else progressBar.style.background = 'var(--gradient-primary)';

    renderExpensesTable();
    updateChart();
    renderReport();
}

function renderExpensesTable() {
    const list = document.getElementById('expenses-list');
    const searchTerm = document.getElementById('search-expenses').value.toLowerCase();
    
    list.innerHTML = '';
    
    const filtered = state.expenses.filter(exp => 
        exp.name.toLowerCase().includes(searchTerm) || 
        exp.category.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        list.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-secondary)">Nenhum gasto encontrado.</td></tr>`;
        return;
    }

    // Sort by date desk
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach((exp, index) => {
        const tr = document.createElement('tr');
        tr.className = 'expense-row';
        tr.innerHTML = `
            <td>${formatDate(exp.date)}</td>
            <td>${exp.name}</td>
            <td><span class="cat-badge">${exp.category}</span></td>
            <td>${formatDate(exp.dueDate || exp.date)}</td>
            <td class="text-right">R$ ${parseFloat(exp.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td class="text-center">
                <span class="status-badge ${exp.isPaid ? 'status-paid' : 'status-pending'}" onclick="togglePaidStatus('${exp.id}')">
                    <i data-lucide="${exp.isPaid ? 'check' : 'clock'}"></i>
                    ${exp.isPaid ? 'Pago' : 'Pendente'}
                </span>
            </td>
            <td class="text-center">
                <button class="btn-delete" onclick="deleteExpense('${exp.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        list.appendChild(tr);
    });
    lucide.createIcons();
}

function renderReport() {
    const reportContent = document.getElementById('report-content');
    const totals = calculateTotals();
    
    const categoryTotals = {};
    state.expenses.forEach(e => {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + parseFloat(e.value);
    });

    let catHTML = '';
    for (const [cat, val] of Object.entries(categoryTotals)) {
        catHTML += `<div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <span>${cat}</span>
            <span>R$ ${val.toLocaleString('pt-BR')}</span>
        </div>`;
    }

    reportContent.innerHTML = `
        <div style="margin-bottom: 2rem">
            <h3>Resumo Geral</h3>
            <p>Saldo Inicial: R$ ${state.initialValue.toLocaleString('pt-BR')}</p>
            <p>Total de Gastos: R$ ${totals.totalExpenses.toLocaleString('pt-BR')}</p>
            <p>Total Pago: R$ ${totals.paidTotal.toLocaleString('pt-BR')}</p>
            <p>Total Pendente: R$ ${totals.unpaidTotal.toLocaleString('pt-BR')}</p>
            <p><strong>Saldo Final (Real): R$ ${totals.balance.toLocaleString('pt-BR')}</strong></p>
            <p><strong>Saldo Disponível (Sem pendências): R$ ${(state.initialValue - totals.paidTotal).toLocaleString('pt-BR')}</strong></p>
        </div>
        <div>
            <h3>Por Categoria</h3>
            ${catHTML || '<p>Nenhum gasto registrado.</p>'}
        </div>
    `;
}

// --- Chart setup ---
function updateChart() {
    const ctx = document.getElementById('chart-pie').getContext('2d');
    
    // Group by category
    const catData = {};
    state.expenses.forEach(exp => {
        catData[exp.category] = (catData[exp.category] || 0) + parseFloat(exp.value);
    });

    const labels = Object.keys(catData);
    const data = Object.values(catData);

    if (chartInstance) {
        chartInstance.destroy();
    }

    if (labels.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#7000ff', '#00f2ff', '#00ff88', '#ff4d4d', '#ff9f40'
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a0a0c0', font: { family: 'Outfit' } }
                }
            },
            cutout: '70%'
        }
    });
}

// --- Event Handlers ---
function setupEventListeners() {
    // Navigation
    document.getElementById('nav-dashboard').addEventListener('click', () => switchSection('dashboard'));
    document.getElementById('nav-transactions').addEventListener('click', () => switchSection('transactions'));
    document.getElementById('nav-reports').addEventListener('click', () => switchSection('reports'));

    // Modals
    document.getElementById('btn-new-expense').addEventListener('click', () => openModal('expense'));
    document.getElementById('btn-edit-initial').addEventListener('click', () => openModal('initial'));
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // Forms
    document.getElementById('form-expense').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('exp-name').value;
        const value = document.getElementById('exp-value').value;
        const category = document.getElementById('exp-category').value;
        const dueDate = document.getElementById('exp-due-date').value;
        const isPaid = document.getElementById('exp-status').value === 'true';
        
        addExpense(name, value, category, dueDate, isPaid);
        e.target.reset();
        closeModal();
    });

    document.getElementById('form-initial').addEventListener('submit', (e) => {
        e.preventDefault();
        const val = document.getElementById('input-initial-val').value;
        state.initialValue = parseFloat(val);
        saveData();
        renderAll();
        closeModal();
    });

    // Search
    document.getElementById('search-expenses').addEventListener('input', renderExpensesTable);

    // Export
    document.getElementById('btn-export-data').addEventListener('click', exportData);
}

// --- Actions ---
function addExpense(name, value, category, dueDate, isPaid) {
    const newExp = {
        id: Date.now().toString(),
        name,
        value: parseFloat(value),
        category,
        dueDate: dueDate || new Date().toISOString().split('T')[0],
        isPaid: isPaid ?? false,
        date: new Date().toISOString()
    };
    state.expenses.push(newExp);
    saveData();
    renderAll();
}

window.togglePaidStatus = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (exp) {
        exp.isPaid = !exp.isPaid;
        saveData();
        renderAll();
    }
};

window.deleteExpense = function(id) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveData();
    renderAll();
};

function switchSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`section-${name}`).classList.remove('hidden');
    document.getElementById(`nav-${name}`).classList.add('active');
    
    const titles = { dashboard: 'Dashboard', transactions: 'Transações', reports: 'Relatórios' };
    document.getElementById('page-title').textContent = titles[name];
    
    lucide.createIcons();
}

function openModal(type) {
    document.getElementById('modal-container').classList.remove('hidden');
    document.getElementById('modal-expense').classList.add('hidden');
    document.getElementById('modal-initial').classList.add('hidden');
    
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if (type === 'initial') {
        document.getElementById('input-initial-val').value = state.initialValue === 0 ? '' : state.initialValue;
    }
}

function closeModal() {
    document.getElementById('modal-container').classList.add('hidden');
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "tatehirapay_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// --- Helpers ---
function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoStr) {
    const date = new Date(isoStr);
    return date.toLocaleDateString('pt-BR');
}
