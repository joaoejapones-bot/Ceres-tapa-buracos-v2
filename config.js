// Configurações do aplicativo
const CONFIG = {
    // Coordenadas de Ceres, GO
    CERES_CENTER: {
        lat: -15.308,
        lng: -49.598
    },
    
    // Zoom padrão do mapa
    DEFAULT_ZOOM: 14,
    
    // Modo de teste para fallback de GPS
    MODO_TESTE: true,
    
    // Tabela do Supabase
    TABELA_BURACOS: 'buracos',
    
    // Distância mínima em metros para considerar duplicata
    DISTANCIA_MINIMA_DUPLICATA: 10
};

// Gerar ID único para o usuário (persiste no localStorage)
function gerarIdUsuario() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }
    return userId;
}

// Exportar para uso global imediatamente
window.CONFIG = CONFIG;
window.gerarIdUsuario = gerarIdUsuario;

// Configuração do Supabase
const SUPABASE_URL = 'https://gvcwwymijloemiktshxh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nNYhyacmM__0rZkbYzNvdA_x03YOuC2';

// Criar instância global do Supabase
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
