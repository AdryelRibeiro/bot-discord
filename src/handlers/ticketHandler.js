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
const { generateTranscriptHTML } = require('../utils/transcripts');

/**
 * Mensagem pública do Sistema de Tickets
 */
function buildPublicTicketMessage(db) {
  const tCfg = db.tickets.config;
  const functions = tCfg.functions || [];

  const functionsText = functions
    .map((f) => `▪ **${f.name}** — ${f.description || 'Atendimento especializado'}`)
    .join('\n') || '▪ **Suporte Geral**';

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle(tCfg.title || 'Central de Atendimento')
    .setDescription(
      `${tCfg.description || 'Selecione abaixo a categoria referente ao seu atendimento.'}\n\n` +
      `${functionsText}\n\n` +
      `🕒 **Horário de Atendimento:** \`${tCfg.schedule || '24 horas'}\``
    )
    .setFooter({ text: `${db.config.storeName} • Atendimento` });

  if (tCfg.banner && tCfg.banner.startsWith('http')) {
    embed.setImage(tCfg.banner);
  }

  const options = (functions.length > 0 ? functions : [
    { id: 'suporte', name: 'Suporte', description: 'Atendimento geral' }
  ]).slice(0, 25).map((f) => ({
    label: f.name.slice(0, 100),
    value: f.id,
    description: (f.description || `Abrir ticket: ${f.name}`).slice(0, 100)
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('public_ticket_open_select')
      .setPlaceholder('Selecione uma categoria para abrir ticket...')
      .addOptions(options)
  );

  return { embeds: [embed], components: [selectRow] };
}

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

function buildActiveTicketView(ticket, db) {
  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle(`Atendimento — ${ticket.functionName}`)
    .setDescription(
      `Olá <@${ticket.userId}>! Nossa equipe já foi notificada e irá atendê-lo em instantes.\n` +
      `Descreva sua dúvida ou solicitação com o máximo de detalhes possível.\n\n` +
      `**Detalhes do Chamado:**\n` +
      `▪ **Cliente:** <@${ticket.userId}>\n` +
      `▪ **Categoria:** \`${ticket.functionName}\`\n` +
      `▪ **Prioridade:** \`${ticket.priority || 'Normal'}\`\n` +
      `▪ **Assunto:** \`${ticket.subject || ticket.functionName}\``
    )
    .setFooter({ text: `${db.config.storeName} • ID #${ticket.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt_close:${ticket.channelId}`).setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tkt_archive:${ticket.channelId}`).setLabel('Arquivar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt_claim:${ticket.channelId}`).setLabel('Assumir Ticket').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tkt_poke:${ticket.channelId}`).setLabel('Notificar Membro').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function handleTicketInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // 1. Abrir ticket pelo menu de seleção
  if (interaction.isStringSelectMenu() && customId === 'public_ticket_open_select') {
    const fnId = interaction.values[0];
    const fnObj = (db.tickets.config.functions || []).find((f) => f.id === fnId) || { name: fnId };

    const existing = Object.values(db.tickets.active).find(
      (t) => t.userId === interaction.user.id && t.status === 'open'
    );
    if (existing) {
      const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
      if (ch) {
        return interaction.reply({
          content: `Você já possui um ticket aberto em <#${ch.id}>.`,
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
          name: `${fnObj.name.toLowerCase().slice(0, 10)}-${cleanUser}`,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          reason: `Ticket de ${interaction.user.tag}`
        });
        await ticketChannel.members.add(interaction.user.id);
      } catch {
        ticketChannel = null;
      }
    }

    if (!ticketChannel) {
      ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${cleanUser}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          ...(db.config.roles.adminRoleId ? [{ id: db.config.roles.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          ...(db.config.roles.staffRoleId ? [{ id: db.config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
        ]
      });
    }

    const ticketId = Date.now().toString(36).toUpperCase();
    const ticket = {
      id: ticketId,
      channelId: ticketChannel.id,
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      functionId: fnId,
      functionName: fnObj.name,
      claimedBy: null,
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

    const ticketUrl = `https://discord.com/channels/${interaction.guild.id}/${ticketChannel.id}`;
    const rowOpen = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Ir para o Ticket').setStyle(ButtonStyle.Link).setURL(ticketUrl)
    );

    return interaction.editReply({
      content: `✓ Seu ticket (**${fnObj.name}**) foi aberto com sucesso em <#${ticketChannel.id}>!`,
      components: [rowOpen]
    });
  }

  // 2. Botões dentro do ticket
  if (interaction.isButton() && customId.startsWith('tkt_')) {
    const [action, channelId] = customId.split(':');
    const ticket = db.tickets.active[channelId || interaction.channelId];

    if (action === 'tkt_claim') {
      if (ticket) {
        ticket.claimedBy = interaction.user.id;
        saveDB();
      }
      return interaction.reply({ content: `✓ Ticket assumido por <@${interaction.user.id}>!` });
    }

    if (action === 'tkt_poke') {
      if (!ticket) return interaction.reply({ content: 'Dados do ticket não encontrados.', ephemeral: true });
      const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
      if (member) {
        await member.send(`🔔 Olá! A equipe respondeu seu ticket em <#${interaction.channelId}> no servidor **${interaction.guild.name}**.`).catch(() => null);
      }
      return interaction.reply({ content: `🔔 O membro <@${ticket.userId}> foi notificado!` });
    }

    if (action === 'tkt_archive') {
      if (ticket) {
        ticket.status = 'archived';
        saveDB();
      }
      await interaction.reply({ content: '📁 Ticket arquivado com sucesso.' });
      if (interaction.channel?.isThread()) {
        await interaction.channel.setArchived(true).catch(() => null);
      }
      return true;
    }

    if (action === 'tkt_close') {
      await interaction.deferReply();

      // Gera transcript HTML
      let transcriptId = 'TR-EXP';
      try {
        transcriptId = await generateTranscriptHTML(interaction.channel, {
          id: ticket?.id || 'TKT',
          functionName: ticket?.functionName || 'Atendimento',
          userId: ticket?.userId,
          userTag: ticket?.userTag,
          closedBy: interaction.user.tag
        });
      } catch (err) {
        console.error('[Transcript Error]:', err);
      }

      // Envia Log de Ticket Encerrado (Idêntico à Print 1 do lote 3)
      const logChannelId = db.config.channels.logsTicketsId || db.config.channels.systemId;
      if (logChannelId) {
        const logCh = await client.channels.fetch(logChannelId).catch(() => null);
        if (logCh) {
          const baseUrl = (db.config.zenCloud.baseUrl || 'http://localhost:3000').replace(/\/$/, '');
          const transcriptUrl = `${baseUrl}/transcript/${transcriptId}`;

          const logEmbed = new EmbedBuilder()
            .setColor('#38BDF8')
            .setTitle('Ticket encerrado')
            .setDescription(
              `Logs › Tickets\n\n` +
              `» **Canal:** <#${interaction.channelId}> • \`${interaction.channelId}\`\n` +
              `» **Aberto por:** ${ticket ? `<@${ticket.userId}> (\`${ticket.userTag || ticket.userId}\`)` : 'Desconhecido'}\n` +
              `» **Assumido por:** ${ticket?.claimedBy ? `<@${ticket.claimedBy}>` : '`Não assumido`'}\n` +
              `» **Fechado por:** <@${interaction.user.id}>\n` +
              `» **Categoria:** \`${ticket?.functionName || 'Geral'}\`\n\n` +
              `O registro completo da conversa está no botão abaixo.`
            )
            .setFooter({ text: `${db.config.storeName} • ${new Date().toLocaleString('pt-BR')}` });

          const rowTranscript = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Ver transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl)
          );

          await logCh.send({ embeds: [logEmbed], components: [rowTranscript] }).catch(() => null);
        }
      }

      if (ticket) {
        delete db.tickets.active[ticket.channelId];
        saveDB();
      }

      await interaction.editReply({ content: '🔒 Ticket encerrado. Este canal será excluído em 5 segundos...' });
      setTimeout(() => {
        interaction.channel?.delete('Ticket encerrado').catch(() => null);
      }, 5000);
      return true;
    }
  }

  return false;
}

module.exports = {
  buildPublicTicketMessage,
  syncTicketMessages,
  buildActiveTicketView,
  handleTicketInteraction
};
