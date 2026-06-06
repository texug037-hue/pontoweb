export default async function handler(req, res) {
  const path = req.url.replace('/api/rhid', '') || '/';
  const url = https://repp.rhid.com.br${path};

  const headers = {
    'Content-Type': 'application/json',
    'X-Cid-Rhid': '81212',
  };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const body = req.method !== 'GET' ? JSON.stringify(req.body) : undefined;
    const response = await fetch(url, { method: req.method, headers, body });
    
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      // RHiD retornou texto não-JSON
      res.status(response.status).json({ raw: text });
    }
  } catch (e) {
    res.status(500).json({ error: 'Proxy error', detail: e.message });
  }
}
