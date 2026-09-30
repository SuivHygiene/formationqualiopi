// Zone de signature au doigt / stylet / souris → data URL PNG.
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let empty = true;
  let last = null;

  function resize() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a2340';
    empty = true;
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    last = pos(e);
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    empty = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    empty = false;
  });
  const stop = () => (drawing = false);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  requestAnimationFrame(resize);

  return {
    isEmpty: () => empty,
    clear: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
    },
    /** PNG recadré sur le tracé (lisible une fois réduit) et limité à 500 px de large. */
    toDataURL: () => {
      const box = inkBounds(ctx, canvas.width, canvas.height) || { x: 0, y: 0, w: canvas.width, h: canvas.height };
      const pad = 8;
      const x = Math.max(0, box.x - pad);
      const y = Math.max(0, box.y - pad);
      const w = Math.min(canvas.width - x, box.w + 2 * pad);
      const h = Math.min(canvas.height - y, box.h + 2 * pad);
      const scale = Math.min(1, 500 / w);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
    resize,
  };
}

/** Rectangle englobant les pixels dessinés (null si vide). */
function inkBounds(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
