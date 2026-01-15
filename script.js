// Variáveis globais
let map;
let markers = [];
let isReporting = false;
let buracosReportados = []; // Armazena os buracos reportados
let userId; // ID único do usuário atual

// Inicializar o aplicativo quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    userId = window.gerarIdUsuario(); // Gerar/obter ID do usuário
    console.log('ID do usuário:', userId);
    
    inicializarMapa();
    testarConexaoSupabase();
    carregarBuracos();
    configurarBotaoReportar();
    configurarSidebar();
});

// Função para inicializar o mapa
function inicializarMapa() {
    // Criar o mapa centrado em Ceres, GO
    map = L.map('map').setView([window.CONFIG.CERES_CENTER.lat, window.CONFIG.CERES_CENTER.lng], window.CONFIG.DEFAULT_ZOOM);
    
    // Adicionar camada de tiles do OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    console.log('Mapa inicializado com sucesso');
}

// Função para testar conexão com Supabase
async function testarConexaoSupabase() {
    try {
        console.log('Testando conexão com Supabase...');
        
        // Tenta fazer uma consulta simples para testar a conexão
        const { data, error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('Erro na conexão com Supabase:', error);
            console.warn('Verifique se a tabela "buracos" existe no Supabase');
        } else {
            console.log('Conexão com Supabase estabelecida com sucesso');
        }
    } catch (error) {
        console.error('Erro ao testar conexão com Supabase:', error);
    }
}

// Função para configurar o botão de reportar
function configurarBotaoReportar() {
    const btnReportar = document.getElementById('btnReportar');
    const btnIcon = document.getElementById('btnIcon');
    
    btnReportar.addEventListener('click', async function() {
        if (isReporting) return;
        
        isReporting = true;
        btnIcon.textContent = '...';
        btnReportar.classList.add('loading');
        
        try {
            await reportarBuraco();
        } catch (error) {
            console.error('Erro ao reportar buraco:', error);
            alert('Erro ao reportar problema. Tente novamente.');
        } finally {
            isReporting = false;
            btnIcon.textContent = '+';
            btnReportar.classList.remove('loading');
        }
    });
}

// Função para reportar um novo buraco
async function reportarBuraco() {
    let lat, lng;
    
    try {
        // Tentar obter localização atual do usuário
        const position = await obterLocalizacaoAtual();
        lat = position.lat;
        lng = position.lng;
        
        console.log('Localização obtida:', { lat, lng });
    } catch (error) {
        console.error('Erro ao obter GPS:', error);
        
        if (window.CONFIG.MODO_TESTE) {
            // Usar coordenadas de Ceres como fallback em modo de teste
            lat = window.CONFIG.CERES_CENTER.lat;
            lng = window.CONFIG.CERES_CENTER.lng;
            console.warn('Usando coordenadas de fallback (modo teste):', { lat, lng });
        } else {
            alert('Não foi possível obter sua localização. Por favor, verifique as permissões do navegador.');
            return; // Sai da função se não conseguir a localização e não estiver em modo de teste
        }
    }

    // Salvar no Supabase
    const buraco = {
        lat: lat,
        lng: lng,
        status: 'Pendente',
        user_id: userId // Adicionar ID do usuário
    };

    // Verificar duplicatas antes de salvar
    const duplicata = verificarDuplicata(lat, lng);
    if (duplicata) {
        alert('Já existe uma solicitação reportada neste local! Verifique o marcador existente.');
        // Centralizar mapa na duplicata
        map.setView([duplicata.lat, duplicata.lng], 16);
        // Abrir popup da duplicata
        markers.forEach(marker => {
            const pos = marker.getLatLng();
            if (Math.abs(pos.lat - duplicata.lat) < 0.000001 && Math.abs(pos.lng - duplicata.lng) < 0.000001) {
                marker.openPopup();
            }
        });
        return;
    }

    try {
        console.log('Enviando dados para Supabase:', buraco);
        
        const { data, error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .insert([buraco])
            .select();

        if (error) {
            console.error('Erro ao salvar no Supabase:', error);
            alert('Erro ao reportar problema no banco de dados: ' + error.message);
            return;
        }

        console.log('Buraco reportado com sucesso:', data);

        if (data && data.length > 0) {
            console.log('Adicionando marcador para:', data[0]);
            adicionarMarcador(data[0]);
            
            // Forçar atualização do mapa
            setTimeout(() => {
                map.invalidateSize();
                console.log('Mapa atualizado');
            }, 100);
            
            console.log('Centralizando mapa nas coordenadas:', { lat, lng });
            // Centralizar o mapa no novo marcador
            map.setView([lat, lng], window.CONFIG.DEFAULT_ZOOM);
            
            // Abrir popup do marcador automaticamente
            setTimeout(() => {
                if (markers.length > 0) {
                    markers[markers.length - 1].openPopup();
                    console.log('Popup aberto automaticamente');
                }
            }, 200);

            // Mostrar mensagem de sucesso
            alert('Problema reportado com sucesso! Obrigado por sua colaboração.');
            
            // Atualizar sidebar
            atualizarSidebar();
        } else {
            console.error('Nenhum dado retornado do Supabase');
        }
    } catch (error) {
        console.error('Erro inesperado ao reportar buraco:', error);
        alert('Erro inesperado ao reportar problema: ' + error.message);
    }
}

// Função para verificar se já existe um buraco próximo (duplicata)
function verificarDuplicata(lat, lng) {
    const distanciaMinima = window.CONFIG.DISTANCIA_MINIMA_DUPLICATA; // 10 metros
    
    for (let buraco of buracosReportados) {
        const distancia = calcularDistancia(lat, lng, buraco.lat, buraco.lng);
        if (distancia <= distanciaMinima) {
            return buraco;
        }
    }
    
    return null;
}

// Função para calcular distância entre duas coordenadas (fórmula de Haversine)
function calcularDistancia(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em metros
}

// Função para obter localização atual do usuário
function obterLocalizacaoAtual() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocalização não suportada pelo navegador'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                let mensagem = 'Erro ao obter localização: ';
                
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensagem += 'Permissão negada pelo usuário';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensagem += 'Informação de localização indisponível';
                        break;
                    case error.TIMEOUT:
                        mensagem += 'Tempo esgotado ao obter localização';
                        break;
                    default:
                        mensagem += 'Erro desconhecido';
                        break;
                }
                
                reject(new Error(mensagem));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// Função para carregar todos os buracos do Supabase
