const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const {
  loadDB,
  saveDB,
  getUser,
  recalculateBadges,
  formatBRL,
  slugify
} = require('../utils/database');
const { createPaymentCharge } = require('../utils/pix');
const {
  buildMainPanelView,
  buildProductDetailView,
  buildManageFieldsView,
  buildTicketPanelView,
  buildConfigPanelView
} = require('../handlers/panelHandler');
const { buildProductSaleMessage, fulfillCartOrder } = require('../handlers/storeHandler');
const { sendTicketStaffPanel } = require('../handlers/ticketHandler');

const commandsList = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('[⚡ Admin] Use para abrir o painel de controle'),

  new SlashCommandBuilder()
    .setName('add_ticket')
    .setDescription('[⚡ Admin] Adiciona um usuário ao ticket atual')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário a adicionar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addsaldo')
    .setDescription('[⚡ Admin] Adiciona saldo a um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário que receberá saldo').setRequired(true))
    .addNumberOption((o) => o.setName('valor').setDescription('Valor em R$').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('📋 Lista de comandos disponíveis no sistema'),

  new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('[⚡ Admin] Crie anúncios (mensagem, embed ou container) e salve até 5 modelos')
    .addStringOption((o) => o.setName('titulo').setDescription('Título do anúncio').setRequired(true))
    .addStringOption((o) => o.setName('mensagem').setDescription('Conteúdo do anúncio').setRequired(true))
    .addStringOption((o) => o.setName('banner').setDescription('URL da imagem/banner (opcional)').setRequired(false))
    .addChannelOption((o) => o.setName('canal').setDescription('Canal onde enviar (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('archive_ticket')
    .setDescription('[⚡ Admin] Use para arquivar um ticket'),

  new SlashCommandBuilder()
    .setName('atualizar-condecoracoes')
    .setDescription('[⚡ Admin] Atualiza e recalcula as condecorações de um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário para recalcular').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cargoall')
    .setDescription('[⚡ Admin] Define um cargo para todos os membros do servidor')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo para adicionar a todos').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('[⚡ Admin] Limpa mensagens do canal')
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade de mensagens (1 a 100)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('close_ticket')
    .setDescription('[⚡ Admin] Use para fechar um ticket'),

  new SlashCommandBuilder()
    .setName('closealltickets')
    .setDescription('[⚡ Admin] Abre o painel de gerenciamento/fechamento de tickets'),

  new SlashCommandBuilder()
    .setName('conceder-condecoracao')
    .setDescription('[⚡ Admin] Concede uma condecoração a um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário que receberá').setRequired(true))
    .addStringOption((o) => o.setName('condecoracao').setDescription('Nome/Emoji da condecoração (ex: 🏆 Cliente VIP)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('condecoracoes')
    .setDescription('Exibe suas condecorações conquistadas através de compras')
    .addUserOption((o) => o.setName('usuario').setDescription('Ver de outro usuário (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('consultarpagamento')
    .setDescription('[⚡ Admin] Consulta o status de um pagamento zenWallet pelo ID')
    .addStringOption((o) => o.setName('id').setDescription('ID do pagamento (ex: PAY-...)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('convites')
    .setDescription('[👤 User] Veja seus convites ou de outro usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('create_mass_coupon')
    .setDescription('[⚡ Admin] Use para criar cupons para todos produtos')
    .addStringOption((o) => o.setName('cupom').setDescription('Código do cupom (ex: PRIME15)').setRequired(true))
    .addIntegerOption((o) => o.setName('desconto').setDescription('Porcentagem de desconto (1 a 99)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('criar_produto')
    .setDescription('[⚡ Admin] Cria um produto já com o nome preenchido')
    .addStringOption((o) => o.setName('nome').setDescription('Nome do novo produto').setRequired(true))
    .addNumberOption((o) => o.setName('preco').setDescription('Preço inicial (R$)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('cuponwin')
    .setDescription('[⚡ Admin] Envia um cupom de desconto para usuario')
    .addUserOption((o) => o.setName('user').setDescription('Usuário sorteado/premiado').setRequired(true))
    .addStringOption((o) => o.setName('cupom').setDescription('Código do cupom').setRequired(true))
    .addChannelOption((o) => o.setName('canal').setDescription('Canal para anunciar (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('definir-prioridade')
    .setDescription('[⚡ Staff] Define a prioridade e o assunto do ticket atual')
    .addStringOption((o) =>
      o.setName('prioridade')
        .setDescription('Nível de prioridade')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Baixa', value: 'Baixa' },
          { name: '🟡 Normal', value: 'Normal' },
          { name: '🟠 Alta', value: 'Alta' },
          { name: '🔴 Urgente', value: 'Urgente' }
        )
    )
    .addStringOption((o) => o.setName('assunto').setDescription('Novo assunto do ticket').setRequired(false)),

  new SlashCommandBuilder()
    .setName('delivery')
    .setDescription('[⚡ Admin] Entregar produto manualmente para um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Comprador').setRequired(true))
    .addStringOption((o) => o.setName('produto').setDescription('Nome do produto').setRequired(true))
    .addStringOption((o) => o.setName('conteudo').setDescription('Key / Conta / Link a entregar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('entregar')
    .setDescription('[⚡ Admin] Use para aprovar um carrinho'),

  new SlashCommandBuilder()
    .setName('enviarpv')
    .setDescription('[⚡ Admin] Enviar mensagem privada para um membro do servidor')
    .addUserOption((o) => o.setName('usuario').setDescription('Membro destinatário').setRequired(true))
    .addStringOption((o) => o.setName('mensagem').setDescription('Mensagem a enviar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('gerarpix')
    .setDescription('[💰 | Vendas] Gere uma cobrança.')
    .addNumberOption((o) => o.setName('valor').setDescription('Valor da cobrança em R$').setRequired(true))
    .addStringOption((o) => o.setName('descricao').setDescription('Descrição da cobrança (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('invites_reset')
    .setDescription('[⚡ Admin] Resetar convites de um usuário ou de todos')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário específico (deixe vazio para todos)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('join')
    .setDescription('[⚡ Admin] Conecta o bot em um canal de voz')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal de voz').setRequired(true)),

  new SlashCommandBuilder()
    .setName('listar_assinaturas')
    .setDescription('[⚡ Admin] Lista todas as assinaturas'),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('[⚡ Admin] Use para trancar o canal'),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('[⚡ Admin] Use para destrancar o canal'),

  new SlashCommandBuilder()
    .setName('manage_item')
    .setDescription('[⚡ Admin] Use para gerenciar um campo de produto')
    .addStringOption((o) => o.setName('produto').setDescription('ID ou nome do produto').setRequired(true)),

  new SlashCommandBuilder()
    .setName('manage_product')
    .setDescription('[⚡ Admin] Use para gerenciar um produto')
    .addStringOption((o) => o.setName('produto').setDescription('ID ou nome do produto').setRequired(true)),

  new SlashCommandBuilder()
    .setName('manage_stock')
    .setDescription('[⚡ Admin] Use para gerenciar o estoque de um produto')
    .addStringOption((o) => o.setName('produto').setDescription('ID ou nome do produto').setRequired(true)),

  new SlashCommandBuilder()
    .setName('managetickets')
    .setDescription('[⚡ Admin] Use para abrir o painel de gerenciamento de tickets'),

  new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('[⚡ Admin] Nuke a channel (recria o canal limpo)'),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('[👤 User] Use para ver o seu perfil de gastos')
    .addUserOption((o) => o.setName('usuario').setDescription('Ver perfil de outro usuário (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('postproduto')
    .setDescription('[⚡ Admin] Postar mensagem de um produto em um canal (set)')
    .addStringOption((o) => o.setName('produto').setDescription('Nome ou ID do produto').setRequired(true))
    .addChannelOption((o) => o.setName('canal').setDescription('Canal onde postar (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('produtossemestoque')
    .setDescription('[⚡ Admin] Mostra os produtos que não possuem estoque.'),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('[⚡ Admin] Use para ver a classificação de gastos do servidor'),

  new SlashCommandBuilder()
    .setName('rank_convites')
    .setDescription('[👤 User] Veja o ranking de convidadores'),

  new SlashCommandBuilder()
    .setName('remove_mass_coupon')
    .setDescription('[⚡ Admin] Use para remover cupons criados em massa')
    .addStringOption((o) => o.setName('cupom').setDescription('Código do cupom (ou TODOS)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('remove-feedback')
    .setDescription('[⚡ Admin] Remove a permissão de um usuário de ver o Canal feed')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário a bloquear no canal de feedback').setRequired(true)),

  new SlashCommandBuilder()
    .setName('removercargoall')
    .setDescription('[⚡ Admin] Remove um cargo de todos os membros do servidor')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo a remover').setRequired(true)),

  new SlashCommandBuilder()
    .setName('removersaldo')
    .setDescription('[⚡ Admin] Remove saldo de um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addNumberOption((o) => o.setName('valor').setDescription('Valor em R$ a remover').setRequired(true)),

  new SlashCommandBuilder()
    .setName('saldopanel')
    .setDescription('[⚡ Admin] Publica em canal público o painel de saldo'),

  new SlashCommandBuilder()
    .setName('sales')
    .setDescription('[⚡ Admin] Use para ver suas vendas'),

  new SlashCommandBuilder()
    .setName('sincronizar_posicoes')
    .setDescription('[⚡ Admin] Sincroniza os cargos de posição com base no valor gasto somente para clientes'),

  new SlashCommandBuilder()
    .setName('solicitarestoque')
    .setDescription('[⚡ Admin] Envia o painel para usuários solicitarem produtos para estoque'),

  new SlashCommandBuilder()
    .setName('ticketstaff')
    .setDescription('[⚡ Staff] Abre o painel staff do ticket atual (ephemeral)'),

  new SlashCommandBuilder()
    .setName('tools')
    .setDescription('[⚡ Admin] Use para abrir o painel de ferramentas'),

  new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('[⚡ Admin] Reinicia o tutorial do painel de controle'),

  new SlashCommandBuilder()
    .setName('vercompras')
    .setDescription('[👤 User] Veja o histórico completo das suas compras'),

  new SlashCommandBuilder()
    .setName('vincular_assinatura')
    .setDescription('[⚡ Admin] Vincula uma assinatura a um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Cliente').setRequired(true))
    .addStringOption((o) => o.setName('plano').setDescription('Nome do plano/produto').setRequired(true))
    .addIntegerOption((o) => o.setName('dias').setDescription('Duração em dias (ex: 30)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('bot_avatar')
    .setDescription('[⚡ Admin] Altera a foto de perfil (avatar) do bot')
    .addStringOption((o) => o.setName('url').setDescription('URL direta da nova imagem').setRequired(false))
    .addAttachmentOption((o) => o.setName('anexo').setDescription('Envie o arquivo de imagem diretamente').setRequired(false)),

  new SlashCommandBuilder()
    .setName('bot_nome')
    .setDescription('[⚡ Admin] Altera o nome de usuário do bot')
    .addStringOption((o) => o.setName('nome').setDescription('Novo nome para o bot').setRequired(true)),

  new SlashCommandBuilder()
    .setName('bot_status')
    .setDescription('[⚡ Admin] Altera o status e atividade do bot')
    .addStringOption((o) =>
      o.setName('status')
        .setDescription('Estado online do bot')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Online', value: 'online' },
          { name: '🟡 Ausente (Idle)', value: 'idle' },
          { name: '🔴 Não Perturbe (DND)', value: 'dnd' }
        )
    )
    .addStringOption((o) =>
      o.setName('tipo')
        .setDescription('Tipo de atividade')
        .setRequired(true)
        .addChoices(
          { name: 'Jogando', value: '0' },
          { name: 'Transmitindo', value: '1' },
          { name: 'Ouvindo', value: '2' },
          { name: 'Assistindo', value: '3' },
          { name: 'Competindo', value: '5' }
        )
    )
    .addStringOption((o) => o.setName('texto').setDescription('Texto exibido na atividade').setRequired(true)),

  new SlashCommandBuilder()
    .setName('bot_bio')
    .setDescription('[⚡ Admin] Altera o subtítulo/bio do Prime Group')
    .addStringOption((o) => o.setName('texto').setDescription('Novo subtítulo institucional').setRequired(true))
];

function isAdminOrStaff(interaction, db) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const r = db.config.roles;
  if (r.adminRoleId && interaction.member?.roles?.cache?.has(r.adminRoleId)) return true;
  if (r.staffRoleId && interaction.member?.roles?.cache?.has(r.staffRoleId)) return true;
  return false;
}

function findProductByQuery(db, query) {
  const q = String(query || '').trim().toLowerCase();
  if (db.products[q]) return db.products[q];
  return Object.values(db.products).find(
    (p) => p.id.toLowerCase() === q || p.name.toLowerCase().includes(q)
  );
}

async function handleSlashCommand(interaction, client) {
  const db = loadDB();
  const cmd = interaction.commandName;

  // Verificação de Bot Privado (se ativado, só responde no servidor autorizado)
  if (db.config.isPrivate) {
    const allowed = db.config.allowedGuildId || process.env.GUILD_ID;
    if (allowed && interaction.guildId !== allowed) {
      return interaction.reply({
        content: '🔒 Este bot é de uso privado do **Prime Group** e não está autorizado neste servidor.',
        ephemeral: true
      });
    }
  }

  // Comandos públicos de usuário
  const publicCommands = ['ajuda', 'condecoracoes', 'convites', 'perfil', 'rank_convites', 'vercompras'];
  if (!publicCommands.includes(cmd) && !isAdminOrStaff(interaction, db)) {
    return interaction.reply({
      content: '❌ Você não possui permissão de Administrador/Staff para utilizar este comando.',
      ephemeral: true
    });
  }

  switch (cmd) {
    case 'panel': {
      return interaction.reply({ ...buildMainPanelView(db), ephemeral: true });
    }

    case 'ajuda': {
      const embed = new EmbedBuilder()
        .setColor(db.config.color || '#5865F2')
        .setAuthor({ name: `${db.config.brandName} • Central de Comandos` })
        .setTitle(`📋 Comandos Disponíveis — ${db.config.storeName}`)
        .addFields(
          {
            name: '👑 Painel & Loja (Admin)',
            value: '`/panel` `/criar_produto` `/manage_product` `/manage_item` `/manage_stock` `/postproduto` `/produtossemestoque` `/sales` `/gerarpix` `/entregar` `/delivery`'
          },
          {
            name: '🏷️ Cupons, Saldo & Assinaturas',
            value: '`/create_mass_coupon` `/remove_mass_coupon` `/cuponwin` `/addsaldo` `/removersaldo` `/saldopanel` `/consultarpagamento` `/vincular_assinatura` `/listar_assinaturas`'
          },
          {
            name: '🎧 Sistema de Tickets',
            value: '`/managetickets` `/ticketstaff` `/add_ticket` `/definir-prioridade` `/archive_ticket` `/close_ticket` `/closealltickets`'
          },
          {
            name: '🛠️ Utilidades & Moderação',
            value: '`/anunciar` `/clear` `/lock` `/unlock` `/nuke` `/cargoall` `/removercargoall` `/enviarpv` `/join` `/tools` `/tutorial`'
          },
          {
            name: '👤 Comandos de Membros',
            value: '`/perfil` `/vercompras` `/condecoracoes` `/convites` `/rank_convites` `/rank`'
          }
        )
        .setFooter({ text: db.config.storeName })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'add_ticket': {
      const target = interaction.options.getUser('usuario');
      if (interaction.channel?.isThread()) {
        await interaction.channel.members.add(target.id).catch(() => null);
      } else if (interaction.channel?.permissionOverwrites) {
        await interaction.channel.permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => null);
      }
      return interaction.reply({ content: `✅ O usuário <@${target.id}> foi adicionado a este ticket!` });
    }

    case 'archive_ticket': {
      const t = db.tickets.active[interaction.channelId];
      if (t) {
        t.status = 'archived';
        saveDB();
      }
      await interaction.reply({ content: '📁 Ticket arquivado com sucesso!' });
      if (interaction.channel?.isThread()) {
        await interaction.channel.setArchived(true).catch(() => null);
      }
      return;
    }

    case 'close_ticket': {
      delete db.tickets.active[interaction.channelId];
      saveDB();
      await interaction.reply({ content: '🔒 Fechando este ticket em 5 segundos...' });
      setTimeout(() => {
        interaction.channel?.delete('Fechado via /close_ticket').catch(() => null);
      }, 5000);
      return;
    }

    case 'closealltickets': {
      const openList = Object.values(db.tickets.active);
      const embed = new EmbedBuilder()
        .setColor('#EF4444')
        .setTitle('🗂️ Gerenciamento de Tickets Abertos')
        .setDescription(`Atualmente existem **${openList.length}** ticket(s) ativo(s) no servidor.\nDeseja encerrar todos de uma vez?`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tkt_close_all_confirm')
          .setLabel(`Fechar Todos (${openList.length})`)
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(openList.length === 0)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    case 'definir-prioridade': {
      const prio = interaction.options.getString('prioridade');
      const subject = interaction.options.getString('assunto');
      const t = db.tickets.active[interaction.channelId];
      if (t) {
        t.priority = prio;
        if (subject) t.subject = subject;
        saveDB();
      }
      return interaction.reply({
        content: `🚦 Prioridade do ticket atualizada para **${prio}**${subject ? ` | Assunto: **${subject}**` : ''}!`
      });
    }

    case 'ticketstaff': {
      return sendTicketStaffPanel(interaction, db.tickets.active[interaction.channelId]);
    }

    case 'managetickets': {
      return interaction.reply({ ...buildTicketPanelView(db), ephemeral: true });
    }

    case 'addsaldo': {
      const target = interaction.options.getUser('usuario');
      const val = Number(interaction.options.getNumber('valor'));
      const u = getUser(target.id);
      u.balance = Number((u.balance + val).toFixed(2));
      saveDB();
      return interaction.reply({
        content: `✅ Adicionado **${formatBRL(val)}** ao saldo de <@${target.id}>! Novo saldo: **${formatBRL(u.balance)}**.`
      });
    }

    case 'removersaldo': {
      const target = interaction.options.getUser('usuario');
      const val = Number(interaction.options.getNumber('valor'));
      const u = getUser(target.id);
      u.balance = Math.max(0, Number((u.balance - val).toFixed(2)));
      saveDB();
      return interaction.reply({
        content: `✅ Removido **${formatBRL(val)}** do saldo de <@${target.id}>! Novo saldo: **${formatBRL(u.balance)}**.`
      });
    }

    case 'saldopanel': {
      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setAuthor({ name: `${db.config.brandName} • zenWallet` })
        .setTitle(`💰 Painel de Saldo — ${db.config.storeName}`)
        .setDescription('Adicione saldo em sua carteira via **PIX** para realizar compras instantâneas em nossa loja!')
        .setFooter({ text: db.config.storeName });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('public_add_balance_btn')
          .setLabel('Adicionar Saldo via PIX')
          .setEmoji('💳')
          .setStyle(ButtonStyle.Success)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Painel de saldo publicado!', ephemeral: true });
    }

    case 'consultarpagamento': {
      const id = interaction.options.getString('id').trim();
      const pay = db.payments[id];
      if (!pay) {
        return interaction.reply({ content: `❌ Pagamento \`${id}\` não encontrado no sistema.`, ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor('#3B82F6')
        .setTitle(`🔍 Consulta de Pagamento — ${id}`)
        .addFields(
          { name: '👤 Usuário', value: `<@${pay.userId}>`, inline: true },
          { name: '💰 Valor', value: `\`${formatBRL(pay.amount)}\``, inline: true },
          { name: '📌 Status', value: `\`${pay.status.toUpperCase()}\``, inline: true },
          { name: '🏦 Provedor', value: `\`${pay.provider || 'PIX'}\``, inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'gerarpix': {
      const valor = interaction.options.getNumber('valor');
      const desc = interaction.options.getString('descricao') || `Cobrança avulsa - ${db.config.storeName}`;
      await interaction.deferReply();

      const charge = await createPaymentCharge({
        bankConfig: db.config.bank,
        amount: valor,
        description: desc,
        userId: interaction.user.id
      });

      db.payments[charge.paymentId] = {
        ...charge,
        userId: interaction.user.id,
        amount: valor,
        description: desc,
        createdAt: new Date().toISOString()
      };
      saveDB();

      const embed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setAuthor({ name: `${db.config.brandName} • Cobrança PIX` })
        .setTitle('💠 Cobrança PIX Gerada')
        .setDescription(`**Descrição:** ${desc}`)
        .addFields(
          { name: '🆔 ID', value: `\`${charge.paymentId}\``, inline: true },
          { name: '💰 Valor', value: `\`${formatBRL(valor)}\``, inline: true },
          { name: '📋 PIX Copia e Cola', value: `\`\`\`\n${charge.copiaECola}\n\`\`\`` }
        )
        .setImage(charge.qrCodeUrl)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    case 'criar_produto': {
      const nome = interaction.options.getString('nome').trim();
      const preco = interaction.options.getNumber('preco') || 10.0;
      const id = slugify(nome);
      db.products[id] = {
        id,
        name: nome,
        description: `# ${nome}\nConfigure a descrição pelo painel.`,
        banner: '',
        color: '#5865F2',
        autoDelivery: true,
        fields: [
          {
            id: `${id}_padrao`,
            name: `${nome.toUpperCase()} PADRÃO`,
            price: preco,
            stock: []
          }
        ],
        coupons: [],
        publishedMessages: []
      };
      saveDB();
      return interaction.reply({
        content: `✅ Produto **${nome}** criado! Gerencie-o abaixo:`,
        ...buildProductDetailView(db.products[id], db),
        ephemeral: true
      });
    }

    case 'manage_product': {
      const q = interaction.options.getString('produto');
      const prod = findProductByQuery(db, q);
      if (!prod) return interaction.reply({ content: `❌ Produto "${q}" não encontrado.`, ephemeral: true });
      return interaction.reply({ ...buildProductDetailView(prod, db), ephemeral: true });
    }

    case 'manage_item':
    case 'manage_stock': {
      const q = interaction.options.getString('produto');
      const prod = findProductByQuery(db, q);
      if (!prod) return interaction.reply({ content: `❌ Produto "${q}" não encontrado.`, ephemeral: true });
      return interaction.reply({ ...buildManageFieldsView(prod), ephemeral: true });
    }

    case 'postproduto': {
      const q = interaction.options.getString('produto');
      const targetCh = interaction.options.getChannel('canal') || interaction.channel;
      const prod = findProductByQuery(db, q);
      if (!prod) return interaction.reply({ content: `❌ Produto "${q}" não encontrado.`, ephemeral: true });

      const payload = buildProductSaleMessage(prod, db);
      const sent = await targetCh.send(payload);
      prod.publishedMessages = prod.publishedMessages || [];
      prod.publishedMessages.push({ channelId: sent.channel.id, messageId: sent.id });
      saveDB();
      return interaction.reply({ content: `✅ Produto **${prod.name}** postado em <#${targetCh.id}>!`, ephemeral: true });
    }

    case 'produtossemestoque': {
      const out = Object.values(db.products).filter((p) =>
        !p.fields || p.fields.length === 0 || p.fields.some((f) => !f.stock || f.stock.length === 0)
      );
      const text = out.map((p) => {
        const emptyF = (p.fields || []).filter((f) => !f.stock || f.stock.length === 0).map((f) => f.name).join(', ');
        return `• **${p.name}** — Sem estoque em: \`${emptyF || 'Todos os campos'}\``;
      }).join('\n') || '✅ Todos os produtos estão com estoque em dia!';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#EF4444').setTitle('📦 Produtos Sem Estoque').setDescription(text)],
        ephemeral: true
      });
    }

    case 'entregar': {
      const cart = Object.values(db.carts).find((c) => c.channelId === interaction.channelId && c.status !== 'delivered');
      if (!cart) {
        return interaction.reply({ content: '❌ Utilize este comando dentro do canal/tópico de um carrinho ativo.', ephemeral: true });
      }
      await interaction.deferReply();
      const res = await fulfillCartOrder(client, interaction.guild, cart, `Aprovado via /entregar por ${interaction.user.username}`);
      if (!res.ok) return interaction.editReply({ content: `❌ Erro: ${res.error}` });
      return interaction.editReply({ content: '✅ Carrinho aprovado e produto entregue com sucesso!' });
    }

    case 'delivery': {
      const user = interaction.options.getUser('usuario');
      const prodName = interaction.options.getString('produto');
      const content = interaction.options.getString('conteudo');

      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle('📦 Entrega Manual de Produto')
        .setDescription(`Olá <@${user.id}>! Você recebeu um produto enviado por <@${interaction.user.id}>:`)
        .addFields(
          { name: '🛍️ Produto', value: `\`${prodName}\``, inline: true },
          { name: '🔑 Conteúdo / Key', value: `\`\`\`\n${content}\n\`\`\``, inline: false }
        )
        .setFooter({ text: db.config.storeName })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => null);
      return interaction.reply({ content: `✅ Produto **${prodName}** entregue para <@${user.id}>!`, embeds: [embed], ephemeral: true });
    }

    case 'create_mass_coupon': {
      const code = interaction.options.getString('cupom').trim().toUpperCase();
      const discountPercent = Math.min(99, Math.max(1, interaction.options.getInteger('desconto')));
      db.coupons[code] = { code, discountPercent, createdAt: new Date().toISOString() };
      for (const p of Object.values(db.products)) {
        p.coupons = (p.coupons || []).filter((c) => c.code !== code);
        p.coupons.push({ code, discountPercent });
      }
      saveDB();
      return interaction.reply({ content: `✅ Cupom em massa **${code}** (-${discountPercent}%) criado para todos os produtos!`, ephemeral: true });
    }

    case 'remove_mass_coupon': {
      const code = (interaction.options.getString('cupom') || 'TODOS').trim().toUpperCase();
      if (code === 'TODOS') {
        db.coupons = {};
        for (const p of Object.values(db.products)) p.coupons = [];
      } else {
        delete db.coupons[code];
        for (const p of Object.values(db.products)) {
          p.coupons = (p.coupons || []).filter((c) => c.code !== code);
        }
      }
      saveDB();
      return interaction.reply({ content: `🗑️ Cupom(ns) em massa removido(s) com sucesso (${code})!`, ephemeral: true });
    }

    case 'cuponwin': {
      const user = interaction.options.getUser('user');
      const code = interaction.options.getString('cupom').trim().toUpperCase();
      const ch = interaction.options.getChannel('canal') || interaction.channel;

      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle('🎁 Você Ganhou um Cupom de Desconto!')
        .setDescription(`Parabéns <@${user.id}>! Você recebeu o cupom exclusivo **\`${code}\`** para utilizar em nossa loja!`);

      await user.send({ embeds: [embed] }).catch(() => null);
      await ch.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => null);
      return interaction.reply({ content: `✅ Cupom **${code}** enviado para <@${user.id}>!`, ephemeral: true });
    }

    case 'perfil': {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const u = getUser(target.id);
      const badges = recalculateBadges(target.id);
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: `Perfil de Cliente • ${target.username}`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: '💰 Saldo em Carteira', value: `\`${formatBRL(u.balance)}\``, inline: true },
          { name: '🛒 Total Gasto na Loja', value: `\`${formatBRL(u.totalSpent)}\``, inline: true },
          { name: '📦 Compras Realizadas', value: `\`${u.purchasesCount || 0} pedidos\``, inline: true },
          { name: '🏅 Condecorações', value: badges.length > 0 ? badges.join('\n') : '`Nenhuma condecoração ainda`', inline: false }
        )
        .setFooter({ text: db.config.storeName })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    case 'vercompras': {
      const u = getUser(interaction.user.id);
      const list = (u.purchases || []).slice(-10).reverse().map((p) =>
        `• \`${p.id}\` — **${p.productName} (${p.fieldName})** • \`${formatBRL(p.amount)}\``
      ).join('\n') || '*Você ainda não realizou nenhuma compra.*';
      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle('🛍️ Histórico de Compras')
        .setDescription(list);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'condecoracoes': {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const badges = recalculateBadges(target.id);
      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle(`🏅 Condecorações de ${target.username}`)
        .setDescription(badges.length > 0 ? badges.map((b) => `• ${b}`).join('\n') : 'Nenhuma condecoração conquistada ainda. Realize compras na loja para desbloquear!');
      return interaction.reply({ embeds: [embed] });
    }

    case 'conceder-condecoracao': {
      const target = interaction.options.getUser('usuario');
      const badge = interaction.options.getString('condecoracao').trim();
      const u = getUser(target.id);
      if (!u.badges.includes(badge)) u.badges.push(badge);
      saveDB();
      return interaction.reply({ content: `🏅 Condecoração **${badge}** concedida para <@${target.id}>!` });
    }

    case 'atualizar-condecoracoes': {
      const target = interaction.options.getUser('usuario');
      const badges = recalculateBadges(target.id);
      return interaction.reply({ content: `✅ Condecorações de <@${target.id}> recalculadas! Total: **${badges.length}**.` });
    }

    case 'rank': {
      const sorted = Object.values(db.users)
        .filter((u) => u.totalSpent > 0)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);
      const desc = sorted.map((u, i) => `**#${i + 1}** <@${u.id}> — \`${formatBRL(u.totalSpent)}\` (${u.purchasesCount} compras)`).join('\n') || '*Nenhuma venda registrada ainda.*';
      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle(`🏆 Ranking de Gastos — ${db.config.storeName}`)
        .setDescription(desc);
      return interaction.reply({ embeds: [embed] });
    }

    case 'sales': {
      const sales = db.sales || [];
      const total = sales.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
      const recent = sales.slice(-10).reverse().map((s) =>
        `• \`${s.id}\` | <@${s.userId}> comprou **${s.productName}** (${formatBRL(s.amount)})`
      ).join('\n') || '*Nenhuma venda realizada ainda.*';
      const embed = new EmbedBuilder()
        .setColor('#22C55E')
        .setTitle('📊 Relatório de Vendas')
        .setDescription(`**Total Faturado:** \`${formatBRL(total)}\` em \`${sales.length}\` vendas.\n\n**Últimas Vendas:**\n${recent}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'sincronizar_posicoes': {
      const rankRoles = db.config.roles.rankRoles || [];
      let updated = 0;
      for (const u of Object.values(db.users)) {
        if (!u.totalSpent || u.totalSpent <= 0) continue;
        const member = await interaction.guild.members.fetch(u.id).catch(() => null);
        if (!member) continue;
        for (const r of rankRoles) {
          if (r.roleId && u.totalSpent >= r.minSpent) {
            await member.roles.add(r.roleId).catch(() => null);
            updated++;
          }
        }
      }
      return interaction.reply({ content: `✅ Cargos de posição sincronizados para **${updated}** cliente(s)!`, ephemeral: true });
    }

    case 'solicitarestoque': {
      const embed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle(`📦 Solicitar Reposição de Estoque — ${db.config.storeName}`)
        .setDescription('O produto que você queria acabou? Clique no botão abaixo para pedir reposição à nossa equipe!');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('public_request_stock_btn').setLabel('Solicitar Produto').setEmoji('🔔').setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Painel de solicitação de estoque enviado!', ephemeral: true });
    }

    case 'convites': {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const u = getUser(target.id);
      const inv = u.invites || { regular: 0, bonus: 0, left: 0, fake: 0 };
      const total = Math.max(0, inv.regular + inv.bonus - inv.left - inv.fake);
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📨 Convites de ${target.username}`)
        .setDescription(`Total de Convites Válidos: **\`${total}\`**\n\n✅ Entraram: \`${inv.regular}\` | 🎁 Bônus: \`${inv.bonus}\` | ❌ Saíram: \`${inv.left}\``);
      return interaction.reply({ embeds: [embed] });
    }

    case 'rank_convites': {
      const sorted = Object.values(db.users)
        .map((u) => {
          const inv = u.invites || { regular: 0, bonus: 0, left: 0, fake: 0 };
          return { id: u.id, total: Math.max(0, inv.regular + inv.bonus - inv.left - inv.fake) };
        })
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      const desc = sorted.map((x, i) => `**#${i + 1}** <@${x.id}> — \`${x.total} convites\``).join('\n') || '*Nenhum convite contabilizado ainda.*';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('🏆 Ranking de Convidadores').setDescription(desc)]
      });
    }

    case 'invites_reset': {
      const target = interaction.options.getUser('usuario');
      if (target) {
        const u = getUser(target.id);
        u.invites = { regular: 0, bonus: 0, left: 0, fake: 0, invitedUsers: [] };
        saveDB();
        return interaction.reply({ content: `✅ Convites de <@${target.id}> resetados!` });
      }
      for (const u of Object.values(db.users)) {
        u.invites = { regular: 0, bonus: 0, left: 0, fake: 0, invitedUsers: [] };
      }
      saveDB();
      return interaction.reply({ content: '✅ Todos os convites do servidor foram resetados!' });
    }

    case 'anunciar': {
      const titulo = interaction.options.getString('titulo');
      const mensagem = interaction.options.getString('mensagem');
      const banner = interaction.options.getString('banner');
      const ch = interaction.options.getChannel('canal') || interaction.channel;

      const embed = new EmbedBuilder()
        .setColor(db.config.color || '#5865F2')
        .setAuthor({ name: db.config.storeName })
        .setTitle(titulo)
        .setDescription(mensagem)
        .setTimestamp();
      if (banner && banner.startsWith('http')) embed.setImage(banner);

      db.announceTemplates = db.announceTemplates || [];
      db.announceTemplates.unshift({ titulo, mensagem, banner });
      db.announceTemplates = db.announceTemplates.slice(0, 5);
      saveDB();

      await ch.send({ embeds: [embed] });
      return interaction.reply({ content: `📢 Anúncio enviado em <#${ch.id}> (modelo salvo)!`, ephemeral: true });
    }

    case 'clear': {
      const qtd = Math.min(100, Math.max(1, interaction.options.getInteger('quantidade')));
      const deleted = await interaction.channel.bulkDelete(qtd, true).catch(() => null);
      return interaction.reply({
        content: `🧹 Foram apagadas **${deleted?.size || 0}** mensagens neste canal!`,
        ephemeral: true
      });
    }

    case 'lock': {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
      return interaction.reply({ content: '🔒 Este canal foi **trancado** pela administração!' });
    }

    case 'unlock': {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: true });
      return interaction.reply({ content: '🔓 Este canal foi **destrancado**!' });
    }

    case 'nuke': {
      const channel = interaction.channel;
      if (!channel || !channel.clone) {
        return interaction.reply({ content: '❌ Este canal não pode receber nuke.', ephemeral: true });
      }
      const pos = channel.position;
      const cloned = await channel.clone({ reason: `Nuke executado por ${interaction.user.tag}` });
      await cloned.setPosition(pos).catch(() => null);
      await channel.delete('Nuke').catch(() => null);
      await cloned.send({ content: `☢️ **Canal recriado (Nuke)** por <@${interaction.user.id}>!` }).catch(() => null);
      return;
    }

    case 'cargoall': {
      const role = interaction.options.getRole('cargo');
      await interaction.reply({ content: `⏳ Adicionando o cargo <@&${role.id}> a todos os membros... Isso pode levar alguns instantes.`, ephemeral: true });
      const members = await interaction.guild.members.fetch();
      let count = 0;
      for (const [, m] of members) {
        if (!m.user.bot && !m.roles.cache.has(role.id)) {
          await m.roles.add(role.id).catch(() => null);
          count++;
        }
      }
      return interaction.followUp({ content: `✅ Cargo <@&${role.id}> adicionado para **${count}** membros!`, ephemeral: true });
    }

    case 'removercargoall': {
      const role = interaction.options.getRole('cargo');
      await interaction.reply({ content: `⏳ Removendo o cargo <@&${role.id}> de todos os membros...`, ephemeral: true });
      const members = await interaction.guild.members.fetch();
      let count = 0;
      for (const [, m] of members) {
        if (m.roles.cache.has(role.id)) {
          await m.roles.remove(role.id).catch(() => null);
          count++;
        }
      }
      return interaction.followUp({ content: `✅ Cargo <@&${role.id}> removido de **${count}** membros!`, ephemeral: true });
    }

    case 'remove-feedback': {
      const target = interaction.options.getUser('usuario');
      const feedId = db.config.channels.feedbackId;
      const ch = feedId ? await client.channels.fetch(feedId).catch(() => null) : interaction.channel;
      if (ch && ch.permissionOverwrites) {
        await ch.permissionOverwrites.edit(target.id, { ViewChannel: false, SendMessages: false });
      }
      return interaction.reply({ content: `🚫 Permissão de visualizar/enviar no canal de feedback removida de <@${target.id}>!` });
    }

    case 'enviarpv': {
      const target = interaction.options.getUser('usuario');
      const msg = interaction.options.getString('mensagem');
      const embed = new EmbedBuilder()
        .setColor(db.config.color || '#5865F2')
        .setAuthor({ name: `Mensagem Oficial • ${db.config.storeName}` })
        .setDescription(msg)
        .setFooter({ text: `Enviado pela administração de ${interaction.guild.name}` })
        .setTimestamp();
      const ok = await target.send({ embeds: [embed] }).then(() => true).catch(() => false);
      if (!ok) return interaction.reply({ content: `❌ Não foi possível enviar DM para <@${target.id}> (DM fechada).`, ephemeral: true });
      return interaction.reply({ content: `✅ Mensagem privada enviada com sucesso para <@${target.id}>!`, ephemeral: true });
    }

    case 'join': {
      const ch = interaction.options.getChannel('canal');
      if (ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) {
        return interaction.reply({ content: '❌ Selecione um canal de voz válido.', ephemeral: true });
      }
      joinVoiceChannel({
        channelId: ch.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
      });
      return interaction.reply({ content: `🔊 Conectado com sucesso ao canal de voz <#${ch.id}>!`, ephemeral: true });
    }

    case 'vincular_assinatura': {
      const target = interaction.options.getUser('usuario');
      const plano = interaction.options.getString('plano');
      const dias = interaction.options.getInteger('dias');
      const expiresAt = new Date(Date.now() + dias * 86_400_000).toISOString();

      const sub = {
        id: `SUB-${Date.now().toString(36).toUpperCase()}`,
        userId: target.id,
        planName: plano,
        days: dias,
        expiresAt,
        createdAt: new Date().toISOString()
      };
      db.subscriptions = db.subscriptions || [];
      db.subscriptions.push(sub);
      saveDB();

      return interaction.reply({
        content: `✅ Assinatura **${plano}** vinculada para <@${target.id}> por **${dias} dias** (Expira em <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:D>)!`
      });
    }

    case 'listar_assinaturas': {
      const subs = db.subscriptions || [];
      const text = subs.map((s) => {
        const expUnix = Math.floor(new Date(s.expiresAt).getTime() / 1000);
        return `• \`${s.id}\` — <@${s.userId}> | **${s.planName}** (Expira <t:${expUnix}:R>)`;
      }).join('\n') || '*Nenhuma assinatura ativa no momento.*';

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#3B82F6').setTitle('📅 Assinaturas Vinculadas').setDescription(text)],
        ephemeral: true
      });
    }

    case 'tools': {
      return interaction.reply({ ...buildConfigPanelView(db), ephemeral: true });
    }

    case 'tutorial': {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🎓 Tutorial Rápido — ${db.config.storeName}`)
        .setDescription([
          '**1. Configurar PIX / Banco:**',
          'Use `/panel` ➜ `⚙️ Configurações` ➜ `👛 Setar meu banco` e informe sua Chave PIX (ou Token Mercado Pago).',
          '',
          '**2. Gerenciar Produtos e Estoque:**',
          'Use `/panel` ➜ `🏪 Minha loja` ➜ `✏️ Produtos`, escolha um produto (ex: *Prime Extremer*) e clique em `📋 Gerenciar campos` para adicionar keys/contas no estoque.',
          '',
          '**3. Colocar Produto à Venda:**',
          'Dentro do produto, clique no botão verde `✔️ Colocar a venda` ou use `/postproduto` no canal desejado.',
          '',
          '**4. Configurar Tickets:**',
          'Use `/panel` ➜ `🎧 Ticket` e clique em `✔️ Postar Mensagem` no seu canal de atendimento!'
        ].join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'bot_avatar': {
      await interaction.deferReply({ ephemeral: true });
      const url = interaction.options.getString('url');
      const attachment = interaction.options.getAttachment('anexo');
      const targetUrl = attachment?.url || url;

      if (!targetUrl) {
        return interaction.editReply({ content: 'Informe uma URL ou anexe uma imagem para definir como avatar.' });
      }

      try {
        await client.user.setAvatar(targetUrl);

        if (db.config.channels?.systemId) {
          const sysCh = await client.channels.fetch(db.config.channels.systemId).catch(() => null);
          if (sysCh) {
            const embed = new EmbedBuilder()
              .setColor('#7C3AED')
              .setTitle('⚙️ Avatar do Bot Atualizado')
              .setDescription(`Avatar alterado por <@${interaction.user.id}>.`)
              .setImage(targetUrl)
              .setTimestamp();
            await sysCh.send({ embeds: [embed] }).catch(() => null);
          }
        }

        return interaction.editReply({ content: '✓ Avatar do bot alterado com sucesso!' });
      } catch (err) {
        return interaction.editReply({ content: `Erro ao alterar avatar: ${err.message}. Lembre-se que o Discord limita trocas de avatar a cada poucos minutos.` });
      }
    }

    case 'bot_nome': {
      await interaction.deferReply({ ephemeral: true });
      const newName = interaction.options.getString('nome').trim();

      try {
        await client.user.setUsername(newName);

        if (db.config.channels?.systemId) {
          const sysCh = await client.channels.fetch(db.config.channels.systemId).catch(() => null);
          if (sysCh) {
            const embed = new EmbedBuilder()
              .setColor('#7C3AED')
              .setTitle('⚙️ Nome do Bot Atualizado')
              .setDescription(`Nome alterado para **${newName}** por <@${interaction.user.id}>.`)
              .setTimestamp();
            await sysCh.send({ embeds: [embed] }).catch(() => null);
          }
        }

        return interaction.editReply({ content: `✓ Nome do bot alterado para **${newName}**!` });
      } catch (err) {
        return interaction.editReply({ content: `Erro ao alterar nome: ${err.message}. O Discord permite trocar o nome de usuário apenas 2 vezes por hora.` });
      }
    }

    case 'bot_status': {
      const status = interaction.options.getString('status');
      const tipo = parseInt(interaction.options.getString('tipo'), 10);
      const texto = interaction.options.getString('texto');

      db.config.presence = {
        status,
        activityType: tipo,
        activityText: texto
      };
      saveDB();

      client.user.setPresence({
        activities: [{ name: texto, type: tipo }],
        status
      });

      if (db.config.channels?.systemId) {
        const sysCh = await client.channels.fetch(db.config.channels.systemId).catch(() => null);
        if (sysCh) {
          const embed = new EmbedBuilder()
            .setColor('#7C3AED')
            .setTitle('⚙️ Status do Bot Atualizado')
            .setDescription(`Status: \`${status}\` | Atividade: \`${texto}\` (Alterado por <@${interaction.user.id}>)`)
            .setTimestamp();
          await sysCh.send({ embeds: [embed] }).catch(() => null);
        }
      }

      return interaction.reply({
        content: `✓ Status atualizado para **${status.toUpperCase()}** com a atividade: "${texto}"!`,
        ephemeral: true
      });
    }

    case 'bot_bio': {
      const bio = interaction.options.getString('texto').trim();
      db.config.brandName = bio;
      saveDB();

      return interaction.reply({
        content: `✓ Subtítulo / bio do bot atualizado para: **${bio}**!`,
        ephemeral: true
      });
    }

    default:
      return interaction.reply({ content: '⚙️ Comando recebido.', ephemeral: true });
  }
}

module.exports = {
  commandsList,
  handleSlashCommand
};
