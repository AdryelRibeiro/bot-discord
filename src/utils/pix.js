/**
 * Gerador oficial de Payload PIX (EMVCo BR Code Banco Central) com CRC16-CCITT
 * + Integração opcional com Mercado Pago API se mpAccessToken estiver configurado.
 */

function formatEMV(id, value) {
  const str = String(value);
  const len = str.length.toString().padStart(2, '0');
  return `${id}${len}${str}`;
}

function crc16CCITT(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function cleanText(text, maxLen) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, maxLen);
}

function generatePixPayload({ pixKey, holderName = 'PRIME STORE', city = 'SAO PAULO', amount = 0, txid = 'PRIMESTORE' }) {
  const key = String(pixKey || 'ConfigureSuaChavePixNoPainel').trim();
  const cleanName = cleanText(holderName, 25) || 'PRIME STORE';
  const cleanCity = cleanText(city, 15) || 'SAO PAULO';
  const cleanTxId = cleanText(txid, 25).replace(/\s+/g, '') || '***';

  const gui = formatEMV('00', 'br.gov.bcb.pix');
  const keyField = formatEMV('01', key);
  const merchantAccountInfo = formatEMV('26', `${gui}${keyField}`);

  const payloadParts = [
    formatEMV('00', '01'), // Payload Format Indicator
    merchantAccountInfo,
    formatEMV('52', '0000'), // Merchant Category Code
    formatEMV('53', '986') // Transaction Currency (986 = BRL)
  ];

  const numericAmount = Number(amount);
  if (numericAmount > 0) {
    payloadParts.push(formatEMV('54', numericAmount.toFixed(2)));
  }

  payloadParts.push(
    formatEMV('58', 'BR'),
    formatEMV('59', cleanName),
    formatEMV('60', cleanCity),
    formatEMV('62', formatEMV('05', cleanTxId))
  );

  const partialPayload = `${payloadParts.join('')}6304`;
  const crc = crc16CCITT(partialPayload);
  const copiaECola = `${partialPayload}${crc}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(copiaECola)}`;

  return {
    copiaECola,
    qrCodeUrl,
    txid: cleanTxId
  };
}

async function createPaymentCharge({ bankConfig, amount, description, userId }) {
  const paymentId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  // Se o usuário tiver configurado Token do Mercado Pago, tenta criar cobrança automática via API oficial
  if (bankConfig?.mpAccessToken && bankConfig.mpAccessToken.length > 20) {
    try {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bankConfig.mpAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': paymentId
        },
        body: JSON.stringify({
          transaction_amount: Number(Number(amount).toFixed(2)),
          description: description || 'Compra Prime Store',
          payment_method_id: 'pix',
          payer: {
            email: `cliente_${userId}@primestore.com`
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const qrCode = data?.point_of_interaction?.transaction_data?.qr_code;
        if (qrCode) {
          return {
            paymentId: String(data.id),
            externalId: String(data.id),
            provider: 'Mercado Pago',
            copiaECola: qrCode,
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(qrCode)}`,
            status: 'pending'
          };
        }
      }
    } catch (err) {
      console.error('[PIX] Falha ao criar cobrança no Mercado Pago, usando PIX Chave:', err.message);
    }
  }

  // Fallback padrão 100% gratuito usando Chave PIX EMVCo
  const pixData = generatePixPayload({
    pixKey: bankConfig?.pixKey || 'ChaveNaoConfigurada',
    holderName: bankConfig?.pixHolderName || 'PRIME STORE',
    city: bankConfig?.pixCity || 'SAO PAULO',
    amount,
    txid: paymentId.replace(/[^A-Z0-9]/g, '').slice(0, 20)
  });

  return {
    paymentId,
    externalId: null,
    provider: bankConfig?.pixKey ? 'PIX Direto (EMV)' : 'PIX Demonstração (Configure em /panel)',
    copiaECola: pixData.copiaECola,
    qrCodeUrl: pixData.qrCodeUrl,
    status: 'pending'
  };
}

async function checkMercadoPagoStatus(externalId, mpAccessToken) {
  if (!externalId || !mpAccessToken) return null;
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${externalId}`, {
      headers: { 'Authorization': `Bearer ${mpAccessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.status; // 'approved', 'pending', 'cancelled'
  } catch {
    return null;
  }
}

module.exports = {
  generatePixPayload,
  createPaymentCharge,
  checkMercadoPagoStatus
};
