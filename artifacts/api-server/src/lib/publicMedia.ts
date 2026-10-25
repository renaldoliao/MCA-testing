import { Storage } from '@google-cloud/storage';

const SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

const storage = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export async function findPublicMedia(path: string) {
  const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (!searchPaths.length) throw new Error('Public object storage is not configured.');

  for (const searchPath of searchPaths) {
    const parts = `${searchPath}/${path}`.split('/').filter(Boolean);
    if (parts.length < 2) continue;

    const bucket = storage.bucket(parts[0]);
    const file = bucket.file(parts.slice(1).join('/'));
    const [exists] = await file.exists();
    if (exists) return file;
  }

  return null;
}
