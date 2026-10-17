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

/**
 * Monta a mensagem pública de venda de um produto (usada em "Colocar a venda" e "/postproduto")
 */
function buildProductSaleMessage(product, db) {
  const fieldsList = (product.fields || []).map((f) => {
    const stockCount = Array.isArray(f.stock) ? f.stock.length : 0;
    return `**${f.name}**\n\`📦 Estoque: ${stockCount}\` • \`💰 ${formatBRL(f.price)}\``;
  }).join('\n\n') || '*Nenhuma variação cadastrada.*';

  const embed = new EmbedBuilder()
    .setColor(product.color || db.config.color || '#5865F2')
    .setAuthor({ name: `${db.config.storeName} • Loja Oficial` })
    .setTitle(product.name)
    .setDescription(`${product.description || ''}\n\n**📋 Opções Disponíveis:**\n${fieldsList}`)
    .addFields(
      { name: '⚡ Entrega Automática', value: product.autoDelivery ? '`✅ Sim (24/7)`' : '`👨‍💻 Manual`', inline: true },
      { name: '💳 Formas de Pagamento', value: '`PIX / Saldo`', inline: true }
    )
    .setFooter({ text: `${db.config.storeName} • Compra 100% Segura` })
    .setTimestamp();

  if (product.banner && product.banner.startsWith('http')) {
    embed.setImage(product.banner);
  } else if (db.config.storeBanner && db.config.storeBanner.startsWith('http')) {
    embed.setImage(db.config.storeBanner);
  }

  const components = [];

  if (product.fields && product.fields.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`buy_select:${product.id}`)
      .setPlaceholder('🛒 Selecione uma opção para comprar...')
      .addOptions(
        product.fields.slice(0, 25).map((f) => {
          const stockCount = Array.isArray(f.stock) ? f.stock.length : 0;
          return {
            label: f.name.slice(0, 100),
            value: f.id,
            description: `Preço: ${formatBRL(f.price)} | Estoque: ${stockCount} unid.`,
            emoji: stockCount > 0 ? '🛒' : '📦'
          };
        })
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }

  const rowBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`buy_quick:${product.id}`)
      .setLabel('Comprar Agora')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Success)
  );
  components.push(rowBtn);

  return { embeds: [embed], components };
}

/**
 * Sincroniza todas as mensagens publicadas de um produto quando estoque/preço muda
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
      // ignora mensagens apagadas
    }
  }

  product.publishedMessages = validMessages;
  saveDB();
  return synced;
}

/**
 * Calcula valores de um carrinho
 */
function calculateCartTotals(cart, db) {
  const product = db.products[cart.productId];
  const field = product?.fields?.find((f) => f.id === cart.fieldId);
  const unitPrice = field ? Number(field.price) : 0;
  const subtotal = unitPrice * (cart.quantity || 1);
  const discountPercent = Number(cart.discountPercent) || 0;
  const discountValue = subtotal * (discountPercent / 100);
  const total = Math.max(0.01, subtotal - discountValue);
  return {
    product,
    field,
    unitPrice,
    subtotal,
    discountPercent,
    discountValue,
    total
  };
}

/**
 * Renderiza o Embed e Botões dentro do canal/tópico de carrinho
 */
