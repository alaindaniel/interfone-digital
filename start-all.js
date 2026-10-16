const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'BACKEND  ', cwd: 'backend', cmd: 'node', args: ['src/server.js'] },
  { name: 'VISITANTE', cwd: 'web-visitor', cmd: 'node', args: ['./node_modules/vite/bin/vite.js', '--port', '3000', '--host'] },
  { name: 'MORADOR  ', cwd: 'resident-app', cmd: 'node', args: ['./node_modules/vite/bin/vite.js', '--port', '3002', '--host'] },
  { name: 'ADMIN    ', cwd: 'admin-dashboard', cmd: 'node', args: ['./node_modules/vite/bin/vite.js', '--port', '3001', '--host'] }
];

console.log('\n======================================================');
console.log('🚀 INICIANDO TODOS OS SERVIÇOS DO INTERFONE DIGITAL');
console.log('======================================================\n');
console.log('📱 Interface do Visitante: http://localhost:3000/v/qr-demo-jardim-principal');
console.log('📱 Aplicativo do Morador:  http://localhost:3002');
console.log('💻 Painel Administrativo:  http://localhost:3001');
console.log('⚙️  Servidor Backend:       http://localhost:4000');
console.log('======================================================\n');

services.forEach(svc => {
  const p = spawn(svc.cmd, svc.args, {
    cwd: path.join(__dirname, svc.cwd),
    shell: false,
    env: process.env
  });
  p.stdout.on('data', d => {
    process.stdout.write('[' + svc.name + '] ' + d);
  });
  p.stderr.on('data', d => {
    process.stderr.write('[' + svc.name + ' ERR] ' + d);
  });
  p.on('close', code => {
    console.log('[' + svc.name + '] Encerrou com código ' + code);
  });
});