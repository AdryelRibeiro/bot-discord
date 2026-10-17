const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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
 * 1. TELA PRINCIPAL DO /panel (Idêntica à Print 1)
 */
function buildMainPanelView(db) {
  const embed = new EmbedBuilder()
    .setColor(db.config.color || '#2B2D31');

  if (db.config.mainBanner && db.config.mainBanner.startsWith('http')) {
    embed.setImage(db.config.mainBanner);
  } else {
    embed.setTitle(`⚡ ${db.config.storeName} — Painel de Controle`);
    embed.setDescription('Selecione abaixo o módulo que deseja gerenciar.');
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_minha_loja').setLabel('Minha loja').setEmoji('🏪').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_ticket').setLabel('Ticket').setEmoji('🎧').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_boas_vindas').setLabel('Boas-Vindas').setEmoji('👋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_automacoes').setLabel('Automações').setEmoji('🔄').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_customizar').setLabel('Customizar').setEmoji('🖌️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_zencloud').setLabel('zenCloud').setEmoji('☁️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_extrato').setLabel('Extrato').setEmoji('🧾').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_configuracoes').setLabel('Configurações').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_zenprotect').setLabel('zenProtect').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * 2. TELA "PAINEL DA LOJA" (Idêntica à Print 2)
 */
function buildStorePanelView(db, username) {
  const productCount = Object.keys(db.products || {}).length;
  const bankStatus = db.config.bank?.configured || db.config.bank?.pixKey
    ? '`🟢 Configurado`'
    : '`🔴 Não configurado`';

  const embed = new EmbedBuilder()
    .setColor('#2B2D31')
    .setAuthor({ name: db.config.brandName || 'zenSallers' })
    .setTitle('Painel da Loja')
    .setDescription(`Senhor(a) **${username}**, escolha o que deseja fazer.`)
    .addFields(
      { name: 'Total criados', value: `\`${productCount}x Produtos\``, inline: false },
      { name: 'Saldo (Efí Bank / PIX)', value: bankStatus, inline: true },
      { name: 'Moeda Padrão', value: `\`${db.config.currency || 'BRL'}\` - \`${db.config.locale || 'pt_BR'}\``, inline: true }
    )
    .setFooter({ text: `${db.config.storeName}` })
    .setTimestamp();

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('store_create_product').setLabel('Criar produto').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('store_list_products').setLabel('Produtos').setEmoji('✏️').setStyle(ButtonStyle.Primary)
  );

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('store_more_options')
      .setPlaceholder('↪️ Mais opções da loja...')
      .addOptions([
        { label: 'Criar Cupom em Massa', value: 'mass_coupon', description: 'Cria um cupom válido para todos os produtos', emoji: '🏷️' },
        { label: 'Postar Painel de Saldo', value: 'post_saldo_panel', description: 'Envia o painel público de recarga de carteira neste canal', emoji: '💰' },
        { label: 'Postar Painel Solicitar Estoque', value: 'post_stock_req', description: 'Envia painel para membros pedirem reposição', emoji: '📦' },
        { label: 'Configurar Banco / Chave PIX', value: 'config_bank', description: 'Defina sua Chave PIX ou Token Mercado Pago', emoji: '👛' }
      ])
  );

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowButtons, rowSelect, rowBack] };
}

/**
 * 3. TELA DE SELEÇÃO DE PRODUTOS (Idêntica à Print 3)
 */
function buildProductListView(db) {
  const products = Object.values(db.products || {});

  const embed = new EmbedBuilder()
    .setColor('#2B2D31')
    .setAuthor({ name: db.config.brandName || 'zenSallers' })
    .setTitle('✏️ Gerenciar Produtos')
    .setDescription(`Selecione um dos **${products.length}** produtos cadastrados no menu abaixo para editar campos, estoque, cupons ou colocar à venda.`)
    .setFooter({ text: db.config.storeName })
    .setTimestamp();

  const components = [];

  if (products.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('store_select_product')
      .setPlaceholder('[1] Clique aqui para selecionar')
      .addOptions(
        products.slice(0, 25).map((p) => ({
          label: p.name.slice(0, 100),
          value: p.id,
          description: (p.description || 'Não definido').replace(/\n+/g, ' ').slice(0, 95),
          emoji: '🛠️'
        }))
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }

  const rowNoStock = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('store_out_of_stock')
      .setLabel('Produtos s/ estoque')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Danger)
  );
  components.push(rowNoStock);

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_minha_loja').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );
  components.push(rowBack);

  return { embeds: [embed], components };
}

/**
 * 4. TELA DE DETALHES DO PRODUTO (Idêntica à Print 4 - Ex: Prime Extremer)
 */
