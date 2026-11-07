const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActivityType
} = require('discord.js');

const {
  loadDB,
  saveDB,
  createBackup,
  listBackups,
  restoreBackup,
  formatBRL,
  slugify
} = require('../utils/database');
const { buildProductSaleMessage, syncProductMessages } = require('./storeHandler');
const { buildPublicTicketMessage, syncTicketMessages } = require('./ticketHandler');

/**
 * 1. TELA PRINCIPAL DO /panel (Clean & Moderna - Prime Group)
 */
function buildMainPanelView(db) {
  const embed = new EmbedBuilder()
    .setColor(db.config.color || '#7C3AED')
    .setAuthor({ name: `${db.config.storeName} • Painel de Controle` })
    .setTitle(db.config.brandName || 'Prime Store')
    .setDescription(
      'Selecione abaixo o módulo que deseja gerenciar.\n' +
      'Todos os recursos de vendas, tickets, automações e segurança estão integrados.'
    );

  if (db.config.mainBanner && db.config.mainBanner.startsWith('http')) {
    embed.setImage(db.config.mainBanner);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_minha_loja').setLabel('Minha loja').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_ticket').setLabel('Ticket').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_boas_vindas').setLabel('Boas-Vindas').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_automacoes').setLabel('Automações').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_customizar').setLabel('Customizar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_zencloud').setLabel('zenCloud').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_extrato').setLabel('Extrato').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway').setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_configuracoes').setLabel('Configurações').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_zenprotect').setLabel('zenProtect').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * 2. TELA "PAINEL DA LOJA"
 */
function buildStorePanelView(db, username) {
  const productCount = Object.keys(db.products || {}).length;
  const bankStatus = db.config.bank?.configured || db.config.bank?.pixKey
    ? '`Configurado`'
    : '`Não configurado`';

  const embed = new EmbedBuilder()
    .setColor('#1E2330')
    .setAuthor({ name: db.config.brandName || 'Prime Store' })
    .setTitle('Painel da Loja')
    .setDescription(`Gerenciamento de produtos e estoque para **${username}**.`)
    .addFields(
      { name: 'Total de Produtos', value: `\`${productCount}x cadastrados\``, inline: true },
      { name: 'PIX / Banco', value: bankStatus, inline: true },
      { name: 'Moeda Padrão', value: `\`${db.config.currency || 'BRL'}\``, inline: true }
    )
    .setFooter({ text: db.config.storeName });

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('store_create_product').setLabel('Criar produto').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('store_list_products').setLabel('Produtos').setStyle(ButtonStyle.Primary)
  );

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('store_more_options')
      .setPlaceholder('Mais opções da loja...')
      .addOptions([
        { label: 'Criar Cupom em Massa', value: 'mass_coupon', description: 'Cria um cupom válido para todos os produtos' },
        { label: 'Postar Painel de Saldo', value: 'post_saldo_panel', description: 'Envia o painel de carteira neste canal' },
        { label: 'Postar Solicitação de Estoque', value: 'post_stock_req', description: 'Painel para membros solicitarem itens' },
        { label: 'Configurar Banco / Chave PIX', value: 'config_bank', description: 'Defina sua Chave PIX ou Token Mercado Pago' }
      ])
  );

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowButtons, rowSelect, rowBack] };
}

/**
 * 3. TELA DE LISTA DE PRODUTOS
 */
