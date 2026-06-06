const https = require('https');

module.exports = async function handler(req, res) {
  const path = req.url.replace('/api/rhid', '') || '/';
  
  const options = {
    hostname: 'repp.rhid.com.br',
    path: path,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Cid-Rhid': '81212',
    }
  };
  
  if (req.headers.authorization) {
    options.headers['Authorization'] = req.headers.authorization;
  }

  const body = req.method !== 'GET' ? JSON.stringify(req.body) : null;
  if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

  const data = await new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let chunks = '';
      response.on('data', chunk => chunks += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body: chunks }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });

  res.setHeader('Content-Type', 'application/json');
  try {
    res.status(data.status).json(JSON.parse(data.body));
  } catch {
    res.status(data.status).json({ raw: data.body });
  }
};
