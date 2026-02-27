const axios = require('axios');
async function check() {
    console.log('📡 Пробуем максимально простой запрос...');
    try {
        const res = await axios.post('https://polza.ai/api/v1/chat/completions', {
            model: 'google/gemini-3-flash-preview',
            messages: [{ role: 'user', content: 'Привет!' }]
        }, {
            headers: {
                'Authorization': 'Bearer pza_jDuBXsLNxumD0Wkp57xgVT-fk0cbD-e6',
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ ОТВЕТ:', res.data.choices[0].message.content);
    } catch (e) {
        console.error('❌ ОШИБКА:');
        console.error(e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
    }
}
check();
