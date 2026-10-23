import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const LINES = [
  'SELECT o.order_id, o.customer_id, SUM(i.amount)',
  '  FROM `out.c-shop_lake`.orders o',
  '  JOIN `out.c-shop_lake`.order_items i USING (order_id)',
  ' WHERE o.status = \'completed\'',
  ' GROUP BY 1, 2',
  'kbagent config list --component-type transformation',
  'kbagent job detail --job-id 4815162342',
  '[ok] 12 configurations, 3 flows',
  'bucket in.c-shop_raw      4 tables   1.2 MB',
  'bucket out.c-shop_lake    4 tables   0.9 MB',
  'bucket out.c-shop_dwh     5 tables   0.7 MB',
  'lineage orders -> fct_orders -> dashboard',
  'WITH daily AS (SELECT DATE(created_at) d, COUNT(*) n',
  '  FROM orders GROUP BY 1) SELECT * FROM daily',
];

/** A tall canvas of console text that the screens scroll through (texture offset, no redraws). */
export function consoleTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#04111f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '20px "IBM Plex Mono", ui-monospace, monospace';
    for (let row = 0; row < 40; row += 1) {
      const line = LINES[row % LINES.length] ?? '';
      context.fillStyle = line.startsWith('[ok]') ? '#2bd47d' : line.startsWith('kbagent') ? '#6fc0ff' : row % 5 === 0 ? '#9fd4ff' : '#4f86c6';
      context.fillText(line, 18, 30 + row * 25);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
