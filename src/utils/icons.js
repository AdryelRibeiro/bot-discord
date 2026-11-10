/**
 * Gerenciador de Ícones e Símbolos Minimalistas e Tecnológicos
 * Sem emojis coloridos infantis e sem bloquear a fila REST do Discord!
 */

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
  return FALLBACK_SYMBOLS[name] || '•';
}

function btnIcon(name) {
  // Retorna undefined para usar apenas labels limpos e modernos sem emojis coloridos
  return undefined;
}

// Inicializador instantâneo não-bloqueante
async function syncApplicationEmojis(client) {
  // Execução instantânea para garantir que a fila REST fique sempre 100% livre!
  return true;
}

module.exports = {
  syncApplicationEmojis,
  icon,
  btnIcon
};
