const zlib = require('zlib');
const { REST, Routes } = require('discord.js');

/**
 * Gerenciador de Ícones Modernos Minimalistas (Application Emojis)
 * Gera ícones PNG monocromáticos (fundo dark #11131A + traço branco #F8FAFC)
 * e sincroniza automaticamente com os Application Emojis do próprio Bot no Discord.
 * Zero emojis coloridos infantis!
 */

const appEmojiCache = new Map();

// Tabela CRC32 para geração nativa de PNG em memória
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Desenha um ícone 64x64 em formato Hexágono/Badge Dark (#11131A) com símbolo branco (#F8FAFC)
 */
function renderModernIconPNG(drawSymbolFn, bgHex = [17, 19, 26], fgHex = [248, 250, 252]) {
  const width = 64;
  const height = 64;
  const rawData = Buffer.alloc((width * 4 + 1) * height);

  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const rowOffset = y * (width * 4 + 1) + 1 + x * 4;
    rawData[rowOffset] = r;
    rawData[rowOffset + 1] = g;
    rawData[rowOffset + 2] = b;
    rawData[rowOffset + 3] = a;
  };

  // Fundo hexagonal/arredondado escuro estilo SyncGroup Seller
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - 31.5);
      const dy = Math.abs(y - 31.5);
      if (dx <= 26 && dy <= 28 && (dx * 0.85 + dy * 0.55) <= 30) {
        setPixel(x, y, bgHex[0], bgHex[1], bgHex[2], 255);
      }
    }
  }

  const drawThickLine = (x0, y0, x1, y1, thickness = 2.6, color = fgHex) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= steps; i++) {
      const px = x0 + ((x1 - x0) * i) / steps;
      const py = y0 + ((y1 - y0) * i) / steps;
      for (let ox = -Math.ceil(thickness); ox <= Math.ceil(thickness); ox++) {
        for (let oy = -Math.ceil(thickness); oy <= Math.ceil(thickness); oy++) {
          if (ox * ox + oy * oy <= thickness * thickness) {
            setPixel(Math.round(px + ox), Math.round(py + oy), color[0], color[1], color[2], 255);
          }
        }
      }
    }
  };

  const drawCircleRing = (cx, cy, radius, thickness = 2.5, color = fgHex) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (Math.abs(dist - radius) <= thickness / 2) {
          setPixel(x, y, color[0], color[1], color[2], 255);
        }
      }
    }
  };

  drawSymbolFn({ drawThickLine, drawCircleRing, setPixel, fgHex });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const ICON_DEFINITIONS = {
  ic_check: ({ drawThickLine }) => {
    drawThickLine(20, 33, 28, 41, 3.0);
    drawThickLine(28, 41, 44, 23, 3.0);
  },
  ic_shield: ({ drawThickLine }) => {
    drawThickLine(32, 16, 46, 22, 2.5);
    drawThickLine(46, 22, 44, 37, 2.5);
    drawThickLine(44, 37, 32, 48, 2.5);
    drawThickLine(32, 48, 20, 37, 2.5);
    drawThickLine(20, 37, 18, 22, 2.5);
    drawThickLine(18, 22, 32, 16, 2.5);
  },
  ic_cart: ({ drawThickLine, drawCircleRing }) => {
    drawThickLine(16, 20, 22, 20, 2.4);
    drawThickLine(22, 20, 26, 36, 2.4);
    drawThickLine(26, 36, 44, 36, 2.4);
    drawThickLine(44, 36, 47, 24, 2.4);
    drawThickLine(24, 24, 47, 24, 2.2);
    drawCircleRing(28, 43, 2.5, 2.5);
    drawCircleRing(41, 43, 2.5, 2.5);
  },
  ic_pix: ({ drawThickLine }) => {
    drawThickLine(32, 16, 48, 32, 2.6);
    drawThickLine(48, 32, 32, 48, 2.6);
    drawThickLine(32, 48, 16, 32, 2.6);
    drawThickLine(16, 32, 32, 16, 2.6);
    drawThickLine(25, 25, 39, 39, 2.0);
    drawThickLine(39, 25, 25, 39, 2.0);
  },
  ic_box: ({ drawThickLine }) => {
    drawThickLine(32, 16, 47, 24, 2.4);
    drawThickLine(47, 24, 47, 40, 2.4);
    drawThickLine(47, 40, 32, 48, 2.4);
    drawThickLine(32, 48, 17, 40, 2.4);
    drawThickLine(17, 40, 17, 24, 2.4);
    drawThickLine(17, 24, 32, 16, 2.4);
    drawThickLine(17, 24, 32, 32, 2.2);
    drawThickLine(47, 24, 32, 32, 2.2);
    drawThickLine(32, 32, 32, 48, 2.2);
  },
  ic_tag: ({ drawThickLine }) => {
    drawThickLine(20, 34, 34, 20, 2.5);
    drawThickLine(34, 20, 44, 20, 2.5);
    drawThickLine(44, 20, 44, 30, 2.5);
    drawThickLine(44, 30, 30, 44, 2.5);
    drawThickLine(30, 44, 20, 34, 2.5);
  },
  ic_edit: ({ drawThickLine }) => {
    drawThickLine(20, 44, 26, 42, 2.4);
    drawThickLine(22, 38, 38, 22, 3.2);
    drawThickLine(38, 22, 42, 26, 3.2);
    drawThickLine(26, 42, 42, 26, 2.4);
  },
  ic_trash: ({ drawThickLine }) => {
    drawThickLine(20, 22, 44, 22, 2.5);
    drawThickLine(24, 22, 24, 45, 2.4);
    drawThickLine(40, 22, 40, 45, 2.4);
    drawThickLine(24, 45, 40, 45, 2.4);
    drawThickLine(28, 18, 36, 18, 2.5);
  },
  ic_settings: ({ drawCircleRing, drawThickLine }) => {
    drawCircleRing(32, 32, 9, 3.0);
    drawThickLine(32, 16, 32, 21, 2.8);
    drawThickLine(32, 43, 32, 48, 2.8);
    drawThickLine(16, 32, 21, 32, 2.8);
    drawThickLine(43, 32, 48, 32, 2.8);
  },
  ic_cloud: ({ drawCircleRing, drawThickLine }) => {
    drawCircleRing(26, 33, 7, 2.6);
    drawCircleRing(36, 30, 8, 2.6);
    drawThickLine(20, 40, 44, 40, 3.0);
  },
  ic_bolt: ({ drawThickLine }) => {
    drawThickLine(35, 16, 23, 33, 2.8);
    drawThickLine(23, 33, 34, 33, 2.8);
    drawThickLine(34, 33, 29, 48, 2.8);
  },
  ic_ticket: ({ drawThickLine }) => {
    drawThickLine(18, 23, 46, 23, 2.5);
    drawThickLine(18, 41, 46, 41, 2.5);
    drawThickLine(18, 23, 18, 41, 2.5);
    drawThickLine(46, 23, 46, 41, 2.5);
    drawThickLine(32, 26, 32, 38, 2.0);
  },
  ic_user: ({ drawCircleRing, drawThickLine }) => {
    drawCircleRing(32, 24, 6, 2.6);
    drawThickLine(20, 44, 26, 36, 2.6);
    drawThickLine(26, 36, 38, 36, 2.6);
    drawThickLine(38, 36, 44, 44, 2.6);
  },
  ic_folder: ({ drawThickLine }) => {
    drawThickLine(18, 22, 28, 22, 2.5);
    drawThickLine(28, 22, 32, 26, 2.5);
    drawThickLine(32, 26, 46, 26, 2.5);
    drawThickLine(18, 22, 18, 43, 2.5);
    drawThickLine(46, 26, 46, 43, 2.5);
    drawThickLine(18, 43, 46, 43, 2.5);
  },
  ic_eye: ({ drawCircleRing, drawThickLine }) => {
    drawThickLine(16, 32, 28, 23, 2.4);
    drawThickLine(28, 23, 36, 23, 2.4);
    drawThickLine(36, 23, 48, 32, 2.4);
    drawThickLine(16, 32, 28, 41, 2.4);
    drawThickLine(28, 41, 36, 41, 2.4);
    drawThickLine(36, 41, 48, 32, 2.4);
    drawCircleRing(32, 32, 3.5, 2.5);
  },
  ic_link: ({ drawThickLine }) => {
    drawThickLine(24, 40, 40, 24, 2.8);
    drawThickLine(30, 24, 40, 24, 2.8);
    drawThickLine(40, 24, 40, 34, 2.8);
  },
  ic_clock: ({ drawCircleRing, drawThickLine }) => {
    drawCircleRing(32, 32, 13, 2.5);
    drawThickLine(32, 24, 32, 32, 2.5);
    drawThickLine(32, 32, 39, 36, 2.5);
  }
};

