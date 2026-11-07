const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { loadDB, saveDB, getUser, recalculateBadges, formatBRL } = require('../utils/database');
const { createPaymentCharge, checkMercadoPagoStatus } = require('../utils/pix');

function getActiveDays(product) {
  const created = product.createdAt || (Date.now() - 11 * 86_400_000);
  const days = Math.max(1, Math.floor((Date.now() - created) / 86_400_000));
  return days;
}

/**
 * Mensagem moderna de venda do produto (Idêntica à Print 1)
 */
function buildProductSaleMessage(product, db) {
  const fields = product.fields || [];
  const minPrice = fields.length > 0 ? Math.min(...fields.map((f) => Number(f.price) || 0)) : 10;
  const activeDays = getActiveDays(product);

  const embed = new EmbedBuilder()
    .setColor('#7C3AED')
    .setDescription(
      `${product.description || ''}\n\n` +
      `**A partir de ${formatBRL(minPrice)}**\n` +
      `**Online** • Operando normalmente • ativo **há ${activeDays} dias**\n\n` +
      `*Escolha seu plano no menu abaixo*`
    );

  if (product.banner && product.banner.startsWith('http')) {
    embed.setImage(product.banner);
  }

  const components = [];

  if (fields.length > 0) {
    const options = fields.slice(0, 25).map((f) => {
      const stockCount = Array.isArray(f.stock) ? f.stock.length : 0;
      const dailyPrice = f.days && f.days > 1 ? ` • ${formatBRL(f.price / f.days)}/dia` : '';
      const badge = f.featured ? ' • Mais vendido' : '';

      return {
        label: f.name.slice(0, 100),
        value: f.id,
        description: `${formatBRL(f.price)}${dailyPrice} • Restam ${stockCount} unidades`,
        emoji: f.featured ? '⭐' : undefined
      };
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`buy_select:${product.id}`)
      .setPlaceholder('Escolha seu plano')
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(select));
  }

  return { embeds: [embed], components };
}

/**
 * Sincroniza todas as mensagens públicas de um produto
 */
async function syncProductMessages(client, productId) {
  const db = loadDB();
  const product = db.products[productId];
  if (!product || !Array.isArray(product.publishedMessages)) return 0;

  let synced = 0;
  const validMessages = [];
  const payload = buildProductSaleMessage(product, db);

  for (const ref of product.publishedMessages) {
    try {
      const channel = await client.channels.fetch(ref.channelId).catch(() => null);
      if (!channel) continue;
      const msg = await channel.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) continue;
      await msg.edit(payload);
      validMessages.push(ref);
      synced++;
    } catch {
      // ignora
    }
  }

  product.publishedMessages = validMessages;
  saveDB();
  return synced;
}

function calculateCartTotals(cart, db) {
  const product = db.products[cart.productId];
  const field = product?.fields?.find((f) => f.id === cart.fieldId);
  const unitPrice = field ? Number(field.price) : 0;
  const subtotal = unitPrice * (cart.quantity || 1);
  const discountPercent = Number(cart.discountPercent) || 0;
  const discountValue = subtotal * (discountPercent / 100);
  const total = Math.max(0.01, subtotal - discountValue);
  return { product, field, unitPrice, subtotal, discountPercent, discountValue, total };
}

/**
 * Constrói a tela do Carrinho (Idêntica às Prints 4 e 5)
 */
