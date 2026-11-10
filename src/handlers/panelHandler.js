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
  slugify,
  getAllowedGuilds
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
    `» **Modo de Abertura:** \`${tCfg.openMode || 'Canal Privado'}\``,
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
        { label: 'Gerenciar Funções', value: 'tkt_cfg_manage_fn', description: 'Editar lista de funções de atendimento' },
        { label: 'Modo de Abertura', value: 'tkt_cfg_open_mode', description: `Atual: ${tCfg.openMode || 'Canal Privado'}` },
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
      'Configure os cargos, canais de logs automatizados, dados bancários e servidores autorizados.\n' +
      'Selecione uma das opções abaixo.'
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_roles_view').setLabel('Cargos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_channels_view').setLabel('Canais de Logs').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_bank').setLabel('Setar meu banco').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_servers_view').setLabel('Servidores Autorizados').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildServersConfigView(db, client) {
  const allowed = getAllowedGuilds(db);
  const allowedListStr = allowed.map((id) => {
    const g = client?.guilds?.cache?.get(id);
    return `• \`${id}\` — ${g ? `🟢 **${g.name}**` : '⚪ Autorizado (Aguardando convite)'}`;
  }).join('\n') || '*Nenhum servidor específico listado (modo aberto).*';

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('🛡️ Servidores Autorizados (Bot Privado)')
    .setDescription(
      `Quando o modo privado está ativo, o bot **automaticamente sai** de qualquer servidor que não esteja nesta lista.\n\n` +
      `▪ **Modo Privado:** \`${db.config.isPrivate ? 'Ativado (Protegido)' : 'Desativado (Público)'}\`\n\n` +
      `**Lista de Servidores Permitidos:**\n${allowedListStr}`
    )
    .setFooter({ text: `${db.config.storeName} • Multi-Servidor` });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_servers_add').setLabel('Adicionar Servidor').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cfg_servers_toggle_privacy').setLabel(db.config.isPrivate ? 'Desativar Modo Privado' : 'Ativar Modo Privado').setStyle(db.config.isPrivate ? ButtonStyle.Danger : ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_configuracoes').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
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
      `**Auto-Role de Cliente na Compra:** \`${a.autoRoleCustomer ? 'Ativado' : 'Desativado'}\`\n` +
      `**Cancelamento de Carrinhos Inativos:** \`${a.autoCancelCartMinutes || 58} minutos\``
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('auto_toggle_repost').setLabel(repost.enabled ? 'Desativar Repostagem' : 'Ativar Repostagem').setStyle(repost.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('auto_cfg_repost').setLabel('Configurar Horários Repost').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('auto_toggle_role').setLabel('Alternar Cargo Automático').setStyle(ButtonStyle.Primary),
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

function buildZenProtectView(db) {
  const zp = db.config.zenProtect || {};
  const embed = new EmbedBuilder()
    .setColor('#EF4444')
    .setTitle('zenProtect — Segurança & Anti-Raid')
    .setDescription(
      `Módulo de proteção ativa do servidor.\n\n` +
      `▪ **Anti-Convites (Links Discord):** \`${zp.antiInvite ? 'Ativado' : 'Desativado'}\`\n` +
      `▪ **Modo Anti-Raid (Bloqueio de Entradas):** \`${zp.raidMode ? 'Ativado' : 'Desativado'}\``
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zp_toggle_invite').setLabel(zp.antiInvite ? 'Desativar Anti-Convites' : 'Ativar Anti-Convites').setStyle(zp.antiInvite ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('zp_toggle_raid').setLabel(zp.raidMode ? 'Desativar Anti-Raid' : 'Ativar Anti-Raid').setStyle(zp.raidMode ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildWelcomeView(db) {
  const w = db.config.welcome || {};
  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('Sistema de Boas-Vindas')
    .setDescription(
      `Status: \`${w.enabled ? 'Ativado' : 'Desativado'}\`\n` +
      `Canal: ${db.config.channels?.boasVindasId ? `<#${db.config.channels.boasVindasId}>` : '`Não configurado`'}\n` +
      `Cargo ao Entrar: ${db.config.roles?.autoRoleId ? `<@&${db.config.roles.autoRoleId}>` : '`Não configurado`'}\n\n` +
      `**Mensagem Atual:**\n${w.message || 'Olá {user}, seja bem-vindo(a) ao {server}!'}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('welcome_toggle').setLabel(w.enabled ? 'Desativar' : 'Ativar').setStyle(w.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('welcome_edit').setLabel('Editar Mensagem').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
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

  if (interaction.isButton() && customId === 'cfg_servers_view') {
    return interaction.update(buildServersConfigView(db, client));
  }

  if (interaction.isButton() && customId === 'cfg_servers_toggle_privacy') {
    db.config.isPrivate = !db.config.isPrivate;
    saveDB();
    return interaction.update(buildServersConfigView(db, client));
  }

  if (interaction.isButton() && customId === 'cfg_servers_add') {
    const modal = new ModalBuilder()
      .setCustomId('modal_cfg_servers_add')
      .setTitle('Autorizar Novo Servidor')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('guild_id')
            .setLabel('ID do Servidor (Guild ID)')
            .setPlaceholder('Ex: 1561082680496365579')
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_servers_add') {
    const newId = interaction.fields.getTextInputValue('guild_id').trim();
    if (!/^\d{17,20}$/.test(newId)) {
      return interaction.reply({ content: 'ID de servidor inválido. Copie os dígitos numéricos do ID do servidor no Discord.', ephemeral: true });
    }
    if (!Array.isArray(db.config.allowedGuildIds)) db.config.allowedGuildIds = [];
    if (!db.config.allowedGuildIds.includes(newId)) {
      db.config.allowedGuildIds.push(newId);
    }
    saveDB();
    return interaction.update(buildServersConfigView(db, client));
  }

  if (interaction.isButton() && customId === 'panel_automacoes') {
    return interaction.update(buildAutomationsView(db));
  }

  if (interaction.isButton() && customId === 'panel_zencloud') {
    return interaction.update(buildZenCloudView(db));
  }

  if (interaction.isButton() && customId === 'panel_zenprotect') {
    return interaction.update(buildZenProtectView(db));
  }

  if (interaction.isButton() && customId === 'panel_boas_vindas') {
    return interaction.update(buildWelcomeView(db));
  }

  if (interaction.isButton() && customId === 'welcome_toggle') {
    db.config.welcome.enabled = !db.config.welcome.enabled;
    saveDB();
    return interaction.update(buildWelcomeView(db));
  }

  if (interaction.isButton() && customId === 'welcome_edit') {
    const modal = new ModalBuilder()
      .setCustomId('modal_welcome_edit')
      .setTitle('Editar Boas-Vindas')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('message').setLabel('Mensagem ({user} e {server})').setValue(db.config.welcome?.message || 'Olá {user}, bem-vindo(a) ao {server}!').setRequired(true).setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_welcome_edit') {
    db.config.welcome.message = interaction.fields.getTextInputValue('message').trim();
    saveDB();
    return interaction.update(buildWelcomeView(db));
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

  if (interaction.isModalSubmit() && customId === 'modal_create_giveaway') {
    const prize = interaction.fields.getTextInputValue('prize').trim();
    const minutes = Math.max(1, parseInt(interaction.fields.getTextInputValue('minutes'), 10) || 60);
    const endsAt = Date.now() + minutes * 60_000;
    const gwId = `GW-${Date.now().toString(36).toUpperCase()}`;

    const embed = new EmbedBuilder()
      .setColor('#22C55E')
      .setTitle(`🎉 SORTEIO: ${prize}`)
      .setDescription(`Clique no botão **Participar** abaixo para concorrer!\n\n⏰ **Encerra:** <t:${Math.floor(endsAt / 1000)}:R>\n👤 **Criado por:** <@${interaction.user.id}>\n🎟️ **Participantes:** \`0\``)
      .setFooter({ text: `ID: ${gwId}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_join:${gwId}`).setLabel('Participar (0)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gw_draw:${gwId}`).setLabel('Sortear Agora (Admin)').setStyle(ButtonStyle.Secondary)
    );

    const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
    db.giveaways[gwId] = {
      id: gwId,
      prize,
      endsAt,
      channelId: sent.channel.id,
      messageId: sent.id,
      participants: [],
      ended: false
    };
    saveDB();
    return interaction.reply({ content: `✓ Sorteio de **${prize}** publicado neste canal!`, ephemeral: true });
  }

  if (interaction.isButton() && customId.startsWith('gw_')) {
    const [act, gwId] = customId.split(':');
    const gw = db.giveaways[gwId];
    if (!gw) return interaction.reply({ content: 'Sorteio não encontrado.', ephemeral: true });

    if (act === 'gw_join') {
      if (gw.ended) return interaction.reply({ content: 'Este sorteio já foi encerrado.', ephemeral: true });
      if (gw.participants.includes(interaction.user.id)) {
        return interaction.reply({ content: 'Você já está participando deste sorteio!', ephemeral: true });
      }
      gw.participants.push(interaction.user.id);
      saveDB();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gw_join:${gwId}`).setLabel(`Participar (${gw.participants.length})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gw_draw:${gwId}`).setLabel('Sortear Agora (Admin)').setStyle(ButtonStyle.Secondary)
      );
      await interaction.message.edit({ components: [row] }).catch(() => null);
      return interaction.reply({ content: '🎉 Participação confirmada!', ephemeral: true });
    }

    if (act === 'gw_draw') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Apenas administradores podem sortear.', ephemeral: true });
      }
      gw.ended = true;
      saveDB();
      if (gw.participants.length === 0) {
        return interaction.reply({ content: 'Sorteio encerrado sem participantes.' });
      }
      const winnerId = gw.participants[Math.floor(Math.random() * gw.participants.length)];
      return interaction.reply({
        content: `🎉 **SORTEIO ENCERRADO!**\n🏆 Prêmio: **${gw.prize}**\n👑 Ganhador(a): <@${winnerId}>! Parabéns!`
      });
    }
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

  // 8. zenCloud Postar Painel & Credenciais
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

  if (interaction.isButton() && customId === 'zencloud_cfg_credentials') {
    const z = db.config.zenCloud;
    const modal = new ModalBuilder()
      .setCustomId('modal_zencloud_cfg')
      .setTitle('Credenciais zenCloud OAuth2')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('client_id').setLabel('OAuth2 Client ID').setValue(z.oauthClientId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('client_secret').setLabel('OAuth2 Client Secret').setValue(z.oauthClientSecret || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('auth_token').setLabel('Token do Bot de Auth (Opcional)').setValue(z.authBotToken || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('base_url').setLabel('URL Pública do seu Bot (Render)').setValue(z.baseUrl || '').setPlaceholder('https://seu-bot.onrender.com').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_zencloud_cfg') {
    db.config.zenCloud.oauthClientId = interaction.fields.getTextInputValue('client_id').trim();
    db.config.zenCloud.oauthClientSecret = interaction.fields.getTextInputValue('client_secret').trim();
    db.config.zenCloud.authBotToken = interaction.fields.getTextInputValue('auth_token').trim();
    db.config.zenCloud.baseUrl = interaction.fields.getTextInputValue('base_url').trim();
    saveDB();
    return interaction.update(buildZenCloudView(db));
  }

  if (interaction.isButton() && customId === 'zencloud_pull_members') {
    const verifiedUsers = db.config.zenCloud?.verifiedUsers || [];
    return interaction.reply({
      content: `ℹ️ O banco de dados possui **${verifiedUsers.length}** membros verificados prontos para backup.`,
      ephemeral: true
    });
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

  // 10. Criar Produto e Opções da Loja
  if (interaction.isButton() && customId === 'store_create_product') {
    const modal = new ModalBuilder()
      .setCustomId('modal_create_product')
      .setTitle('Criar Novo Produto')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do Produto').setPlaceholder('Ex: BRMODS').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Descrição detalhada').setPlaceholder('Funções e detalhes do produto...').setRequired(true).setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço inicial (R$)').setValue('10.00').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner (Opcional)').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_create_product') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || 10.0;
    const banner = interaction.fields.getTextInputValue('banner').trim();

    const id = slugify(name);
    db.products[id] = {
      id,
      name,
      description,
      banner,
      color: '#7C3AED',
      autoDelivery: true,
      fields: [
        {
          id: `${id}_24h`,
          name: '24h - Diario',
          days: 1,
          featured: true,
          price,
          stock: []
        }
      ],
      coupons: [],
      publishedMessages: []
    };
    saveDB();
    return interaction.update(buildProductDetailView(db.products[id], db));
  }

  if (interaction.isButton() && customId === 'store_out_of_stock') {
    const outProducts = Object.values(db.products).filter((p) =>
      !p.fields || p.fields.length === 0 || p.fields.some((f) => !f.stock || f.stock.length === 0)
    );
    const listText = outProducts.map((p) => {
      const emptyFields = (p.fields || []).filter((f) => !f.stock || f.stock.length === 0).map((f) => f.name).join(', ');
      return `• **${p.name}** (${emptyFields || 'Sem planos'})`;
    }).join('\n') || '✓ Todos os produtos possuem estoque disponível!';

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#EF4444').setTitle('📦 Produtos Sem Estoque').setDescription(listText)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && customId === 'store_more_options') {
    const choice = interaction.values[0];
    if (choice === 'config_bank') {
      const b = db.config.bank || {};
      const modal = new ModalBuilder()
        .setCustomId('modal_cfg_bank')
        .setTitle('Configurar Pagamento PIX')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('pix_key').setLabel('Chave PIX').setValue(b.pixKey || '').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('holder').setLabel('Titular').setValue(b.pixHolderName || 'PRIME GROUP').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mp_token').setLabel('Token Mercado Pago').setValue(b.mpAccessToken || '').setRequired(false).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }
    if (choice === 'mass_coupon') {
      const modal = new ModalBuilder()
        .setCustomId('modal_mass_coupon')
        .setTitle('Criar Cupom em Massa')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom').setPlaceholder('PRIME15').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discount').setLabel('Porcentagem de Desconto (%)').setValue('15').setRequired(true).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }
    if (choice === 'post_saldo_panel') {
      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle(`Carteira Digital • ${db.config.storeName}`)
        .setDescription('Adicione saldo em sua carteira via **PIX** para realizar compras instantâneas!')
        .setFooter({ text: db.config.storeName });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('public_add_balance_btn').setLabel('Adicionar Saldo via PIX').setStyle(ButtonStyle.Success)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✓ Painel de saldo postado neste canal!', ephemeral: true });
    }
    if (choice === 'post_stock_req') {
      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle(`Solicitar Estoque • ${db.config.storeName}`)
        .setDescription('O item que você queria acabou? Clique abaixo para avisar nossa equipe e pedir reposição!')
        .setFooter({ text: db.config.storeName });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('public_request_stock_btn').setLabel('Solicitar Estoque').setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✓ Painel de reposição de estoque postado!', ephemeral: true });
    }
  }

  if (interaction.isModalSubmit() && customId === 'modal_mass_coupon') {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const discount = Math.min(99, Math.max(1, parseInt(interaction.fields.getTextInputValue('discount'), 10) || 10));
    db.coupons[code] = { code, discountPercent: discount, createdAt: new Date().toISOString() };
    for (const p of Object.values(db.products)) {
      p.coupons = (p.coupons || []).filter((c) => c.code !== code);
      p.coupons.push({ code, discountPercent: discount });
    }
    saveDB();
    return interaction.reply({ content: `✓ Cupom global **${code}** (${discount}% OFF) criado!`, ephemeral: true });
  }

  // 11. Ações de Produtos
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

  if (interaction.isButton() && customId.startsWith('prod_edit:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_prod_edit:${product.id}`)
      .setTitle(`Editar — ${product.name.slice(0, 20)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome').setValue(product.name).setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Descrição').setValue(product.description || '').setRequired(true).setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setValue(product.banner || '').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_prod_edit:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    product.name = interaction.fields.getTextInputValue('name').trim();
    product.description = interaction.fields.getTextInputValue('description').trim();
    product.banner = interaction.fields.getTextInputValue('banner').trim();
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildProductDetailView(product, db));
  }

  if (interaction.isButton() && customId.startsWith('prod_coupons:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_prod_coupon:${product.id}`)
      .setTitle(`Cupom — ${product.name.slice(0, 20)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom').setPlaceholder('PRIME10').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('discount').setLabel('Desconto (%)').setValue('10').setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_prod_coupon:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const discount = Math.min(99, Math.max(1, parseInt(interaction.fields.getTextInputValue('discount'), 10) || 10));

    product.coupons = (product.coupons || []).filter((c) => c.code !== code);
    product.coupons.push({ code, discountPercent: discount });
    saveDB();
    return interaction.update(buildProductDetailView(product, db));
  }

  if (interaction.isButton() && customId.startsWith('prod_delete:')) {
    const prodId = customId.split(':')[1];
    delete db.products[prodId];
    saveDB();
    return interaction.update(buildProductListView(db));
  }

  if (interaction.isButton() && customId.startsWith('field_add:')) {
    const prodId = customId.split(':')[1];
    const modal = new ModalBuilder()
      .setCustomId(`modal_field_add:${prodId}`)
      .setTitle('Adicionar Plano')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do Plano (ex: 30d - Mensal)').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço (R$)').setPlaceholder('50.00').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('stock').setLabel('Estoque Inicial (1 item por linha)').setRequired(false).setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_field_add:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

    const name = interaction.fields.getTextInputValue('name').trim();
    const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || 10.0;
    const rawStock = interaction.fields.getTextInputValue('stock') || '';
    const stockItems = rawStock.split('\n').map((s) => s.trim()).filter(Boolean);

    product.fields.push({
      id: slugify(`${name}_${Date.now().toString(36).slice(-3)}`),
      name,
      price,
      stock: stockItems
    });
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildManageFieldsView(product));
  }

  if (interaction.isStringSelectMenu() && customId.startsWith('field_select:')) {
    const prodId = customId.split(':')[1];
    const fieldId = interaction.values[0];
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!product || !field) return interaction.reply({ content: 'Plano não encontrado.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor('#7C3AED')
      .setTitle(`Plano: ${field.name}`)
      .setDescription(`Preço: \`${formatBRL(field.price)}\`\nEstoque Atual: \`${field.stock?.length || 0} unidades\``);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fitem_stock:${product.id}:${field.id}`).setLabel('Abastecer Estoque').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`fitem_edit:${product.id}:${field.id}`).setLabel('Editar Preço').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fitem_del:${product.id}:${field.id}`).setLabel('Excluir').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`prod_fields:${product.id}`).setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId.startsWith('fitem_stock:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: 'Plano não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_fitem_stock:${prodId}:${fieldId}`)
      .setTitle(`Estoque — ${field.name.slice(0, 20)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('stock_lines')
            .setLabel('Itens (1 key/conta por linha)')
            .setValue((field.stock || []).join('\n').slice(0, 3900))
            .setRequired(false)
            .setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_fitem_stock:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: 'Plano não encontrado.', ephemeral: true });

    const lines = interaction.fields.getTextInputValue('stock_lines') || '';
    field.stock = lines.split('\n').map((s) => s.trim()).filter(Boolean);
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildProductDetailView(product, db));
  }

  if (interaction.isButton() && customId.startsWith('fitem_edit:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: 'Plano não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_fitem_edit:${prodId}:${fieldId}`)
      .setTitle('Editar Preço do Plano')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome').setValue(field.name).setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço (R$)').setValue(String(field.price)).setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_fitem_edit:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: 'Plano não encontrado.', ephemeral: true });

    field.name = interaction.fields.getTextInputValue('name').trim();
    field.price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || field.price;
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildManageFieldsView(product));
  }

  if (interaction.isButton() && customId.startsWith('fitem_del:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });
    product.fields = (product.fields || []).filter((f) => f.id !== fieldId);
    saveDB();
    await syncProductMessages(client, product.id);
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

  // 12. Configuração de Tickets
  if (interaction.isStringSelectMenu() && customId === 'ticket_config_select') {
    const opt = interaction.values[0];

    if (opt === 'tkt_cfg_open_mode') {
      db.tickets.config.openMode =
        db.tickets.config.openMode === 'Thread Privada' ? 'Canal Privado' : 'Thread Privada';
      saveDB();
      return interaction.update(buildTicketPanelView(db));
    }

    if (opt === 'tkt_cfg_appearance') {
      const tCfg = db.tickets.config;
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_appearance')
        .setTitle('Aparência dos Tickets')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('title').setLabel('Título').setValue(tCfg.title || 'Central de Atendimento').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Descrição').setValue(tCfg.description || '').setRequired(true).setStyle(TextInputStyle.Paragraph)
          )
        );
      return interaction.showModal(modal);
    }

    if (opt === 'tkt_cfg_add_fn') {
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_add_fn')
        .setTitle('Nova Função de Atendimento')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Nome (ex: Financeiro, Suporte)').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('desc').setLabel('Descrição curta').setRequired(false).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (opt === 'tkt_cfg_manage_fn') {
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_manage_fn')
        .setTitle('Funções (1 por linha)')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('lines')
              .setLabel('Nomes das Funções (1 por linha)')
              .setValue((db.tickets.config.functions || []).map((f) => f.name).join('\n'))
              .setRequired(true)
              .setStyle(TextInputStyle.Paragraph)
          )
        );
      return interaction.showModal(modal);
    }

    if (opt === 'tkt_cfg_schedule') {
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_schedule')
        .setTitle('Horários de Atendimento')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('schedule').setLabel('Horário').setValue(db.tickets.config.schedule || '24 horas').setRequired(true).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_appearance') {
    db.tickets.config.title = interaction.fields.getTextInputValue('title').trim();
    db.tickets.config.description = interaction.fields.getTextInputValue('description').trim();
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_add_fn') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const desc = interaction.fields.getTextInputValue('desc').trim() || `Atendimento: ${name}`;
    db.tickets.config.functions.push({ id: slugify(name), name, description: desc });
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_manage_fn') {
    const lines = interaction.fields.getTextInputValue('lines').split('\n').map((s) => s.trim()).filter(Boolean);
    db.tickets.config.functions = lines.map((name) => ({ id: slugify(name), name, description: `Atendimento: ${name}` }));
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_schedule') {
    db.tickets.config.schedule = interaction.fields.getTextInputValue('schedule').trim();
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isButton() && customId === 'tkt_panel_post') {
    const payload = buildPublicTicketMessage(db);
    const sent = await interaction.channel.send(payload);
    db.tickets.config.publishedMessages = db.tickets.config.publishedMessages || [];
    db.tickets.config.publishedMessages.push({ channelId: sent.channel.id, messageId: sent.id });
    saveDB();
    return interaction.reply({ content: '✓ Painel de Tickets publicado neste canal!', ephemeral: true });
  }

  if (interaction.isButton() && customId === 'tkt_panel_sync') {
    const count = await syncTicketMessages(client);
    return interaction.reply({ content: `✓ **${count}** mensagem(ns) de ticket sincronizada(s)!`, ephemeral: true });
  }

  // 13. zenProtect
  if (interaction.isButton() && customId === 'zp_toggle_invite') {
    db.config.zenProtect.antiInvite = !db.config.zenProtect.antiInvite;
    saveDB();
    return interaction.update(buildZenProtectView(db));
  }

  if (interaction.isButton() && customId === 'zp_toggle_raid') {
    db.config.zenProtect.raidMode = !db.config.zenProtect.raidMode;
    saveDB();
    return interaction.update(buildZenProtectView(db));
  }

  // 14. Automações
  if (interaction.isButton() && customId === 'auto_toggle_repost') {
    db.config.automations.productRepost.enabled = !db.config.automations.productRepost.enabled;
    saveDB();
    return interaction.update(buildAutomationsView(db));
  }

  if (interaction.isButton() && customId === 'auto_toggle_role') {
    db.config.automations.autoRoleCustomer = !db.config.automations.autoRoleCustomer;
    saveDB();
    return interaction.update(buildAutomationsView(db));
  }

  if (interaction.isButton() && customId === 'auto_cfg_repost') {
    const repost = db.config.automations.productRepost;
    const modal = new ModalBuilder()
      .setCustomId('modal_cfg_repost')
      .setTitle('Configurar Repostagem')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('interval').setLabel('Intervalo em Minutos').setValue(String(repost.intervalMinutes || 180)).setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('hours').setLabel('Horários Fixos (ex: 12:00, 18:00)').setValue(repost.fixedHours || '12:00, 18:00, 22:00').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_repost') {
    const interval = parseInt(interaction.fields.getTextInputValue('interval'), 10) || 180;
    const hours = interaction.fields.getTextInputValue('hours').trim();
    db.config.automations.productRepost.intervalMinutes = interval;
    db.config.automations.productRepost.fixedHours = hours;
    db.config.automations.productRepost.enabled = true;
    saveDB();
    return interaction.update(buildAutomationsView(db));
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
