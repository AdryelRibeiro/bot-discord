/**
 * Construtor Oficial de Discord Components V2 (Containers, Sections, TextDisplay, MediaGallery, Separator)
 * Compatível com qualquer versão do discord.js v14 via estrutura oficial da API v10 do Discord.
 */

const IS_COMPONENTS_V2_FLAG = 1 << 15; // 32768
const EPHEMERAL_FLAG = 1 << 6; // 64

function parseHexColor(hex, fallback = 0x7C3AED) {
  if (typeof hex === 'number') return hex;
  if (!hex) return fallback;
  const cleaned = String(hex).replace(/^#/, '').trim();
  const num = parseInt(cleaned, 16);
  return Number.isNaN(num) ? fallback : num;
}

/**
 * Componente TextDisplay (type: 10)
 */
function textDisplay(content) {
  return {
    type: 10,
    content: String(content || '\u200b')
  };
}

/**
 * Componente Separator (type: 14)
 */
function separator(divider = true, spacing = 1) {
  return {
    type: 14,
    divider: Boolean(divider),
    spacing
  };
}

/**
 * Componente MediaGallery (type: 12)
 */
function mediaGallery(urls = []) {
  const validUrls = (Array.isArray(urls) ? urls : [urls]).filter((u) => u && String(u).startsWith('http'));
  if (validUrls.length === 0) return null;
  return {
    type: 12,
    items: validUrls.map((url) => ({
      media: { url: String(url).trim() }
    }))
  };
}

/**
 * Componente Section (type: 9) com Thumbnail (type: 11) ou Button (type: 2) na lateral direita
 */
function sectionWithThumbnail(markdownLines, thumbnailUrl) {
  const contentStr = Array.isArray(markdownLines) ? markdownLines.join('\n') : String(markdownLines);
  if (!thumbnailUrl || !String(thumbnailUrl).startsWith('http')) {
    return textDisplay(contentStr);
  }
  return {
    type: 9,
    components: [textDisplay(contentStr)],
    accessory: {
      type: 11,
      media: { url: String(thumbnailUrl).trim() }
    }
  };
}

function sectionWithButton(markdownLines, buttonComponent) {
  const contentStr = Array.isArray(markdownLines) ? markdownLines.join('\n') : String(markdownLines);
  const rawBtn = typeof buttonComponent.toJSON === 'function' ? buttonComponent.toJSON() : buttonComponent;
  return {
    type: 9,
    components: [textDisplay(contentStr)],
    accessory: rawBtn
  };
}

/**
 * Converte ActionRowBuilder ou objeto raw para JSON compatível com Container V2
 */
function normalizeComponent(comp) {
  if (!comp) return null;
  if (typeof comp.toJSON === 'function') return comp.toJSON();
  return comp;
}

/**
 * Componente Container (type: 17)
 */
function createContainer({ accentColor = '#7C3AED', components = [] }) {
  const normalized = components.map(normalizeComponent).filter(Boolean);
  return {
    type: 17,
    accent_color: parseHexColor(accentColor, 0x7C3AED),
    components: normalized
  };
}

/**
 * Monta o payload final da mensagem usando Components V2 (flags: 32768)
 */
function v2Payload(containersOrComponents, { ephemeral = false } = {}) {
  const list = (Array.isArray(containersOrComponents) ? containersOrComponents : [containersOrComponents])
    .map(normalizeComponent)
    .filter(Boolean);

  return {
    flags: ephemeral ? (IS_COMPONENTS_V2_FLAG | EPHEMERAL_FLAG) : IS_COMPONENTS_V2_FLAG,
    components: list
  };
}

module.exports = {
  IS_COMPONENTS_V2_FLAG,
  EPHEMERAL_FLAG,
  parseHexColor,
  textDisplay,
  separator,
  mediaGallery,
  sectionWithThumbnail,
  sectionWithButton,
  createContainer,
  v2Payload
};