function buildCartView(cart, db) {
  const { product, field, unitPrice, discountPercent, total } = calculateCartTotals(cart, db);

  const embed = new EmbedBuilder()
    .setColor('#1E2330')
    .setTitle('✓ Obrigado pela preferência!')
    .setDescription(
      `✓ **Nossa entrega é 100% automática.**\n` +
      `▪ **Você está comprando: ${product?.name || 'Produto'}**\n\n` +
      `**Detalhes do Pedido**\n\n` +
      `**Pedido:** #${cart.numId || cart.id.slice(-8)}\n` +
      `**Produto:** ${product?.name || 'Produto'}\n` +
      `**Plano:** ${field?.name || 'Padrão'}\n` +
      `**Valor:** ${formatBRL(unitPrice)}\n` +
      `**Quantidade:** ${cart.quantity}\n` +
      `**Desconto:** ${cart.couponCode ? `${cart.couponCode} (-${discountPercent}%)` : 'Nenhum cupom aplicado'}\n` +
      `**Total:** ${formatBRL(total)}`
    );

  if (product?.banner && product.banner.startsWith('http')) {
    embed.setImage(product.banner);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_coupon:${cart.id}`).setLabel('Usar Cupom').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cart_change_qty:${cart.id}`).setLabel('Alterar Quantidade').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_proceed_pay:${cart.id}`).setLabel('Ir para Pagamento').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cart_cancel:${cart.id}`).setLabel('Cancelar Pedido').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Constrói a tela de Seleção de Método de Pagamento
 */
function buildPaymentMethodSelectView(cart, db) {
  const { total } = calculateCartTotals(cart, db);

  const embed = new EmbedBuilder()
    .setColor('#1E2330')
    .setTitle('Seleção de Método de Pagamento')
    .setDescription(
      `**Pedido:** #${cart.numId || cart.id.slice(-8)}\n` +
      `**Total:** ${formatBRL(total)}\n\n` +
      `Escolha como deseja pagar:`
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cart_pay_method_select:${cart.id}`)
    .setPlaceholder('Selecione o método de pagamento')
    .addOptions([
      {
        label: 'PIX',
        value: 'method_pix',
        description: 'Pagamento instantâneo via PIX'
      },
      {
        label: 'Saldo da Carteira',
        value: 'method_balance',
        description: 'Pagar com seu saldo em conta'
      }
    ]);

  const rowSelect = new ActionRowBuilder().addComponents(select);
  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_back_view:${cart.id}`).setLabel('‹ Voltar ao Pedido').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cart_cancel:${cart.id}`).setLabel('Cancelar Pedido').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [rowSelect, rowBack] };
}

/**
 * Constrói a tela de Pagamento PIX com QR Code
 */
function buildPixPaymentView(cart, charge, db) {
  const { product, total } = calculateCartTotals(cart, db);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Pagamento PIX')
    .setDescription(
      `Realize o pagamento para receber seu produto automaticamente.\n\n` +
      `▪ **Pedido:** #${cart.numId || cart.id.slice(-8)}\n` +
      `▪ **Produto:** ${product?.name || 'Produto'}\n` +
      `▪ **Total:** ${formatBRL(total)}\n\n` +
      `⏰ **Expira em 58 minutos**`
    )
    .setImage(charge.qrCodeUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_copy_pix:${cart.id}`).setLabel('Copia e Cola').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cart_cancel:${cart.id}`).setLabel('Cancelar Pedido').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Envia log detalhado para o canal de pedidos (logspedidos)
 */
async function sendCartLog(client, db, { title, color = '#3B82F6', fields = [], description = '' }) {
  const logChannelId = db.config.channels?.logsVendasId;
  if (!logChannelId) return;
  try {
    const ch = await client.channels.fetch(logChannelId).catch(() => null);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description || null)
      .addFields(fields)
      .setFooter({ text: `${db.config.storeName} • Logs › Pedidos` })
      .setTimestamp();

    await ch.send({ embeds: [embed] }).catch(() => null);
  } catch {
    // ignora
  }
}

/**
 * Abre um novo carrinho para o comprador
 */