function buildProductListView(db) {
  const products = Object.values(db.products || {});

  const embed = new EmbedBuilder()
    .setColor('#1E2330')
    .setTitle('Gerenciar Produtos')
    .setDescription(`Selecione um dos **${products.length}** produtos abaixo para gerenciar campos, estoque ou colocar à venda.`);

  const components = [];

  if (products.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('store_select_product')
      .setPlaceholder('Selecione um produto...')
      .addOptions(
        products.slice(0, 25).map((p) => ({
          label: p.name.slice(0, 100),
          value: p.id,
          description: (p.description || '').replace(/\n+/g, ' ').slice(0, 95) || 'Sem descrição'
        }))
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }

  const rowBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('store_out_of_stock').setLabel('Produtos s/ estoque').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_minha_loja').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );
  components.push(rowBtns);

  return { embeds: [embed], components };
}

/**
 * 4. TELA DE DETALHES DO PRODUTO
 */
function buildProductDetailView(product, db) {
  const fieldsLines = (product.fields || []).map((f) => {
    const stockCount = Array.isArray(f.stock) ? f.stock.length : 0;
    return `▪ **${f.name}**\n\`Estoque: ${stockCount}\` • \`${formatBRL(f.price)}\``;
  }).join('\n\n') || '*Nenhum plano cadastrado*';

  const couponsLines = (product.coupons && product.coupons.length > 0)
    ? product.coupons.map((c) => `\`${c.code}\` (-${c.discountPercent}%)`).join(', ')
    : 'Nenhum cupom cadastrado';

  const embed = new EmbedBuilder()
    .setColor(product.color || '#7C3AED')
    .setTitle(product.name)
    .setDescription(
      `**Descrição:**\n${product.description || '*Sem descrição*'}\n\n` +
      `**Planos & Estoque:**\n${fieldsLines}\n\n` +
      `**Cupons:** ${couponsLines}\n` +
      `**Entrega Automática:** \`${product.autoDelivery ? 'Sim' : 'Não'}\``
    )
    .setFooter({ text: `Produtos › ${product.name}` });

  if (product.banner && product.banner.startsWith('http')) {
    embed.setImage(product.banner);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_edit:${product.id}`).setLabel('Editar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`prod_fields:${product.id}`).setLabel('Gerenciar planos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`prod_coupons:${product.id}`).setLabel('Gerenciar cupons').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_publish:${product.id}`).setLabel('Colocar a venda').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`prod_delete:${product.id}`).setLabel('Excluir Produto').setStyle(ButtonStyle.Danger)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_sync:${product.id}`).setLabel('Sincronizar Produto').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('store_list_products').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function buildManageFieldsView(product) {
  const fieldsText = (product.fields || []).map((f, idx) => {
    const count = Array.isArray(f.stock) ? f.stock.length : 0;
    return `**${idx + 1}. ${f.name}** — \`${formatBRL(f.price)}\` | Estoque: \`${count} itens\``;
  }).join('\n') || '*Nenhum plano cadastrado.*';

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle(`Gerenciar Planos — ${product.name}`)
    .setDescription(`Adicione variações ou selecione um plano abaixo para reabastecer o estoque.\n\n${fieldsText}`);

  const components = [];

  if (product.fields && product.fields.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`field_select:${product.id}`)
      .setPlaceholder('Selecione um plano para editar ou abastecer...')
      .addOptions(
        product.fields.slice(0, 25).map((f) => ({
          label: f.name.slice(0, 100),
          value: f.id,
          description: `Preço: ${formatBRL(f.price)} | Estoque: ${f.stock?.length || 0}`
        }))
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }

  const rowBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`field_add:${product.id}`).setLabel('Novo Plano').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`prod_view:${product.id}`).setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );
  components.push(rowBtns);

  return { embeds: [embed], components };
}

/**
 * 5. TELA DE TICKETS
 */
function buildTicketPanelView(db) {
  const tCfg = db.tickets.config;
  const fns = tCfg.functions || [];
  const fnLines = fns.map((f) => `▪ **${f.name}**`).join('\n') || '*Nenhuma função criada*';

  const desc = [
    'Configure e gerencie o sistema de tickets do seu servidor.',
    '',
    `» **Status:** ${tCfg.enabled ? '`Configurado`' : '`Desativado`'}`,
    `» **Funções:** \`${fns.length}x configuradas\``,
    `» **Modo de Abertura:** \`${tCfg.openMode || 'Thread Privada'}\``,
    `» **Horários:** \`${tCfg.schedule || '24 horas'}\``,
    '',
    fnLines,
    '',
    'Selecione uma opção no menu abaixo para configurar.'
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('Sistema de Tickets')
    .setDescription(desc)
    .setFooter({ text: `${db.config.storeName} • Tickets` });

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_config_select')
      .setPlaceholder('Selecione uma opção para configurar')
      .addOptions([
        { label: 'Configurar Aparência', value: 'tkt_cfg_appearance', description: 'Título, descrição, cor e banner' },
        { label: 'Adicionar Função', value: 'tkt_cfg_add_fn', description: 'Criar uma nova função de atendimento' },
        { label: 'Modo de Abertura', value: 'tkt_cfg_open_mode', description: `Atual: ${tCfg.openMode || 'Thread Privada'}` },
        { label: 'Configurar Horários', value: 'tkt_cfg_schedule', description: `Horários (${tCfg.schedule || '24 horas'})` }
      ])
  );

  const rowActions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_panel_sync').setLabel('Sincronizar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkt_panel_post').setLabel('Postar Mensagem').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowSelect, rowActions] };
}

