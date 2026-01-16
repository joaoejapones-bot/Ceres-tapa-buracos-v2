// Variáveis globais
let reports = [];
let currentFilter = 'all';
let currentUser = null;
let miniMap; // Variável para o mapa miniatura
let routeMap; // Variável para o mapa de rota
let optimizedRoute = []; // Armazena a rota otimizada
let currentMonthYearFilter = ''; // Filtro de mês/ano para relatório de obras

// Credenciais de acesso (para teste)
const CREDENTIALS = {
    username: 'admin',
    password: 'ceres2026'
};

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Verificar se já está logado
    const savedUser = sessionStorage.getItem('gestorUser');
    if (savedUser) {
        currentUser = savedUser;
        showMainPanel();
    }
    
    // Configurar formulário de login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// Função para handle login
function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
        currentUser = username;
        sessionStorage.setItem('gestorUser', username);
        showMainPanel();
    } else {
        alert('Usuário ou senha incorretos!');
        document.getElementById('password').value = '';
    }
}

// Função para mostrar painel principal
function showMainPanel() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    document.getElementById('currentUser').textContent = currentUser;
    
    // Inicializar mapa miniatura
    initializeMiniMap();
    
    // Carregar reportes
    loadReports();
}

// Função para logout
function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        sessionStorage.removeItem('gestorUser');
        currentUser = null;
        document.getElementById('loginContainer').style.display = 'flex';
        document.getElementById('mainContainer').style.display = 'none';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
}

// Função para inicializar o mapa miniatura
function initializeMiniMap() {
    // Criar o mapa centrado em Ceres, GO
    miniMap = L.map('miniMap').setView([window.CONFIG.CERES_CENTER.lat, window.CONFIG.CERES_CENTER.lng], 13);
    
    // Adicionar camada de tiles do OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(miniMap);
    
    console.log('Mapa miniatura inicializado com sucesso');
}