function buildProductDetailView(product, db) {
  const fieldsLines = (product.fields || []).map((f) => {
    const stockCount = Array.isArray(f.stock) ? f.stock.length : 0;
    return `**${f.name}**\n\`📦 ${stockCount}\` • \`💰 ${formatBRL(f.price)}\``;
  }).join('\n') || '*Nenhum campo criado ainda*';

  const couponsLines = (product.coupons && product.coupons.length > 0)
    ? product.coupons.map((c) => `\`${c.code}\` (-${c.discountPercent}%)`).join(', ')
    : 'Nenhum cupom cadastrado';

  const desc = [
    '**Detalhes**',
    '',
    '✔️ **Campos**',
    '',
    fieldsLines,
    '',
    '🔖 **Cupons**',
    '',
    couponsLines,
    '',
    '**Entrega automática**',
    product.autoDelivery ? '`✅ Sim`' : '`❌ Não`'
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(product.color || '#2B2D31')
    .setAuthor({ name: product.name })
    .setDescription(desc)
    .setFooter({ text: `Produtos ➜ ${product.name}` })
    .setTimestamp();

  if (product.banner && product.banner.startsWith('http')) {
    embed.setImage(product.banner);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_edit:${product.id}`).setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`prod_fields:${product.id}`).setLabel('Gerenciar campos').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`prod_coupons:${product.id}`).setLabel('Gerenciar cupons').setEmoji('🏷️').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_publish:${product.id}`).setLabel('Colocar a venda').setEmoji('✔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`prod_delete:${product.id}`).setLabel('Excluir Produto').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prod_sync:${product.id}`).setLabel('Sincronizar Produto').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('store_list_products').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * 4.1 SUB-TELA DE GERENCIAR CAMPOS E ESTOQUE DE UM PRODUTO
 */
function buildManageFieldsView(product) {
  const fieldsText = (product.fields || []).map((f, idx) => {
    const count = Array.isArray(f.stock) ? f.stock.length : 0;
    return `**${idx + 1}. ${f.name}** — \`${formatBRL(f.price)}\` | Estoque: \`${count} itens\``;
  }).join('\n') || '*Nenhum campo cadastrado.*';

  const embed = new EmbedBuilder()
    .setColor('#3B82F6')
    .setTitle(`📋 Gerenciar Campos — ${product.name}`)
    .setDescription(`Adicione novas variações (ex: *1 Dia, 7 Dias, 30 Dias, Lifetime*) ou selecione um campo abaixo para abastecer o estoque.\n\n${fieldsText}`);

  const components = [];

  if (product.fields && product.fields.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`field_select:${product.id}`)
      .setPlaceholder('📦 Selecione um campo para adicionar estoque ou editar...')
      .addOptions(
        product.fields.slice(0, 25).map((f) => ({
          label: f.name.slice(0, 100),
          value: f.id,
          description: `Preço: ${formatBRL(f.price)} | Estoque: ${f.stock?.length || 0}`,
          emoji: '📦'
        }))
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }

  const rowBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`field_add:${product.id}`).setLabel('Novo Campo / Variação').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`prod_view:${product.id}`).setLabel('‹ Voltar ao Produto').setStyle(ButtonStyle.Secondary)
  );
  components.push(rowBtns);

  return { embeds: [embed], components };
}

/**
 * 5. TELA DO SISTEMA DE TICKETS (Idêntica às Prints 5 e 6)
 */
function buildTicketPanelView(db) {
  const tCfg = db.tickets.config;
  const fns = tCfg.functions || [];
  const fnLines = fns.map((f) => `${f.emoji || '📋'} ${f.name}`).join('\n') || '*Nenhuma função criada*';

  const desc = [
    'Configure e gerencie o sistema de tickets do seu servidor.',
    '',
    `» **Status:** ${tCfg.enabled ? '✔️ `Configurado`' : '❌ `Desativado`'}`,
    `» **Funções:** \`${fns.length}x configuradas\``,
    `» **Modo de Abertura:** \`💬 ${tCfg.openMode || 'Thread Privada'}\``,
    `» **Modo de Mensagem:** \`📋 ${tCfg.messageMode || 'Embed Clássico'}\``,
    `» **Horários:** \`🟢 ${tCfg.schedule || '24 horas'}\``,
    '',
    fnLines,
    '',
    'Selecione uma opção no menu abaixo para configurar.'
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(tCfg.color || '#1D4ED8')
    .setAuthor({ name: db.config.brandName || 'zenSallers' })
    .setTitle('Sistema de Tickets')
    .setDescription(desc)
    .setFooter({ text: `${db.config.storeName} • Tickets` })
    .setTimestamp();

  if (tCfg.banner && tCfg.banner.startsWith('http')) {
    embed.setImage(tCfg.banner);
  }

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_config_select')
      .setPlaceholder('Selecione uma opção para configurar')
      .addOptions([
        {
          label: 'Configurar Aparência',
          value: 'tkt_cfg_appearance',
          description: 'Título, descrição, cor e banner da mensagem'
        },
        {
          label: 'Adicionar Função',
          value: 'tkt_cfg_add_fn',
          description: 'Criar uma nova função de atendimento',
          emoji: '➕'
        },
        {
          label: 'Gerenciar Funções',
          value: 'tkt_cfg_manage_fn',
          description: `Editar ou remover funções existentes (${fns.length}x)`,
          emoji: '📋'
        },
        {
          label: 'Modo de Abertura',
          value: 'tkt_cfg_open_mode',
          description: `Atual: ${tCfg.openMode || 'Thread Privada'}`
        },
        {
          label: 'Configurar Horários',
          value: 'tkt_cfg_schedule',
          description: `Horários de atendimento (${tCfg.schedule || '24 horas'})`
        }
      ])
  );

  const rowActions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_panel_sync').setLabel('Sincronizar Mensagens').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkt_panel_post').setLabel('Postar Mensagem').setEmoji('✔️').setStyle(ButtonStyle.Success)
  );

  const rowBottom = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_panel_preview').setLabel('Preview').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkt_panel_help').setLabel('Ajuda').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowSelect, rowActions, rowBottom] };
}

