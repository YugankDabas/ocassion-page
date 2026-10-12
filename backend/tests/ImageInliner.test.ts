import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImageInliner } from '../src/render/ImageInliner';
import { silentLogger } from './fakes';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('ImageInliner', () => {
  let server: Server;
  let base: string;
  const requested: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      requested.push(req.url ?? '');
      if (req.url === '/media/a.png' || req.url === '/media/b.png?v=1&w=2') res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
      else if (req.url === '/media/not-an-image') res.writeHead(200, { 'content-type': 'text/html' }).end('<p>hi</p>');
      else res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('embeds images from allowed locations and leaves everything else alone', async () => {
    const inliner = new ImageInliner([`${base}/media`], silentLogger);
    const html =
      `<img src="${base}/media/a.png" alt="A"><source srcset="${base}/media/b.png?v=1&amp;w=2 2x">` +
      `<img src="${base}/private/secret.png"><img src="${base}/media/missing.png"><img src="${base}/media/not-an-image">` +
      `<img src="https://elsewhere.example/c.png"><img src="/relative.png"><a href="${base}/media/a.png">link</a>`;
    const out = await inliner.inline(html);
    const dataUri = `data:image/png;base64,${PNG.toString('base64')}`;

    expect(out).toContain(`<img src="${dataUri}" alt="A">`);
    expect(out).toContain(`<source srcset="${dataUri} 2x">`);
    // Outside the allow-list: never requested, URL kept.
    expect(out).toContain(`<img src="${base}/private/secret.png">`);
    expect(out).toContain('<img src="https://elsewhere.example/c.png">');
    expect(requested).not.toContain('/private/secret.png');
    // Allowed but unusable: URL kept.
    expect(out).toContain(`<img src="${base}/media/missing.png">`);
    expect(out).toContain(`<img src="${base}/media/not-an-image">`);
    // Only image attributes are touched.
    expect(out).toContain(`<a href="${base}/media/a.png">link</a>`);
    expect(out).toContain('<img src="/relative.png">');
  });
});
