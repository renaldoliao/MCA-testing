import { Router, type Request, type Response } from 'express';
import { findPublicMedia } from '../lib/publicMedia';

const router = Router();

router.get('/storage/public-objects/*filePath', async (req: Request, res: Response): Promise<void> => {
  const raw = req.params.filePath;
  const objectPath = (Array.isArray(raw) ? raw.join('/') : raw).replaceAll('\\', '/');
  const segments = objectPath.split('/');
  if (!objectPath || segments.some(part => !part || part === '.' || part === '..')) {
    res.status(400).json({ error: 'Invalid asset path.' });
    return;
  }

  try {
    const file = await findPublicMedia(objectPath);
    if (!file) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    res.setHeader('Content-Type', metadata.contentType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || !size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }

      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : size - 1;
      if (!match[1] && match[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(0, size - suffixLength);
        end = size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      end = Math.min(end, size - 1);
      res.status(206);
      res.setHeader('Content-Length', String(end - start + 1));
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      file.createReadStream({ start, end }).on('error', error => {
        req.log.error({ err: error }, 'Error streaming public video');
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      }).pipe(res);
      return;
    }

    if (size) res.setHeader('Content-Length', String(size));
    file.createReadStream().on('error', error => {
      req.log.error({ err: error }, 'Error streaming public video');
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    }).pipe(res);
  } catch (error) {
    req.log.error({ err: error }, 'Error serving public media');
    res.status(500).json({ error: 'Unable to serve the video.' });
  }
});

export default router;
