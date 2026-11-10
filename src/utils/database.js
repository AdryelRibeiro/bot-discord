const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DEFAULT_DB = {
  config: {
    storeName: 'Prime Group',
    brandName: 'Prime Store',
    currency: 'BRL',
    locale: 'pt_BR',
    color: '#7C3AED',
    mainBanner: '',
    storeBanner: '',
    isPrivate: true,
    allowedGuildId: '',
    allowedGuildIds: [],
    presence: {
      status: 'online', // 'online' | 'idle' | 'dnd'
      activityType: 0, // 0: Playing, 1: Streaming, 2: Listening, 3: Watching, 5: Competing
      activityText: 'Prime Group • /panel'
    },
    roles: {
      adminRoleId: '',
      staffRoleId: '',
      customerRoleId: '',
      autoRoleId: '',
      verifiedRoleId: '',
      rankRoles: [
        { minSpent: 50, roleId: '', name: 'Bronze VIP' },
        { minSpent: 150, roleId: '', name: 'Prata VIP' },
        { minSpent: 500, roleId: '', name: 'Ouro VIP' }
      ]
    },
    channels: {
      logsCategoryId: '',
      systemId: '',
      logsVendasId: '', // logspedidos
      entradasId: '',
      saidasId: '',
      notifyOnId: '',
      mensagensId: '',
      trafegoId: '', // Chamadas de voz / Call logs
      logsTicketsId: '', // ticket
      solicitacaoEstoqueId: '', // solicitacoes-estoque
      boasVindasId: '',
      feedbackId: ''
    },
    bank: {
      provider: 'PIX',
      configured: false,
      pixKey: '',
      pixHolderName: 'PRIME GROUP',
      pixCity: 'SAO PAULO',
      mpAccessToken: ''
    },
    welcome: {
      enabled: false,
      title: 'Bem-vindo(a) à Prime Group',
      message: 'Olá {user}, seja bem-vindo(a) ao **{server}**.',
      banner: ''
    },
    automations: {
      autoCancelCartMinutes: 58,
      autoRoleCustomer: true,
      stockAlertDM: true,
      autoSyncMessages: true,
      productRepost: {
        enabled: false,
        intervalMinutes: 180,
        fixedHours: '12:00, 18:00, 22:00',
        lastRepostAt: 0
      },
      autoMessages: []
    },
    zenCloud: {
      oauthClientId: '',
      oauthClientSecret: '',
      authBotToken: '',
      baseUrl: '',
      guildId: '',
      verifiedRoleId: '',
      logChannelId: '',
      webhookUrl: '',
      verifiedUsers: []
    },
    zenProtect: {
      antiInvite: false,
      antiSpam: false,
      raidMode: false,
      minAccountDays: 0
    }
  },
  products: {
    'brmods': {
      id: 'brmods',
      name: 'BRMODS',
      description: [
        'Silent • Silent V2 • Silent Beta V3 • Aim Regulável • Aim Regulável CS2',
        '',
        'Aim Rage • FOV • Show FOV • Head Rate • Chest Rate',
        '',
        'Salvar Amigo Minsta • UMP/XMP Nível 2 • Anti Tatu Tela Parada',
        '',
        'Ghost • Teleport Wall • Down Player • Down Enemy',
        '',
        'Solo Session • All ESP • Stream Mode • Etc.'
      ].join('\n'),
      banner: '',
      color: '#7C3AED',
      autoDelivery: true,
      createdAt: Date.now() - 11 * 86_400_000,
      fields: [
        {
          id: '24h_diario',
          name: '24h - Diario',
          days: 1,
          featured: true,
          price: 10.00,
          stock: [
            'PRIME-BRMODS-24H-0001',
            'PRIME-BRMODS-24H-0002',
            'PRIME-BRMODS-24H-0003',
            'PRIME-BRMODS-24H-0004',
            'PRIME-BRMODS-24H-0005',
            'PRIME-BRMODS-24H-0006',
            'PRIME-BRMODS-24H-0007'
          ]
        },
        {
          id: '10d_dias',
          name: '10d - 10 Dias',
          days: 10,
          featured: false,
          price: 55.00,
          stock: [
            'PRIME-BRMODS-10D-0001',
            'PRIME-BRMODS-10D-0002',
            'PRIME-BRMODS-10D-0003'
          ]
        },
        {
          id: '31d_mensal',
          name: '31d - Mensal',
          days: 31,
          featured: false,
          price: 100.00,
          stock: [
            'PRIME-BRMODS-31D-0001',
            'PRIME-BRMODS-31D-0002',
            'PRIME-BRMODS-31D-0003'
          ]
        }
      ],
      coupons: [],
      publishedMessages: []
    },
    'prime_extremer': {
      id: 'prime_extremer',
      name: 'Prime Extremer',
      description: 'Aimbot Lite • Silent Aim • Magnet Lite • Auto Fire • Stream Mode',
      banner: '',
      color: '#7C3AED',
      autoDelivery: true,
      createdAt: Date.now() - 15 * 86_400_000,
      fields: [
        {
          id: 'extremer_1d',
          name: '24h - Diario',
          days: 1,
          featured: true,
          price: 6.00,
          stock: ['KEY-1D-0001-PRIME', 'KEY-1D-0002-PRIME']
        },
        {
          id: 'extremer_7d',
          name: '7d - Semanal',
          days: 7,
          featured: false,
          price: 14.99,
          stock: ['KEY-7D-0001-PRIME', 'KEY-7D-0002-PRIME']
        },
        {
          id: 'extremer_30d',
          name: '30d - Mensal',
          days: 30,
          featured: false,
          price: 50.00,
          stock: ['KEY-30D-0001-PRIME', 'KEY-30D-0002-PRIME']
        },
        {
          id: 'extremer_lifetime',
          name: 'Lifetime - Vitalício',
          days: 0,
          featured: false,
          price: 110.00,
          stock: ['KEY-LIFE-0001-PRIME', 'KEY-LIFE-0002-PRIME']
        }
      ],
      coupons: [],
      publishedMessages: []
    }
  },
  coupons: {},
  tickets: {
    config: {
      enabled: true,
      openMode: 'Canal Privado',
      messageMode: 'Container V2',
      schedule: '24 horas',
      title: 'Central de Atendimento • Prime Group',
      description: 'Selecione abaixo a categoria referente ao seu atendimento para abrir um ticket com nossa equipe.',
      color: '#7C3AED',
      banner: '',
      functions: [
        { id: 'suporte', name: 'Suporte', description: 'Tire dúvidas gerais ou peça suporte técnico' },
        { id: 'receber_key', name: 'Receber Key', description: 'Resgate sua key ou solicite ativação' },
        { id: 'sobre_erro', name: 'Reportar Erro', description: 'Reporte um problema ou erro encontrado' }
      ],
      publishedMessages: []
    },
    active: {},
    transcripts: {}
  },
  carts: {},
  payments: {},
  users: {},
  sales: [],
  subscriptions: [],
  giveaways: {},
  announceTemplates: []
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let dbCache = null;

function sanitizeDB(db) {
  // Purga estrita de qualquer menção legada a SyncGroup
  if (db.config) {
    if (!db.config.storeName || db.config.storeName.includes('Sync')) db.config.storeName = 'Prime Group';
    if (!db.config.brandName || db.config.brandName.includes('Sync')) db.config.brandName = 'Prime Store';
  }
  return db;
}

function loadDB() {
  ensureDirs();
  if (dbCache) return sanitizeDB(dbCache);
  if (!fs.existsSync(DB_FILE)) {
    dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveDB();
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    dbCache = {
      ...DEFAULT_DB,
      ...parsed,
      config: {
        ...DEFAULT_DB.config,
        ...(parsed.config || {}),
        roles: { ...DEFAULT_DB.config.roles, ...(parsed.config?.roles || {}) },
        channels: { ...DEFAULT_DB.config.channels, ...(parsed.config?.channels || {}) },
        bank: { ...DEFAULT_DB.config.bank, ...(parsed.config?.bank || {}) },
        welcome: { ...DEFAULT_DB.config.welcome, ...(parsed.config?.welcome || {}) },
        presence: { ...DEFAULT_DB.config.presence, ...(parsed.config?.presence || {}) },
        automations: {
          ...DEFAULT_DB.config.automations,
          ...(parsed.config?.automations || {}),
          productRepost: {
            ...DEFAULT_DB.config.automations.productRepost,
            ...(parsed.config?.automations?.productRepost || {})
          }
        },
        zenCloud: {
          ...DEFAULT_DB.config.zenCloud,
          ...(parsed.config?.zenCloud || {})
        },
        zenProtect: { ...DEFAULT_DB.config.zenProtect, ...(parsed.config?.zenProtect || {}) }
      },
      tickets: {
        ...DEFAULT_DB.tickets,
        ...(parsed.tickets || {}),
        config: { ...DEFAULT_DB.tickets.config, ...(parsed.tickets?.config || {}) },
        transcripts: { ...(parsed.tickets?.transcripts || {}) }
      }
    };
    return sanitizeDB(dbCache);
  } catch (err) {
    console.error('[DB] Erro ao carregar database.json, usando padrão:', err.message);
    dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
    return dbCache;
  }
}

function saveDB() {
  ensureDirs();
  if (!dbCache) dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
  sanitizeDB(dbCache);
  fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
}

function createBackup(label = 'manual') {
  ensureDirs();
  const db = loadDB();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${label}-${stamp}.json`;
  const fullPath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(db, null, 2), 'utf-8');
  return fileName;
}

function listBackups() {
  ensureDirs();
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
}

function restoreBackup(fileName) {
  ensureDirs();
  const fullPath = path.join(BACKUP_DIR, fileName);
  if (!fs.existsSync(fullPath)) return false;
  const raw = fs.readFileSync(fullPath, 'utf-8');
  dbCache = JSON.parse(raw);
  saveDB();
  return true;
}

function getUser(userId) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      balance: 0,
      totalSpent: 0,
      purchasesCount: 0,
      purchases: [],
      badges: [],
      invites: {
        regular: 0,
        bonus: 0,
        left: 0,
        fake: 0,
        invitedUsers: []
      }
    };
    saveDB();
  }
  return db.users[userId];
}

function recalculateBadges(userId) {
  const user = getUser(userId);
  const newBadges = new Set(user.badges || []);
  if (user.purchasesCount >= 1) newBadges.add('Primeiro Pedido');
  if (user.purchasesCount >= 5) newBadges.add('Cliente Fiel (5+ compras)');
  if (user.purchasesCount >= 15) newBadges.add('Colecionador Prime (15+ compras)');
  if (user.totalSpent >= 50) newBadges.add('Cliente Bronze (R$ 50+)');
  if (user.totalSpent >= 150) newBadges.add('Cliente Prata (R$ 150+)');
  if (user.totalSpent >= 500) newBadges.add('Cliente Ouro (R$ 500+)');
  if (user.totalSpent >= 1000) newBadges.add('Magnata Prime (R$ 1.000+)');
  user.badges = Array.from(newBadges);
  saveDB();
  return user.badges;
}

function formatBRL(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `item_${Date.now()}`;
}

function isGuildAuthorized(guildId, db) {
  if (!db || !db.config) return true;
  if (db.config.isPrivate === false) return true;

  const allowedList = new Set();
  if (db.config.allowedGuildId) {
    allowedList.add(String(db.config.allowedGuildId).trim());
  }
  if (Array.isArray(db.config.allowedGuildIds)) {
    db.config.allowedGuildIds.forEach((id) => {
      if (id) allowedList.add(String(id).trim());
    });
  }
  if (process.env.GUILD_ID) {
    process.env.GUILD_ID.split(',').forEach((id) => {
      if (id.trim()) allowedList.add(id.trim());
    });
  }

  if (allowedList.size === 0) return true;
  return allowedList.has(String(guildId).trim());
}

function getAllowedGuilds(db) {
  const allowedList = new Set();
  if (db.config.allowedGuildId) allowedList.add(String(db.config.allowedGuildId).trim());
  if (Array.isArray(db.config.allowedGuildIds)) {
    db.config.allowedGuildIds.forEach((id) => {
      if (id) allowedList.add(String(id).trim());
    });
  }
  if (process.env.GUILD_ID) {
    process.env.GUILD_ID.split(',').forEach((id) => {
      if (id.trim()) allowedList.add(id.trim());
    });
  }
  return Array.from(allowedList);
}

module.exports = {
  loadDB,
  saveDB,
  createBackup,
  listBackups,
  restoreBackup,
  getUser,
  recalculateBadges,
  formatBRL,
  slugify,
  isGuildAuthorized,
  getAllowedGuilds
};