async function carregarBuracos() {
    try {
        // Limpar marcadores existentes antes de carregar novos
        limparMarcadores();
        
        const { data, error } = await window.supabaseClient
            .from(window.CONFIG.TABELA_BURACOS)
            .select('*')
            .order('id', { ascending: false });
        
        if (error) {
            console.error('Erro ao carregar buracos:', error);
            return;
        }
        
        console.log('Buracos carregados:', data);
        
        // Armazenar buracos carregados
        buracosReportados = data || [];
        
        // Adicionar marcadores para cada buraco
        if (data && data.length > 0) {
            data.forEach(buraco => adicionarMarcador(buraco));
        }
        
        // Atualizar sidebar
        atualizarSidebar();
    } catch (error) {
        console.error('Erro ao carregar buracos:', error);
    }
}

// Função para adicionar um marcador no mapa
function adicionarMarcador(buraco) {
    console.log('Criando marcador para buraco:', buraco);
    console.log('Coordenadas do marcador:', buraco.lat, buraco.lng);
    
    // Criar ícone personalizado maior e mais visível
    const icone = L.divIcon({
        html: '<div style="font-size: 32px; text-align: center; line-height: 32px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));">⚠️</div>',
        iconSize: [40, 40],
        className: 'marcador-buraco-grande'
    });
    
    // Criar marcador
    const marker = L.marker([buraco.lat, buraco.lng], { icon: icone })
        .addTo(map);
    
    console.log('Marcador adicionado ao mapa');
    
    // Criar conteúdo do popup
    const popupContent = `
        <div class="popup-content">
            <h3>Problema Reportado</h3>
            <p><strong>Status:</strong> <span class="status-pendente">${buraco.status}</span></p>
            <p><strong>Coordenadas:</strong></p>
            <p>Lat: ${buraco.lat.toFixed(6)}</p>
            <p>Lng: ${buraco.lng.toFixed(6)}</p>
        </div>
    `;
    
    // Adicionar popup ao marcador
    marker.bindPopup(popupContent);
    
    // Adicionar à lista de marcadores
    markers.push(marker);
    
    console.log('Total de marcadores no mapa:', markers.length);
}

// Função para limpar todos os marcadores
function limparMarcadores() {
    markers.forEach(marker => {
        map.removeLayer(marker);
    });
    markers = [];
}

// Função para recarregar os dados (útil para debugging)
async function recarregarDados() {
    limparMarcadores();
    await carregarBuracos();
}

// Expor funções globalmente para debugging
window.appFunctions = {
    recarregarDados,
    limparMarcadores,
    carregarBuracos
};

