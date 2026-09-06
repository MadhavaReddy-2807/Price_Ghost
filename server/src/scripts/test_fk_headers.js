import axios from 'axios';

async function testFlipkart() {
  const url = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VSYX4';

  const testConfigs = [
    {
      name: 'Standard Desktop Chrome with Referer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/',
      }
    },
    {
      name: 'Mobile User Agent',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Referer': 'https://www.google.com/',
      }
    }
  ];

  for (const c of testConfigs) {
    try {
      console.log(`Testing ${c.name}...`);
      const res = await axios.get(url, { headers: c.headers, timeout: 10000 });
      console.log(`✅ ${c.name} succeeded with status ${res.status}, length: ${res.data.length}`);
      if (res.data.includes('70,999') || res.data.includes('iPhone 15')) {
        console.log('  Found product content in HTML!');
      }
    } catch (e) {
      console.log(`❌ ${c.name} failed: ${e.response?.status || e.message}`);
    }
  }
}

testFlipkart().catch(console.error);
