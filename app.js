// --- Initial State ---
let state = {
    initialValue: 0,
    transactions: [] 
};

let editingTransactionId = null;
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
    const saved = localStorage.getItem('tatehirapay_data');
    
    if (saved) {
        state = JSON.parse(saved);
        
        // Migration: Move old expenses to transactions
        if (state.expenses) {
            state.transactions = state.expenses.map(e => ({ ...e, type: 'expense' }));
            delete state.expenses;
            saveData();
        }

        // Migration: Ensure all have type
        state.transactions = (state.transactions || []).map(t => ({
            ...t,
            type: t.type || 'expense'
        }));
    }
}

function saveData() {
    localStorage.setItem('tatehirapay_data', JSON.stringify(state));
}

// --- Logic ---
function calculateTotals() {
    const totalTransactions = state.transactions || [];
    
    const totalExpenses = totalTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.value), 0);
        
    const registeredIncomes = totalTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.value), 0);

    const totalIncomes = registeredIncomes + state.initialValue;

    const paidTotal = totalTransactions
        .filter(t => t.type === 'expense' && t.isPaid)
        .reduce((sum, t) => sum + parseFloat(t.value), 0);

    const unpaidTotal = totalExpenses - paidTotal;
    
    // Balance now means "Money effectively in pocket"
    const realBalance = totalIncomes - paidTotal;
    // Projected balance means "Money left after all bills are paid"
    const projectedBalance = totalIncomes - totalExpenses;
    
    return {
        totalIncomes,
        registeredIncomes,
        totalExpenses,
        paidTotal,
        unpaidTotal,
        realBalance,
        projectedBalance,
        percentageUsed: totalIncomes > 0 ? (totalExpenses / totalIncomes) * 100 : 0
    };
}

// --- Render Functions ---
function renderAll() {
    const totals = calculateTotals();
    
    // Update Top Cards
    document.getElementById('val-initial').textContent = formatCurrency(state.initialValue);
    document.getElementById('val-total-incomes').textContent = formatCurrency(totals.totalIncomes);
    // Primary 'Gastos' now shows what is LEFT to pay (abates when paid)
    document.getElementById('val-total-expenses').textContent = formatCurrency(totals.unpaidTotal);
    // Primary 'Balance' now shows REAL money (abates when paid)
    document.getElementById('val-balance').textContent = formatCurrency(totals.realBalance);
    document.getElementById('val-paid').textContent = formatCurrency(totals.paidTotal);
    document.getElementById('val-unpaid').textContent = formatCurrency(totals.unpaidTotal);

    // Update Transaction Tab Summary
    document.getElementById('tab-total-expenses').textContent = `Falta: R$ ${formatCurrency(totals.unpaidTotal)}`;
    document.getElementById('tab-total-incomes').textContent = `Gasto: R$ ${formatCurrency(totals.paidTotal)}`;
    document.getElementById('transaction-count').textContent = `${state.transactions.length} registros no total`;

    // Update Progress Bar
    const progressBar = document.getElementById('budget-progress');
    const budgetText = document.getElementById('budget-text');
    const percent = Math.min(totals.percentageUsed, 100).toFixed(1);
    progressBar.style.width = `${percent}%`;
    budgetText.textContent = `${percent}% do orçamento mensal comprometido`;
    
    if (percent > 90) progressBar.style.background = 'var(--expense)';
    else if (percent > 70) progressBar.style.background = 'orange';
    else progressBar.style.background = 'var(--gradient-primary)';

    renderTransactionsTable();
    updateChart();
    renderReport();
}

