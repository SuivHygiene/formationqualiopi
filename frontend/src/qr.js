import QRCode from 'qrcode';

/** Renvoie un data URL PNG du QR code. */
export function qrDataUrl(text, size = 240) {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}

export const portailUrl = (token) => `${location.origin}/stagiaire.html#t=${token}`;
export const portailBaseUrl = () => `${location.origin}/stagiaire.html`;
export const verificationUrl = (code) => `${location.origin}/verification.html#${code}`;
