require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder,
  ActivityType,
  PermissionFlagsBits
} = require('discord.js');

const { loadDB, saveDB, getUser } = require('./utils/database');
const { commandsList, handleSlashCommand } = require('./commands/slashCommands');
const { handlePanelInteraction } = require('./handlers/panelHandler');
const { handleStoreInteraction } = require('./handlers/storeHandler');
const { handleTicketInteraction } = require('./handlers/ticketHandler');

// ============================================================================
// 1. SERVIDOR WEB 24/7 (KEEP-ALIVE PARA RENDER + UPTIMEROBOT)
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const db = loadDB();
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${db.config.storeName} • Bot 24/7</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2rem 3rem; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; border: 1px solid #334155; }
          .badge { display: inline-block; background: #22c55e; color: #052e16; font-weight: 700; padding: 0.35rem 0.9rem; border-radius: 999px; font-size: 0.85rem; margin-bottom: 1rem; }
          h1 { margin: 0.2rem 0 0.5rem; font-size: 1.6rem; }
          p { color: #94a3b8; margin: 0.3rem 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● ONLINE 24/7</div>
          <h1>${db.config.storeName} (${db.config.brandName})</h1>
          <p>Produtos cadastrados: <strong>${Object.keys(db.products || {}).length}</strong></p>
          <p>Vendas realizadas: <strong>${(db.sales || []).length}</strong></p>
          <p>Uptime: <strong>${Math.floor(process.uptime() / 60)} minutos</strong></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    botReady: client.isReady(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🌐 [Keep-Alive 24/7] Servidor HTTP ativo na porta ${PORT}`);
});

// ============================================================================
// 2. INICIALIZAÇÃO DO CLIENTE DISCORD
// ============================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// Cache de convites por servidor para rastrear quem convidou quem
const invitesCache = new Map();

async function refreshGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const codeMap = new Map();
    invites.forEach((inv) => codeMap.set(inv.code, inv.uses || 0));
    invitesCache.set(guild.id, codeMap);
  } catch {
    // Sem permissão de gerenciar servidor para ler convites
  }
}

async function registerSlashCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID || client.user?.id;
  if (!token || !clientId) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const body = commandsList.map((c) => c.toJSON());

  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body });
      console.log(`✅ [Slash] ${body.length} comandos registrados instantaneamente no servidor (${process.env.GUILD_ID})!`);
    }
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`✅ [Slash] ${body.length} comandos globais sincronizados com sucesso!`);
  } catch (err) {
    console.error('❌ [Slash] Erro ao registrar comandos:', err.message);
  }
}

client.once('ready', async () => {
  const db = loadDB();
  console.log(`🤖 Bot conectado com sucesso como ${client.user.tag}!`);

  client.user.setPresence({
    activities: [{ name: `${db.config.storeName} • /panel`, type: ActivityType.Playing }],
    status: 'online'
  });

  await registerSlashCommands();

  for (const [, guild] of client.guilds.cache) {
    await refreshGuildInvites(guild);
  }
});

client.on('inviteCreate', async (invite) => {
  if (invite.guild) await refreshGuildInvites(invite.guild);
});

client.on('inviteDelete', async (invite) => {
  if (invite.guild) await refreshGuildInvites(invite.guild);
});

// ============================================================================
// 3. ENTRADA DE NOVOS MEMBROS (BOAS-VINDAS + CONVITES + AUTO-ROLE + ZENPROTECT)
// ============================================================================
client.on('guildMemberAdd', async (member) => {
  const db = loadDB();

  // zenProtect: Modo Anti-Raid
  if (db.config.zenProtect?.raidMode) {
    await member.send('🚨 O servidor está temporariamente com o Modo Anti-Raid ativado. Tente entrar novamente mais tarde.').catch(() => null);
    await member.kick('zenProtect: Modo Anti-Raid ativo').catch(() => null);
    return;
  }

  // Cargo Automático ao Entrar
  if (db.config.roles?.autoRoleId) {
    await member.roles.add(db.config.roles.autoRoleId).catch(() => null);
  }

  // Rastreamento de Convites
  try {
    const cached = invitesCache.get(member.guild.id) || new Map();
    const currentInvites = await member.guild.invites.fetch();
    let usedInvite = null;

    for (const [, inv] of currentInvites) {
      const prevUses = cached.get(inv.code) || 0;
      if ((inv.uses || 0) > prevUses) {
        usedInvite = inv;
        break;
      }
    }
    await refreshGuildInvites(member.guild);

    if (usedInvite && usedInvite.inviter) {
      const inviterProfile = getUser(usedInvite.inviter.id);
      inviterProfile.invites.regular = (inviterProfile.invites.regular || 0) + 1;
      inviterProfile.invites.invitedUsers.push(member.id);
      saveDB();
    }
  } catch {
    // ignora
  }

  // Mensagem de Boas-Vindas
  if (db.config.welcome?.enabled && db.config.channels?.boasVindasId) {
    const ch = await member.guild.channels.fetch(db.config.channels.boasVindasId).catch(() => null);
    if (ch) {
      const text = (db.config.welcome.message || 'Bem-vindo(a) {user} ao **{server}**!')
        .replace(/\{user\}/gi, `<@${member.id}>`)
        .replace(/\{server\}/gi, member.guild.name);

      const embed = new EmbedBuilder()
        .setColor(db.config.color || '#5865F2')
        .setTitle(db.config.welcome.title || `👋 Bem-vindo(a) à ${db.config.storeName}!`)
        .setDescription(text)
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: `Membro #${member.guild.memberCount} • ${db.config.storeName}` })
        .setTimestamp();

      await ch.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => null);
    }
  }
});

// ============================================================================
// 4. ZENPROTECT: ANTI-CONVITES / ANTI-DIVULGAÇÃO
// ============================================================================
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const db = loadDB();

  if (db.config.zenProtect?.antiInvite) {
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!isAdmin && /(discord\.gg\/|discord\.com\/invite\/)/i.test(message.content)) {
      await message.delete().catch(() => null);
      const warn = await message.channel.send({
        content: `🛡️ <@${message.author.id}>, o envio de links de convite não é permitido neste servidor (**zenProtect**)!`
      }).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 6000);
    }
  }
});

// ============================================================================
// 5. ROTEADOR CENTRAL DE INTERAÇÕES (SLASH, BOTÕES, SELECT MENUS, MODALS)
// ============================================================================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, client);
      return;
    }

    // 1. Tenta processar no Painel de Controle (/panel)
    const handledByPanel = await handlePanelInteraction(interaction, client);
    if (handledByPanel !== false) return;

    // 2. Tenta processar na Loja / Carrinho / Saldo
    const handledByStore = await handleStoreInteraction(interaction, client);
    if (handledByStore !== false) return;

    // 3. Tenta processar no Sistema de Tickets
    const handledByTicket = await handleTicketInteraction(interaction, client);
    if (handledByTicket !== false) return;
  } catch (err) {
    console.error('❌ [Interaction Error]:', err);
    const msg = { content: `❌ Ocorreu um erro ao processar esta ação: \`${err.message}\``, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg).catch(() => null);
    } else {
      await interaction.reply(msg).catch(() => null);
    }
  }
});

// ============================================================================
// 6. LOGIN DO BOT
// ============================================================================
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'SEU_TOKEN_AQUI') {
  console.warn('⚠️ [AVISO] Configure a variável DISCORD_TOKEN no arquivo .env para conectar o bot ao Discord!');
} else {
  client.login(token).catch((err) => {
    console.error('❌ Falha ao fazer login no Discord (verifique seu DISCORD_TOKEN):', err.message);
  });
}