/**
 * 6. TELA DE CONFIGURAÇÕES
 */
function buildConfigPanelView(db) {
  const embed = new EmbedBuilder()
    .setColor('#1E2330')
    .setTitle('Configurações Gerais')
    .setDescription(
      'Configure os cargos, canais de logs automatizados e dados bancários do servidor.\n' +
      'Selecione uma das opções abaixo.'
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_roles_view').setLabel('Cargos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_channels_view').setLabel('Canais de Logs').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_bank').setLabel('Setar meu banco').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildRolesConfigView(db) {
  const r = db.config.roles;
  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('Configuração de Cargos')
    .setDescription(
      `**Cargos Atuais:**\n` +
      `▪ **Admin:** ${r.adminRoleId ? `<@&${r.adminRoleId}>` : '`Não configurado`'}\n` +
      `▪ **Staff / Suporte:** ${r.staffRoleId ? `<@&${r.staffRoleId}>` : '`Não configurado`'}\n` +
      `▪ **Cliente (Ao Comprar):** ${r.customerRoleId ? `<@&${r.customerRoleId}>` : '`Não configurado`'}\n` +
      `▪ **Auto-Role (Ao Entrar):** ${r.autoRoleId ? `<@&${r.autoRoleId}>` : '`Não configurado`'}\n` +
      `▪ **Verificado (zenCloud):** ${r.verifiedRoleId ? `<@&${r.verifiedRoleId}>` : '`Não configurado`'}\n\n` +
      `*Escolha abaixo qual cargo você deseja definir usando a lista do servidor:*`
    );

  const selectRoleType = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg_select_role_type')
      .setPlaceholder('Escolha o cargo para alterar...')
      .addOptions([
        { label: 'Cargo de Administrador', value: 'role_admin' },
        { label: 'Cargo de Staff / Atendimento', value: 'role_staff' },
        { label: 'Cargo de Cliente (Automático na Compra)', value: 'role_customer' },
        { label: 'Cargo Automático (Ao Entrar no Servidor)', value: 'role_autorole' },
        { label: 'Cargo de Verificado (zenCloud OAuth2)', value: 'role_verified' }
      ])
  );

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_configuracoes').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [selectRoleType, rowBack] };
}

