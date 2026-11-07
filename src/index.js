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

const { loadDB, saveDB, getUser } = require('./utils/database');
const { commandsList, handleSlashCommand } = require('./commands/slashCommands');
const { handlePanelInteraction } = require('./handlers/panelHandler');
const { handleStoreInteraction, buildProductSaleMessage } = require('./handlers/storeHandler');
const { handleTicketInteraction } = require('./handlers/ticketHandler');
const { syncApplicationEmojis } = require('./utils/icons');
const { setupAuthRoutes } = require('./utils/authServer');

// ============================================================================
// 1. SERVIDOR EXPRESS 24/7 (COM WEBPAGE & OAUTH2 & TRANSCRIPTS)
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const db = loadDB();
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${db.config.storeName} • Sistema 24/7</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0E14; color: #F8FAFC; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #11141C; padding: 2.5rem 3.5rem; border-radius: 18px; box-shadow: 0 15px 40px rgba(0,0,0,0.6); text-align: center; border: 1px solid #1E2330; }
          .badge { display: inline-block; background: rgba(34, 197, 94, 0.15); color: #22C55E; font-weight: 700; padding: 0.35rem 1rem; border-radius: 999px; font-size: 0.85rem; margin-bottom: 1rem; border: 1px solid rgba(34,197,94,0.3); }
          h1 { margin: 0.2rem 0 0.5rem; font-size: 1.5rem; font-weight: 700; }
          p { color: #94A3B8; margin: 0.4rem 0; font-size: 0.92rem; }
          .link { display: inline-block; margin-top: 1.2rem; background: #7C3AED; color: #FFF; text-decoration: none; padding: 0.6rem 1.4rem; border-radius: 10px; font-size: 0.9rem; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● ONLINE 24/7</div>
          <h1>${db.config.storeName} (${db.config.brandName})</h1>
          <p>Produtos cadastrados: <strong>${Object.keys(db.products || {}).length}</strong></p>
          <p>Vendas realizadas: <strong>${(db.sales || []).length}</strong></p>
          <p>Uptime: <strong>${Math.floor(process.uptime() / 60)} minutos</strong></p>
          <a class="link" href="/verify">Verificação OAuth2</a>
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

// Configura rotas de OAuth2 e Transcripts no Express
setupAuthRoutes(app, client);

app.listen(PORT, () => {
  console.log(`🌐 [Keep-Alive 24/7] Servidor ativo na porta ${PORT}`);
});

const invitesCache = new Map();

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

client.once('ready', async () => {
  const db = loadDB();
  console.log(`🤖 Bot online como ${client.user.tag}!`);

  client.user.setPresence({
    activities: [{ name: `${db.config.storeName} • /panel`, type: ActivityType.Playing }],
    status: 'online'
  });

  await syncApplicationEmojis(client);
  await registerSlashCommands();

  for (const [, guild] of client.guilds.cache) {
    await refreshGuildInvites(guild);
  }

  // Inicia agendador de repostagem e limpeza
  startAutomationsScheduler();
});

// ============================================================================
// 3. LOGS AUTOMATIZADOS (ENTRADAS, SAÍDAS, MENSAGENS APAGADAS / EDITADAS)
// ============================================================================

// MEMBRO ENTROU (Idêntico à Print 3 do lote 3)
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

  // Envia log no canal de entradas (Print 3)
  const entradasId = db.config.channels.entradasId;
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

// MEMBRO SAIU (Idêntico à Print 4 do lote 3)
client.on('guildMemberRemove', async (member) => {
  const db = loadDB();
  const saidasId = db.config.channels.saidasId;
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

// MENSAGEM APAGADA (Idêntica à Print 2 superior do lote 3)
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  const db = loadDB();
  const msgChannelId = db.config.channels.mensagensId;
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

// MENSAGEM EDITADA (Idêntica à Print 2 inferior do lote 3)
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const db = loadDB();
  const msgChannelId = db.config.channels.mensagensId;
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
// 4. ZENPROTECT (ANTI-CONVITES)
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
// 5. AGENDADOR DE AUTOMAÇÕES (REPOSTAGEM DE PRODUTOS & LIMPEZA DE CARRINHOS)
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
// 6. ROTEADOR DE INTERAÇÕES
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
  } catch (err) {
    console.error('[Interaction Error]:', err);
    const msg = { content: `Ocorreu um erro ao processar esta ação: \`${err.message}\``, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg).catch(() => null);
    } else {
      await interaction.reply(msg).catch(() => null);
    }
  }
});

// ============================================================================
// 7. LOGIN
// ============================================================================
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'SEU_TOKEN_AQUI') {
  console.warn('[AVISO] Configure DISCORD_TOKEN no arquivo .env');
} else {
  client.login(token).catch((err) => {
    console.error('Falha ao conectar no Discord:', err.message);
  });
}