function buildCartView(cart, db) {
  const { product, field, unitPrice, subtotal, discountPercent, total } = calculateCartTotals(cart, db);
  const stockCount = Array.isArray(field?.stock) ? field.stock.length : 0;

  const embed = new EmbedBuilder()
    .setColor('#22C55E')
    .setAuthor({ name: `${db.config.brandName} • Carrinho de Compras` })
    .setTitle(`🛒 ${product?.name || 'Produto'} — ${field?.name || 'Item'}`)
    .setDescription(`Olá <@${cart.userId}>! Confira os detalhes do seu pedido abaixo e escolha como deseja finalizar a compra.`)
    .addFields(
      { name: '📦 Produto / Variação', value: `\`${product?.name} -> ${field?.name}\``, inline: false },
      { name: '🔢 Quantidade', value: `\`${cart.quantity}x\` (Disponível: \`${stockCount}\`)`, inline: true },
      { name: '💵 Valor Unitário', value: `\`${formatBRL(unitPrice)}\``, inline: true },
      { name: '🏷️ Cupom Aplicado', value: cart.couponCode ? `\`${cart.couponCode} (-${discountPercent}%)\`` : '`Nenhum`', inline: true },
      { name: '💰 Total a Pagar', value: `**\`${formatBRL(total)}\`** (Subtotal: ${formatBRL(subtotal)})`, inline: false },
      { name: '📌 Status do Pedido', value: cart.status === 'pending_payment' ? '`⏳ Aguardando Pagamento`' : '`🟢 Aberto para edição`', inline: false }
    )
    .setFooter({ text: `ID do Carrinho: ${cart.id} • ${db.config.storeName}` })
    .setTimestamp();

  const rowQty = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_sub:${cart.id}`).setLabel('-1').setStyle(ButtonStyle.Secondary).setDisabled(cart.quantity <= 1),
    new ButtonBuilder().setCustomId(`cart_add:${cart.id}`).setLabel('+1').setStyle(ButtonStyle.Secondary).setDisabled(cart.quantity >= stockCount),
    new ButtonBuilder().setCustomId(`cart_coupon:${cart.id}`).setLabel('Usar Cupom').setEmoji('🏷️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cart_cancel:${cart.id}`).setLabel('Cancelar').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );

  const rowPay = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cart_pay_pix:${cart.id}`).setLabel('Gerar PIX').setEmoji('💠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cart_pay_balance:${cart.id}`).setLabel('Pagar com Saldo').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cart_staff_approve:${cart.id}`).setLabel('Aprovar (Staff)').setEmoji('✔️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [rowQty, rowPay] };
}

/**
 * Abre um novo carrinho para o comprador
 */
async function openCartForUser(interaction, productId, fieldId) {
  const db = loadDB();
  const product = db.products[productId];
  if (!product) {
    return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
  }

  const field = fieldId
    ? product.fields.find((f) => f.id === fieldId)
    : product.fields[0];

  if (!field) {
    return interaction.reply({ content: '❌ Este produto ainda não possui variações/campos cadastrados.', ephemeral: true });
  }

  const stockCount = Array.isArray(field.stock) ? field.stock.length : 0;
  if (stockCount <= 0) {
    const rowNotify = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`stock_req_btn:${product.id}:${field.id}`)
        .setLabel('Avisar quando chegar estoque')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Primary)
    );
    return interaction.reply({
      content: `❌ O item **${field.name}** está sem estoque no momento! Clique abaixo para solicitar reposição à administração.`,
      components: [rowNotify],
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
        content: `⚠️ Você já possui um carrinho aberto em <#${ch.id}>! Finalize ou cancele-o antes de abrir outro.`,
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

  try {
    if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
      cartChannel = await interaction.channel.threads.create({
        name: `🛒・carrinho-${cleanUsername}`,
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        reason: `Carrinho de compras de ${interaction.user.tag}`
      });
      await cartChannel.members.add(interaction.user.id);
    }
  } catch {
    cartChannel = null;
  }

  if (!cartChannel) {
    cartChannel = await interaction.guild.channels.create({
      name: `🛒・carrinho-${cleanUsername}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...(db.config.roles.adminRoleId ? [{ id: db.config.roles.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ...(db.config.roles.staffRoleId ? [{ id: db.config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
      ]
    });
  }

  const cartId = `CART-${Date.now().toString(36).toUpperCase()}`;
  const cart = {
    id: cartId,
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

  const view = buildCartView(cart, db);
  await cartChannel.send({ content: `<@${interaction.user.id}> Bem-vindo(a) ao seu carrinho!`, ...view });

  return interaction.editReply({
    content: `✅ Seu carrinho foi criado com sucesso! Acesse: <#${cartChannel.id}>`
  });
}

/**
 * Entrega o pedido do carrinho e registra a venda
 */