async function openCartForUser(interaction, productId, fieldId) {
  const db = loadDB();
  const product = db.products[productId];
  if (!product) {
    return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });
  }

  const field = fieldId
    ? product.fields.find((f) => f.id === fieldId)
    : product.fields[0];

  if (!field) {
    return interaction.reply({ content: 'Este produto ainda não possui planos configurados.', ephemeral: true });
  }

  const stockCount = Array.isArray(field.stock) ? field.stock.length : 0;
  if (stockCount <= 0) {
    return interaction.reply({
      content: `O plano **${field.name}** está esgotado no momento. Use o painel de solicitação de estoque para avisar a equipe.`,
      ephemeral: true
    });
  }

  // Verifica se o usuário já tem carrinho aberto
  const existingCart = Object.values(db.carts).find(
    (c) => c.userId === interaction.user.id && (c.status === 'open' || c.status === 'pending_payment')
  );
  if (existingCart) {
    const ch = await interaction.guild.channels.fetch(existingCart.channelId).catch(() => null);
    if (ch) {
      return interaction.reply({
        content: `Você já possui um carrinho aberto em <#${ch.id}>! Finalize ou cancele antes de abrir outro.`,
        ephemeral: true
      });
    } else {
      delete db.carts[existingCart.id];
      saveDB();
    }
  }

  await interaction.deferReply({ ephemeral: true });

  let cartChannel = null;
  const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'cliente';

  if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
    try {
      cartChannel = await interaction.channel.threads.create({
        name: `carrinho-${cleanUsername}`,
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        reason: `Carrinho de ${interaction.user.tag}`
      });
      await cartChannel.members.add(interaction.user.id);
    } catch {
      cartChannel = null;
    }
  }

  if (!cartChannel) {
    cartChannel = await interaction.guild.channels.create({
      name: `carrinho-${cleanUsername}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...(db.config.roles.adminRoleId ? [{ id: db.config.roles.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ...(db.config.roles.staffRoleId ? [{ id: db.config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
      ]
    });
  }

  const numId = String(Math.floor(10000000 + Math.random() * 90000000));
  const cartId = `CART-${numId}`;

  const cart = {
    id: cartId,
    numId,
    channelId: cartChannel.id,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    productId: product.id,
    fieldId: field.id,
    quantity: 1,
    couponCode: null,
    discountPercent: 0,
    status: 'open',
    paymentId: null,
    createdAt: Date.now()
  };

  db.carts[cartId] = cart;
  saveDB();

  // Envia view do carrinho no canal do carrinho
  const view = buildCartView(cart, db);
  await cartChannel.send({ content: `<@${interaction.user.id}>`, ...view });

  // Resposta Efêmera no canal de compra
  const cartUrl = `https://discord.com/channels/${interaction.guild.id}/${cartChannel.id}`;
  const rowBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Ir para o Carrinho').setStyle(ButtonStyle.Link).setURL(cartUrl)
  );

  const embedEphemeral = new EmbedBuilder()
    .setColor('#1E2330')
    .setTitle('✓ Pedido Criado!')
    .setDescription('✓ **Seu pedido foi criado com sucesso!**\nClique no botão abaixo para ir ao seu carrinho.');

  await interaction.editReply({ embeds: [embedEphemeral], components: [rowBtn] });

  // Notificação na DM do usuário
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor('#00D4AA')
      .setTitle('PRODUTO ADICIONADO AO CARRINHO')
      .setDescription(`Olá <@${interaction.user.id}>!, por favor clique no botão ao lado para **prosseguir com sua compra** e receber seus itens designados!`);

    const dmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Acessar Carrinho').setStyle(ButtonStyle.Link).setURL(cartUrl)
    );
    await interaction.user.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => null);
  } catch {
    // DM fechada
  }

  // Log detalhado no canal logspedidos
  await sendCartLog(interaction.client, db, {
    title: '🛒 Carrinho Aberto',
    color: '#3B82F6',
    fields: [
      { name: '👤 Comprador', value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`, inline: true },
      { name: '📦 Produto', value: `\`${product.name}\``, inline: true },
      { name: '🏷️ Plano', value: `\`${field.name}\``, inline: true },
      { name: '💰 Valor Inicial', value: `\`${formatBRL(field.price)}\``, inline: true },
      { name: '📍 Canal', value: `<#${cartChannel.id}>`, inline: true },
      { name: '🆔 Pedido', value: `\`#${numId}\``, inline: true }
    ]
  });
}

