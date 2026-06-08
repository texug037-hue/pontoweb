const https = require('https');
exports.handler = async function(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Cid-Rhid',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  const path = event.path.replace('/.netlify/functions/rhid', '') || '/';
  const qs = event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : '';
  const options = {
    hostname: 'repp.rhid.com.br',
    path: path + qs,
    method: event.httpMethod,
    headers: {
      'Content-Type': 'application/json',
      'X-Cid-Rhid': '81212',
      ...(event.headers.authorization ? { 'Authorization': event.headers.authorization } : {}),
    }
  };
  const data = await new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (event.body) req.write(event.body);
    req.end();
  });
  return {
    statusCode: data.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: data.body,
  };
};