// Função para carregar todos os reportes
async function loadReports() {
    try {
        showLoading(true);
        
        const { data, error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .select('*')
            .order('id', { ascending: false });
        
        if (error) {
            console.error('Erro ao carregar reportes:', error);
            showError('Erro ao carregar reportes. Tente novamente.');
            return;
        }
        
        reports = data || [];
        updateStatistics();
        renderReports();
        updateMapMarkers(); // Adicionar marcadores no mapa
        
    } catch (error) {
        console.error('Erro inesperado ao carregar reportes:', error);
        showError('Erro inesperado. Tente novamente.');
    } finally {
        showLoading(false);
    }
}

// Função para atualizar estatísticas
function updateStatistics() {
    const total = reports.length;
    const pendentes = reports.filter(r => r.status === 'Pendente').length;
    const manutencao = reports.filter(r => r.status === 'Em Manutenção').length;
    const resolvidos = reports.filter(r => r.status === 'Resolvido').length;
    
    document.getElementById('totalReports').textContent = total;
    document.getElementById('pendingReports').textContent = pendentes;
    document.getElementById('maintenanceReports').textContent = manutencao;
    document.getElementById('resolvedReports').textContent = resolvidos;
}

// Função para atualizar marcadores no mapa
function updateMapMarkers() {
    if (!miniMap) return;
    
    // Limpar marcadores existentes
    miniMap.eachLayer(function(layer) {
        if (layer instanceof L.Marker) {
            miniMap.removeLayer(layer);
        }
    });
    
    // Filtrar reportes para o mapa
    let filteredReports = reports;
    if (currentFilter !== 'all') {
        filteredReports = reports.filter(r => r.status === currentFilter);
    }
    
    // Adicionar marcadores para cada reporte
    filteredReports.forEach(report => {
        const icon = getMarkerIcon(report.status);
        const marker = L.marker([report.lat, report.lng], { icon })
            .addTo(miniMap);
        
        // Criar popup
        const popupContent = createPopupContent(report);
        marker.bindPopup(popupContent);
    });
    
    // Ajustar mapa para mostrar todos os marcadores
    if (filteredReports.length > 0) {
        const group = new L.featureGroup(
            filteredReports.map(r => L.marker([r.lat, r.lng]))
        );
        miniMap.fitBounds(group.getBounds().pad(0.1));
    }
}

// Função para obter ícone do marcador por status
function getMarkerIcon(status) {
    const iconMap = {
        'Pendente': '⚠️',
        'Em Manutenção': '🔧',
        'Resolvido': '✅'
    };
    
    const emoji = iconMap[status] || '⚠️';
    
    return L.divIcon({
        html: `<div style="font-size: 28px; text-align: center; line-height: 28px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));">${emoji}</div>`,
        iconSize: [35, 35],
        className: 'custom-marker-grande'
    });
}

// Função para criar conteúdo do popup
function createPopupContent(report) {
    const reportDate = report.created_at ? new Date(report.created_at) : new Date();
    const formattedDate = reportDate.toLocaleDateString('pt-BR');
    
    return `
        <div class="popup-content">
            <h6>Reporte #${report.id || 'N/A'}</h6>
            <p><strong>Status:</strong> <span class="popup-status status-${getStatusClass(report.status)}">${report.status}</span></p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Coordenadas:</strong></p>
            <p style="font-family: monospace; font-size: 11px;">
                ${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}
            </p>
            ${report.user_id ? `<p><strong>Usuário:</strong> ${report.user_id.substring(0, 8)}...</p>` : ''}
        </div>
    `;
}

// Função para renderizar reportes na tabela
function renderReports() {
    const tbody = document.getElementById('reportsTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');
    
    // Filtrar reportes
    let filteredReports = reports;
    if (currentFilter !== 'all') {
        filteredReports = reports.filter(r => r.status === currentFilter);
    }
    
    if (filteredReports.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
    
    tbody.innerHTML = '';
    
    filteredReports.forEach(report => {
        const row = createReportRow(report);
        tbody.appendChild(row);
    });
}

// Função para criar linha da tabela
function createReportRow(report) {
    const tr = document.createElement('tr');
    
    // Formatar data
    const reportDate = report.created_at ? new Date(report.created_at) : new Date();
    const formattedDate = reportDate.toLocaleDateString('pt-BR') + ' ' + 
                         reportDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Criar link para mapa
    const mapLink = `https://www.google.com/maps?q=${report.lat},${report.lng}`;
    
    tr.innerHTML = `
        <td><strong>#${report.id || 'N/A'}</strong></td>
        <td>
            <div>${formattedDate}</div>
            <small class="text-muted">há ${getTimeAgo(reportDate)}</small>
        </td>
        <td>
            <div class="coordinates">
                <i class="fas fa-map-marker-alt me-1"></i>
                ${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}
            </div>
            <a href="${mapLink}" target="_blank" class="location-link">
                <i class="fas fa-external-link-alt me-1"></i>Ver no mapa
            </a>
        </td>
        <td>
            <div><strong>Problema Urbano</strong></div>
            <small class="text-muted">Reportado por usuário</small>
            ${report.user_id ? `<br><small class="text-muted">ID: ${report.user_id.substring(0, 8)}...</small>` : ''}
        </td>
        <td>
            <span class="status-badge status-${getStatusClass(report.status)}">
                ${report.status}
            </span>
        </td>
        <td>
            <div class="action-buttons">
                ${getActionButtons(report)}
            </div>
        </td>
    `;
    
    return tr;
}

// Função para obter classe CSS do status
function getStatusClass(status) {
    switch (status) {
        case 'Pendente': return 'pendente';
        case 'Em Manutenção': return 'manutencao';
        case 'Resolvido': return 'resolvido';
        default: return 'pendente';
    }
}

// Função para obter botões de ação
function getActionButtons(report) {
    let buttons = '';
    
    if (report.status === 'Pendente') {
        buttons += `
            <button class="btn-action btn-manutencao" onclick="updateStatus(${report.id}, 'Em Manutenção')" title="Iniciar Manutenção">
                <i class="fas fa-tools"></i> Manutenção
            </button>
            <button class="btn-action btn-resolvido" onclick="updateStatus(${report.id}, 'Resolvido')" title="Marcar como Resolvido">
                <i class="fas fa-check"></i> Resolver
            </button>
        `;
    } else if (report.status === 'Em Manutenção') {
        buttons += `
            <button class="btn-action btn-resolvido" onclick="updateStatus(${report.id}, 'Resolvido')" title="Marcar como Resolvido">
                <i class="fas fa-check"></i> Resolver
            </button>
        `;
    } else if (report.status === 'Resolvido') {
        buttons += `
            <button class="btn-action btn-manutencao" onclick="updateStatus(${report.id}, 'Em Manutenção')" title="Reabrir Manutenção">
                <i class="fas fa-undo"></i> Reabrir
            </button>
        `;
    }
    
    // Botão de excluir (sempre visível)
    buttons += `
        <button class="btn-action btn-delete" onclick="deleteReport(${report.id})" title="Excluir Solicitação">
            <i class="fas fa-trash"></i> Excluir
        </button>
    `;
    
    return buttons;
}

// Função para atualizar status de um reporte
async function updateStatus(reportId, newStatus) {
    if (!confirm(`Tem certeza que deseja alterar o status para "${newStatus}"?`)) {
        return;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .update({ status: newStatus })
            .eq('id', reportId);
        
        if (error) {
            console.error('Erro ao atualizar status:', error);
            alert('Erro ao atualizar status. Tente novamente.');
            return;
        }
        
        // Recarregar dados
        await loadReports();
        
        // Mostrar feedback
        showSuccess(`Status atualizado para "${newStatus}" com sucesso!`);
        
    } catch (error) {
        console.error('Erro inesperado ao atualizar status:', error);
        alert('Erro inesperado. Tente novamente.');
    }
}

// Função para filtrar reportes
function filterReports(filter) {
    currentFilter = filter;
    renderReports();
    updateMapMarkers(); // Atualizar marcadores do mapa
    
    // Atualizar botões de filtro
    document.querySelectorAll('.filters-container .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
}

// Função para mostrar/ocultar loading
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    const tableContainer = document.getElementById('tableContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (show) {
        spinner.style.display = 'block';
        tableContainer.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        spinner.style.display = 'none';
    }
}

// Função para mostrar mensagem de erro
function showError(message) {
    // Criar toast de erro
    showToast(message, 'danger');
}

// Função para mostrar mensagem de sucesso
function showSuccess(message) {
    // Criar toast de sucesso
    showToast(message, 'success');
}

// Função para criar toast (notificação)
function showToast(message, type) {
    // Remover toast existente
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Criar elemento toast
    const toast = document.createElement('div');
    toast.className = `toast-notification alert alert-${type} position-fixed top-0 end-0 m-3`;
    toast.style.zIndex = '9999';
    toast.style.minWidth = '300px';
    
    const icon = type === 'success' ? 'check-circle' : 'exclamation-triangle';
    
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${icon} me-2"></i>
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close ms-2" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remover após 5 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Função para calcular tempo atrás
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'poucos segundos';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' horas';
    if (seconds < 2592000) return Math.floor(seconds / 86400) + ' dias';
    return Math.floor(seconds / 2592000) + ' meses';
}

// Função para atualizar dados automaticamente (a cada 30 segundos)
setInterval(() => {
    if (currentUser) {
        loadReports();
    }
}, 30000);

// Função para excluir um reporte
async function deleteReport(reportId) {
    if (!confirm('Tem certeza que deseja EXCLUIR esta solicitação?\n\n⚠️ Esta ação não pode ser desfeita!')) {
        return;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .delete()
            .eq('id', reportId);
        
        if (error) {
            console.error('Erro ao excluir reporte:', error);
            showError('Erro ao excluir solicitação. Tente novamente.');
            return;
        }
        
        // Recarregar dados
        await loadReports();
        
        // Mostrar feedback
        showSuccess('Solicitação excluída com sucesso!');
        
    } catch (error) {
        console.error('Erro inesperado ao excluir reporte:', error);
        showError('Erro inesperado. Tente novamente.');
    }
}

// Função para gerar rota otimizada
function generateOptimizedRoute() {
    // Filtrar apenas reportes pendentes e em manutenção
    const pendingReports = reports.filter(r => r.status === 'Pendente' || r.status === 'Em Manutenção');
    
    if (pendingReports.length === 0) {
        showError('Não há reportes pendentes ou em manutenção para gerar rota.');
        return;
    }
    
    // Coordenadas da garagem municipal
    const garageCoords = {
        lat: -15.310332144673131,
        lng: -49.617540026618634
    };
    
    // Adicionar garagem como ponto inicial
    const waypoints = [garageCoords, ...pendingReports];
    
    // Calcular rota otimizada (algoritmo simples do vizinho mais próximo)
    optimizedRoute = calculateOptimizedRoute(waypoints);
    
    // Mostrar modal com a rota
    showRouteModal();
}

// Função para calcular rota otimizada (Nearest Neighbor)
function calculateOptimizedRoute(waypoints) {
    if (waypoints.length <= 1) return waypoints;
    
    const unvisited = [...waypoints];
    const route = [unvisited.shift()]; // Começa da garagem
    
    while (unvisited.length > 0) {
        const current = route[route.length - 1];
        let nearest = null;
        let minDistance = Infinity;
        
        // Encontrar o ponto mais próximo
        for (let i = 0; i < unvisited.length; i++) {
            const distance = calculateDistance(current, unvisited[i]);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = i;
            }
        }
        
        if (nearest !== null) {
            route.push(unvisited[nearest]);
            unvisited.splice(nearest, 1);
        }
    }
    
    return route;
}

// Função para calcular distância entre dois pontos
function calculateDistance(point1, point2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em metros
}

// Função para mostrar modal da rota
function showRouteModal() {
    const modal = new bootstrap.Modal(document.getElementById('routeModal'));
    
    // Inicializar mapa da rota após o modal ser mostrado
    modal.show();
    
    setTimeout(() => {
        initializeRouteMap();
        updateRouteInfo();
    }, 300);
}

// Função para inicializar mapa da rota
function initializeRouteMap() {
    if (routeMap) {
        routeMap.remove();
    }
    
    // Criar o mapa da rota
    routeMap = L.map('routeMap').setView([-15.310332, -49.617540], 13);
    
    // Adicionar camada de tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(routeMap);
    
    // Adicionar marcadores e linha da rota
    drawRoute();
}

// Função para desenhar rota no mapa
function drawRoute() {
    if (!routeMap || optimizedRoute.length === 0) return;
    
    // Limpar camadas existentes
    routeMap.eachLayer(function(layer) {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            routeMap.removeLayer(layer);
        }
    });
    
    // Desenhar linha da rota
    const routeCoordinates = optimizedRoute.map(point => [point.lat, point.lng]);
    const routeLine = L.polyline(routeCoordinates, {
        color: '#667eea',
        weight: 4,
        opacity: 0.8
    }).addTo(routeMap);
    
    // Adicionar marcadores
    optimizedRoute.forEach((point, index) => {
        const isGarage = index === 0;
        const icon = isGarage ? 
            '🏢' : // Garagem
            (point.status === 'Pendente' ? '⚠️' : '🔧'); // Status
        
        const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({
                html: `<div style="font-size: 24px; text-align: center;">${icon}</div>`,
                iconSize: [30, 30],
                className: isGarage ? 'garage-marker' : 'route-marker'
            })
        }).addTo(routeMap);
        
        // Popup com informações
        const popupContent = isGarage ? 
            '<div><strong>🏢 Garagem Municipal</strong><br>Ponto de partida</div>' :
            `<div><strong>Reporte #${point.id || 'N/A'}</strong><br>Status: ${point.status}</div>`;
        
        marker.bindPopup(popupContent);
    });
    
    // Ajustar mapa para mostrar toda a rota
    routeMap.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
}

