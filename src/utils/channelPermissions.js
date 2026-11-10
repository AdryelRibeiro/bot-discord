const { PermissionFlagsBits, ChannelType } = require('discord.js');

/**
 * Monta as permissões completas para Canais Privados de Carrinho e Ticket
 * Garantindo que:
 * 1. O comprador/membro veja e fale no canal.
 * 2. O bot tenha controle total.
 * 3. O dono do servidor tenha acesso.
 * 4. O cargo de Admin configurado tenha acesso.
 * 5. O cargo de Suporte/Staff configurado tenha acesso.
 * 6. TODOS os cargos com permissão de Administrador no Discord tenham acesso automaticamente.
 * 7. TODOS os cargos cujo nome contenha Admin, Staff, Suporte, Mod tenham acesso automaticamente.
 * 8. @everyone seja bloqueado de ver o canal.
 */
function buildPrivateChannelOverwrites(guild, db, userId) {
  const overwrites = [
    // 1. Bloqueia @everyone
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    // 2. Libera o comprador / autor do ticket
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions
      ]
    },
    // 3. Libera o Bot com permissões administrativas completas
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  const addedRoleIds = new Set();

  // 4. Cargo de Admin configurado no /panel
  if (db.config?.roles?.adminRoleId && guild.roles.cache.has(db.config.roles.adminRoleId)) {
    overwrites.push({
      id: db.config.roles.adminRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages
      ]
    });
    addedRoleIds.add(db.config.roles.adminRoleId);
  }

  // 5. Cargo de Staff / Suporte configurado no /panel
  if (db.config?.roles?.staffRoleId && guild.roles.cache.has(db.config.roles.staffRoleId)) {
    if (!addedRoleIds.has(db.config.roles.staffRoleId)) {
      overwrites.push({
        id: db.config.roles.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
      addedRoleIds.add(db.config.roles.staffRoleId);
    }
  }

  // 6. Detecção Inteligente de TODOS os cargos de Administrador e Staff do servidor
  guild.roles.cache.forEach((role) => {
    if (role.id === guild.id) return; // ignora @everyone
    if (addedRoleIds.has(role.id)) return;

    const roleName = role.name.toLowerCase();
    const isDiscordAdmin = role.permissions.has(PermissionFlagsBits.Administrator);
    const isManager = role.permissions.has(PermissionFlagsBits.ManageGuild) || role.permissions.has(PermissionFlagsBits.ManageChannels);
    const isStaffNamed = /admin|staff|suport|mod|gerente|diretor|dono|responsavel/i.test(roleName);

    if (isDiscordAdmin || isManager || isStaffNamed) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
      addedRoleIds.add(role.id);
    }
  });

  return overwrites;
}

/**
 * Busca ou cria uma Categoria para Carrinhos
 */
async function getOrCreateCartCategory(guild) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && /carrinho/i.test(c.name)
  );
  if (!category) {
    try {
      category = await guild.channels.create({
        name: '🛒・CARRINHOS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }
        ]
      });
    } catch {
      category = null;
    }
  }
  return category;
}

/**
 * Busca ou cria uma Categoria para Tickets
 */
async function getOrCreateTicketCategory(guild) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && /ticket|atendimento/i.test(c.name)
  );
  if (!category) {
    try {
      category = await guild.channels.create({
        name: '🎫・TICKETS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }
        ]
      });
    } catch {
      category = null;
    }
  }
  return category;
}

/**
 * Retorna as menções dos cargos de atendimento para notificar
 */
function getStaffMentions(guild, db) {
  const mentions = [];
  if (db.config?.roles?.staffRoleId && guild.roles.cache.has(db.config.roles.staffRoleId)) {
    mentions.push(`<@&${db.config.roles.staffRoleId}>`);
  }
  if (db.config?.roles?.adminRoleId && guild.roles.cache.has(db.config.roles.adminRoleId)) {
    mentions.push(`<@&${db.config.roles.adminRoleId}>`);
  }
  if (mentions.length === 0) {
    // Procura por cargo suporte ou staff
    const autoStaff = guild.roles.cache.find((r) => /staff|suport/i.test(r.name));
    if (autoStaff) mentions.push(`<@&${autoStaff.id}>`);
  }
  return mentions.join(' ');
}

module.exports = {
  buildPrivateChannelOverwrites,
  getOrCreateCartCategory,
  getOrCreateTicketCategory,
  getStaffMentions
};
