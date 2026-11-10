const fs = require('fs');
const path = require('path');
const { loadDB, saveDB } = require('./database');

const TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', 'data', 'transcripts');

function ensureDir() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }
}

/**
 * Coleta as mensagens do canal e gera uma página HTML estilizada e moderna
 */
async function generateTranscriptHTML(channel, ticketInfo) {
  ensureDir();
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => []);
  const sorted = Array.from(messages.values()).reverse();

  const transcriptId = `TR-${ticketInfo.id || Date.now().toString(36).toUpperCase()}`;
  const dateStr = new Date().toLocaleString('pt-BR');

  const messagesHtml = sorted.map((msg) => {
    const avatar = msg.author.displayAvatarURL({ size: 64 });
    const time = new Date(msg.createdTimestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isBot = msg.author.bot ? '<span class="bot-tag">APP</span>' : '';
    const content = msg.cleanContent ? `<div class="content">${escapeHtml(msg.cleanContent)}</div>` : '';

    const embedsHtml = (msg.embeds || []).map((e) => `
      <div class="embed-box">
        ${e.title ? `<div class="embed-title">${escapeHtml(e.title)}</div>` : ''}
        ${e.description ? `<div class="embed-desc">${escapeHtml(e.description)}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="message">
        <img class="avatar" src="${avatar}" alt="" />
        <div class="msg-body">
          <div class="msg-header">
            <span class="author">${escapeHtml(msg.author.username)}</span>
            ${isBot}
            <span class="time">${time}</span>
          </div>
          ${content}
          ${embedsHtml}
        </div>
      </div>
    `;
  }).join('\n');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript #${transcriptId} • Prime Group</title>
  <style>
    :root {
      --bg: #0B0E14;
      --card: #11141C;
      --border: #1E2330;
      --text: #F1F5F9;
      --text-muted: #94A3B8;
      --accent: #7C3AED;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem 1rem; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 900px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
    .header { padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: rgba(124, 58, 237, 0.05); }
    .header h1 { font-size: 1.25rem; font-weight: 600; }
    .header .meta { font-size: 0.85rem; color: var(--text-muted); }
    .meta-tags { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    .tag { background: #181C26; border: 1px solid var(--border); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; color: #CBD5E1; }
    .chat { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
    .message { display: flex; gap: 0.9rem; align-items: flex-start; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #222; }
    .msg-body { flex: 1; }
    .msg-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .author { font-weight: 600; font-size: 0.95rem; }
    .bot-tag { background: var(--accent); color: #fff; font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: bold; }
    .time { font-size: 0.75rem; color: var(--text-muted); }
    .content { font-size: 0.92rem; line-height: 1.45; color: #E2E8F0; word-break: break-word; }
    .embed-box { margin-top: 0.5rem; background: #0E1118; border-left: 3px solid var(--accent); padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.85rem; }
    .embed-title { font-weight: 600; margin-bottom: 0.25rem; color: #FFF; }
    .embed-desc { color: #CBD5E1; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Ticket #${transcriptId}</h1>
        <div class="meta-tags">
          <span class="tag">Categoria: ${escapeHtml(ticketInfo.functionName || 'Suporte')}</span>
          <span class="tag">Cliente: ${escapeHtml(ticketInfo.userTag || ticketInfo.userId || '')}</span>
          <span class="tag">${dateStr}</span>
        </div>
      </div>
    </div>
    <div class="chat">
      ${messagesHtml || '<p style="color:#64748B; text-align:center;">Nenhuma mensagem registrada.</p>'}
    </div>
  </div>
</body>
</html>
  `.trim();

  const filePath = path.join(TRANSCRIPTS_DIR, `${transcriptId}.html`);
  fs.writeFileSync(filePath, html, 'utf-8');

  const db = loadDB();
  db.tickets.transcripts = db.tickets.transcripts || {};
  db.tickets.transcripts[transcriptId] = {
    id: transcriptId,
    ticketId: ticketInfo.id,
    userId: ticketInfo.userId,
    userTag: ticketInfo.userTag,
    closedBy: ticketInfo.closedBy,
    functionName: ticketInfo.functionName,
    createdAt: dateStr
  };
  saveDB();

  return transcriptId;
}

function getTranscriptHTML(transcriptId) {
  ensureDir();
  const filePath = path.join(TRANSCRIPTS_DIR, `${transcriptId}.html`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  generateTranscriptHTML,
  getTranscriptHTML
};