// Função para configurar a sidebar
function configurarSidebar() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const closeBtn = document.getElementById('closeSidebar');
    const refreshBtn = document.getElementById('btnRefresh');
    const sidebar = document.getElementById('sidebar');
    
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
    });
    
    closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });
    
    // Configurar botão de atualização
    refreshBtn.addEventListener('click', async () => {
        if (refreshBtn.classList.contains('loading')) return;
        
        refreshBtn.classList.add('loading');
        refreshBtn.innerHTML = '🔄 Atualizando';
        
        try {
            await carregarBuracos();
            refreshBtn.innerHTML = '✅ Atualizado!';
            
            setTimeout(() => {
                refreshBtn.classList.remove('loading');
                refreshBtn.innerHTML = '🔄 Atualizar';
            }, 1500);
            
        } catch (error) {
            console.error('Erro ao atualizar:', error);
            refreshBtn.innerHTML = '❌ Erro ao atualizar';
            
            setTimeout(() => {
                refreshBtn.classList.remove('loading');
                refreshBtn.innerHTML = '🔄 Atualizar';
            }, 2000);
        }
    });
    
    // Fechar sidebar ao clicar fora dela
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}

// Função para atualizar a sidebar com os buracos reportados
function atualizarSidebar() {
    const reportsList = document.getElementById('reportsList');
    const totalReports = document.getElementById('totalReports');
    const pendingReports = document.getElementById('pendingReports');
    
    // Atualizar estatísticas
    totalReports.textContent = buracosReportados.length;
    pendingReports.textContent = buracosReportados.filter(b => b.status === 'Pendente').length;
    
    // Limpar lista atual
    reportsList.innerHTML = '';
    
    if (buracosReportados.length === 0) {
        reportsList.innerHTML = `
            <div class="empty-state">
                <p>Nenhum reporte encontrado</p>
            </div>
        `;
        return;
    }
    
    // Adicionar cada buraco à lista
    buracosReportados.forEach((buraco, index) => {
        const reportItem = document.createElement('div');
        reportItem.className = 'report-item';
        
        // Verificar se o usuário é o dono do reporte
        const isOwner = !buraco.user_id || buraco.user_id === userId;
        
        reportItem.innerHTML = `
            <div class="report-item-header">
                <span>Reporte #${buraco.id || index + 1}</span>
                <span class="report-status">${buraco.status}</span>
            </div>
            <div class="report-coords">
                📍 ${buraco.lat.toFixed(6)}, ${buraco.lng.toFixed(6)}
            </div>
            <div class="report-actions">
                <button class="btn-small btn-view" onclick="verBuracoNoMapa(${buraco.lat}, ${buraco.lng})">
                    Ver no mapa
                </button>
                ${isOwner ? `
                    <button class="btn-small btn-delete" onclick="removerBuraco(${buraco.id || index})">
                        Remover
                    </button>
                ` : ''}
            </div>
        `;
        
        reportsList.appendChild(reportItem);
    });
}

// Função para ver buraco no mapa
function verBuracoNoMapa(lat, lng) {
    map.setView([lat, lng], 16);
    
    // Encontrar e abrir popup do marcador
    markers.forEach(marker => {
        const pos = marker.getLatLng();
        if (Math.abs(pos.lat - lat) < 0.000001 && Math.abs(pos.lng - lng) < 0.000001) {
            marker.openPopup();
        }
    });
    
    // Fechar sidebar no mobile
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
    }
}

// Função para remover buraco
async function removerBuraco(id) {
    // Encontrar o buraco para verificar se pertence ao usuário
    const buraco = buracosReportados.find(b => b.id === id);
    
    if (!buraco) {
        alert('Reporte não encontrado.');
        return;
    }
    
    // Verificar se o usuário é o dono do reporte
    if (buraco.user_id && buraco.user_id !== userId) {
        alert('Você só pode remover os reportes que você mesmo criou.');
        return;
    }
    
    if (!confirm('Tem certeza que deseja remover este reporte?')) {
        return;
    }
    
    try {
        let error;
        
        if (id) {
            // Remover do Supabase se tiver ID
            const { error: deleteError } = await window.supabaseClient
                .from(window.CONFIG.TABELA_BURACOS)
                .delete()
                .eq('id', id);
            error = deleteError;
        }
        
        if (error) {
            console.error('Erro ao remover buraco:', error);
            alert('Erro ao remover reporte. Tente novamente.');
            return;
        }
        
        // Recarregar dados
        await carregarBuracos();
        
        alert('Reporte removido com sucesso!');
        
    } catch (error) {
        console.error('Erro ao remover buraco:', error);
        alert('Erro ao remover reporte. Tente novamente.');
    }
}
