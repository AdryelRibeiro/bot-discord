require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  PermissionFlagsBits
} = require('discord.js');

const { loadDB, saveDB, getUser, formatBRL } = require('./utils/database');
const { commandsList, handleSlashCommand } = require('./commands/slashCommands');
const { handlePanelInteraction } = require('./handlers/panelHandler');
const { handleStoreInteraction, buildProductSaleMessage } = require('./handlers/storeHandler');
const { handleTicketInteraction } = require('./handlers/ticketHandler');
const { syncApplicationEmojis } = require('./utils/icons');
const { setupAuthRoutes } = require('./utils/authServer');
const { setupDashboardRoutes } = require('./utils/dashboard');

// ============================================================================
// 1. SERVIDOR EXPRESS 24/7 (WEB DASHBOARD + OAUTH2 + TRANSCRIPTS + KEEP-ALIVE)
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    botReady: client.isReady(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// 2. CLIENTE DISCORD
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

// Configura o Dashboard Web Futurista e o Servidor OAuth2
setupDashboardRoutes(app, client);
setupAuthRoutes(app, client);

app.listen(PORT, () => {
  console.log(`🌐 [Keep-Alive 24/7 & Dashboard] Servidor ativo na porta ${PORT}`);
});

const invitesCache = new Map();
const voiceJoinTimes = new Map(); // Rastreia o tempo que cada usuário entrou na call

async function refreshGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const codeMap = new Map();
    invites.forEach((inv) => codeMap.set(inv.code, inv.uses || 0));
    invitesCache.set(guild.id, codeMap);
  } catch {
    //
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
      console.log(`[Slash] ${body.length} comandos registrados no servidor (${process.env.GUILD_ID})!`);
    }
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`[Slash] ${body.length} comandos globais sincronizados.`);
  } catch (err) {
    console.error('[Slash] Erro ao registrar comandos:', err.message);
  }
}

