import dns from 'dns';

async function testDNS() {
  console.log('--- Test with default system DNS ---');
  try {
    const servers = dns.getServers();
    console.log('Default servers:', servers);
    const lookup1 = await dns.promises.lookup('smtp.gmail.com');
    console.log('✅ System DNS resolved smtp.gmail.com:', lookup1);
    const srv = await dns.promises.resolveSrv('_mongodb._tcp.cluster0.gd0b66v.mongodb.net');
    console.log('✅ System DNS resolved MongoDB SRV:', srv.length, 'records found');
  } catch (e) {
    console.log('❌ System DNS failed:', e.message);
  }

  console.log('\n--- Test with forced 8.8.8.8 / 1.1.1.1 ---');
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('Forced servers:', dns.getServers());
    const lookup2 = await dns.promises.lookup('smtp.gmail.com');
    console.log('✅ Forced DNS resolved smtp.gmail.com:', lookup2);
    const srv2 = await dns.promises.resolveSrv('_mongodb._tcp.cluster0.gd0b66v.mongodb.net');
    console.log('✅ Forced DNS resolved MongoDB SRV:', srv2.length, 'records found');
  } catch (e) {
    console.log('❌ Forced DNS failed:', e.message);
  }
}

testDNS().catch(console.error);