function buildChannelsConfigView(db) {
  const c = db.config.channels;
  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('Configuração de Canais e Logs')
    .setDescription(
      `**Canais Atuais:**\n` +
      `▪ **system:** ${c.systemId ? `<#${c.systemId}>` : '`Não configurado`'}\n` +
      `▪ **logspedidos:** ${c.logsVendasId ? `<#${c.logsVendasId}>` : '`Não configurado`'}\n` +
      `▪ **entradas:** ${c.entradasId ? `<#${c.entradasId}>` : '`Não configurado`'}\n` +
      `▪ **saídas:** ${c.saidasId ? `<#${c.saidasId}>` : '`Não configurado`'}\n` +
      `▪ **notifyon:** ${c.notifyOnId ? `<#${c.notifyOnId}>` : '`Não configurado`'}\n` +
      `▪ **mensagens:** ${c.mensagensId ? `<#${c.mensagensId}>` : '`Não configurado`'}\n` +
      `▪ **tráfego (Call / Voz):** ${c.trafegoId ? `<#${c.trafegoId}>` : '`Não configurado`'}\n` +
      `▪ **ticket:** ${c.logsTicketsId ? `<#${c.logsTicketsId}>` : '`Não configurado`'}\n` +
      `▪ **solicitacoes-estoque:** ${c.solicitacaoEstoqueId ? `<#${c.solicitacaoEstoqueId}>` : '`Não configurado`'}\n\n` +
      `Clique em **Configurar Auto** para criar e vincular todos os 9 canais automaticamente na categoria privada **Logs**!`
    );

  const rowAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_channels_auto').setLabel('Configurar Auto (Criar Todos os Canais)').setStyle(ButtonStyle.Success)
  );

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg_select_channel_target')
      .setPlaceholder('Ou selecione um canal individual para definir...')
      .addOptions([
        { label: 'Canal logspedidos (Vendas)', value: 'ch_pedidos' },
        { label: 'Canal entradas', value: 'ch_entradas' },
        { label: 'Canal saídas', value: 'ch_saidas' },
        { label: 'Canal mensagens (Apagadas / Editadas)', value: 'ch_mensagens' },
        { label: 'Canal tráfego (Entradas/Saídas de Call)', value: 'ch_trafego' },
        { label: 'Canal ticket (Transcripts)', value: 'ch_ticket' },
        { label: 'Canal solicitacoes-estoque', value: 'ch_estoque' }
      ])
  );

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_configuracoes').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowAuto, rowSelect, rowBack] };
}

