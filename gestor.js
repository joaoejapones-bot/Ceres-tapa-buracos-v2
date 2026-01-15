// Variáveis globais
let reports = [];
let currentFilter = 'all';
let currentUser = null;
let miniMap; // Variável para o mapa miniatura
let routeMap; // Variável para o mapa de rota
let optimizedRoute = []; // Armazena a rota otimizada

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
