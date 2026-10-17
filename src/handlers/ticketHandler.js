const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { loadDB, saveDB } = require('../utils/database');

/**
 * Monta a mensagem pública do Sistema de Tickets (usada em "Postar Mensagem" e "Preview")
 */
function buildPublicTicketMessage(db) {
  const tCfg = db.tickets.config;
  const functionsText = (tCfg.functions || [])
    .map((f) => `${f.emoji || '📋'} **${f.name}** — ${f.description || 'Atendimento especializado'}`)
    .join('\n') || '📋 **Suporte Geral**';

  const embed = new EmbedBuilder()
    .setColor(tCfg.color || '#1D4ED8')
    .setAuthor({ name: `${db.config.brandName} • Atendimento` })
    .setTitle(tCfg.title || '🎧 Central de Atendimento')
    .setDescription(`${tCfg.description || 'Selecione uma opção abaixo para abrir um ticket.'}\n\n${functionsText}\n\n🕒 **Horário de Atendimento:** \`${tCfg.schedule || '24 horas'}\``)
    .setFooter({ text: `${db.config.storeName} • Sistema de Tickets` })
    .setTimestamp();

  if (tCfg.banner && tCfg.banner.startsWith('http')) {
    embed.setImage(tCfg.banner);
  }

  const options = (tCfg.functions && tCfg.functions.length > 0 ? tCfg.functions : [
    { id: 'suporte', name: 'Suporte', emoji: '📋', description: 'Atendimento geral' }
  ]).slice(0, 25).map((f) => ({
    label: f.name.slice(0, 100),
    value: f.id,
    description: (f.description || `Abrir ticket: ${f.name}`).slice(0, 100),
    emoji: f.emoji || '📋'
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('public_ticket_open_select')
      .setPlaceholder('📂 Selecione uma categoria para abrir ticket...')
      .addOptions(options)
  );

  return { embeds: [embed], components: [selectRow] };
}

/**
 * Sincroniza todas as mensagens públicas de Ticket
 */
async function syncTicketMessages(client) {
  const db = loadDB();
  const refs = db.tickets.config.publishedMessages || [];
  let synced = 0;
  const validRefs = [];
  const payload = buildPublicTicketMessage(db);

  for (const ref of refs) {
    try {
      const ch = await client.channels.fetch(ref.channelId).catch(() => null);
      if (!ch) continue;
      const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) continue;
      await msg.edit(payload);
      validRefs.push(ref);
      synced++;
    } catch {
      // ignora
    }
  }
  db.tickets.config.publishedMessages = validRefs;
  saveDB();
  return synced;
}

/**
 * Monta o embed interno de um ticket aberto
 */
function buildActiveTicketView(ticket, db) {
  const embed = new EmbedBuilder()
    .setColor('#3B82F6')
    .setAuthor({ name: `${db.config.brandName} • Atendimento #${ticket.id}` })
    .setTitle(`🎧 Ticket — ${ticket.functionName}`)
    .setDescription(`Olá <@${ticket.userId}>! Nossa equipe já foi notificada e irá atendê-lo em instantes.\nDescreva seu assunto com o máximo de detalhes possível.`)
    .addFields(
      { name: '👤 Autor', value: `<@${ticket.userId}>`, inline: true },
      { name: '📂 Categoria', value: `\`${ticket.functionName}\``, inline: true },
      { name: '🚦 Prioridade', value: `\`${ticket.priority || 'Normal'}\``, inline: true },
      { name: '📝 Assunto', value: `\`${ticket.subject || 'Não especificado'}\``, inline: false }
    )
    .setFooter({ text: `${db.config.storeName} • Tickets` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt_close:${ticket.channelId}`).setLabel('Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tkt_archive:${ticket.channelId}`).setLabel('Arquivar').setEmoji('📁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt_poke:${ticket.channelId}`).setLabel('Notificar Membro').setEmoji('🔔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tkt_staff:${ticket.channelId}`).setLabel('Painel Staff').setEmoji('🛠️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Trata abertura e botões de tickets
 */
async function handleTicketInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // 1. Abrir ticket pelo menu público
  if (interaction.isStringSelectMenu() && customId === 'public_ticket_open_select') {
    const fnId = interaction.values[0];
    const fnObj = (db.tickets.config.functions || []).find((f) => f.id === fnId) || { name: fnId };

    // Verifica se o usuário já tem ticket aberto
    const existing = Object.values(db.tickets.active).find(
      (t) => t.userId === interaction.user.id && t.status === 'open'
    );
    if (existing) {
      const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
      if (ch) {
        return interaction.reply({
          content: `⚠️ Você já possui um ticket aberto em <#${ch.id}>!`,
          ephemeral: true
        });
      } else {
        delete db.tickets.active[existing.channelId];
        saveDB();
      }
    }

    await interaction.deferReply({ ephemeral: true });

    const cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'user';
    let ticketChannel = null;

    if (db.tickets.config.openMode === 'Thread Privada' && interaction.channel?.type === ChannelType.GuildText) {
      try {
        ticketChannel = await interaction.channel.threads.create({
          name: `🎫・${fnObj.name.slice(0, 12)}-${cleanUser}`,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          reason: `Ticket aberto por ${interaction.user.tag}`
        });
        await ticketChannel.members.add(interaction.user.id);
      } catch {
        ticketChannel = null;
      }
    }

    if (!ticketChannel) {
      ticketChannel = await interaction.guild.channels.create({
        name: `🎫・${cleanUser}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          ...(db.config.roles.adminRoleId ? [{ id: db.config.roles.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          ...(db.config.roles.staffRoleId ? [{ id: db.config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
        ]
      });
    }

    const ticket = {
      id: Date.now().toString(36).toUpperCase(),
      channelId: ticketChannel.id,
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      functionId: fnId,
      functionName: fnObj.name,
      priority: 'Normal',
      subject: fnObj.name,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    db.tickets.active[ticketChannel.id] = ticket;
    saveDB();

    const view = buildActiveTicketView(ticket, db);
    const staffMention = db.config.roles.staffRoleId ? `<@&${db.config.roles.staffRoleId}>` : '';
    await ticketChannel.send({ content: `<@${interaction.user.id}> ${staffMention}`, ...view });

    return interaction.editReply({
      content: `✅ Seu ticket (**${fnObj.name}**) foi aberto com sucesso em <#${ticketChannel.id}>!`
    });
  }

  // 2. Ações dentro do Ticket (Fechar, Arquivar, Notificar, Painel Staff)
  if (interaction.isButton() && customId.startsWith('tkt_')) {
    const [action, channelId] = customId.split(':');
    const ticket = db.tickets.active[channelId || interaction.channelId];

    if (action === 'tkt_close') {
      if (ticket) {
        ticket.status = 'closed';
        delete db.tickets.active[ticket.channelId];
        saveDB();
      }

      if (db.config.channels.logsTicketsId) {
        const logCh = await client.channels.fetch(db.config.channels.logsTicketsId).catch(() => null);
        if (logCh) {
          const logEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🔒 Ticket Encerrado')
            .addFields(
              { name: '👤 Autor do Ticket', value: ticket ? `<@${ticket.userId}>` : 'Desconhecido', inline: true },
              { name: '👮 Fechado por', value: `<@${interaction.user.id}>`, inline: true },
              { name: '📂 Categoria', value: `\`${ticket?.functionName || 'Geral'}\``, inline: true }
            )
            .setTimestamp();
          await logCh.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }

      await interaction.reply({ content: `🔒 Ticket encerrado por <@${interaction.user.id}>. Este canal será deletado em 5 segundos...` });
      setTimeout(() => {
        interaction.channel?.delete('Ticket encerrado').catch(() => null);
      }, 5000);
      return true;
    }

    if (action === 'tkt_archive') {
      if (ticket) {
        ticket.status = 'archived';
        saveDB();
      }
      await interaction.reply({ content: `📁 Ticket arquivado por <@${interaction.user.id}>.` });
      if (interaction.channel?.isThread()) {
        await interaction.channel.setArchived(true).catch(() => null);
      }
      return true;
    }

    if (action === 'tkt_poke') {
      if (!ticket) return interaction.reply({ content: '❌ Dados do ticket não encontrados.', ephemeral: true });
      const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
      if (member) {
        await member.send({
          content: `🔔 Olá! A equipe respondeu seu ticket em <#${interaction.channelId}> no servidor **${interaction.guild.name}**.`
        }).catch(() => null);
      }
      return interaction.reply({ content: `🔔 O usuário <@${ticket.userId}> foi notificado no privado e aqui no canal!` });
    }

    if (action === 'tkt_staff') {
      return sendTicketStaffPanel(interaction, ticket);
    }

    if (action === 'tkt_close_all_confirm') {
      const openTickets = Object.values(db.tickets.active);
      let closedCount = 0;
      for (const t of openTickets) {
        const ch = await interaction.guild.channels.fetch(t.channelId).catch(() => null);
        if (ch) await ch.delete('Fechamento em massa (/closealltickets)').catch(() => null);
        delete db.tickets.active[t.channelId];
        closedCount++;
      }
      saveDB();
      return interaction.update({
        content: `✅ Todos os **${closedCount}** tickets abertos foram encerrados com sucesso!`,
        embeds: [],
        components: []
      });
    }
  }

  return false;
}