// Função para atualizar informações da rota
function updateRouteInfo() {
    if (optimizedRoute.length === 0) return;
    
    // Calcular distância total
    let totalDistance = 0;
    for (let i = 1; i < optimizedRoute.length; i++) {
        totalDistance += calculateDistance(optimizedRoute[i-1], optimizedRoute[i]);
    }
    
    // Atualizar informações
    document.getElementById('totalStops').textContent = optimizedRoute.length - 1; // Descontar a garagem
    document.getElementById('totalDistance').textContent = (totalDistance / 1000).toFixed(2) + ' km';
    document.getElementById('estimatedTime').textContent = Math.round(totalDistance / 500 * 60) + ' min'; // Estimativa: 500m/min
}

// Função para abrir rota no Google Maps
function openRouteInGoogleMaps() {
    if (optimizedRoute.length === 0) return;
    
    // Criar URL do Google Maps com waypoints
    const waypoints = optimizedRoute.slice(1).map(point => `${point.lat},${point.lng}`).join('/');
    const url = `https://www.google.com/maps/dir/${optimizedRoute[0].lat},${optimizedRoute[0].lng}/${waypoints}`;
    
    window.open(url, '_blank');
}

// Função para compartilhar rota
function shareRoute() {
    if (optimizedRoute.length === 0) return;
    
    const routeInfo = `Rota Otimizada - Tapa-Buracos Ceres/GO\n` +
                     `Total de paradas: ${optimizedRoute.length - 1}\n` +
                     `Distância: ${document.getElementById('totalDistance').textContent}\n` +
                     `Tempo estimado: ${document.getElementById('estimatedTime').textContent}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Rota Otimizada - Tapa-Buracos',
            text: routeInfo
        });
    } else {
        // Fallback: copiar para área de transferência
        navigator.clipboard.writeText(routeInfo).then(() => {
            showSuccess('Rota copiada para a área de transferência!');
        });
    }
}

// Função para imprimir rota
function printRoute() {
    window.print();
}

// ============ FUNÇÕES DA CONTABILIDADE DE VIAS ============

// Função para inicializar aba de Contabilidade de Vias
function initializeWorksTab() {
    populateMonthYearFilter();
    updateWorksStatistics();
    renderWorksTable();
}

// Função para popular filtro de mês/ano
function populateMonthYearFilter() {
    const select = document.getElementById('monthYearFilter');
    select.innerHTML = '<option value="">Todos os Períodos</option>';
    
    // Obter meses/anos únicos dos reportes
    const monthYears = new Set();
    reports.forEach(report => {
        if (report.created_at) {
            const date = new Date(report.created_at);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthYears.add(monthYear);
        }
    });
    
    // Converter para array e ordenar do mais recente ao mais antigo
    const sortedMonthYears = Array.from(monthYears).sort((a, b) => b.localeCompare(a));
    
    // Adicionar opções ao select
    sortedMonthYears.forEach(monthYear => {
        const [year, month] = monthYear.split('-');
        const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const option = document.createElement('option');
        option.value = monthYear;
        option.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        select.appendChild(option);
    });
}

// Função para filtrar por mês/ano
function filterByMonthYear() {
    const select = document.getElementById('monthYearFilter');
    currentMonthYearFilter = select.value;
    updateWorksStatistics();
    renderWorksTable();
}

// Função para atualizar estatísticas das obras
function updateWorksStatistics() {
    let filteredReports = reports;
    
    // Aplicar filtro de mês/ano se selecionado
    if (currentMonthYearFilter) {
        filteredReports = reports.filter(report => {
            if (!report.created_at) return false;
            const date = new Date(report.created_at);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            return monthYear === currentMonthYearFilter;
        });
    }
    
    const totalReportados = filteredReports.length;
    const totalTapados = filteredReports.filter(r => r.status === 'Resolvido').length;
    
    // Calcular meta do mês (50 buracos, mas ajustar baseado no período)
    let metaMes = 50;
    if (currentMonthYearFilter) {
        // Se for um mês específico, manter meta 50
        metaMes = 50;
    } else {
        // Se for todos os períodos, calcular média mensal
        const uniqueMonths = new Set(reports.map(r => {
            if (r.created_at) {
                const date = new Date(r.created_at);
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }
        })).size;
        metaMes = uniqueMonths > 0 ? Math.round(totalTapados / uniqueMonths) : 50;
    }
    
    document.getElementById('totalReportados').textContent = totalReportados;
    document.getElementById('totalTapados').textContent = totalTapados;
    document.getElementById('metaMes').textContent = metaMes;
}

// Função para renderizar tabela de obras
function renderWorksTable() {
    const tbody = document.getElementById('worksTableBody');
    const emptyState = document.getElementById('worksEmptyState');
    const tableContainer = document.getElementById('worksTableContainer');
    
    // Filtrar reportes
    let filteredReports = reports;
    if (currentMonthYearFilter) {
        filteredReports = reports.filter(report => {
            if (!report.created_at) return false;
            const date = new Date(report.created_at);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            return monthYear === currentMonthYearFilter;
        });
    }
    
    if (filteredReports.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
    
    tbody.innerHTML = '';
    
    // Ordenar por data do reporte (mais recente primeiro)
    filteredReports.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB - dateA;
    });
    
    filteredReports.forEach(report => {
        const row = createWorksRow(report);
        tbody.appendChild(row);
    });
}

// Função para criar linha da tabela de obras
function createWorksRow(report) {
    const tr = document.createElement('tr');
    
    // Formatar datas
    const reportDate = report.created_at ? new Date(report.created_at) : new Date();
    const formattedReportDate = reportDate.toLocaleDateString('pt-BR');
    
    let formattedConclusionDate = '-';
    if (report.status === 'Resolvido' && report.updated_at) {
        const conclusionDate = new Date(report.updated_at);
        formattedConclusionDate = conclusionDate.toLocaleDateString('pt-BR');
    }
    
    // Criar link para mapa
    const mapLink = `https://www.google.com/maps?q=${report.lat},${report.lng}`;
    
    tr.innerHTML = `
        <td><strong>#${report.id || 'N/A'}</strong></td>
        <td>
            <div class="coordinates">
                <i class="fas fa-map-marker-alt me-1"></i>
                ${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}
            </div>
            <a href="${mapLink}" target="_blank" class="location-link">
                <i class="fas fa-external-link-alt me-1"></i>Ver no mapa
            </a>
        </td>
        <td>${formattedReportDate}</td>
        <td>${formattedConclusionDate}</td>
        <td>
            <span class="status-badge status-${getStatusClass(report.status)}">
                ${report.status}
            </span>
        </td>
        <td>
            ${getWorksActionButton(report)}
        </td>
    `;
    
    return tr;
}

