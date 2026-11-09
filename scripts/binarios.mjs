// Converte arquivos .b64 do repositório em binários dentro de data/ (ex.: app/icon-512.png.b64 -> data/app/icon-512.png).
// Existe porque a integração que publica o site só envia texto. Roda junto com a coleta (import em coleta.mjs).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function* andar(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'data'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* andar(p);
    else if (e.name.endsWith('.b64')) yield p;
  }
}
try {
  for await (const f of andar(raiz)) {
    const destino = path.join(raiz, 'data', path.relative(raiz, f).slice(0, -4));
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, Buffer.from((await fs.readFile(f, 'utf8')).trim(), 'base64'));
    console.log('binário:', path.relative(raiz, destino));
  }
} catch (e) { console.error('binarios.mjs falhou:', e.message); }
