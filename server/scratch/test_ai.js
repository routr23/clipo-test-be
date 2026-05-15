async function test() {
  const url = 'https://bedrock-mantle.eu-north-1.api.aws/v1/chat/completions';
  const rawKey = 'ABSKQmVkcm9ja0FQSUtleS02bGNhLWF0LTkyMjcwOTg3MDc4Nzp0QXlGb0ZsRTA1MVVxNUZ6VWRSNDhiV0N4YlZxTkZVQkdnR2F0WWtjOTNvaE5NNUxmL25SR0Y5NzFEcz0=';
  
  console.log('--- Testing with Base64 key ---');
  await tryFetch(rawKey);

  console.log('\n--- Testing with Decoded key ---');
  const decodedKey = Buffer.from(rawKey, 'base64').toString();
  await tryFetch(decodedKey);
}

async function tryFetch(key) {
  const url = 'https://bedrock-mantle.eu-north-1.api.aws/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`
  };
  const body = {
    model: 'openai.gpt-oss-120b',
    messages: [{ role: 'user', content: 'hello' }]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.text();
    console.log('STATUS:', res.status);
    console.log('DATA:', data);
  } catch (err) {
    console.error(err);
  }
}

test();
