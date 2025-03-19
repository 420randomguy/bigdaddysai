import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const history = await kv.get('history');
  res.status(200).json(history || []);
}