// ============================================================================
// 3. READY (INICIALIZAÇÃO INSTANTÂNEA & SEM BLOQUEIOS)
// ============================================================================
client.once('ready', async () => {
  const db = loadDB();
  console.log(`🤖 Bot online como ${client.user.tag}!`);

  // Aplica presença configurada
  const presence = db.config.presence || {};
  client.user.setPresence({
    activities: [{
      name: presence.activityText || `${db.config.storeName} • /panel`,
      type: Number(presence.activityType) || ActivityType.Playing
    }],
    status: presence.status || 'online'
  });

  // Salva servidor padrão se ainda não configurado
  if (!db.config.allowedGuildId && client.guilds.cache.first()) {
    db.config.allowedGuildId = process.env.GUILD_ID || client.guilds.cache.first().id;
    saveDB();
  }

  // Notificação de Bot Online no canal notifyon
  if (db.config.channels?.notifyOnId) {
    try {
      const notifyCh = await client.channels.fetch(db.config.channels.notifyOnId).catch(() => null);
      if (notifyCh) {
        const embed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🟢 Sistema Prime Group Online')
          .setDescription(
            `O bot foi iniciado e está operando em regime **24 horas**.\n\n` +
            `▪ **Latência:** \`${client.ws.ping >= 0 ? client.ws.ping : 18} ms\`\n` +
            `▪ **Servidor:** \`${client.guilds.cache.first()?.name || 'Oficial'}\`\n` +
            `▪ **Hora do Início:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
          .setFooter({ text: `${db.config.storeName} • 24/7` })
          .setTimestamp();
        await notifyCh.send({ embeds: [embed] }).catch(() => null);
      }
    } catch {
      //
    }
  }

  // Executa tarefas secundárias em segundo plano sem travar o bot
  setTimeout(() => {
    registerSlashCommands();
    for (const [, guild] of client.guilds.cache) {
      refreshGuildInvites(guild);
    }
    startAutomationsScheduler();
  }, 1000);
});

// ============================================================================
// 4. POLÍTICA DE BOT PRIVADO (PROTEÇÃO CONTRA ENTRADA EM SERVIDORES ESTRANHOS)
// ============================================================================
client.on('guildCreate', async (guild) => {
  const db = loadDB();
  if (db.config.isPrivate) {
    const allowed = db.config.allowedGuildId || process.env.GUILD_ID;
    if (allowed && guild.id !== allowed) {
      console.warn(`[Privado] Bot adicionado no servidor não autorizado: ${guild.name} (${guild.id}). Saindo...`);
      try {
        const defCh = guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
        if (defCh) {
          await defCh.send('🔒 Este bot é de uso estritamente privado do **Prime Group** e não tem permissão para operar neste servidor.').catch(() => null);
        }
      } catch {
        //
      }
      await guild.leave().catch(() => null);
    }
  }
});

// ============================================================================
// 5. LOGS DE CHAMADA DE VOZ / CALL (CANAL TRÁFEGO)
// ============================================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const db = loadDB();
  const trafegoId = db.config.channels?.trafegoId;
  if (!trafegoId) return;

  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const ch = await member.guild.channels.fetch(trafegoId).catch(() => null);
  if (!ch) return;

  const now = Date.now();

  // 1. Entrou em uma chamada
  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(member.id, now);
    const voiceChannel = newState.channel;
    const membersCount = voiceChannel?.members?.size || 1;

    const embed = new EmbedBuilder()
      .setColor('#22C55E')
      .setTitle('Membro conectou na chamada')
      .setDescription(
        `Logs › Tráfego (Voz)\n\n` +
        `» **Membro:** <@${member.id}> (\`${member.user.username}\`)\n` +
        `» **Canal:** <#${newState.channelId}> (\`${voiceChannel?.name}\`)\n` +
        `» **Membros na call agora:** \`${membersCount} membros\``
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

    return ch.send({ embeds: [embed] }).catch(() => null);
  }

  // 2. Saiu da chamada
  if (oldState.channelId && !newState.channelId) {
    const joinedAt = voiceJoinTimes.get(member.id) || now;
    voiceJoinTimes.delete(member.id);

    const diffMs = now - joinedAt;
    const mins = Math.floor(diffMs / 60_000);
    const secs = Math.floor((diffMs % 60_000) / 1000);
    const durationStr = mins > 0 ? `${mins} min e ${secs} s` : `${secs} segundos`;

    const oldChannel = oldState.channel;
    const remainingCount = oldChannel?.members?.size || 0;

    const embed = new EmbedBuilder()
      .setColor('#EF4444')
      .setTitle('Membro desconectou da chamada')
      .setDescription(
        `Logs › Tráfego (Voz)\n\n` +
        `» **Membro:** <@${member.id}> (\`${member.user.username}\`)\n` +
        `» **Canal:** <#${oldState.channelId}> (\`${oldChannel?.name}\`)\n` +
        `» **Duração da conexão:** \`${durationStr}\`\n` +
        `» **Membros restantes:** \`${remainingCount} membros\``
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

    return ch.send({ embeds: [embed] }).catch(() => null);
  }

  // 3. Trocou de canal de chamada
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const embed = new EmbedBuilder()
      .setColor('#3B82F6')
      .setTitle('Membro trocou de chamada')
      .setDescription(
        `Logs › Tráfego (Voz)\n\n` +
        `» **Membro:** <@${member.id}> (\`${member.user.username}\`)\n` +
        `» **Canal Anterior:** <#${oldState.channelId}>\n` +
        `» **Novo Canal:** <#${newState.channelId}>`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

    return ch.send({ embeds: [embed] }).catch(() => null);
  }
});

// ============================================================================
// 6. LOGS AUTOMATIZADOS (ENTRADAS, SAÍDAS, MENSAGENS)
// ============================================================================

// MEMBRO ENTROU
client.on('guildMemberAdd', async (member) => {
  const db = loadDB();

  if (db.config.zenProtect?.raidMode) {
    await member.send('🚨 O servidor está temporariamente com o Modo Anti-Raid ativado.').catch(() => null);
    await member.kick('zenProtect: Modo Anti-Raid').catch(() => null);
    return;
  }

  if (db.config.roles?.autoRoleId) {
    await member.roles.add(db.config.roles.autoRoleId).catch(() => null);
  }

  const entradasId = db.config.channels?.entradasId;
  if (entradasId) {
    const ch = await member.guild.channels.fetch(entradasId).catch(() => null);
    if (ch) {
      const createdDate = new Date(member.user.createdTimestamp);
      const diffDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
      const createdStr = `${createdDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} • \`${diffDays} dias\``;

      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle('Membro entrou')
        .setDescription(
          `Logs › Entradas\n\n` +
          `» **Membro:** <@${member.id}> (\`${member.user.username}\`)\n` +
          `» **Conta criada:** \`${createdStr}\`\n` +
          `» **Membros agora:** \`${member.guild.memberCount}\``
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

      await ch.send({ embeds: [embed] }).catch(() => null);
    }
  }
});

// MEMBRO SAIU
client.on('guildMemberRemove', async (member) => {
  const db = loadDB();
  const saidasId = db.config.channels?.saidasId;
  if (!saidasId) return;

  const ch = await member.guild.channels.fetch(saidasId).catch(() => null);
  if (!ch) return;

  const joinedAt = member.joinedTimestamp ? new Date(member.joinedTimestamp) : new Date();
  const diffMs = Date.now() - (member.joinedTimestamp || Date.now());
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);

  const rolesList = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => `<@&${r.id}>`)
    .join(' ') || '`Nenhum cargo`';

  const embed = new EmbedBuilder()
    .setColor('#EF4444')
    .setTitle('Membro saiu')
    .setDescription(
      `Logs › Saídas\n\n` +
      `» **Membro:** <@${member.id}> (\`${member.user?.username || member.id}\`)\n` +
      `» **Entrou em:** \`${joinedAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}\` • ficou \`${days} dias, ${hours} h e ${mins} min\`\n` +
      `» **Membros agora:** \`${member.guild.memberCount}\`\n` +
      `@ **Cargos:** ${rolesList}`
    )
    .setThumbnail(member.user?.displayAvatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

  await ch.send({ embeds: [embed] }).catch(() => null);
});

// MENSAGEM APAGADA
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  const db = loadDB();
  const msgChannelId = db.config.channels?.mensagensId;
  if (!msgChannelId) return;

  const ch = await message.guild.channels.fetch(msgChannelId).catch(() => null);
  if (!ch) return;

  const channelUrl = `https://discord.com/channels/${message.guild.id}/${message.channelId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Ir ao canal').setStyle(ButtonStyle.Link).setURL(channelUrl)
  );

  const embed = new EmbedBuilder()
    .setColor('#EF4444')
    .setTitle('Mensagem apagada')
    .setDescription(
      `Logs › Mensagens\n\n` +
      `• **Autor:** <@${message.author.id}> (\`${message.author.username}\`)\n` +
      `• **Canal:** <#${message.channelId}>\n\n` +
      `**Conteúdo**\n` +
      `\`\`\`\n${message.cleanContent || message.content || 'Nenhum texto / Anexo'}\n\`\`\``
    )
    .setThumbnail(message.author.displayAvatarURL())
    .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

  await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
});

// MENSAGEM EDITADA
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const db = loadDB();
  const msgChannelId = db.config.channels?.mensagensId;
  if (!msgChannelId) return;

  const ch = await newMsg.guild.channels.fetch(msgChannelId).catch(() => null);
  if (!ch) return;

  const msgUrl = `https://discord.com/channels/${newMsg.guild.id}/${newMsg.channelId}/${newMsg.id}`;
  const channelUrl = `https://discord.com/channels/${newMsg.guild.id}/${newMsg.channelId}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Ver mensagem').setStyle(ButtonStyle.Link).setURL(msgUrl),
    new ButtonBuilder().setLabel('Ir ao canal').setStyle(ButtonStyle.Link).setURL(channelUrl)
  );

  const embed = new EmbedBuilder()
    .setColor('#F59E0B')
    .setTitle('Mensagem editada')
    .setDescription(
      `Logs › Mensagens\n\n` +
      `• **Autor:** <@${newMsg.author.id}> (\`${newMsg.author.username}\`)\n` +
      `• **Canal:** <#${newMsg.channelId}>\n\n` +
      `**Antes**\n` +
      `\`\`\`\n${oldMsg.cleanContent || oldMsg.content || 'Não registrado'}\n\`\`\`\n` +
      `**Depois**\n` +
      `\`\`\`\n${newMsg.cleanContent || newMsg.content || 'Vazio'}\n\`\`\``
    )
    .setThumbnail(newMsg.author.displayAvatarURL())
    .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

  await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
});

// ============================================================================
// 7. ZENPROTECT (ANTI-CONVITES)
// ============================================================================
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const db = loadDB();

  if (db.config.zenProtect?.antiInvite) {
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!isAdmin && /(discord\.gg\/|discord\.com\/invite\/)/i.test(message.content)) {
      await message.delete().catch(() => null);
      const warn = await message.channel.send(`🛡️ <@${message.author.id}>, o envio de convites não é permitido neste servidor.`).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 5000);
    }
  }
});