/**
 * Entrega o pedido e registra na base de dados
 */
async function fulfillCartOrder(client, guild, cart, methodLabel = 'PIX') {
  const db = loadDB();
  const { product, field, total } = calculateCartTotals(cart, db);
  if (!product || !field) {
    return { ok: false, error: 'Produto ou plano não encontrado.' };
  }

  if (!Array.isArray(field.stock) || field.stock.length < cart.quantity) {
    return { ok: false, error: `Estoque insuficiente! Restam apenas ${field.stock?.length || 0} unidades.` };
  }

  const deliveredItems = field.stock.splice(0, cart.quantity);
  cart.status = 'delivered';
  cart.deliveredAt = Date.now();

  if (cart.paymentId && db.payments[cart.paymentId]) {
    db.payments[cart.paymentId].status = 'approved';
  }

  const saleId = `#${cart.numId || cart.id.slice(-8)}`;
  const saleRecord = {
    id: saleId,
    cartId: cart.id,
    userId: cart.userId,
    productId: product.id,
    productName: product.name,
    fieldId: field.id,
    fieldName: field.name,
    quantity: cart.quantity,
    amount: total,
    method: methodLabel,
    deliveredItems,
    createdAt: new Date().toISOString()
  };

  db.sales.push(saleRecord);

  // Perfil do usuário
  const userProfile = getUser(cart.userId);
  userProfile.totalSpent = Number((userProfile.totalSpent + total).toFixed(2));
  userProfile.purchasesCount = (userProfile.purchasesCount || 0) + 1;
  userProfile.purchases.push(saleRecord);
  recalculateBadges(cart.userId);
  saveDB();

  // Embed de entrega moderno
  const deliveryEmbed = new EmbedBuilder()
    .setColor('#22C55E')
    .setTitle('✓ Pagamento Aprovado & Produto Entregue!')
    .setDescription(
      `Obrigado pela sua compra, <@${cart.userId}>!\n\n` +
      `▪ **Produto:** \`${product.name} — ${field.name} (${cart.quantity}x)\`\n` +
      `▪ **Valor:** \`${formatBRL(total)} (${methodLabel})\`\n\n` +
      `**Seus Itens / Chaves de Acesso:**\n` +
      `\`\`\`\n${deliveredItems.join('\n')}\n\`\`\``
    )
    .setFooter({ text: `Pedido ${saleId} • ${db.config.storeName}` })
    .setTimestamp();

  // Envia no canal do carrinho
  const cartChannel = await client.channels.fetch(cart.channelId).catch(() => null);
  if (cartChannel) {
    await cartChannel.send({ content: `<@${cart.userId}>`, embeds: [deliveryEmbed] }).catch(() => null);
    await cartChannel.send({ content: '🔒 Este carrinho será encerrado automaticamente em 60 segundos.' }).catch(() => null);
    setTimeout(async () => {
      await cartChannel.delete('Carrinho entregue').catch(() => null);
    }, 60_000);
  }

  // Envia na DM do comprador
  try {
    const member = await guild.members.fetch(cart.userId).catch(() => null);
    if (member) {
      await member.send({ embeds: [deliveryEmbed] }).catch(() => null);

      if (db.config.roles.customerRoleId) {
        await member.roles.add(db.config.roles.customerRoleId).catch(() => null);
      }

      for (const r of db.config.roles.rankRoles || []) {
        if (r.roleId && userProfile.totalSpent >= r.minSpent) {
          await member.roles.add(r.roleId).catch(() => null);
        }
      }
    }
  } catch {
    // DM fechada
  }

  // Log completo no canal logspedidos
  await sendCartLog(client, db, {
    title: '✅ Pedido Concluído & Entregue',
    color: '#22C55E',
    fields: [
      { name: '👤 Comprador', value: `<@${cart.userId}> (\`${cart.userId}\`)`, inline: true },
      { name: '📦 Produto / Plano', value: `\`${product.name} -> ${field.name}\``, inline: true },
      { name: '🔢 Quantidade', value: `\`${cart.quantity}x\``, inline: true },
      { name: '💰 Valor Total', value: `\`${formatBRL(total)} (${methodLabel})\``, inline: true },
      { name: '📉 Estoque Restante', value: `\`${field.stock.length} itens\``, inline: true },
      { name: '🔑 Itens Entregues', value: `|| \`${deliveredItems.join(', ')}\` ||`, inline: false }
    ]
  });

  // Sincroniza mensagem pública
  await syncProductMessages(client, product.id);

  return { ok: true, saleRecord };
}

