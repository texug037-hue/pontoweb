export default async function handler(req, res) {
  const path = req.url.replace('/api/rhid', '') || '/';
  const url = `https://repp.rhid.com.br${path}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Cid-Rhid': '81212',
  };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error', detail: e.message });
  }
}