// ============================================================================
// 8. AGENDADOR DE AUTOMAÇÕES
// ============================================================================
function startAutomationsScheduler() {
  setInterval(async () => {
    const db = loadDB();
    const now = Date.now();

    // 1. Limpeza de carrinhos inativos
    const maxAgeMs = (db.config.automations.autoCancelCartMinutes || 58) * 60_000;
    for (const [cartId, cart] of Object.entries(db.carts)) {
      if (cart.status === 'open' && (now - cart.createdAt) > maxAgeMs) {
        cart.status = 'cancelled';
        const ch = await client.channels.fetch(cart.channelId).catch(() => null);
        if (ch) {
          await ch.send('🔒 Carrinho cancelado automaticamente por inatividade. Fechando canal...').catch(() => null);
          setTimeout(() => ch.delete('Carrinho inativo').catch(() => null), 4000);
        }
        delete db.carts[cartId];
        saveDB();
      }
    }

    // 2. Repostagem automática de produtos
    const repost = db.config.automations?.productRepost;
    if (repost?.enabled) {
      const intervalMs = (repost.intervalMinutes || 180) * 60_000;
      if (now - (repost.lastRepostAt || 0) >= intervalMs) {
        repost.lastRepostAt = now;
        saveDB();

        for (const product of Object.values(db.products)) {
          if (!Array.isArray(product.publishedMessages) || product.publishedMessages.length === 0) continue;
          const currentRef = product.publishedMessages[0];
          try {
            const ch = await client.channels.fetch(currentRef.channelId).catch(() => null);
            if (!ch) continue;
            const oldMsg = await ch.messages.fetch(currentRef.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);

            const payload = buildProductSaleMessage(product, db);
            const newMsg = await ch.send(payload);
            product.publishedMessages = [{ channelId: newMsg.channelId, messageId: newMsg.id }];
            saveDB();
          } catch {
            //
          }
        }
      }
    }
  }, 60_000);
}

