const { loadDB, formatBRL } = require('./database');

function setupDashboardRoutes(app, client) {
  // API JSON para dados em tempo real
  app.get('/api/stats', (req, res) => {
    const db = loadDB();
    const mem = process.memoryUsage();
    const totalRevenue = (db.sales || []).reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const activeCartsCount = Object.values(db.carts || {}).filter((c) => c.status === 'open' || c.status === 'pending_payment').length;
    const activeTicketsCount = Object.keys(db.tickets?.active || {}).length;
    const verifiedMembersCount = (db.config.zenCloud?.verifiedUsers || []).length;

    let totalMembers = 0;
    client.guilds.cache.forEach((g) => (totalMembers += g.memberCount || 0));

    res.json({
      online: client.isReady(),
      uptimeSeconds: Math.floor(process.uptime()),
      ping: client.ws.ping >= 0 ? client.ws.ping : 18,
      ramMB: Math.round(mem.rss / 1024 / 1024),
      guildsCount: client.guilds.cache.size,
      totalMembers,
      storeName: db.config.storeName || 'Prime Group',
      brandName: db.config.brandName || 'Prime Store',
      totalRevenue: formatBRL(totalRevenue),
      totalRevenueRaw: totalRevenue,
      salesCount: (db.sales || []).length,
      productsCount: Object.keys(db.products || {}).length,
      activeCartsCount,
      activeTicketsCount,
      verifiedMembersCount,
      recentSales: (db.sales || []).slice(-8).reverse(),
      products: Object.values(db.products || {}).map((p) => ({
        id: p.id,
        name: p.name,
        fieldsCount: (p.fields || []).length,
        totalStock: (p.fields || []).reduce((acc, f) => acc + (Array.isArray(f.stock) ? f.stock.length : 0), 0)
      }))
    });
  });

  // Página do Web Dashboard Moderno e Tecnológico
  const renderDashboard = (req, res) => {
    const db = loadDB();
    const totalRevenue = (db.sales || []).reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const recentSales = (db.sales || []).slice(-6).reverse();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard • ${db.config.storeName}</title>
  <style>
    :root {
      --bg: #07090E;
      --card: #0D111A;
      --card-hover: #121824;
      --border: rgba(255, 255, 255, 0.07);
      --accent: #7C3AED;
      --accent-glow: rgba(124, 58, 237, 0.35);
      --cyan: #00F0FF;
      --cyan-glow: rgba(0, 240, 255, 0.25);
      --green: #10B981;
      --text: #F8FAFC;
      --text-muted: #8E9BAE;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; overflow-x: hidden; background-image: radial-gradient(circle at 10% 20%, rgba(124, 58, 237, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 240, 255, 0.06) 0%, transparent 40%); }
    
    /* Topbar */
    .topbar { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 2.5rem; border-bottom: 1px solid var(--border); background: rgba(13, 17, 26, 0.7); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 50; }
    .brand { display: flex; align-items: center; gap: 0.85rem; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.5px; }
    .brand-icon { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--accent), var(--cyan)); display: flex; align-items: center; justify-content: center; font-weight: 900; color: #FFF; box-shadow: 0 0 20px var(--accent-glow); }
    .brand-sub { font-size: 0.75rem; color: var(--cyan); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
    .status-pill { display: flex; align-items: center; gap: 0.6rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 0.45rem 1rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--green); }
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } 100% { opacity: 1; transform: scale(1); } }
    
    /* Layout */
    .container { max-width: 1300px; margin: 0 auto; padding: 2.5rem 2rem; }
    .section-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; color: var(--text-muted); font-weight: 700; margin-bottom: 1.2rem; display: flex; align-items: center; gap: 0.5rem; }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    
    /* Metrics Grid */
    .grid-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }
    .metric-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; position: relative; overflow: hidden; transition: transform 0.2s, border-color 0.2s; }
    .metric-card:hover { transform: translateY(-3px); border-color: rgba(255, 255, 255, 0.15); }
    .metric-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 3px; background: linear-gradient(90deg, var(--accent), transparent); opacity: 0.8; }
    .metric-card.cyan::before { background: linear-gradient(90deg, var(--cyan), transparent); }
    .metric-card.green::before { background: linear-gradient(90deg, var(--green), transparent); }
    .metric-label { font-size: 0.82rem; color: var(--text-muted); font-weight: 500; margin-bottom: 0.4rem; }
    .metric-value { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.5px; color: #FFF; }
    .metric-sub { font-size: 0.75rem; color: var(--cyan); margin-top: 0.4rem; font-weight: 500; }
    
    /* Panels Split */
    .grid-split { display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; margin-bottom: 2.5rem; }
    @media (max-width: 900px) { .grid-split { grid-template-columns: 1fr; } }
    
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 1.75rem; }
    .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .panel-title { font-size: 1.05rem; font-weight: 700; color: #FFF; }
    
    /* Table */
    .table-responsive { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
    td { padding: 0.9rem 1rem; font-size: 0.88rem; border-bottom: 1px solid rgba(255, 255, 255, 0.03); color: #CBD5E1; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .badge-paid { background: rgba(16, 185, 129, 0.15); color: var(--green); padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
    
    /* Live Console / Quick Actions */
    .action-btn { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.95rem 1.1rem; border-radius: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); color: #FFF; text-decoration: none; font-size: 0.88rem; font-weight: 600; margin-bottom: 0.75rem; transition: all 0.2s; cursor: pointer; }
    .action-btn:hover { background: rgba(124, 58, 237, 0.15); border-color: var(--accent); transform: translateX(3px); }
    
    .terminal-box { background: #07090E; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 1rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #94A3B8; max-height: 220px; overflow-y: auto; line-height: 1.6; }
    .terminal-line { display: flex; gap: 0.5rem; }
    .terminal-line .t-time { color: #64748B; }
    .terminal-line .t-tag { color: var(--cyan); }
    
    /* Footer */
    .footer { text-align: center; padding: 2rem 0; font-size: 0.8rem; color: var(--text-muted); border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <!-- Topbar -->
  <div class="topbar">
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div id="store-title">${db.config.storeName}</div>
        <div class="brand-sub">CONTROL CENTER</div>
      </div>
    </div>
    <div class="status-pill">
      <div class="pulse-dot"></div>
      <span id="live-status">ONLINE 24/7</span>
    </div>
  </div>

  <div class="container">
    <!-- Métricas -->
    <div class="section-title">Métricas Operacionais</div>
    <div class="grid-metrics">
      <div class="metric-card">
        <div class="metric-label">Faturamento Total</div>
        <div class="metric-value" id="val-revenue">${formatBRL(totalRevenue)}</div>
        <div class="metric-sub" id="val-sales">${(db.sales || []).length} pedidos concluídos</div>
      </div>
      <div class="metric-card cyan">
        <div class="metric-label">Produtos Cadastrados</div>
        <div class="metric-value" id="val-products">${Object.keys(db.products || {}).length}</div>
        <div class="metric-sub">Prontos para venda no Discord</div>
      </div>
      <div class="metric-card green">
        <div class="metric-label">Latência / Ping</div>
        <div class="metric-value" id="val-ping">${client.ws.ping >= 0 ? client.ws.ping : 18} ms</div>
        <div class="metric-sub" id="val-uptime">Uptime 100%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Carrinhos Abertos</div>
        <div class="metric-value" id="val-carts">${Object.values(db.carts || {}).filter((c) => c.status === 'open' || c.status === 'pending_payment').length}</div>
        <div class="metric-sub" id="val-tickets">${Object.keys(db.tickets?.active || {}).length} tickets ativos</div>
      </div>
    </div>

    <!-- Divisão Central -->
    <div class="grid-split">
      <!-- Painel Esquerdo: Vendas Recentes -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Pedidos & Vendas Recentes</div>
          <span style="font-size:0.75rem; color:var(--cyan); font-weight:600;">TEMPO REAL</span>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="sales-tbody">
              ${
                recentSales.length > 0
                  ? recentSales.map((s) => `
                    <tr>
                      <td><code>${s.id}</code></td>
                      <td><span style="color:#FFF; font-weight:500;">&lt;@${s.userId}&gt;</span></td>
                      <td>${s.productName} (${s.fieldName})</td>
                      <td><strong style="color:#FFF;">${formatBRL(s.amount)}</strong></td>
                      <td><span class="badge-paid">Entregue</span></td>
                    </tr>
                  `).join('')
                  : '<tr><td colspan="5" style="text-align:center; color:#64748B; padding:2rem;">Nenhuma venda registrada ainda.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Painel Direito: Ações & Monitoramento -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Ações do Sistema</div>
        </div>
        <a class="action-btn" href="/verify" target="_blank">
          <span>Verificação OAuth2 zenCloud</span>
          <span>↗</span>
        </a>
        <a class="action-btn" href="/health" target="_blank">
          <span>Verificar Rota Keep-Alive (/health)</span>
          <span>●</span>
        </a>
        <div class="action-btn" onclick="navigator.clipboard.writeText(window.location.origin + '/verify'); alert('Link de Verificação copiado!');">
          <span>Copiar Link de Verificação</span>
          <span>📋</span>
        </div>

        <div style="margin-top:1.5rem; margin-bottom:0.6rem; font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Console do Bot</div>
        <div class="terminal-box" id="term-logs">
          <div class="terminal-line"><span class="t-time">[SYSTEM]</span> <span class="t-tag">PRIME GROUP</span> Servidor Express & Bot Discord online</div>
          <div class="terminal-line"><span class="t-time">[SYSTEM]</span> Monitorando canais, chamadas de voz e vendas</div>
          <div class="terminal-line"><span class="t-time">[AUTO]</span> Sincronizador de estoque e logs ativos</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    ${db.config.storeName} • Sistema Tecnológico de Vendas & Gestão 24/7
  </div>

  <script>
    async function updateStats() {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('val-revenue').textContent = data.totalRevenue;
        document.getElementById('val-sales').textContent = data.salesCount + ' pedidos concluídos';
        document.getElementById('val-products').textContent = data.productsCount;
        document.getElementById('val-ping').textContent = data.ping + ' ms';
        document.getElementById('val-uptime').textContent = 'Uptime: ' + Math.floor(data.uptimeSeconds / 60) + ' min';
        document.getElementById('val-carts').textContent = data.activeCartsCount;
        document.getElementById('val-tickets').textContent = data.activeTicketsCount + ' tickets ativos';

        if (data.recentSales && data.recentSales.length > 0) {
          const tbody = document.getElementById('sales-tbody');
          tbody.innerHTML = data.recentSales.map(s => \`
            <tr>
              <td><code>\${s.id}</code></td>
              <td><span style="color:#FFF; font-weight:500;">&lt;@\${s.userId}&gt;</span></td>
              <td>\${s.productName} (\${s.fieldName})</td>
              <td><strong style="color:#FFF;">R$ \${Number(s.amount).toFixed(2)}</strong></td>
              <td><span class="badge-paid">Entregue</span></td>
            </tr>
          \`).join('');
        }
      } catch (e) {
        console.error(e);
      }
    }
    setInterval(updateStats, 5000);
  </script>
</body>
</html>
    `.trim());
  };

  app.get('/', renderDashboard);
  app.get('/dashboard', renderDashboard);
}

module.exports = {
  setupDashboardRoutes
};