async function sendTicketStaffPanel(interaction, ticket) {
  const db = loadDB();
  const t = ticket || db.tickets.active[interaction.channelId];
  if (!t) {
    return interaction.reply({ content: '❌ Este canal não é um ticket ativo registrado.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor('#6366F1')
    .setTitle('🛠️ Painel Staff do Ticket')
    .setDescription('Use os comandos ou botões rápidos abaixo para gerenciar este atendimento:')
    .addFields(
      { name: '👤 Cliente', value: `<@${t.userId}>`, inline: true },
      { name: '🚦 Prioridade Atual', value: `\`${t.priority || 'Normal'}\``, inline: true },
      { name: '📝 Assunto', value: `\`${t.subject || t.functionName}\``, inline: false },
      { name: '⚡ Atalhos Slash', value: '`/add_ticket` • `/definir-prioridade` • `/archive_ticket` • `/close_ticket`', inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt_poke:${t.channelId}`).setLabel('Chamar na DM').setEmoji('🔔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tkt_archive:${t.channelId}`).setLabel('Arquivar').setEmoji('📁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt_close:${t.channelId}`).setLabel('Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

module.exports = {
  buildPublicTicketMessage,
  syncTicketMessages,
  buildActiveTicketView,
  handleTicketInteraction,
  sendTicketStaffPanel
};