async function fulfillCartOrder(client, guild, cart, methodLabel = 'PIX') {
  const db = loadDB();
  const { product, field, total } = calculateCartTotals(cart, db);
  if (!product || !field) {
    return { ok: false, error: 'Produto ou variação não encontrada.' };
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

  const saleId = `SALE-${Date.now().toString(36).toUpperCase()}`;
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

  // Atualiza perfil do comprador
  const userProfile = getUser(cart.userId);
  userProfile.totalSpent = Number((userProfile.totalSpent + total).toFixed(2));
  userProfile.purchasesCount = (userProfile.purchasesCount || 0) + 1;
  userProfile.purchases.push(saleRecord);
  recalculateBadges(cart.userId);

  saveDB();

  // Monta embed de entrega
  const deliveryEmbed = new EmbedBuilder()
    .setColor('#22C55E')
    .setAuthor({ name: `${db.config.storeName} • Entrega Automática` })
    .setTitle('✅ Pagamento Aprovado & Produto Entregue!')
    .setDescription(`Obrigado pela sua compra, <@${cart.userId}>! Aqui estão os dados do seu produto:`)
    .addFields(
      { name: '📦 Produto', value: `\`${product.name} — ${field.name} (${cart.quantity}x)\``, inline: true },
      { name: '💰 Valor Pago', value: `\`${formatBRL(total)} (${methodLabel})\``, inline: true },
      { name: '🔑 Seu(s) Produto(s) / Key(s)', value: `\`\`\`\n${deliveredItems.join('\n')}\n\`\`\``, inline: false }
    )
    .setFooter({ text: `Pedido #${saleId} • ${db.config.storeName}` })
    .setTimestamp();

  // Envia no canal do carrinho
  const cartChannel = await client.channels.fetch(cart.channelId).catch(() => null);
  if (cartChannel) {
    await cartChannel.send({ content: `<@${cart.userId}>`, embeds: [deliveryEmbed] }).catch(() => null);
    await cartChannel.send({ content: '🔒 Este carrinho será fechado automaticamente em **60 segundos**.' }).catch(() => null);
    setTimeout(async () => {
      await cartChannel.delete('Carrinho finalizado e entregue').catch(() => null);
    }, 60_000);
  }

  // Envia na DM do comprador também
  try {
    const member = await guild.members.fetch(cart.userId).catch(() => null);
    if (member) {
      await member.send({ embeds: [deliveryEmbed] }).catch(() => null);

      // Dá cargo de Cliente se configurado
      if (db.config.roles.customerRoleId) {
        await member.roles.add(db.config.roles.customerRoleId).catch(() => null);
      }

      // Sincroniza cargos de Rank por valor gasto
      for (const r of db.config.roles.rankRoles || []) {
        if (r.roleId && userProfile.totalSpent >= r.minSpent) {
          await member.roles.add(r.roleId).catch(() => null);
        }
      }
    }
  } catch {
    // DM fechada
  }

  // Envia log no canal de vendas se configurado
  if (db.config.channels.logsVendasId) {
    const logChannel = await client.channels.fetch(db.config.channels.logsVendasId).catch(() => null);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle('🧾 Nova Venda Realizada!')
        .addFields(
          { name: '👤 Comprador', value: `<@${cart.userId}> (\`${cart.userId}\`)`, inline: true },
          { name: '📦 Produto', value: `\`${product.name} -> ${field.name} (${cart.quantity}x)\``, inline: true },
          { name: '💰 Valor', value: `\`${formatBRL(total)} (${methodLabel})\``, inline: true },
          { name: '📉 Estoque Restante', value: `\`${field.stock.length} unid.\``, inline: true }
        )
        .setFooter({ text: `Venda #${saleId}` })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
  }

  // Sincroniza mensagens públicas do produto
  await syncProductMessages(client, product.id);

  return { ok: true, saleRecord };
}

/**
 * Trata todas as interações de compra/carrinho/saldo
 */
async function handleStoreInteraction(interaction, client) {
  const db = loadDB();
  const customId = interaction.customId || '';

  // 1. Seleção de produto no menu público
  if (interaction.isStringSelectMenu() && customId.startsWith('buy_select:')) {
    const productId = customId.split(':')[1];
    const fieldId = interaction.values[0];
    return openCartForUser(interaction, productId, fieldId);
  }

  // 2. Botão "Comprar Agora" rápido
  if (interaction.isButton() && customId.startsWith('buy_quick:')) {
    const productId = customId.split(':')[1];
    return openCartForUser(interaction, productId, null);
  }

  // 3. Solicitar reposição de estoque
  if (interaction.isButton() && customId.startsWith('stock_req_btn:')) {
    const [, productId, fieldId] = customId.split(':');
    const product = db.products[productId];
    const field = product?.fields?.find((f) => f.id === fieldId);

    if (db.config.channels.solicitacaoEstoqueId) {
      const ch = await client.channels.fetch(db.config.channels.solicitacaoEstoqueId).catch(() => null);
      if (ch) {
        await ch.send({
          content: `🔔 **Solicitação de Estoque:** <@${interaction.user.id}> pediu reposição do produto **${product?.name || productId}** (${field?.name || 'Geral'})!`
        }).catch(() => null);
      }
    }
    return interaction.reply({
      content: '✅ Sua solicitação de estoque foi enviada para a equipe! Você será avisado assim que reabastecermos.',
      ephemeral: true
    });
  }

  // 4. Botões dentro do carrinho
  if (interaction.isButton() && customId.startsWith('cart_')) {
    const [action, cartId] = customId.split(':');
    const cart = db.carts[cartId];
    if (!cart) {
      return interaction.reply({ content: '❌ Este carrinho não existe mais.', ephemeral: true });
    }

    if (action === 'cart_add' || action === 'cart_sub') {
      if (interaction.user.id !== cart.userId) {
        return interaction.reply({ content: '❌ Apenas o dono do carrinho pode alterar a quantidade.', ephemeral: true });
      }
      const { field } = calculateCartTotals(cart, db);
      const maxStock = field?.stock?.length || 1;
      if (action === 'cart_add' && cart.quantity < maxStock) cart.quantity++;
      if (action === 'cart_sub' && cart.quantity > 1) cart.quantity--;
      saveDB();
      return interaction.update(buildCartView(cart, db));
    }

    if (action === 'cart_coupon') {
      if (interaction.user.id !== cart.userId) {
        return interaction.reply({ content: '❌ Apenas o dono do carrinho pode aplicar cupom.', ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`modal_cart_coupon:${cart.id}`)
        .setTitle('🏷️ Aplicar Cupom de Desconto')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('coupon_code')
              .setLabel('Digite o código do cupom')
              .setPlaceholder('Ex: PRIME10')
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'cart_cancel') {
      cart.status = 'cancelled';
      saveDB();
      await interaction.reply({ content: '🗑️ Carrinho cancelado. Este canal será fechado em 5 segundos.' });
      setTimeout(() => {
        interaction.channel?.delete('Carrinho cancelado pelo usuário').catch(() => null);
      }, 5000);
      return;
    }

    if (action === 'cart_pay_balance') {
      if (interaction.user.id !== cart.userId) {
        return interaction.reply({ content: '❌ Apenas o dono do carrinho pode pagar.', ephemeral: true });
      }
      const userProfile = getUser(cart.userId);
      const { total } = calculateCartTotals(cart, db);
      if (userProfile.balance < total) {
        return interaction.reply({
          content: `❌ Saldo insuficiente! Seu saldo atual é **${formatBRL(userProfile.balance)}** e o pedido custa **${formatBRL(total)}**.`,
          ephemeral: true
        });
      }
      userProfile.balance = Number((userProfile.balance - total).toFixed(2));
      saveDB();
      await interaction.deferReply();
      const result = await fulfillCartOrder(client, interaction.guild, cart, 'Saldo da Carteira');
      if (!result.ok) {
        userProfile.balance = Number((userProfile.balance + total).toFixed(2));
        saveDB();
        return interaction.editReply({ content: `❌ Erro ao entregar: ${result.error}` });
      }
      return interaction.editReply({ content: '✅ Pago com sucesso usando seu saldo da carteira!' });
    }

    if (action === 'cart_pay_pix') {
      if (interaction.user.id !== cart.userId) {
        return interaction.reply({ content: '❌ Apenas o dono do carrinho pode gerar o PIX.', ephemeral: true });
      }
      await interaction.deferReply();
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

      const pixEmbed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setAuthor({ name: `${db.config.brandName} • Checkout PIX` })
        .setTitle('💠 Pagamento via PIX Gerado!')
        .setDescription('Escaneie o QR Code abaixo ou copie o código **PIX Copia e Cola** para realizar o pagamento.')
        .addFields(
          { name: '🆔 ID do Pagamento', value: `\`${charge.paymentId}\``, inline: true },
          { name: '💰 Valor Exato', value: `\`${formatBRL(total)}\``, inline: true },
          { name: '🏦 Provedor', value: `\`${charge.provider}\``, inline: true },
          { name: '📋 PIX Copia e Cola', value: `\`\`\`\n${charge.copiaECola}\n\`\`\``, inline: false }
        )
        .setImage(charge.qrCodeUrl)
        .setFooter({ text: 'Após pagar, clique em "Verificar Pagamento" abaixo.' })
        .setTimestamp();

      const rowVerify = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cart_verify_pix:${cart.id}`)
          .setLabel('Já Paguei / Verificar Pagamento')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cart_copy_pix:${cart.id}`)
          .setLabel('Enviar Copia e Cola no Chat')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`cart_staff_approve:${cart.id}`)
          .setLabel('Aprovar Pagamento (Staff)')
          .setEmoji('✔️')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.editReply({ embeds: [pixEmbed], components: [rowVerify] });
    }

    if (action === 'cart_copy_pix') {
      const payment = db.payments[cart.paymentId];
      if (!payment) return interaction.reply({ content: '❌ Gere o PIX primeiro.', ephemeral: true });
      return interaction.reply({ content: payment.copiaECola, ephemeral: true });
    }

    if (action === 'cart_verify_pix') {
      const payment = db.payments[cart.paymentId];
      if (!payment) return interaction.reply({ content: '❌ Nenhum pagamento gerado para este carrinho.', ephemeral: true });

      // Se tiver Mercado Pago configurado, verifica na API automaticamente
      if (payment.externalId && db.config.bank.mpAccessToken) {
        const status = await checkMercadoPagoStatus(payment.externalId, db.config.bank.mpAccessToken);
        if (status === 'approved') {
          await interaction.deferReply();
          const res = await fulfillCartOrder(client, interaction.guild, cart, 'PIX Automático');
          if (!res.ok) return interaction.editReply({ content: `❌ ${res.error}` });
          return interaction.editReply({ content: '✅ Pagamento confirmado automaticamente! Produto entregue.' });
        }
      }

      // Notifica staff no canal de logs ou no próprio carrinho para liberação
      if (db.config.channels.logsVendasId) {
        const logCh = await client.channels.fetch(db.config.channels.logsVendasId).catch(() => null);
        if (logCh) {
          const rowApprove = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`cart_staff_approve:${cart.id}`)
              .setLabel('Aprovar e Entregar Agora')
              .setEmoji('✔️')
              .setStyle(ButtonStyle.Success)
          );
          await logCh.send({
            content: `🔔 **Confirmação de PIX solicitada!** <@${cart.userId}> informou que realizou o pagamento do carrinho <#${cart.channelId}> (ID: \`${payment.paymentId}\` • Valor: **${formatBRL(payment.amount)}**).`,
            components: [rowApprove]
          }).catch(() => null);
        }
      }

      return interaction.reply({
        content: '⏳ Solicitação de verificação enviada! Se o pagamento foi via API automática aguarde alguns instantes, ou um administrador irá aprovar com `/entregar` ou clicando em **Aprovar Pagamento**.',
        ephemeral: true
      });
    }

    if (action === 'cart_staff_approve') {
      const isStaff =
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        (db.config.roles.adminRoleId && interaction.member?.roles?.cache?.has(db.config.roles.adminRoleId)) ||
        (db.config.roles.staffRoleId && interaction.member?.roles?.cache?.has(db.config.roles.staffRoleId));

      if (!isStaff) {
        return interaction.reply({ content: '❌ Apenas Administradores ou Staff podem aprovar o carrinho manualmente.', ephemeral: true });
      }

      if (cart.status === 'delivered') {
        return interaction.reply({ content: '⚠️ Este carrinho já foi entregue.', ephemeral: true });
      }

      await interaction.deferReply();
      const res = await fulfillCartOrder(client, interaction.guild, cart, `Aprovado por ${interaction.user.username}`);
      if (!res.ok) {
        return interaction.editReply({ content: `❌ Falha ao aprovar carrinho: ${res.error}` });
      }
      return interaction.editReply({ content: `✅ Carrinho aprovado por <@${interaction.user.id}> e produto entregue automaticamente!` });
    }
  }

  // 5. Modal de Cupom no Carrinho
  if (interaction.isModalSubmit() && customId.startsWith('modal_cart_coupon:')) {
    const cartId = customId.split(':')[1];
    const cart = db.carts[cartId];
    if (!cart) return interaction.reply({ content: '❌ Carrinho não encontrado.', ephemeral: true });

    const code = interaction.fields.getTextInputValue('coupon_code').trim().toUpperCase();
    const product = db.products[cart.productId];

    // Procura cupom no produto ou cupom global
    const prodCoupon = (product?.coupons || []).find((c) => c.code.toUpperCase() === code);
    const globalCoupon = db.coupons[code];
    const found = prodCoupon || globalCoupon;

    if (!found) {
      return interaction.reply({ content: `❌ O cupom \`${code}\` é inválido ou expirou.`, ephemeral: true });
    }

    cart.couponCode = found.code;
    cart.discountPercent = Number(found.discountPercent) || 10;
    saveDB();

    await interaction.reply({ content: `✅ Cupom **${found.code}** aplicado com **${cart.discountPercent}%** de desconto!`, ephemeral: true });
    if (interaction.channel) {
      const view = buildCartView(cart, db);
      await interaction.channel.send(view).catch(() => null);
    }
    return;
  }

  // 6. Botão do Painel Público de Adicionar Saldo (/saldopanel)
  if (interaction.isButton() && customId === 'public_add_balance_btn') {
    const modal = new ModalBuilder()
      .setCustomId('modal_public_add_balance')
      .setTitle('💰 Adicionar Saldo na Carteira')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Valor que deseja depositar (R$)')
            .setPlaceholder('Ex: 25.00')
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_public_add_balance') {
    const rawVal = interaction.fields.getTextInputValue('amount').replace(',', '.');
    const amount = parseFloat(rawVal);
    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Informe um valor numérico válido maior que zero.', ephemeral: true });
    }

    const charge = await createPaymentCharge({
      bankConfig: db.config.bank,
      amount,
      description: `Recarga de Saldo - ${interaction.user.username}`,
      userId: interaction.user.id
    });

    db.payments[charge.paymentId] = {
      ...charge,
      type: 'wallet_topup',
      userId: interaction.user.id,
      amount,
      createdAt: new Date().toISOString()
    };
    saveDB();

    const embed = new EmbedBuilder()
      .setColor('#22C55E')
      .setTitle('💰 PIX Gerado para Adição de Saldo')
      .setDescription(`Realize o pagamento de **${formatBRL(amount)}** usando o QR Code ou PIX Copia e Cola abaixo.`)
      .addFields(
        { name: '🆔 ID do Pagamento', value: `\`${charge.paymentId}\``, inline: true },
        { name: '💵 Valor', value: `\`${formatBRL(amount)}\``, inline: true },
        { name: '📋 PIX Copia e Cola', value: `\`\`\`\n${charge.copiaECola}\n\`\`\`` }
      )
      .setImage(charge.qrCodeUrl)
      .setFooter({ text: 'Guarde o ID do pagamento caso precise consultar.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 7. Botão do Painel Público de Solicitar Estoque (/solicitarestoque)
  if (interaction.isButton() && customId === 'public_request_stock_btn') {
    const modal = new ModalBuilder()
      .setCustomId('modal_public_request_stock')
      .setTitle('📦 Solicitar Produto / Estoque')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('product_wanted')
            .setLabel('Qual produto ou conta você deseja?')
            .setPlaceholder('Ex: Prime Extremer 30 Dias / Conta Mestre')
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && customId === 'modal_public_request_stock') {
    const wanted = interaction.fields.getTextInputValue('product_wanted');
    if (db.config.channels.solicitacaoEstoqueId) {
      const ch = await client.channels.fetch(db.config.channels.solicitacaoEstoqueId).catch(() => null);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle('📦 Nova Solicitação de Estoque')
          .setDescription(`**Usuário:** <@${interaction.user.id}>\n**Pedido:**\n\`\`\`\n${wanted}\n\`\`\``)
          .setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => null);
      }
    }
    return interaction.reply({ content: '✅ Seu pedido de reposição de estoque foi registrado com sucesso!', ephemeral: true });
  }

  return false;
}

module.exports = {
  buildProductSaleMessage,
  syncProductMessages,
  openCartForUser,
  fulfillCartOrder,
  handleStoreInteraction
};
