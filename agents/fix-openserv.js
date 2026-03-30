const fs = require('fs');
const file = './.openserv.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

delete data.agents['shobu-analyst'];
delete data.workflows['shobu-analyst'];

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Deleted shobu-analyst from state');