function renderTransactionsTable() {
    const list = document.getElementById('expenses-list');
    const searchTerm = document.getElementById('search-expenses').value.toLowerCase();
    
    list.innerHTML = '';
    
    const filtered = (state.transactions || []).filter(t => 
        t.name.toLowerCase().includes(searchTerm) || 
        t.category.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        list.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 3rem; color: var(--text-secondary)">
            <i data-lucide="info" style="margin-bottom: 10px; width: 32px; height: 32px; opacity: 0.5"></i><br>
            Nenhuma transação encontrada.
        </td></tr>`;
        lucide.createIcons();
        return;
    }

    filtered.sort((a,b) => new Date(b.id) - new Date(a.id)).forEach((t) => {
        const tr = document.createElement('tr');
        tr.className = 'expense-row';
        const isExpense = t.type === 'expense';
        
        tr.innerHTML = `
            <td>${formatDate(t.date)}</td>
            <td>${t.name}</td>
            <td><span class="cat-badge">${t.category}</span></td>
            <td>${isExpense ? 'Dia ' + (t.dueDate || '1') : '-'}</td>
            <td class="text-right value-cell ${isExpense ? 'expense' : 'income'}">
                ${isExpense ? '-' : '+'} R$ ${parseFloat(t.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </td>
            <td class="text-center">
                ${isExpense ? `
                <span class="status-badge ${t.isPaid ? 'status-paid' : 'status-pending'}" onclick="togglePaidStatus('${t.id}')">
                    <i data-lucide="${t.isPaid ? 'check' : 'clock'}"></i>
                    ${t.isPaid ? 'Pago' : 'Pendente'}
                </span>` : '<span style="color: var(--income); opacity: 0.7">—</span>'}
            </td>
            <td class="text-center">
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-edit" onclick="editTransaction('${t.id}')">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteTransaction('${t.id}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
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
    state.transactions.forEach(t => {
        const key = t.type === 'expense' ? `[G] ${t.category}` : `[R] ${t.category}`;
        categoryTotals[key] = (categoryTotals[key] || 0) + parseFloat(t.value);
    });

    let catHTML = '';
    for (const [cat, val] of Object.entries(categoryTotals)) {
        const isExpense = cat.startsWith('[G]');
        catHTML += `
            <div class="report-stat-card" style="display:flex; justify-content:space-between; align-items:center">
                <div>
                    <span class="label">${cat}</span>
                    <span class="value" style="color: ${isExpense ? 'var(--expense)' : 'var(--income)'}">
                        ${isExpense ? '-' : '+'} R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </span>
                </div>
                <div style="opacity: 0.3"><i data-lucide="${isExpense ? 'arrow-down-right' : 'arrow-up-right'}"></i></div>
            </div>`;
    }

    reportContent.innerHTML = `
        <div class="report-grid">
            <div>
                <h3 class="report-section-title"><i data-lucide="bar-chart-2"></i> Resumo Financeiro</h3>
                <div class="report-stat-card">
                    <span class="label">Total de Receitas (Inicial + Entradas)</span>
                    <span class="value" style="color: var(--income)">R$ ${totals.totalIncomes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="report-stat-card">
                    <span class="label">Total Já Pago</span>
                    <span class="value" style="color: var(--expense)">- R$ ${totals.paidTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="report-stat-cardHighlight" style="background: var(--gradient-primary); padding: 1.5rem; border-radius: 16px; margin-top: 1rem; margin-bottom: 1rem;">
                    <span class="label" style="color: rgba(255,255,255,0.7)">Saldo Real (O que você tem)</span>
                    <span class="value" style="color: white; font-size: 1.8rem">R$ ${totals.realBalance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="report-stat-card" style="border-style: dashed; opacity: 0.8">
                    <span class="label">Saldo Projetado (Após pagar tudo)</span>
                    <span class="value" style="color: var(--text-primary)">R$ ${totals.projectedBalance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>
            <div>
                <h3 class="report-section-title"><i data-lucide="tag"></i> Transações por Categoria</h3>
                <div style="max-height: 400px; overflow-y: auto; padding-right: 10px;">
                    ${catHTML || '<p style="color: var(--text-secondary)">Nenhuma movimentação para exibir.</p>'}
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// --- Chart setup ---
function updateChart() {
    const ctx = document.getElementById('chart-pie').getContext('2d');
    
    // Group by category
    const catData = {};
    state.transactions.forEach(t => {
        catData[t.category] = (catData[t.category] || 0) + parseFloat(t.value);
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
    document.getElementById('btn-new-transaction').addEventListener('click', () => openTransactionModal());
    document.getElementById('btn-edit-initial').addEventListener('click', () => openInitialModal());
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // Toggle Type
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const type = e.target.getAttribute('data-type');
            updateModalFields(type);
        });
    });

    // Forms
    document.getElementById('form-transaction').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTransaction();
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
    document.getElementById('search-expenses').addEventListener('input', renderTransactionsTable);

    // Export
    document.getElementById('btn-export-data').addEventListener('click', exportData);
}

function updateModalFields(type) {
    const extraFields = document.getElementById('expense-extra-fields');
    const lblName = document.getElementById('lbl-name');
    
    if (type === 'income') {
        extraFields.style.display = 'none';
        lblName.textContent = 'Descrição da Receita';
    } else {
        extraFields.style.display = 'grid';
        lblName.textContent = 'Descrição do Gasto';
    }
}

// --- Actions ---
function saveTransaction() {
    const type = document.querySelector('.toggle-btn.active').getAttribute('data-type');
    const name = document.getElementById('trans-name').value;
    const value = document.getElementById('trans-value').value;
    const category = document.getElementById('trans-category').value;
    const dueDate = document.getElementById('trans-due-date').value;
    const isPaid = document.getElementById('trans-status').value === 'true';

    if (editingTransactionId) {
        const index = state.transactions.findIndex(t => t.id === editingTransactionId);
        if (index !== -1) {
            state.transactions[index] = {
                ...state.transactions[index],
                type, name, value: parseFloat(value), category, 
                dueDate: type === 'expense' ? (dueDate || '1') : null,
                isPaid: type === 'expense' ? isPaid : true
            };
        }
    } else {
        const newTrans = {
            id: Date.now().toString(),
            type,
            name,
            value: parseFloat(value),
            category,
            dueDate: type === 'expense' ? (dueDate || '1') : null,
            isPaid: type === 'expense' ? isPaid : true,
            date: new Date().toISOString()
        };
        state.transactions.push(newTrans);
    }
    
    saveData();
    renderAll();
    closeModal();
}

window.togglePaidStatus = function(id) {
    const t = state.transactions.find(t => t.id === id);
    if (t && t.type === 'expense') {
        t.isPaid = !t.isPaid;
        saveData();
        renderAll();
    }
};

window.deleteTransaction = function(id) {
    if (confirm('Tem certeza que deseja excluir esta transação?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveData();
        renderAll();
    }
};

window.editTransaction = function(id) {
    const t = state.transactions.find(t => t.id === id);
    if (!t) return;
    
    editingTransactionId = id;
    openTransactionModal(t);
}

function switchSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`section-${name}`).classList.remove('hidden');
    document.getElementById(`nav-${name}`).classList.add('active');
    
    const titles = { dashboard: 'Dashboard', transactions: 'Transações', reports: 'Relatórios' };
    document.getElementById('page-title').textContent = titles[name];
    
    lucide.createIcons();
}

function openTransactionModal(data = null) {
    document.getElementById('modal-container').classList.remove('hidden');
    document.getElementById('modal-transaction').classList.remove('hidden');
    document.getElementById('modal-initial').classList.add('hidden');
    
    const form = document.getElementById('form-transaction');
    form.reset();
    
    const title = document.getElementById('modal-title');
    const btnSubmit = document.getElementById('btn-save-transaction');
    
    if (data) {
        title.textContent = 'Editar Transação';
        btnSubmit.textContent = 'Atualizar Transação';
        
        // Set type toggle
        document.querySelectorAll('.toggle-btn').forEach(b => {
            if (b.getAttribute('data-type') === data.type) b.classList.add('active');
            else b.classList.remove('active');
        });
        
        document.getElementById('trans-name').value = data.name;
        document.getElementById('trans-value').value = data.value;
        document.getElementById('trans-category').value = data.category;
        document.getElementById('trans-due-date').value = data.dueDate || '';
        document.getElementById('trans-status').value = data.isPaid ? 'true' : 'false';
        
        updateModalFields(data.type);
    } else {
        editingTransactionId = null;
        title.textContent = 'Registrar Transação';
        btnSubmit.textContent = 'Salvar Transação';
        
        // Default to expense
        document.querySelector('[data-type="expense"]').click();
    }
}

function openInitialModal() {
    document.getElementById('modal-container').classList.remove('hidden');
    document.getElementById('modal-initial').classList.remove('hidden');
    document.getElementById('modal-transaction').classList.add('hidden');
    document.getElementById('input-initial-val').value = state.initialValue || '';
}

function closeModal() {
    document.getElementById('modal-container').classList.add('hidden');
    editingTransactionId = null;
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