function buildAutomationsView(db) {
  const a = db.config.automations;
  const repost = a.productRepost || {};

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('Automações do Sistema')
    .setDescription(
      `**Repostagem Automática de Produtos:**\n` +
      `» Status: \`${repost.enabled ? 'Ativado' : 'Desativado'}\`\n` +
      `» Intervalo: \`${repost.intervalMinutes || 180} minutos\` (ou Horários: \`${repost.fixedHours || '12:00, 18:00, 22:00'}\`)\n\n` +
      `**Mensagens Automáticas:** \`${(a.autoMessages || []).length} cadastradas\`\n` +
      `**Auto-Role de Cliente na Compra:** \`${a.autoRoleCustomer ? 'Ativado' : 'Desativado'}\`\n` +
      `**Cancelamento de Carrinhos Inativos:** \`${a.autoCancelCartMinutes || 58} minutos\``
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('auto_toggle_repost').setLabel(repost.enabled ? 'Desativar Repostagem' : 'Ativar Repostagem').setStyle(repost.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('auto_cfg_repost').setLabel('Configurar Horários Repost').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('auto_create_message').setLabel('Nova Mensagem Automática').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildZenCloudView(db) {
  const z = db.config.zenCloud || {};
  const verifiedCount = (z.verifiedUsers || []).length;
  const baseUrl = (z.baseUrl || 'https://seu-bot.onrender.com').replace(/\/$/, '');
  const verifyUrl = `${baseUrl}/verify`;

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('zenCloud — Autenticação OAuth2 & Backup')
    .setDescription(
      `Central de segurança e proteção de membros via Discord OAuth2.\n\n` +
      `**Status das Credenciais:**\n` +
      `▪ **OAuth2 Client ID:** \`${z.oauthClientId || 'Padrão da Aplicação'}\`\n` +
      `▪ **OAuth2 Secret:** \`${z.oauthClientSecret ? 'Configurado' : 'Não configurado'}\`\n` +
      `▪ **Token do Bot de Auth:** \`${z.authBotToken ? 'Configurado' : 'Não configurado'}\`\n` +
      `▪ **URL de Verificação:** \`${verifyUrl}\`\n` +
      `▪ **Total de Membros Verificados:** \`${verifiedCount} membros\`\n\n` +
      `*Membros verificados recebem o cargo automaticamente e ficam salvos caso seja necessário restaurá-los.*`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zencloud_cfg_credentials').setLabel('Configurar Credenciais').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('zencloud_post_panel').setLabel('Postar Verificação no Canal').setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zencloud_pull_members').setLabel(`Puxar Membros (${verifiedCount})`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Handler central de todas as interações do /panel
 */
async function handlePanelInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // 1. Navegação de Menus Principais
  if (interaction.isButton() && customId === 'panel_back_main') {
    return interaction.update(buildMainPanelView(db));
  }

  if (interaction.isButton() && customId === 'panel_minha_loja') {
    return interaction.update(buildStorePanelView(db, interaction.user.username));
  }

  if (interaction.isButton() && customId === 'store_list_products') {
    return interaction.update(buildProductListView(db));
  }

  if (interaction.isButton() && customId === 'panel_ticket') {
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isButton() && customId === 'panel_configuracoes') {
    return interaction.update(buildConfigPanelView(db));
  }

  if (interaction.isButton() && customId === 'cfg_roles_view') {
    return interaction.update(buildRolesConfigView(db));
  }

  if (interaction.isButton() && customId === 'cfg_channels_view') {
    return interaction.update(buildChannelsConfigView(db));
  }

  if (interaction.isButton() && customId === 'panel_automacoes') {
    return interaction.update(buildAutomationsView(db));
  }

  if (interaction.isButton() && customId === 'panel_zencloud') {
    return interaction.update(buildZenCloudView(db));
  }

  // 2. Customizar Bot / Loja
  if (interaction.isButton() && customId === 'panel_customizar') {
    const modal = new ModalBuilder()
      .setCustomId('modal_customizar_prime')
      .setTitle('Customizar Prime Group')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('store_name').setLabel('Nome Principal').setValue(db.config.storeName || 'Prime Group').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('brand_name').setLabel('Subtítulo do Bot / Loja').setValue(db.config.brandName || 'Prime Store').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('presence_text').setLabel('Status do Bot (Atividade)').setValue(db.config.presence?.activityText || 'Prime Group • /panel').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner (Opcional)').setValue(db.config.mainBanner || '').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_customizar_prime') {
    db.config.storeName = interaction.fields.getTextInputValue('store_name').trim() || 'Prime Group';
    db.config.brandName = interaction.fields.getTextInputValue('brand_name').trim() || 'Prime Store';
    const statusText = interaction.fields.getTextInputValue('presence_text').trim() || 'Prime Group • /panel';
    db.config.presence.activityText = statusText;
    db.config.mainBanner = interaction.fields.getTextInputValue('banner').trim();
    saveDB();

    client.user?.setPresence({
      activities: [{ name: statusText, type: ActivityType.Playing }],
      status: db.config.presence?.status || 'online'
    });

    return interaction.update(buildMainPanelView(db));
  }

  // 3. Extrato
  if (interaction.isButton() && customId === 'panel_extrato') {
    const sales = db.sales || [];
    const totalRevenue = sales.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const lastSales = sales.slice(-8).reverse().map((s) =>
      `• \`${s.id}\` — **${s.productName}** (${s.fieldName}) • \`${formatBRL(s.amount)}\` para <@${s.userId}>`
    ).join('\n') || '*Nenhuma venda registrada ainda.*';

    const embed = new EmbedBuilder()
      .setColor('#22C55E')
      .setTitle(`🧾 Extrato Financeiro — ${db.config.storeName}`)
      .addFields(
        { name: 'Faturamento Total', value: `\`${formatBRL(totalRevenue)}\``, inline: true },
        { name: 'Total de Vendas', value: `\`${sales.length} pedidos\``, inline: true },
        { name: 'Últimas Transações', value: lastSales, inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  // 4. Giveaway
  if (interaction.isButton() && customId === 'panel_giveaway') {
    const modal = new ModalBuilder()
      .setCustomId('modal_create_giveaway')
      .setTitle('Novo Sorteio')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('prize').setLabel('Qual é o Prêmio?').setPlaceholder('Ex: Key BRMODS 30 Dias').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('minutes').setLabel('Duração em Minutos').setValue('60').setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  // 5. Configurar Auto para os 9 Canais
  if (interaction.isButton() && customId === 'cfg_channels_auto') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;

    try {
      const category = await guild.channels.create({
        name: 'Logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          ...(db.config.roles.adminRoleId ? [{ id: db.config.roles.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          ...(db.config.roles.staffRoleId ? [{ id: db.config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
        ]
      });

      const channelNames = [
        { key: 'systemId', name: '📁・system' },
        { key: 'logsVendasId', name: '📁・logspedidos' },
        { key: 'entradasId', name: '📁・entradas' },
        { key: 'saidasId', name: '📁・saídas' },
        { key: 'notifyOnId', name: '📁・notifyon' },
        { key: 'mensagensId', name: '📁・mensagens' },
        { key: 'trafegoId', name: '📁・tráfego' },
        { key: 'logsTicketsId', name: '📁・ticket' },
        { key: 'solicitacaoEstoqueId', name: '📁・solicitacoes-estoque' }
      ];

      for (const item of channelNames) {
        const created = await guild.channels.create({
          name: item.name,
          type: ChannelType.GuildText,
          parent: category.id
        });
        db.config.channels[item.key] = created.id;
      }

      db.config.channels.logsCategoryId = category.id;
      saveDB();

      return interaction.editReply({
        content: `✓ **Categoria Logs e os 9 canais criados com sucesso!**\nVerifique sua lista de canais à esquerda.`
      });
    } catch (err) {
      console.error('[Auto Channel Error]:', err);
      return interaction.editReply({
        content: `Falha ao criar canais: ${err.message}. Verifique as permissões de Administrador do bot.`
      });
    }
  }

  // 6. Seletores de Cargos
  if (interaction.isStringSelectMenu() && customId === 'cfg_select_role_type') {
    const roleType = interaction.values[0];
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`cfg_pick_role:${roleType}`)
      .setPlaceholder('Escolha o cargo na lista...');

    return interaction.reply({
      content: 'Selecione o cargo desejado:',
      components: [new ActionRowBuilder().addComponents(roleSelect)],
      ephemeral: true
    });
  }

  if (interaction.isRoleSelectMenu() && customId.startsWith('cfg_pick_role:')) {
    const roleType = customId.split(':')[1];
    const roleId = interaction.values[0];

    if (roleType === 'role_admin') db.config.roles.adminRoleId = roleId;
    if (roleType === 'role_staff') db.config.roles.staffRoleId = roleId;
    if (roleType === 'role_customer') db.config.roles.customerRoleId = roleId;
    if (roleType === 'role_autorole') db.config.roles.autoRoleId = roleId;
    if (roleType === 'role_verified') {
      db.config.roles.verifiedRoleId = roleId;
      db.config.zenCloud.verifiedRoleId = roleId;
    }
    saveDB();

    return interaction.update({
      content: `✓ Cargo <@&${roleId}> configurado com sucesso!`,
      components: []
    });
  }

  // 7. Seletores de Canais
  if (interaction.isStringSelectMenu() && customId === 'cfg_select_channel_target') {
    const target = interaction.values[0];
    const chSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`cfg_pick_channel:${target}`)
      .setPlaceholder('Escolha o canal na lista...')
      .setChannelTypes(ChannelType.GuildText);

    return interaction.reply({
      content: 'Selecione o canal no menu abaixo:',
      components: [new ActionRowBuilder().addComponents(chSelect)],
      ephemeral: true
    });
  }

  if (interaction.isChannelSelectMenu() && customId.startsWith('cfg_pick_channel:')) {
    const target = customId.split(':')[1];
    const channelId = interaction.values[0];

    if (target === 'ch_pedidos') db.config.channels.logsVendasId = channelId;
    if (target === 'ch_entradas') db.config.channels.entradasId = channelId;
    if (target === 'ch_saidas') db.config.channels.saidasId = channelId;
    if (target === 'ch_mensagens') db.config.channels.mensagensId = channelId;
    if (target === 'ch_trafego') db.config.channels.trafegoId = channelId;
    if (target === 'ch_ticket') db.config.channels.logsTicketsId = channelId;
    if (target === 'ch_estoque') db.config.channels.solicitacaoEstoqueId = channelId;
    saveDB();

    return interaction.update({
      content: `✓ Canal <#${channelId}> vinculado com sucesso!`,
      components: []
    });
  }

  // 8. zenCloud Postar Painel
  if (interaction.isButton() && customId === 'zencloud_post_panel') {
    const baseUrl = (db.config.zenCloud.baseUrl || 'https://seu-bot.onrender.com').replace(/\/$/, '');
    const verifyUrl = `${baseUrl}/verify`;

    const embed = new EmbedBuilder()
      .setColor('#7C3AED')
      .setTitle(`Verificação de Segurança • ${db.config.storeName}`)
      .setDescription(
        `Para liberar acesso completo aos canais do servidor e participar das compras,\n` +
        `clique no botão abaixo para verificar sua conta via **Discord OAuth2**.\n\n` +
        `🔒 *Processo 100% seguro, rápido e criptografado.*`
      )
      .setFooter({ text: 'Protegido por zenCloud' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Verificar Conta').setStyle(ButtonStyle.Link).setURL(verifyUrl)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✓ Painel de verificação postado neste canal!', ephemeral: true });
  }

  // 9. Configurações de Banco / Chave PIX
  if (interaction.isButton() && customId === 'cfg_bank') {
    const b = db.config.bank || {};
    const modal = new ModalBuilder()
      .setCustomId('modal_cfg_bank')
      .setTitle('Configurar Pagamento PIX')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('pix_key').setLabel('Chave PIX (CPF, Email, Tel ou Aleatória)').setValue(b.pixKey || '').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('holder').setLabel('Nome do Titular (Sem acentos)').setValue(b.pixHolderName || 'PRIME GROUP').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('mp_token').setLabel('Access Token Mercado Pago (Opcional)').setValue(b.mpAccessToken || '').setPlaceholder('Deixe vazio para usar Chave PIX direto').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_bank') {
    db.config.bank.pixKey = interaction.fields.getTextInputValue('pix_key').trim();
    db.config.bank.pixHolderName = interaction.fields.getTextInputValue('holder').trim() || 'PRIME GROUP';
    db.config.bank.mpAccessToken = interaction.fields.getTextInputValue('mp_token').trim();
    db.config.bank.configured = Boolean(db.config.bank.pixKey || db.config.bank.mpAccessToken);
    saveDB();
    return interaction.reply({ content: '✓ Configurações bancárias salvas com sucesso!', ephemeral: true });
  }

  // 10. Ações de Produtos
  if (interaction.isStringSelectMenu() && customId === 'store_select_product') {
    const prodId = interaction.values[0];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });
    return interaction.update(buildProductDetailView(product, db));
  }

  if (interaction.isButton() && customId.startsWith('prod_view:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.update(buildProductListView(db));
    return interaction.update(buildProductDetailView(product, db));
  }

  if (interaction.isButton() && customId.startsWith('prod_fields:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });
    return interaction.update(buildManageFieldsView(product));
  }

  if (interaction.isButton() && customId.startsWith('prod_publish:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    const saleMsgPayload = buildProductSaleMessage(product, db);
    const sent = await interaction.channel.send(saleMsgPayload);

    product.publishedMessages = product.publishedMessages || [];
    product.publishedMessages.push({ channelId: sent.channel.id, messageId: sent.id });
    saveDB();

    return interaction.reply({
      content: `✓ O produto **${product.name}** foi colocado à venda neste canal com sucesso!`,
      ephemeral: true
    });
  }

  if (interaction.isButton() && customId.startsWith('prod_sync:')) {
    const prodId = customId.split(':')[1];
    const count = await syncProductMessages(client, prodId);
    return interaction.reply({
      content: `✓ Sincronização concluída! **${count}** mensagem(ns) deste produto foram atualizadas.`,
      ephemeral: true
    });
  }

  return false;
}

module.exports = {
  buildMainPanelView,
  buildStorePanelView,
  buildProductListView,
  buildProductDetailView,
  buildManageFieldsView,
  buildTicketPanelView,
  buildConfigPanelView,
  handlePanelInteraction
};