/**
 * Trata interações de loja / carrinho / pagamento
 */
async function handleStoreInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // 1. Menu de seleção de plano na mensagem pública
  if (interaction.isStringSelectMenu() && customId.startsWith('buy_select:')) {
    const productId = customId.split(':')[1];
    const fieldId = interaction.values[0];
    return openCartForUser(interaction, productId, fieldId);
  }

  // 2. Ações do Carrinho
  if (interaction.isButton() && customId.startsWith('cart_')) {
    const [action, cartId] = customId.split(':');
    const cart = db.carts[cartId];
    if (!cart) {
      return interaction.reply({ content: 'Este carrinho não foi encontrado ou já foi finalizado.', ephemeral: true });
    }

    if (action === 'cart_cancel') {
      cart.status = 'cancelled';
      saveDB();

      const { product, field, total } = calculateCartTotals(cart, db);
      await sendCartLog(client, db, {
        title: '🗑️ Carrinho Cancelado',
        color: '#EF4444',
        fields: [
          { name: '👤 Usuário', value: `<@${cart.userId}>`, inline: true },
          { name: '📦 Produto', value: `\`${product?.name || 'Desconhecido'} - ${field?.name || 'Padrão'}\``, inline: true },
          { name: '💰 Valor', value: `\`${formatBRL(total)}\``, inline: true },
          { name: '🆔 Pedido', value: `\`#${cart.numId || cart.id.slice(-8)}\``, inline: true }
        ]
      });

      await interaction.reply({ content: 'Pedido cancelado. Este canal será fechado em 5 segundos.' });
      setTimeout(() => {
        interaction.channel?.delete('Cancelado pelo cliente').catch(() => null);
      }, 5000);
      return true;
    }

    if (action === 'cart_change_qty') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_cart_qty:${cart.id}`)
        .setTitle('Alterar Quantidade')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('qty')
              .setLabel('Nova Quantidade desejada')
              .setValue(String(cart.quantity || 1))
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'cart_coupon') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_cart_coupon:${cart.id}`)
        .setTitle('Usar Cupom')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('code')
              .setLabel('Código do Cupom de Desconto')
              .setPlaceholder('Ex: PRIME10')
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'cart_proceed_pay') {
      return interaction.update(buildPaymentMethodSelectView(cart, db));
    }

    if (action === 'cart_back_view') {
      return interaction.update(buildCartView(cart, db));
    }

    if (action === 'cart_copy_pix') {
      const pay = db.payments[cart.paymentId];
      if (!pay) return interaction.reply({ content: 'Gere o PIX primeiro.', ephemeral: true });
      return interaction.reply({ content: pay.copiaECola, ephemeral: true });
    }
  }

  // 3. Seleção do Método de Pagamento (PIX ou Saldo)
  if (interaction.isStringSelectMenu() && customId.startsWith('cart_pay_method_select:')) {
    const cartId = customId.split(':')[1];
    const cart = db.carts[cartId];
    if (!cart) return interaction.reply({ content: 'Carrinho não encontrado.', ephemeral: true });

    const method = interaction.values[0];

    if (method === 'method_balance') {
      const userProfile = getUser(cart.userId);
      const { total } = calculateCartTotals(cart, db);
      if (userProfile.balance < total) {
        return interaction.reply({
          content: `Saldo insuficiente! Seu saldo atual é **${formatBRL(userProfile.balance)}** e o pedido custa **${formatBRL(total)}**.`,
          ephemeral: true
        });
      }
      userProfile.balance = Number((userProfile.balance - total).toFixed(2));
      saveDB();
      await interaction.deferUpdate();
      await fulfillCartOrder(client, interaction.guild, cart, 'Saldo da Carteira');
      return true;
    }

    if (method === 'method_pix') {
      await interaction.deferUpdate();
      const { product, field, total } = calculateCartTotals(cart, db);
      const charge = await createPaymentCharge({
        bankConfig: db.config.bank,
        amount: total,
        description: `${product?.name} - ${field?.name}`,
        userId: cart.userId
      });

      cart.status = 'pending_payment';
      cart.paymentId = charge.paymentId;
      db.payments[charge.paymentId] = {
        ...charge,
        cartId: cart.id,
        userId: cart.userId,
        amount: total,
        createdAt: new Date().toISOString()
      };
      saveDB();

      // Log de PIX Gerado em logspedidos
      await sendCartLog(client, db, {
        title: '💠 Cobrança PIX Gerada',
        color: '#00D4AA',
        fields: [
          { name: '👤 Comprador', value: `<@${cart.userId}>`, inline: true },
          { name: '📦 Produto / Plano', value: `\`${product?.name} -> ${field?.name}\``, inline: true },
          { name: '💰 Valor', value: `\`${formatBRL(total)}\``, inline: true },
          { name: '🆔 ID Pagamento', value: `\`${charge.paymentId}\``, inline: true }
        ]
      });

      return interaction.editReply(buildPixPaymentView(cart, charge, db));
    }
  }

  // 4. Modais do Carrinho (Cupom e Quantidade)
  if (interaction.isModalSubmit() && customId.startsWith('modal_cart_qty:')) {
    const cartId = customId.split(':')[1];
    const cart = db.carts[cartId];
    if (!cart) return interaction.reply({ content: 'Carrinho não encontrado.', ephemeral: true });

    const newQty = parseInt(interaction.fields.getTextInputValue('qty'), 10);
    const { field } = calculateCartTotals(cart, db);
    const maxStock = field?.stock?.length || 1;

    if (isNaN(newQty) || newQty < 1) {
      return interaction.reply({ content: 'Informe uma quantidade válida maior que zero.', ephemeral: true });
    }
    if (newQty > maxStock) {
      return interaction.reply({ content: `Quantidade indisponível! Estoque atual: ${maxStock} unidades.`, ephemeral: true });
    }

    cart.quantity = newQty;
    saveDB();
    return interaction.update(buildCartView(cart, db));
  }

  if (interaction.isModalSubmit() && customId.startsWith('modal_cart_coupon:')) {
    const cartId = customId.split(':')[1];
    const cart = db.carts[cartId];
    if (!cart) return interaction.reply({ content: 'Carrinho não encontrado.', ephemeral: true });

    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const product = db.products[cart.productId];

    const prodCoupon = (product?.coupons || []).find((c) => c.code.toUpperCase() === code);
    const globalCoupon = db.coupons[code];
    const found = prodCoupon || globalCoupon;

    if (!found) {
      return interaction.reply({ content: `O cupom \`${code}\` é inválido ou expirou.`, ephemeral: true });
    }

    cart.couponCode = found.code;
    cart.discountPercent = Number(found.discountPercent) || 10;
    saveDB();
    return interaction.update(buildCartView(cart, db));
  }

  return false;
}

module.exports = {
  buildProductSaleMessage,
  syncProductMessages,
  openCartForUser,
  fulfillCartOrder,
  handleStoreInteraction,
  sendCartLog
};
