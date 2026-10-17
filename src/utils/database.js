const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DEFAULT_DB = {
  config: {
    storeName: 'Prime Group',
    brandName: 'zenSallers',
    currency: 'BRL',
    locale: 'pt_BR',
    color: '#5865F2',
    mainBanner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
    storeBanner: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
    roles: {
      adminRoleId: '',
      staffRoleId: '',
      customerRoleId: '',
      autoRoleId: '',
      rankRoles: [
        { minSpent: 50, roleId: '', name: 'Bronze VIP' },
        { minSpent: 150, roleId: '', name: 'Prata VIP' },
        { minSpent: 500, roleId: '', name: 'Ouro VIP' }
      ]
    },
    channels: {
      logsVendasId: '',
      logsTicketsId: '',
      boasVindasId: '',
      feedbackId: '',
      solicitacaoEstoqueId: ''
    },
    bank: {
      provider: 'PIX / Efí / Mercado Pago',
      configured: false,
      pixKey: '',
      pixHolderName: 'Prime Store',
      pixCity: 'SAO PAULO',
      mpAccessToken: ''
    },
    welcome: {
      enabled: false,
      title: '👋 Bem-vindo(a) à Prime Store!',
      message: 'Olá {user}, seja muito bem-vindo(a) ao **{server}**! Confira nossos produtos e abra um ticket se precisar de ajuda.',
      banner: ''
    },
    automations: {
      autoCancelCartMinutes: 15,
      autoRoleCustomer: true,
      stockAlertDM: true,
      autoSyncMessages: true
    },
    zenProtect: {
      antiInvite: false,
      antiSpam: false,
      raidMode: false,
      minAccountDays: 0
    }
  },
  products: {
    'prime_extremer': {
      id: 'prime_extremer',
      name: 'Prime Extremer',
      description: '# Mod Menu Extremer\n**Memory**\n* Aimbot Lite\n* Silent Aim\n**Exploits**\n* Magnet Lite\n* Auto Fire',
      banner: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1000&auto=format&fit=crop&q=80',
      color: '#2B2D31',
      autoDelivery: true,
      fields: [
        {
          id: 'extremer_lifetime',
          name: 'EXTREMER LIFETIMER',
          price: 110.00,
          stock: [
            'KEY-LIFE-0001-PRIME',
            'KEY-LIFE-0002-PRIME',
            'KEY-LIFE-0003-PRIME'
          ]
        },
        {
          id: 'extremer_30d',
          name: 'EXTREMER 30 DIAS',
          price: 50.00,
          stock: [
            'KEY-30D-0001-PRIME',
            'KEY-30D-0002-PRIME'
          ]
        },
        {
          id: 'extremer_7d',
          name: 'EXTREMER 7 DIAS',
          price: 14.99,
          stock: [
            'KEY-7D-0001-PRIME',
            'KEY-7D-0002-PRIME'
          ]
        },
        {
          id: 'extremer_1d',
          name: 'EXTREMER 1 DIA',
          price: 6.00,
          stock: [
            'KEY-1D-0001-PRIME',
            'KEY-1D-0002-PRIME'
          ]
        }
      ],
      coupons: [],
      publishedMessages: []
    },
    'prime_priv': {
      id: 'prime_priv',
      name: 'Prime Priv',
      description: '# Prime Priv **Functions Panel:** * Aimbot Lite * Aimbot Key * Aimbot Delay * AimBot External * Silent',
      banner: '',
      color: '#5865F2',
      autoDelivery: true,
      fields: [
        {
          id: 'priv_30d',
          name: 'PRIME PRIV 30 DIAS',
          price: 45.00,
          stock: ['KEY-PRIV-30D-001']
        },
        {
          id: 'priv_7d',
          name: 'PRIME PRIV 7 DIAS',
          price: 19.90,
          stock: ['KEY-PRIV-7D-001']
        }
      ],
      coupons: [],
      publishedMessages: []
    },
    'conta_guest': {
      id: 'conta_guest',
      name: 'conta guest',
      description: 'Não definido',
      banner: '',
      color: '#5865F2',
      autoDelivery: true,
      fields: [
        {
          id: 'guest_un',
          name: 'CONTA GUEST UNIDADE',
          price: 5.00,
          stock: []
        }
      ],
      coupons: [],
      publishedMessages: []
    },
    'contas_mestre': {
      id: 'contas_mestre',
      name: 'contas mestre',
      description: '# TODAS AS CONTAS MESTRE NA RANK! # * ÚNICO USUÁRIO * CONTAS 100% LIMPAS * 0 RISCO DE CONTA DUP',
      banner: '',
      color: '#5865F2',
      autoDelivery: true,
      fields: [
        {
          id: 'mestre_un',
          name: 'CONTA MESTRE RANK',
          price: 25.00,
          stock: ['login_mestre1:senha123']
        }
      ],
      coupons: [],
      publishedMessages: []
    },
    'contas_punho': {
      id: 'contas_punho',
      name: 'contas punho',
      description: '# Conta punho — Nível Aleatório de 1 a 33 com Punho #',
      banner: '',
      color: '#5865F2',
      autoDelivery: true,
      fields: [
        {
          id: 'punho_un',
          name: 'CONTA COM PUNHO',
          price: 18.00,
          stock: []
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
      openMode: 'Thread Privada', // 'Thread Privada' | 'Canal Privado'
      messageMode: 'Embed Clássico',
      schedule: '24 horas',
      title: '🎧 Central de Atendimento',
      description: 'Selecione abaixo a categoria referente ao seu atendimento para abrir um ticket com nossa equipe.',
      color: '#1D4ED8',
      banner: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1000&auto=format&fit=crop&q=80',
      functions: [
        { id: 'suporte', name: 'Suporte', emoji: '📋', description: 'Tire dúvidas gerais ou peça suporte técnico' },
        { id: 'receber_key', name: 'receber key', emoji: '📋', description: 'Resgate sua key ou solicite ativação' },
        { id: 'sobre_erro', name: 'sobre um erro', emoji: '📋', description: 'Reporte um problema ou erro encontrado' }
      ],
      publishedMessages: []
    },
    active: {}
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

function loadDB() {
  ensureDirs();
  if (dbCache) return dbCache;
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
        automations: { ...DEFAULT_DB.config.automations, ...(parsed.config?.automations || {}) },
        zenProtect: { ...DEFAULT_DB.config.zenProtect, ...(parsed.config?.zenProtect || {}) }
      },
      tickets: {
        ...DEFAULT_DB.tickets,
        ...(parsed.tickets || {}),
        config: { ...DEFAULT_DB.tickets.config, ...(parsed.tickets?.config || {}) }
      }
    };
    return dbCache;
  } catch (err) {
    console.error('[DB] Erro ao carregar database.json, usando padrão:', err.message);
    dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
    return dbCache;
  }
}

function saveDB() {
  ensureDirs();
  if (!dbCache) dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
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
  if (user.purchasesCount >= 1) newBadges.add('🛒 Primeiro Pedido');
  if (user.purchasesCount >= 5) newBadges.add('⭐ Cliente Fiel (5+ compras)');
  if (user.purchasesCount >= 15) newBadges.add('👑 Colecionador Prime (15+ compras)');
  if (user.totalSpent >= 50) newBadges.add('🥉 Gastador Bronze (R$ 50+)');
  if (user.totalSpent >= 150) newBadges.add('🥈 Gastador Prata (R$ 150+)');
  if (user.totalSpent >= 500) newBadges.add('🥇 Gastador Ouro (R$ 500+)');
  if (user.totalSpent >= 1000) newBadges.add('💎 Magnata Prime (R$ 1.000+)');
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

module.exports = {
  loadDB,
  saveDB,
  createBackup,
  listBackups,
  restoreBackup,
  getUser,
  recalculateBadges,
  formatBRL,
  slugify
};