// Função para obter botão de ação das obras
function getWorksActionButton(report) {
    if (report.status === 'Pendente' || report.status === 'Em Manutenção') {
        return `
            <button class="btn-confirmar-reparo" onclick="confirmarReparo(${report.id})" title="Confirmar Reparo">
                <i class="fas fa-check me-1"></i>Confirmar Reparo
            </button>
        `;
    } else if (report.status === 'Resolvido') {
        return `
            <button class="btn-action btn-manutencao" onclick="updateStatus(${report.id}, 'Em Manutenção')" title="Reabrir">
                <i class="fas fa-undo me-1"></i>Reabrir
            </button>
        `;
    }
    return '';
}

// Função para confirmar reparo
async function confirmarReparo(reportId) {
    if (!confirm('Tem certeza que deseja confirmar o reparo deste buraco?\n\nO status será alterado para "Resolvido" e a data de conclusão será registrada.')) {
        return;
    }
    
    try {
        // Encontrar o reporte para obter coordenadas
        const report = reports.find(r => r.id === reportId);
        
        // Atualizar status para "Resolvido" e registrar data de conclusão
        const { error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .update({ 
                status: 'Resolvido',
                updated_at: new Date().toISOString()
            })
            .eq('id', reportId);
        
        if (error) {
            console.error('Erro ao confirmar reparo:', error);
            showError('Erro ao confirmar reparo. Tente novamente.');
            return;
        }
        
        // Enviar notificação de feedback para o usuário
        if (report) {
            await sendRepairNotification(report);
        }
        
        // Recarregar dados
        await loadReports();
        
        // Atualizar apenas a aba de obras se estiver ativa
        const worksTab = document.getElementById('works-pane');
        if (worksTab.classList.contains('active')) {
            updateWorksStatistics();
            renderWorksTable();
        }
        
        // Mostrar feedback para o gestor
        showSuccess('Reparo confirmado com sucesso! Status alterado para "Resolvido".');
        
    } catch (error) {
        console.error('Erro inesperado ao confirmar reparo:', error);
        showError('Erro inesperado. Tente novamente.');
    }
}

// ============ FUNÇÃO DE NOTIFICAÇÃO DE REPARO ============

/**
 * Envia notificação de feedback para o usuário quando um reparo é confirmado
 * Esta função pode ser facilmente conectada a serviços de notificação como Firebase,
 * OneSignal, ou outros sistemas de push notification no futuro
 * 
 * @param {Object} report - Dados do reporte contendo coordenadas e outras informações
 */
async function sendRepairNotification(report) {
    try {
        // Obter nome da rua usando reverse geocoding
        const streetName = await getStreetNameFromCoordinates(report.lat, report.lng);
        
        // Gerar mensagem principal da notificação
        const mainMessage = `Buraco na rua ${streetName} tapado!`;
        
        // Gerar assinatura da marca
        const signature = 'SJ Tech Soluções';
        
        // Estrutura da notificação (formato padrão para serviços futuros)
        const notificationData = {
            title: 'Reparo Concluído',
            body: mainMessage,
            signature: signature,
            // Metadados para integração futura
            metadata: {
                reportId: report.id,
                coordinates: {
                    lat: report.lat,
                    lng: report.lng
                },
                completedAt: new Date().toISOString(),
                // Campo para identificar o usuário que reportou (se disponível)
                userId: report.user_id || null
            },
            // Configurações de exibição
            display: {
                priority: 'high',
                sound: 'default',
                badge: true,
                // Configurações visuais para branding
                branding: {
                    signature: signature,
                    signatureStyle: 'discreta elegante'
                }
            }
        };
        
        // ===== INTEGRAÇÃO COM SERVIÇOS DE NOTIFICAÇÃO =====
        // Ponto de expansão para integração futura:
        
        // 1. Firebase Cloud Messaging (FCM)
        // await sendFirebaseNotification(notificationData);
        
        // 2. OneSignal
        // await sendOneSignalNotification(notificationData);
        
        // 3. Push API nativa do navegador
        // await sendBrowserPushNotification(notificationData);
        
        // 4. WebSocket para tempo real
        // await sendWebSocketNotification(notificationData);
        
        // ===== IMPLEMENTAÇÃO ATUAL (CONSOLE + TOAST) =====
        // Por enquanto, exibimos no console e mostramos um toast simulado
        console.log('🔔 NOTIFICAÇÃO ENVIADA:', notificationData);
        
        // Simular exibição da notificação para o gestor (em produção, isso iria para o app do usuário)
        showNotificationToast(mainMessage, signature);
        
        // Salvar log da notificação para auditoria (opcional)
        await saveNotificationLog(notificationData);
        
        return {
            success: true,
            message: 'Notificação enviada com sucesso',
            data: notificationData
        };
        
    } catch (error) {
        console.error('Erro ao enviar notificação de reparo:', error);
        
        // Em produção, poderíamos ter uma fila de retry para notificações falhas
        return {
            success: false,
            error: error.message,
            message: 'Falha ao enviar notificação'
        };
    }
}

/**
 * Obtém o nome da rua a partir das coordenadas usando reverse geocoding
 * Utiliza o Nominatim (OpenStreetMap) - gratuito e sem necessidade de API key
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} Nome da rua ou endereço aproximado
 */
async function getStreetNameFromCoordinates(lat, lng) {
    try {
        // Timeout para evitar que a requisição demore muito
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
        
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
            {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'CeresBuracosApp/1.0 (SJ Tech Soluções; contato@sjtech.com.br)'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extrair informações do endereço
        const address = data.address || {};
        
        // Prioridade para nome da rua
        let streetName = address.road || 
                       address.street || 
                       address.pedestrian || 
                       address.residential ||
                       address.footway ||
                       'Local não identificado';
        
        // Adicionar número se disponível
        if (address.house_number) {
            streetName += `, ${address.house_number}`;
        }
        
        // Adicionar bairro se disponível
        if (address.suburb || address.neighbourhood) {
            streetName += ` - ${address.suburb || address.neighbourhood}`;
        }
        
        // Adicionar cidade (sempre Ceres, mas mantém para consistência)
        if (address.city || address.town || address.village) {
            streetName += `, ${address.city || address.town || address.village}`;
        }
        
        return streetName;
        
    } catch (error) {
        console.warn('Erro ao obter nome da rua:', error);
        
        // Fallback: usar coordenadas formatadas
        return `Local (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
}

/**
 * Exibe um toast simulando a notificação que seria enviada ao usuário
 * Em produção, esta função seria substituída pelo envio real para o app do usuário
 * 
 * @param {string} message - Mensagem principal da notificação
 * @param {string} signature - Assinatura da marca
 */
function showNotificationToast(message, signature) {
    // Remover toast existente
    const existingToast = document.querySelector('.notification-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Criar elemento toast personalizado
    const toast = document.createElement('div');
    toast.className = 'notification-toast position-fixed top-0 start-50 translate-middle-x mt-3';
    toast.style.zIndex = '10000';
    toast.style.minWidth = '350px';
    toast.style.maxWidth = '400px';
    
    toast.innerHTML = `
        <div class="card shadow-lg border-0" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
            <div class="card-body text-white p-3">
                <div class="d-flex align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas fa-check-circle me-2" style="font-size: 1.2rem;"></i>
                            <strong style="font-size: 0.9rem;">Reparo Concluído</strong>
                        </div>
                        <div class="mb-2" style="font-size: 0.95rem; line-height: 1.3;">
                            ${message}
                        </div>
                        <div style="font-size: 0.75rem; opacity: 0.9; font-style: italic;">
                            ${signature}
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-close-white ms-2" onclick="this.closest('.notification-toast').remove()"></button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remover após 8 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 8000);
    
    // Animação de entrada
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -20px)';
    toast.style.transition = 'all 0.3s ease';
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    }, 100);
}