/**
 * 6. TELA DE CONFIGURAÇÕES (Idêntica à Print 7)
 */
function buildConfigPanelView(db) {
  const embed = new EmbedBuilder()
    .setColor('#2B2D31')
    .setDescription('**» O que precisa configurar?**');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_roles').setLabel('Cargos').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_channels').setLabel('Canais').setEmoji('#️⃣').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_bank').setLabel('Setar meu banco').setEmoji('👛').setStyle(ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * Handler central de todas as interações do /panel
 */
async function handlePanelInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // Voltar ao menu principal
  if (interaction.isButton() && customId === 'panel_back_main') {
    return interaction.update(buildMainPanelView(db));
  }

  // Abrir "Minha loja"
  if (interaction.isButton() && customId === 'panel_minha_loja') {
    return interaction.update(buildStorePanelView(db, interaction.user.username));
  }

  // Abrir "Produtos" (lista de seleção)
  if (interaction.isButton() && customId === 'store_list_products') {
    return interaction.update(buildProductListView(db));
  }

  // Botão "Produtos s/ estoque"
  if (interaction.isButton() && customId === 'store_out_of_stock') {
    const outProducts = Object.values(db.products).filter((p) =>
      !p.fields || p.fields.length === 0 || p.fields.some((f) => !f.stock || f.stock.length === 0)
    );
    const listText = outProducts.map((p) => {
      const emptyFields = (p.fields || []).filter((f) => !f.stock || f.stock.length === 0).map((f) => f.name).join(', ');
      return `• **${p.name}** (${emptyFields || 'Sem campos'})`;
    }).join('\n') || '✅ Todos os produtos possuem estoque disponível!';

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('📦 Produtos ou Campos Sem Estoque')
          .setDescription(listText)
      ],
      ephemeral: true
    });
  }

  // Botão "Criar produto"
  if (interaction.isButton() && customId === 'store_create_product') {
    const modal = new ModalBuilder()
      .setCustomId('modal_create_product')
      .setTitle('➕ Criar Novo Produto')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do Produto').setPlaceholder('Ex: Prime Extremer').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Descrição do Produto').setPlaceholder('Descreva as funções e detalhes...').setRequired(true).setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço do Campo Padrão (R$)').setPlaceholder('Ex: 25.00').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner (Opcional)').setPlaceholder('https://...').setRequired(false).setStyle(TextInputStyle.Short)
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
      color: '#5865F2',
      autoDelivery: true,
      fields: [
        {
          id: `${id}_padrao`,
          name: `${name.toUpperCase()} PADRÃO`,
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

  // Mais opções da loja (Select Menu)
  if (interaction.isStringSelectMenu() && customId === 'store_more_options') {
    const choice = interaction.values[0];
    if (choice === 'config_bank') {
      return showBankModal(interaction, db);
    }
    if (choice === 'post_saldo_panel') {
      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle(`💰 Carteira Digital — ${db.config.storeName}`)
        .setDescription('Adicione saldo em sua carteira via **PIX** e compre qualquer produto da loja com 1 clique!')
        .setFooter({ text: db.config.storeName });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('public_add_balance_btn').setLabel('Adicionar Saldo').setEmoji('💳').setStyle(ButtonStyle.Success)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Painel público de saldo postado neste canal!', ephemeral: true });
    }
    if (choice === 'post_stock_req') {
      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle(`📦 Central de Estoque — ${db.config.storeName}`)
        .setDescription('Procurando algum produto esgotado? Clique no botão abaixo para solicitar reposição diretamente à nossa equipe!')
        .setFooter({ text: db.config.storeName });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('public_request_stock_btn').setLabel('Solicitar Estoque').setEmoji('🔔').setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Painel de solicitação de estoque enviado!', ephemeral: true });
    }
    if (choice === 'mass_coupon') {
      const modal = new ModalBuilder()
        .setCustomId('modal_mass_coupon')
        .setTitle('🏷️ Criar Cupom em Massa')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom').setPlaceholder('Ex: PRIME20').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discount').setLabel('Porcentagem de Desconto (%)').setPlaceholder('Ex: 20').setRequired(true).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit() && customId === 'modal_mass_coupon') {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const discountPercent = Math.min(99, Math.max(1, parseInt(interaction.fields.getTextInputValue('discount'), 10) || 10));
    db.coupons[code] = { code, discountPercent, createdAt: new Date().toISOString() };
    for (const prod of Object.values(db.products)) {
      prod.coupons = (prod.coupons || []).filter((c) => c.code !== code);
      prod.coupons.push({ code, discountPercent });
    }
    saveDB();
    return interaction.reply({ content: `✅ Cupom global **${code}** (${discountPercent}% OFF) adicionado a todos os produtos!`, ephemeral: true });
  }

  // Selecionar um produto na lista
  if (interaction.isStringSelectMenu() && customId === 'store_select_product') {
    const prodId = interaction.values[0];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
    return interaction.update(buildProductDetailView(product, db));
  }

  // Voltar para detalhes de um produto
  if (interaction.isButton() && customId.startsWith('prod_view:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.update(buildProductListView(db));
    return interaction.update(buildProductDetailView(product, db));
  }

  // Editar Produto (Nome, Descrição, Banner, Entrega Automática)
  if (interaction.isButton() && customId.startsWith('prod_edit:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_prod_edit:${product.id}`)
      .setTitle(`✏️ Editar — ${product.name.slice(0, 25)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do Produto').setValue(product.name).setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Descrição').setValue(product.description || '').setRequired(true).setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner').setValue(product.banner || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('auto').setLabel('Entrega Automática? (sim / nao)').setValue(product.autoDelivery ? 'sim' : 'nao').setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_prod_edit:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    product.name = interaction.fields.getTextInputValue('name').trim();
    product.description = interaction.fields.getTextInputValue('description').trim();
    product.banner = interaction.fields.getTextInputValue('banner').trim();
    const autoText = interaction.fields.getTextInputValue('auto').trim().toLowerCase();
    product.autoDelivery = autoText !== 'nao' && autoText !== 'não' && autoText !== 'false';
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildProductDetailView(product, db));
  }

  // Gerenciar campos do produto
  if (interaction.isButton() && customId.startsWith('prod_fields:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
    return interaction.update(buildManageFieldsView(product));
  }

  // Adicionar Novo Campo/Variação ao produto
  if (interaction.isButton() && customId.startsWith('field_add:')) {
    const prodId = customId.split(':')[1];
    const modal = new ModalBuilder()
      .setCustomId(`modal_field_add:${prodId}`)
      .setTitle('➕ Adicionar Campo / Variação')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome da Variação (ex: EXTREMER 30 DIAS)').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço em R$ (ex: 50.00)').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('stock').setLabel('Estoque Inicial (1 key/conta por linha)').setPlaceholder('KEY-001\nKEY-002').setRequired(false).setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_field_add:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

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

  // Selecionar um Campo para abastecer estoque ou editar
  if (interaction.isStringSelectMenu() && customId.startsWith('field_select:')) {
    const prodId = customId.split(':')[1];
    const fieldId = interaction.values[0];
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!product || !field) return interaction.reply({ content: '❌ Campo não encontrado.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor('#22C55E')
      .setTitle(`📦 Campo: ${field.name}`)
      .setDescription(`**Produto:** ${product.name}\n**Preço Atual:** \`${formatBRL(field.price)}\`\n**Estoque Disponível:** \`${field.stock?.length || 0} unidades\``);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fitem_stock:${product.id}:${field.id}`).setLabel('Adicionar / Editar Estoque').setEmoji('📦').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`fitem_edit:${product.id}:${field.id}`).setLabel('Editar Nome/Preço').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fitem_del:${product.id}:${field.id}`).setLabel('Excluir Campo').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`prod_fields:${product.id}`).setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [row] });
  }

  // Abastecer Estoque do Campo
  if (interaction.isButton() && customId.startsWith('fitem_stock:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: '❌ Campo não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_fitem_stock:${prodId}:${fieldId}`)
      .setTitle(`📦 Estoque — ${field.name.slice(0, 22)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('stock_lines')
            .setLabel('Itens do Estoque (1 key ou conta por linha)')
            .setValue((field.stock || []).join('\n').slice(0, 3900))
            .setPlaceholder('KEY-001\nKEY-002\nlogin:senha')
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
    if (!field) return interaction.reply({ content: '❌ Campo não encontrado.', ephemeral: true });

    const lines = interaction.fields.getTextInputValue('stock_lines') || '';
    field.stock = lines.split('\n').map((s) => s.trim()).filter(Boolean);
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildProductDetailView(product, db));
  }

  // Editar nome/preço do Campo
  if (interaction.isButton() && customId.startsWith('fitem_edit:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    const field = product?.fields?.find((f) => f.id === fieldId);
    if (!field) return interaction.reply({ content: '❌ Campo não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_fitem_edit:${prodId}:${fieldId}`)
      .setTitle('✏️ Editar Campo')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do Campo').setValue(field.name).setRequired(true).setStyle(TextInputStyle.Short)
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
    if (!field) return interaction.reply({ content: '❌ Campo não encontrado.', ephemeral: true });

    field.name = interaction.fields.getTextInputValue('name').trim();
    field.price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || field.price;
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildManageFieldsView(product));
  }

  // Excluir Campo
  if (interaction.isButton() && customId.startsWith('fitem_del:')) {
    const [, prodId, fieldId] = customId.split(':');
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
    product.fields = (product.fields || []).filter((f) => f.id !== fieldId);
    saveDB();
    await syncProductMessages(client, product.id);
    return interaction.update(buildManageFieldsView(product));
  }

  // Gerenciar Cupons do Produto
  if (interaction.isButton() && customId.startsWith('prod_coupons:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`modal_prod_coupon:${product.id}`)
      .setTitle(`🏷️ Cupom — ${product.name.slice(0, 22)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom (ou LIMPAR para apagar)').setPlaceholder('Ex: EXTREMER15').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('discount').setLabel('Desconto em % (1 a 99)').setPlaceholder('Ex: 15').setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_prod_coupon:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const discountPercent = Math.min(99, Math.max(1, parseInt(interaction.fields.getTextInputValue('discount'), 10) || 10));

    if (code === 'LIMPAR') {
      product.coupons = [];
    } else {
      product.coupons = (product.coupons || []).filter((c) => c.code !== code);
      product.coupons.push({ code, discountPercent });
    }
    saveDB();
    return interaction.update(buildProductDetailView(product, db));
  }

  // Colocar Produto à Venda no canal atual
  if (interaction.isButton() && customId.startsWith('prod_publish:')) {
    const prodId = customId.split(':')[1];
    const product = db.products[prodId];
    if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    const saleMsgPayload = buildProductSaleMessage(product, db);
    const sent = await interaction.channel.send(saleMsgPayload);

    product.publishedMessages = product.publishedMessages || [];
    product.publishedMessages.push({ channelId: sent.channel.id, messageId: sent.id });
    saveDB();

    return interaction.reply({
      content: `✅ O produto **${product.name}** foi colocado à venda neste canal com sucesso!`,
      ephemeral: true
    });
  }

  // Sincronizar Produto
  if (interaction.isButton() && customId.startsWith('prod_sync:')) {
    const prodId = customId.split(':')[1];
    const count = await syncProductMessages(client, prodId);
    return interaction.reply({
      content: `🔄 Sincronização concluída! **${count}** mensagem(ns) pública(s) deste produto foram atualizadas.`,
      ephemeral: true
    });
  }

  // Excluir Produto
  if (interaction.isButton() && customId.startsWith('prod_delete:')) {
    const prodId = customId.split(':')[1];
    delete db.products[prodId];
    saveDB();
    return interaction.update(buildProductListView(db));
  }

  // =========================================================================
  // MÓDULO DE TICKETS (Prints 5 e 6)
  // =========================================================================
  if (interaction.isButton() && customId === 'panel_ticket') {
    return interaction.update(buildTicketPanelView(db));
  }

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
        .setTitle('🎨 Configurar Aparência dos Tickets')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('title').setLabel('Título da Mensagem').setValue(tCfg.title || '').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Descrição').setValue(tCfg.description || '').setRequired(true).setStyle(TextInputStyle.Paragraph)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('color').setLabel('Cor Hexadecimal').setValue(tCfg.color || '#1D4ED8').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner').setValue(tCfg.banner || '').setRequired(false).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (opt === 'tkt_cfg_add_fn') {
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_add_fn')
        .setTitle('➕ Adicionar Função de Ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Nome da Função (ex: Suporte, Financeiro)').setRequired(true).setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('desc').setLabel('Descrição curta').setPlaceholder('Descreva para que serve esta categoria').setRequired(false).setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (opt === 'tkt_cfg_manage_fn') {
      const modal = new ModalBuilder()
        .setCustomId('modal_tkt_manage_fn')
        .setTitle('📋 Gerenciar Funções (1 por linha)')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('lines')
              .setLabel('Funções de Atendimento (1 por linha)')
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
        .setTitle('🕒 Configurar Horários de Atendimento')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('schedule')
              .setLabel('Horário exibido no painel')
              .setValue(db.tickets.config.schedule || '24 horas')
              .setPlaceholder('Ex: 24 horas ou Seg a Sex 09h às 22h')
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_appearance') {
    db.tickets.config.title = interaction.fields.getTextInputValue('title').trim();
    db.tickets.config.description = interaction.fields.getTextInputValue('description').trim();
    db.tickets.config.color = interaction.fields.getTextInputValue('color').trim() || '#1D4ED8';
    db.tickets.config.banner = interaction.fields.getTextInputValue('banner').trim();
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_add_fn') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('desc').trim() || `Atendimento para ${name}`;
    db.tickets.config.functions.push({
      id: slugify(name),
      name,
      emoji: '📋',
      description
    });
    saveDB();
    return interaction.update(buildTicketPanelView(db));
  }

  if (interaction.isModalSubmit() && customId === 'modal_tkt_manage_fn') {
    const lines = interaction.fields.getTextInputValue('lines').split('\n').map((s) => s.trim()).filter(Boolean);
    db.tickets.config.functions = lines.map((name) => ({
      id: slugify(name),
      name,
      emoji: '📋',
      description: `Atendimento: ${name}`
    }));
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
    return interaction.reply({ content: '✅ Painel de Tickets publicado neste canal com sucesso!', ephemeral: true });
  }

  if (interaction.isButton() && customId === 'tkt_panel_sync') {
    const count = await syncTicketMessages(client);
    return interaction.reply({ content: `🔄 **${count}** mensagem(ns) de ticket foram sincronizadas!`, ephemeral: true });
  }

  if (interaction.isButton() && customId === 'tkt_panel_preview') {
    const payload = buildPublicTicketMessage(db);
    return interaction.reply({ content: '👁️ **Preview do Painel de Tickets:**', ...payload, ephemeral: true });
  }

  if (interaction.isButton() && customId === 'tkt_panel_help') {
    return interaction.reply({
      content: 'ℹ️ **Como usar o Sistema de Tickets:**\n1. Use o menu para adicionar/editar categorias (ex: *Suporte, Receber Key*).\n2. Escolha entre **Thread Privada** ou **Canal Privado**.\n3. Clique em **✔️ Postar Mensagem** no canal onde deseja que os membros abram tickets!',
      ephemeral: true
    });
  }

  // =========================================================================
  // MÓDULO DE CONFIGURAÇÕES (Print 7: Cargos, Canais, Setar meu banco)
  // =========================================================================
  if (interaction.isButton() && customId === 'panel_configuracoes') {
    return interaction.update(buildConfigPanelView(db));
  }

  if (interaction.isButton() && customId === 'cfg_bank') {
    return showBankModal(interaction, db);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_bank') {
    const pixKey = interaction.fields.getTextInputValue('pix_key').trim();
    const holder = interaction.fields.getTextInputValue('holder').trim() || 'PRIME STORE';
    const mpToken = interaction.fields.getTextInputValue('mp_token').trim();

    db.config.bank.pixKey = pixKey;
    db.config.bank.pixHolderName = holder;
    db.config.bank.mpAccessToken = mpToken;
    db.config.bank.configured = Boolean(pixKey || mpToken);
    saveDB();

    return interaction.reply({
      content: `✅ Configurações bancárias salvas com sucesso!\n• **Chave PIX:** \`${pixKey || 'Não definida'}\`\n• **Titular:** \`${holder}\`\n• **Mercado Pago Token:** \`${mpToken ? 'Configurado (Automático)' : 'Não definido (Usando PIX EMV)'}\``,
      ephemeral: true
    });
  }

  if (interaction.isButton() && customId === 'cfg_roles') {
    const r = db.config.roles;
    const modal = new ModalBuilder()
      .setCustomId('modal_cfg_roles')
      .setTitle('🏷️ Configurar IDs dos Cargos')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('admin').setLabel('ID do Cargo Admin').setValue(r.adminRoleId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('staff').setLabel('ID do Cargo Staff / Suporte').setValue(r.staffRoleId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('customer').setLabel('ID do Cargo Cliente (Ao Comprar)').setValue(r.customerRoleId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('autorole').setLabel('ID do Cargo Automático (Ao Entrar)').setValue(r.autoRoleId || '').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_roles') {
    db.config.roles.adminRoleId = interaction.fields.getTextInputValue('admin').trim();
    db.config.roles.staffRoleId = interaction.fields.getTextInputValue('staff').trim();
    db.config.roles.customerRoleId = interaction.fields.getTextInputValue('customer').trim();
    db.config.roles.autoRoleId = interaction.fields.getTextInputValue('autorole').trim();
    saveDB();
    return interaction.reply({ content: '✅ Cargos atualizados com sucesso!', ephemeral: true });
  }

  if (interaction.isButton() && customId === 'cfg_channels') {
    const c = db.config.channels;
    const modal = new ModalBuilder()
      .setCustomId('modal_cfg_channels')
      .setTitle('#️⃣ Configurar IDs dos Canais')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('vendas').setLabel('ID do Canal de Logs de Vendas').setValue(c.logsVendasId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tickets').setLabel('ID do Canal de Logs de Tickets').setValue(c.logsTicketsId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('boasvindas').setLabel('ID do Canal de Boas-Vindas').setValue(c.boasVindasId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('feedback').setLabel('ID do Canal de Feedback / Avaliações').setValue(c.feedbackId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('estoque').setLabel('ID do Canal de Solicitação de Estoque').setValue(c.solicitacaoEstoqueId || '').setRequired(false).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_cfg_channels') {
    db.config.channels.logsVendasId = interaction.fields.getTextInputValue('vendas').trim();
    db.config.channels.logsTicketsId = interaction.fields.getTextInputValue('tickets').trim();
    db.config.channels.boasVindasId = interaction.fields.getTextInputValue('boasvindas').trim();
    db.config.channels.feedbackId = interaction.fields.getTextInputValue('feedback').trim();
    db.config.channels.solicitacaoEstoqueId = interaction.fields.getTextInputValue('estoque').trim();
    saveDB();
    return interaction.reply({ content: '✅ Canais do sistema configurados com sucesso!', ephemeral: true });
  }

  // =========================================================================
  // DEMAIS MÓDULOS DO PAINEL PRINCIPAL (Boas-vindas, Automações, Customizar, zenCloud, Extrato, Giveaway, zenProtect)
  // =========================================================================

  // BOAS-VINDAS
  if (interaction.isButton() && customId === 'panel_boas_vindas') {
    const w = db.config.welcome;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('👋 Sistema de Boas-Vindas')
      .setDescription(`Status: ${w.enabled ? '`🟢 Ativado`' : '`🔴 Desativado`'}\nCanal: ${db.config.channels.boasVindasId ? `<#${db.config.channels.boasVindasId}>` : '`Não definido`'}\nCargo Automático: ${db.config.roles.autoRoleId ? `<@&${db.config.roles.autoRoleId}>` : '`Não definido`'}\n\n**Mensagem Atual:**\n${w.message}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('welcome_toggle').setLabel(w.enabled ? 'Desativar' : 'Ativar').setStyle(w.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('welcome_edit').setLabel('Editar Mensagem').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId === 'welcome_toggle') {
    db.config.welcome.enabled = !db.config.welcome.enabled;
    saveDB();
    return interaction.update({
      content: `✅ Boas-vindas ${db.config.welcome.enabled ? 'ativado' : 'desativado'}!`,
      ...buildMainPanelView(db)
    });
  }

  if (interaction.isButton() && customId === 'welcome_edit') {
    const modal = new ModalBuilder()
      .setCustomId('modal_welcome_edit')
      .setTitle('👋 Configurar Boas-Vindas')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channel_id').setLabel('ID do Canal de Boas-Vindas').setValue(db.config.channels.boasVindasId || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('message').setLabel('Mensagem (use {user} e {server})').setValue(db.config.welcome.message || '').setRequired(true).setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_welcome_edit') {
    db.config.channels.boasVindasId = interaction.fields.getTextInputValue('channel_id').trim();
    db.config.welcome.message = interaction.fields.getTextInputValue('message').trim();
    db.config.welcome.enabled = true;
    saveDB();
    return interaction.reply({ content: '✅ Configurações de Boas-Vindas salvas!', ephemeral: true });
  }

  // AUTOMAÇÕES
  if (interaction.isButton() && customId === 'panel_automacoes') {
    const a = db.config.automations;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🔄 Automações da Loja')
      .addFields(
        { name: '⏱️ Auto-Fechar Carrinhos Inativos', value: `\`${a.autoCancelCartMinutes} minutos\``, inline: true },
        { name: '🏷️ Cargo de Cliente Automático', value: a.autoRoleCustomer ? '`✅ Ativo`' : '`❌ Inativo`', inline: true },
        { name: '🔄 Auto-Sincronizar Estoque nas Mensagens', value: a.autoSyncMessages ? '`✅ Ativo`' : '`❌ Inativo`', inline: true }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('auto_toggle_role').setLabel('Alternar Cargo Automático').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId === 'auto_toggle_role') {
    db.config.automations.autoRoleCustomer = !db.config.automations.autoRoleCustomer;
    saveDB();
    return interaction.reply({ content: `✅ Cargo automático na compra: **${db.config.automations.autoRoleCustomer ? 'Ativado' : 'Desativado'}**`, ephemeral: true });
  }

  // CUSTOMIZAR
  if (interaction.isButton() && customId === 'panel_customizar') {
    const modal = new ModalBuilder()
      .setCustomId('modal_customizar')
      .setTitle('🖌️ Customizar Aparência do Bot/Painel')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('store_name').setLabel('Nome da Loja').setValue(db.config.storeName || 'Prime Group').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('brand_name').setLabel('Subtítulo / Sistema').setValue(db.config.brandName || 'zenSallers').setRequired(true).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('banner').setLabel('URL do Banner do /panel').setValue(db.config.mainBanner || '').setRequired(false).setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('color').setLabel('Cor Padrão (Hex)').setValue(db.config.color || '#5865F2').setRequired(true).setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_customizar') {
    db.config.storeName = interaction.fields.getTextInputValue('store_name').trim();
    db.config.brandName = interaction.fields.getTextInputValue('brand_name').trim();
    db.config.mainBanner = interaction.fields.getTextInputValue('banner').trim();
    db.config.color = interaction.fields.getTextInputValue('color').trim() || '#5865F2';
    saveDB();
    return interaction.update(buildMainPanelView(db));
  }

  // ZENCLOUD (Backup e Restauração)
  if (interaction.isButton() && customId === 'panel_zencloud') {
    const backups = listBackups();
    const embed = new EmbedBuilder()
      .setColor('#3B82F6')
      .setTitle('☁️ zenCloud — Backup & Proteção de Dados')
      .setDescription(`Salve ou restaure instantaneamente todos os seus produtos, estoques, configurações e vendas.\n\n**Backups Salvos (${backups.length}):**\n${backups.slice(0, 5).map((b) => `• \`${b}\``).join('\n') || '*Nenhum backup criado ainda.*'}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cloud_create_backup').setLabel('Criar Backup Agora').setEmoji('☁️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cloud_restore_latest').setLabel('Restaurar Último Backup').setEmoji('🔄').setStyle(ButtonStyle.Primary).setDisabled(backups.length === 0),
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId === 'cloud_create_backup') {
    const file = createBackup('zencloud');
    return interaction.reply({ content: `☁️ Backup criado com sucesso no **zenCloud**: \`${file}\`!`, ephemeral: true });
  }

  if (interaction.isButton() && customId === 'cloud_restore_latest') {
    const backups = listBackups();
    if (backups.length === 0) return interaction.reply({ content: '❌ Nenhum backup disponível.', ephemeral: true });
    restoreBackup(backups[0]);
    return interaction.reply({ content: `✅ Backup \`${backups[0]}\` restaurado com sucesso!`, ephemeral: true });
  }

  // EXTRATO FINANCEIRO
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
        { name: '💰 Faturamento Total', value: `\`${formatBRL(totalRevenue)}\``, inline: true },
        { name: '📦 Total de Pedidos Entregues', value: `\`${sales.length} vendas\``, inline: true },
        { name: '📋 Últimas Movimentações', value: lastSales, inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  // GIVEAWAY (Sorteios)
  if (interaction.isButton() && customId === 'panel_giveaway') {
    const modal = new ModalBuilder()
      .setCustomId('modal_create_giveaway')
      .setTitle('🎉 Iniciar Sorteio (Giveaway)')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('prize').setLabel('Qual é o Prêmio?').setPlaceholder('Ex: Key Prime Extremer 30 Dias').setRequired(true).setStyle(TextInputStyle.Short)
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
      .setDescription(`Clique no botão **Participar** abaixo para concorrer!\n\n⏰ **Encerra:** <t:${Math.floor(endsAt / 1000)}:R>\n👤 **Organizado por:** <@${interaction.user.id}>\n🎟️ **Participantes:** \`0\``)
      .setFooter({ text: `ID: ${gwId}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_join:${gwId}`).setLabel('Participar (0)').setEmoji('🎉').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gw_draw:${gwId}`).setLabel('Sortear Agora (Admin)').setEmoji('🎲').setStyle(ButtonStyle.Secondary)
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
    return interaction.reply({ content: `✅ Sorteio de **${prize}** publicado neste canal!`, ephemeral: true });
  }

  if (interaction.isButton() && customId.startsWith('gw_')) {
    const [act, gwId] = customId.split(':');
    const gw = db.giveaways[gwId];
    if (!gw) return interaction.reply({ content: '❌ Sorteio não encontrado.', ephemeral: true });

    if (act === 'gw_join') {
      if (gw.ended) return interaction.reply({ content: '⚠️ Este sorteio já foi encerrado.', ephemeral: true });
      if (gw.participants.includes(interaction.user.id)) {
        return interaction.reply({ content: '✅ Você já está participando deste sorteio!', ephemeral: true });
      }
      gw.participants.push(interaction.user.id);
      saveDB();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gw_join:${gwId}`).setLabel(`Participar (${gw.participants.length})`).setEmoji('🎉').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gw_draw:${gwId}`).setLabel('Sortear Agora (Admin)').setEmoji('🎲').setStyle(ButtonStyle.Secondary)
      );
      await interaction.message.edit({ components: [row] }).catch(() => null);
      return interaction.reply({ content: '🎉 Participação confirmada! Boa sorte!', ephemeral: true });
    }

    if (act === 'gw_draw') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        return interaction.reply({ content: '❌ Apenas administradores podem encerrar o sorteio.', ephemeral: true });
      }
      gw.ended = true;
      saveDB();
      if (gw.participants.length === 0) {
        return interaction.reply({ content: '⚠️ Sorteio encerrado sem participantes.' });
      }
      const winnerId = gw.participants[Math.floor(Math.random() * gw.participants.length)];
      return interaction.reply({
        content: `🎉 **SORTEIO ENCERRADO!**\n🏆 Prêmio: **${gw.prize}**\n👑 Vencedor(a): <@${winnerId}>! Parabéns!`
      });
    }
  }

  // ZENPROTECT (Segurança Anti-Raid / Anti-Divulgação)
  if (interaction.isButton() && customId === 'panel_zenprotect') {
    const zp = db.config.zenProtect;
    const embed = new EmbedBuilder()
      .setColor('#EF4444')
      .setTitle('🛡️ zenProtect — Segurança do Servidor')
      .setDescription('Proteja sua loja contra divulgações não autorizadas, spam e ataques de raid.')
      .addFields(
        { name: '🔗 Anti-Convites (Discord Links)', value: zp.antiInvite ? '`🟢 Ativado`' : '`🔴 Desativado`', inline: true },
        { name: '🚨 Modo Anti-Raid (Bloqueia Novas Entradas)', value: zp.raidMode ? '`🟢 Ativado`' : '`🔴 Desativado`', inline: true }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('zp_toggle_invite').setLabel('Alternar Anti-Convites').setEmoji('🔗').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('zp_toggle_raid').setLabel('Alternar Modo Raid').setEmoji('🚨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel_back_main').setLabel('‹ Voltar').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId === 'zp_toggle_invite') {
    db.config.zenProtect.antiInvite = !db.config.zenProtect.antiInvite;
    saveDB();
    return interaction.reply({ content: `🛡️ Anti-Convites agora está: **${db.config.zenProtect.antiInvite ? 'ATIVADO' : 'DESATIVADO'}**`, ephemeral: true });
  }

  if (interaction.isButton() && customId === 'zp_toggle_raid') {
    db.config.zenProtect.raidMode = !db.config.zenProtect.raidMode;
    saveDB();
    return interaction.reply({ content: `🚨 Modo Anti-Raid agora está: **${db.config.zenProtect.raidMode ? 'ATIVADO' : 'DESATIVADO'}**`, ephemeral: true });
  }

  return false;
}

function showBankModal(interaction, db) {
  const b = db.config.bank || {};
  const modal = new ModalBuilder()
    .setCustomId('modal_cfg_bank')
    .setTitle('👛 Setar Meu Banco / PIX')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('pix_key')
          .setLabel('Sua Chave PIX (CPF, Email, Telefone, Aleat.)')
          .setValue(b.pixKey || '')
          .setPlaceholder('Ex: seuemail@dominio.com ou chave aleatoria')
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('holder')
          .setLabel('Nome do Titular (Sem acentos)')
          .setValue(b.pixHolderName || 'PRIME STORE')
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mp_token')
          .setLabel('Access Token Mercado Pago (Opcional)')
          .setValue(b.mpAccessToken || '')
          .setPlaceholder('APP_USR-... (Deixe vazio para usar Chave PIX)')
          .setRequired(false)
          .setStyle(TextInputStyle.Short)
      )
    );
  return interaction.showModal(modal);
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
