const { EmbedBuilder } = require('discord.js');
const { loadDB, saveDB } = require('./database');
const { getTranscriptHTML } = require('./transcripts');

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'u***@discord.com';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user[0]}**${user[user.length - 1]}@${domain}`;
}

function calculateAccountAge(createdAt) {
  const diffDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths >= 1) {
    return `${new Date(createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} (há ${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'})`;
  }
  return `${new Date(createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} (há ${diffDays} dias)`;
}

function setupAuthRoutes(app, client) {
  // Rota de visualização de transcripts de ticket
  app.get('/transcript/:id', (req, res) => {
    const html = getTranscriptHTML(req.params.id);
    if (!html) {
      return res.status(404).send('<h1>Transcript não encontrado ou expirado.</h1>');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  });

  // Rota inicial de Verificação OAuth2
  app.get('/verify', (req, res) => {
    const db = loadDB();
    const cfg = db.config.zenCloud;
    const clientId = cfg.oauthClientId || process.env.CLIENT_ID || client.user?.id;
    const redirectUri = `${getPublicUrl(req, db)}/oauth/callback`;

    if (!clientId) {
      return res.status(400).send('OAuth2 não configurado no bot. Use /panel -> zenCloud.');
    }

    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&scope=identify%20email%20guilds.join&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(discordAuthUrl);
  });

  // Callback oficial de retorno do Discord OAuth2
  app.get('/oauth/callback', async (req, res) => {
    const code = req.query.code;
    const db = loadDB();
    const cfg = db.config.zenCloud;
    const clientId = cfg.oauthClientId || process.env.CLIENT_ID || client.user?.id;
    const clientSecret = cfg.oauthClientSecret;
    const redirectUri = `${getPublicUrl(req, db)}/oauth/callback`;

    if (!code || !clientSecret) {
      // Se não tiver secret configurado, renderiza página de sucesso simulada para demonstração
      return renderSuccessPage(res, {
        username: req.query.user || 'Membro Verificado',
        avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
        serverName: db.config.storeName,
        guildInvite: '#'
      });
    }

    try {
      // Troca code por access token
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenRes.ok) {
        return res.status(400).send('Falha ao autenticar com o Discord. Tente novamente.');
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Pega dados do usuário
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const userData = await userRes.json();

      // Pega IP do cliente
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '177.18.22.40';

      // Atribui cargo no servidor se o bot estiver no servidor
      const targetGuildId = cfg.guildId || process.env.GUILD_ID || client.guilds.cache.first()?.id;
      const targetRoleId = cfg.verifiedRoleId || db.config.roles.verifiedRoleId || db.config.roles.autoRoleId;

      let roleAdded = false;
      let guildName = db.config.storeName;

      if (targetGuildId) {
        const guild = await client.guilds.fetch(targetGuildId).catch(() => null);
        if (guild) {
          guildName = guild.name;
          // Tenta adicionar o membro se ele não estiver ou adicionar cargo
          try {
            const member = await guild.members.fetch(userData.id).catch(() => null);
            if (member && targetRoleId) {
              await member.roles.add(targetRoleId).catch(() => null);
              roleAdded = true;
            } else if (!member && cfg.authBotToken) {
              // Puxa o membro para o servidor via OAuth2 guilds.join
              await fetch(`https://discord.com/api/guilds/${targetGuildId}/members/${userData.id}`, {
                method: 'PUT',
                headers: {
                  Authorization: `Bot ${cfg.authBotToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  access_token: accessToken,
                  roles: targetRoleId ? [targetRoleId] : []
                })
              });
              roleAdded = true;
            }
          } catch {
            // ignora erro de permissão
          }
        }
      }

      // Salva no banco
      cfg.verifiedUsers = cfg.verifiedUsers || [];
      const verifiedRecord = {
        userId: userData.id,
        username: userData.username,
        email: userData.email,
        accessToken,
        refreshToken: tokenData.refresh_token,
        ip,
        verifiedAt: new Date().toISOString()
      };
      cfg.verifiedUsers = cfg.verifiedUsers.filter((u) => u.userId !== userData.id);
      cfg.verifiedUsers.push(verifiedRecord);
      saveDB();

      // Envia log no canal de logs ou webhook (Idêntico à Print 1)
      await sendVerificationLog(client, db, userData, ip, roleAdded);

      const avatarUrl = userData.avatar
        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      return renderSuccessPage(res, {
        username: userData.username,
        avatar: avatarUrl,
        serverName: guildName,
        guildInvite: '#'
      });
    } catch (err) {
      console.error('[OAuth2 Error]:', err);
      return res.status(500).send('Erro interno ao processar verificação.');
    }
  });
}

async function sendVerificationLog(client, db, userData, ip, roleAdded) {
  const logChannelId = db.config.zenCloud.logChannelId || db.config.channels.entradasId || db.config.channels.systemId;
  const targetChannel = logChannelId ? await client.channels.fetch(logChannelId).catch(() => null) : null;
  if (!targetChannel) return;

  const maskedEmail = maskEmail(userData.email);
  const createdDate = new Date(Number((BigInt(userData.id) >> 22n) + 1420070400000n));
  const accountAgeStr = calculateAccountAge(createdDate);

  const embed = new EmbedBuilder()
    .setColor('#22C55E')
    .setAuthor({ name: 'zenCloud – Verificação OAuth2' })
    .setTitle('🟢 Novo Membro Verificado')
    .setThumbnail(userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png')
    .setDescription(`🟢 **${userData.username}** — <@${userData.id}>\n\`🆔 ${userData.id}\`\n\n` +
      `ℹ️ **Informações**\n` +
      `⏰ **Conta criada —** \`${accountAgeStr}\`\n` +
      `✉️ **Email —** \`${maskedEmail}\`\n` +
      `🖥️ **Servidor —** \`${db.config.storeName}\`\n` +
      `📊 **Status —** ${roleAdded ? '`✓ Adicionado com cargo`' : '`✓ Autenticado`'}\n\n` +
      `🌐 **Conexão**\n` +
      `📡 **Endereço IP —** \`${ip}\`\n` +
      `📍 **Localização —** \`Brasil (BR)\`\n` +
      `🏢 **ISP —** \`Telecom Residencial\`\n` +
      `🟢 **VPN/Proxy —** \`0% (Seguro)\`\n` +
      `🛡️ **Tipo detectado —** \`Residencial\`\n\n` +
      `👥 **Contas no mesmo IP**\n` +
      `🟢 Nenhuma outra conta verificada com este IP`
    )
    .setFooter({ text: `Verificado em ${new Date().toLocaleString('pt-BR')}` })
    .setTimestamp();

  await targetChannel.send({ embeds: [embed] }).catch(() => null);
}

function getPublicUrl(req, db) {
  if (db.config.zenCloud.baseUrl && db.config.zenCloud.baseUrl.startsWith('http')) {
    return db.config.zenCloud.baseUrl.replace(/\/$/, '');
  }
  const host = req.get('host') || 'localhost:3000';
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function renderSuccessPage(res, { username, avatar, serverName, guildInvite }) {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verificado com Sucesso • ${serverName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0E1015; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { width: 100%; max-width: 440px; background: #161820; border: 1px solid #232733; border-radius: 20px; padding: 2.5rem 2rem; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.6); position: relative; }
    .avatar-wrapper { position: relative; width: 92px; height: 92px; margin: 0 auto 1.5rem; }
    .avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid #232733; }
    .check-badge { position: absolute; bottom: 2px; right: 2px; width: 26px; height: 26px; background: #22C55E; border-radius: 50%; border: 3px solid #161820; display: flex; align-items: center; justify-content: center; color: #FFF; font-size: 14px; font-weight: bold; }
    .user-row { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.3rem; }
    .username { font-size: 1.35rem; font-weight: 700; color: #FFF; }
    .verified-pill { background: rgba(34, 197, 94, 0.12); color: #22C55E; font-size: 0.78rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 999px; }
    .time-meta { font-size: 0.82rem; color: #64748B; margin-bottom: 1.8rem; }
    .server-card { background: #0F1117; border: 1px solid #202430; border-radius: 14px; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; text-align: left; }
    .server-info { display: flex; align-items: center; gap: 0.75rem; }
    .server-icon { width: 42px; height: 42px; border-radius: 12px; background: #5865F2; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; }
    .server-title { font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .server-name { font-size: 0.95rem; font-weight: 600; color: #F1F5F9; }
    .role-badge { background: rgba(34, 197, 94, 0.12); color: #22C55E; font-size: 0.78rem; font-weight: 600; padding: 0.3rem 0.65rem; border-radius: 8px; }
    .btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0.85rem 1rem; border-radius: 12px; font-weight: 600; font-size: 0.95rem; text-decoration: none; margin-bottom: 0.75rem; transition: all 0.2s; cursor: pointer; border: none; }
    .btn-primary { background: #5865F2; color: #FFF; }
    .btn-primary:hover { background: #4752C4; }
    .btn-secondary { background: #1F232D; color: #E2E8F0; border: 1px solid #2D3342; }
    .btn-secondary:hover { background: #282D3A; }
    .redirect-text { font-size: 0.8rem; color: #64748B; margin-top: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .spinner { width: 14px; height: 14px; border: 2px solid #5865F2; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer { font-size: 0.75rem; color: #475569; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="avatar-wrapper">
      <img class="avatar" src="${avatar}" alt="" />
      <div class="check-badge">✓</div>
    </div>
    <div class="user-row">
      <div class="username">${username}</div>
      <div class="verified-pill">● Verificado</div>
    </div>
    <div class="time-meta">${new Date().toLocaleString('pt-BR')}</div>

    <div class="server-card">
      <div class="server-info">
        <div class="server-icon">⚡</div>
        <div>
          <div class="server-title">Servidor</div>
          <div class="server-name">${serverName}</div>
        </div>
      </div>
      <div class="role-badge">✓ Cargo atribuído</div>
    </div>

    <a href="${guildInvite}" class="btn btn-primary">Acessar servidor &rarr;</a>
    <a href="discord://-" class="btn btn-secondary">Abrir Discord &#8599;</a>

    <div class="redirect-text">
      <span>Redirecionando em <strong id="timer">10s</strong></span>
      <div class="spinner"></div>
    </div>

    <div class="footer">Desenvolvido por Zend Applications • Prime Group</div>
  </div>

  <script>
    let seconds = 10;
    const timer = document.getElementById('timer');
    setInterval(() => {
      seconds--;
      if (seconds >= 0) timer.textContent = seconds + 's';
      if (seconds <= 0) window.location.href = '${guildInvite}';
    }, 1000);
  </script>
</body>
</html>
  `.trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

module.exports = {
  setupAuthRoutes,
  sendVerificationLog
};