/**
 * Salva log da notificação para auditoria e análise futura
 * Esta função pode ser expandida para salvar em banco de dados
 * 
 * @param {Object} notificationData - Dados da notificação enviada
 */
async function saveNotificationLog(notificationData) {
    try {
        // Em produção, salvar em tabela de logs do Supabase
        // const { error } = await window.supabaseClient
        //     .from('notification_logs')
        //     .insert({
        //         notification_type: 'repair_completed',
        //         report_id: notificationData.metadata.reportId,
        //         user_id: notificationData.metadata.userId,
        //         message: notificationData.body,
        //         sent_at: new Date().toISOString(),
        //         metadata: notificationData
        //     });
        
        // Por enquanto, apenas log no console
        console.log('📝 LOG DE NOTIFICAÇÃO:', {
            type: 'repair_completed',
            timestamp: new Date().toISOString(),
            data: notificationData
        });
        
    } catch (error) {
        console.error('Erro ao salvar log de notificação:', error);
    }
}

// Adicionar listener para quando a aba de Contabilidade de Vias for ativada (após o DOM estar pronto)
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar listener para quando a aba de Contabilidade de Vias for ativada
    const worksTab = document.getElementById('works-tab');
    if (worksTab) {
        worksTab.addEventListener('shown.bs.tab', function () {
            initializeWorksTab();
        });
    }
});