// ============================================================================
// 9. ROTEADOR DE INTERAÇÕES COM RESPOSTA ULTRA-RÁPIDA
// ============================================================================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, client);
      return;
    }

    const handledByPanel = await handlePanelInteraction(interaction, client);
    if (handledByPanel !== false) return;

    const handledByStore = await handleStoreInteraction(interaction, client);
    if (handledByStore !== false) return;

    const handledByTicket = await handleTicketInteraction(interaction, client);
    if (handledByTicket !== false) return;

    // Resposta de segurança absoluta para NUNCA estourar timeout de 3 segundos no Discord
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '⚠️ Este menu ou botão expirou ou pertence a uma versão anterior do bot. Digite `/panel` para abrir um painel novo e atualizado!',
        ephemeral: true
      }).catch(() => null);
    }
  } catch (err) {
    console.error('[Interaction Error]:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `Ocorreu um erro ao processar esta ação: \`${err.message}\``, ephemeral: true }).catch(() => null);
    } else {
      await interaction.followUp({ content: `Ocorreu um erro: \`${err.message}\``, ephemeral: true }).catch(() => null);
    }
  }
});

// ============================================================================
// 10. LOGIN
// ============================================================================
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'SEU_TOKEN_AQUI') {
  console.warn('[AVISO] Configure DISCORD_TOKEN no arquivo .env');
} else {
  client.login(token).catch((err) => {
    console.error('Falha ao conectar no Discord:', err.message);
  });
}