/**
 * Sincroniza os ícones modernos na conta da aplicação do Bot no Discord
 */
async function syncApplicationEmojis(client) {
  try {
    const token = process.env.DISCORD_TOKEN;
    const appId = process.env.CLIENT_ID || client.user?.id;
    if (!token || !appId) return;

    const rest = new REST({ version: '10' }).setToken(token);
    const existingRes = await rest.get(Routes.applicationEmojis(appId)).catch(() => null);
    const existingList = existingRes?.items || [];

    for (const item of existingList) {
      appEmojiCache.set(item.name, { id: item.id, name: item.name, markdown: `<:${item.name}:${item.id}>` });
    }

    for (const [name, drawFn] of Object.entries(ICON_DEFINITIONS)) {
      if (!appEmojiCache.has(name)) {
        try {
          const pngBuffer = renderModernIconPNG(drawFn);
          const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
          const created = await rest.post(Routes.applicationEmojis(appId), {
            body: { name, image: dataUri }
          });
          if (created && created.id) {
            appEmojiCache.set(name, {
              id: created.id,
              name: created.name,
              markdown: `<:${created.name}:${created.id}>`
            });
          }
        } catch {
          // Ignora limite ou falha individual
        }
      }
    }
    console.log(`[Icons] ${appEmojiCache.size} ícones modernos sincronizados.`);
  } catch (err) {
    console.warn('[Icons] Aviso ao sincronizar Application Emojis:', err.message);
  }
}

const FALLBACK_SYMBOLS = {
  ic_check: '✓',
  ic_shield: '◈',
  ic_cart: '▸',
  ic_pix: '◈',
  ic_box: '▪',
  ic_tag: '▪',
  ic_edit: '✎',
  ic_trash: '×',
  ic_settings: '⚙',
  ic_cloud: '◈',
  ic_bolt: '⚡',
  ic_ticket: '▪',
  ic_user: '•',
  ic_folder: '▸',
  ic_eye: '•',
  ic_link: '↗',
  ic_clock: '•'
};

function icon(name) {
  const found = appEmojiCache.get(name);
  if (found) return found.markdown;
  return FALLBACK_SYMBOLS[name] || '•';
}

function btnIcon(name) {
  const found = appEmojiCache.get(name);
  if (found && found.id) return { id: found.id, name: found.name };
  return undefined;
}

module.exports = {
  syncApplicationEmojis,
  icon,
  btnIcon
};
