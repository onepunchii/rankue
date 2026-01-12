
import axios from 'axios';
const KEY = '54424d7984cf4edd93b711fb868e22df';

// Candidate for Member Info
const candidates = [
    'nwvrqwxyaytdsfvhu', // 국회의원 인적사항 (Most likely)
    'HGMEMNO_INFO', // Another possibility
];

async function check() {
    console.log(`Checking Member Info API...`);

    for (const service of candidates) {
        try {
            const url = `https://open.assembly.go.kr/portal/openapi/${service}?KEY=${KEY}&Type=json&pIndex=1&pSize=5&AGE=22`;
            const res = await axios.get(url);

            if (res.data[service]) {
                console.log(`✅ [SUCCESS] ${service}`);
                console.log('   Sample:', JSON.stringify(res.data[service][1].row[0]).substring(0, 150));
            } else {
                console.log(`❌ [FAIL] ${service}:`, res.data.RESULT?.MESSAGE || JSON.stringify(res.data));
            }
        } catch (e) { console.error(e); }
    }
}
check();
