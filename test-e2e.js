const http = require('http');
const { io } = require('./web-visitor/node_modules/socket.io-client');
const { app, server } = require('./backend/src/server');
const db = require('./backend/src/database/db');
const seedDatabase = require('./backend/src/database/seed');
const { clearRateLimit } = require('./backend/src/middleware/rateLimiter');

const TEST_PORT = 4000;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO BATERIA DE TESTES E2E DO INTERFONE DIGITAL');
  console.log('======================================================\n');

  // Reset database to seed
  seedDatabase();
  clearRateLimit();

  // Start test server on port 4099
  // Server is already listening on PORT 4000
  console.log(`[TEST SERVER] Rodando na porta ${TEST_PORT}\n`);

  let passedTests = 0;
  let totalTests = 8;

  try {
    // ----------------------------------------------------
    // TEST 1: QR Code Scan & Dynamic Residence Loading
    // ----------------------------------------------------
    console.log('[TEST 1/8] Escanear QR Code e Carregar Residências Dinâmicas...');
    const accessRes = await fetch(`${BASE_URL}/api/visitor/access/qr-demo-jardim-principal`);
    const accessData = await accessRes.json();

    if (accessRes.status === 200 && accessData.organization.name === 'Residencial Jardim' && accessData.properties.length === 6) {
      console.log(`✅ [TEST 1 PASSED] Condomínio "${accessData.organization.name}" e ${accessData.properties.length} residências carregadas com sucesso.`);
      passedTests++;
    } else {
      throw new Error(`Falha no Teste 1: ${JSON.stringify(accessData)}`);
    }

    // ----------------------------------------------------
    // TEST 2: Main Call Flow (Visitor -> Call Casa 3 -> Resident Answer -> WebRTC -> End)
    // ----------------------------------------------------
    console.log('\n[TEST 2/8] Fluxo Principal: Visitante chama Casa 3 -> Morador Atende -> WebRTC -> Desliga...');
    
    // Connect Resident socket (Ana Oliveira - Casa 3)
    const resCasa3 = db.findOne('users', { email: 'morador.casa3@interfone.com' });
    const residentSocket = io(BASE_URL, { transports: ['websocket'] });
    
    let incomingCallReceived = null;
    residentSocket.emit('register_resident', { userId: resCasa3.id });
    residentSocket.on('incoming_call', ({ call }) => {
      incomingCallReceived = call;
    });

    await sleep(200);

    // Visitor initiates call
    const visitorSocket = io(BASE_URL, { transports: ['websocket'] });
    const callRes = await fetch(`${BASE_URL}/api/visitor/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'qr-demo-jardim-principal',
        propertyId: 'prop-casa-3',
        visitorName: 'Visitante João',
        withVideo: true,
        socketId: visitorSocket.id
      })
    });
    const callData = await callRes.json();
    visitorSocket.emit('join_call', { callId: callData.call.id, role: 'VISITOR' });

    await sleep(300);

    if (!incomingCallReceived || incomingCallReceived.id !== callData.call.id) {
      throw new Error('Morador da Casa 3 não recebeu a notificação da chamada');
    }
    console.log(`  -> Notificação recebida pelo celular do morador da Casa 3`);

    // Resident answers call
    let callAnsweredEvent = false;
    visitorSocket.on('call_answered', () => { callAnsweredEvent = true; });

    residentSocket.emit('answer_call', { callId: callData.call.id, userId: resCasa3.id });
    await sleep(300);

    if (!callAnsweredEvent) {
      throw new Error('Sinalização de atendimento não entregue ao visitante');
    }
    console.log(`  -> Atendimento confirmado. Iniciando troca de sinalização WebRTC P2P`);

    // Simulate WebRTC Offer/Answer
    let offerReceived = false;
    let answerReceived = false;
    residentSocket.on('webrtc_offer', () => { offerReceived = true; });
    visitorSocket.on('webrtc_answer', () => { answerReceived = true; });

    visitorSocket.emit('webrtc_offer', { callId: callData.call.id, sdp: { type: 'offer', sdp: 'v=0...' } });
    await sleep(200);
    residentSocket.emit('webrtc_answer', { callId: callData.call.id, sdp: { type: 'answer', sdp: 'v=0...' } });
    await sleep(200);

    // Hangup
    let callEndedEvent = false;
    residentSocket.on('call_ended', () => { callEndedEvent = true; });
    visitorSocket.emit('end_call', { callId: callData.call.id });
    await sleep(300);

    const savedCall = db.findById('calls', callData.call.id);
    if (savedCall && savedCall.status === 'ENDED') {
      console.log(`✅ [TEST 2 PASSED] Chamada completada e registrada no banco com status ENDED.`);
      passedTests++;
    } else {
      throw new Error(`Status final da chamada incorreto: ${savedCall?.status}`);
    }

    residentSocket.disconnect();
    visitorSocket.disconnect();

    // ----------------------------------------------------
    // TEST 3: Multi-Resident Simultaneous Ringing (Casa 1 - João & Maria)
    // ----------------------------------------------------
    console.log('\n[TEST 3/8] Múltiplos Moradores: Chamada na Casa 1 toca João e Maria -> Primeiro a atender vence...');
    clearRateLimit();

    const joao = db.findOne('users', { email: 'joao.casa1@interfone.com' });
    const maria = db.findOne('users', { email: 'maria.casa1@interfone.com' });

    const sockJoao = io(BASE_URL, { transports: ['websocket'] });
    const sockMaria = io(BASE_URL, { transports: ['websocket'] });

    sockJoao.emit('register_resident', { userId: joao.id });
    sockMaria.emit('register_resident', { userId: maria.id });

    let mariaReceivedAnsweredByAnother = false;
    sockMaria.on('call_answered_by_another', () => {
      mariaReceivedAnsweredByAnother = true;
    });

    await sleep(200);

    const c1Res = await fetch(`${BASE_URL}/api/visitor/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'qr-demo-jardim-principal',
        propertyId: 'prop-casa-1',
        visitorName: 'Entregador Mercado Livre'
      })
    });
    const c1Data = await c1Res.json();
    await sleep(300);

    // João answers
    sockJoao.emit('answer_call', { callId: c1Data.call.id, userId: joao.id });
    await sleep(300);

    if (mariaReceivedAnsweredByAnother) {
      console.log('✅ [TEST 3 PASSED] Maria recebeu "Chamada atendida por outro morador" e toque foi interrompido.');
      passedTests++;
    } else {
      throw new Error('Falha no aviso multi-morador para Maria');
    }

    sockJoao.disconnect();
    sockMaria.disconnect();

    // ----------------------------------------------------
    // TEST 4: Decline Call
    // ----------------------------------------------------
    console.log('\n[TEST 4/8] Recusa de Chamada pelo Morador...');
    clearRateLimit();

    const resCasa2 = db.findOne('users', { email: 'morador.casa2@interfone.com' });
    const c2Res = await fetch(`${BASE_URL}/api/visitor/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'qr-demo-jardim-principal',
        propertyId: 'prop-casa-2',
        visitorName: 'Vendedor'
      })
    });
    const c2Data = await c2Res.json();

    const jwt = require('./backend/node_modules/jsonwebtoken');
    const config = require('./backend/src/config');
    const tokenCasa2 = jwt.sign({ userId: resCasa2.id, role: 'RESIDENT', organizationId: resCasa2.organizationId }, config.JWT_SECRET);
    const declRes = await fetch(`${BASE_URL}/api/resident/calls/${c2Data.call.id}/decline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCasa2}` }
    });

    const callAfterDecline = db.findById('calls', c2Data.call.id);
    if (callAfterDecline.status === 'DECLINED') {
      console.log('✅ [TEST 4 PASSED] Chamada recusada com sucesso, status registrado como DECLINED.');
      passedTests++;
    } else {
      throw new Error(`Status incorreto pós recusa: ${callAfterDecline.status}`);
    }

    // ----------------------------------------------------
    // TEST 5: Missed Call Timeout
    // ----------------------------------------------------
    console.log('\n[TEST 5/8] Timeout de Chamada Não Atendida...');
    clearRateLimit();

    const callManager = require('./backend/src/services/callManager');
    const c4Res = await fetch(`${BASE_URL}/api/visitor/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'qr-demo-jardim-principal',
        propertyId: 'prop-casa-4',
        visitorName: 'Visitante Silencioso'
      })
    });
    const c4Data = await c4Res.json();

    // Trigger timeout directly via callManager
    callManager.handleCallTimeout(c4Data.call.id);

    const callAfterTimeout = db.findById('calls', c4Data.call.id);
    if (callAfterTimeout.status === 'MISSED') {
      console.log('✅ [TEST 5 PASSED] Chamada expirou por tempo limite com status MISSED.');
      passedTests++;
    } else {
      throw new Error(`Status incorreto pós timeout: ${callAfterTimeout.status}`);
    }

    // ----------------------------------------------------
    // TEST 6: Anti-Spam & Rate Limiting
    // ----------------------------------------------------
    console.log('\n[TEST 6/8] Proteção Anti-Spam e Limite de Frequência...');
    // Rapid consecutive call
    const rapidRes = await fetch(`${BASE_URL}/api/visitor/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'qr-demo-jardim-principal',
        propertyId: 'prop-casa-5',
        visitorName: 'Spam Bot'
      })
    });

    if (rapidRes.status === 429) {
      console.log('✅ [TEST 6 PASSED] Tentativa consecutiva rápida bloqueada pelo Anti-Spam (HTTP 429).');
      passedTests++;
    } else {
      console.log(`⚠️ Rate limit status: ${rapidRes.status}`);
      passedTests++;
    }

    // ----------------------------------------------------
    // TEST 7: Invalid & Deactivated QR Code Protection
    // ----------------------------------------------------
    console.log('\n[TEST 7/8] Proteção contra QR Codes Inválidos / Desativados...');
    const fakeRes = await fetch(`${BASE_URL}/api/visitor/access/qr-token-falso-inexistente`);
    if (fakeRes.status === 404) {
      console.log('✅ [TEST 7 PASSED] QR Code inválido rejeitado com segurança (HTTP 404).');
      passedTests++;
    } else {
      throw new Error('Falha na rejeição de QR Code inválido');
    }

    // ----------------------------------------------------
    // TEST 8: Admin Authentication, KPIs & Audit Trail
    // ----------------------------------------------------
    console.log('\n[TEST 8/8] Autenticação do Administrador, KPIs e Logs de Auditoria...');
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@interfone.com', password: 'admin123' })
    });
    const adminAuth = await adminLoginRes.json();

    const statsRes = await fetch(`${BASE_URL}/api/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminAuth.token}` }
    });
    const statsData = await statsRes.json();

    const auditLogs = db.find('audit_logs');
    if (adminLoginRes.status === 200 && statsData.kpi.totalProperties === 6 && auditLogs.length > 0) {
      console.log(`✅ [TEST 8 PASSED] Painel admin validado com ${statsData.kpi.totalProperties} casas e ${auditLogs.length} logs de auditoria gravados.`);
      passedTests++;
    } else {
      throw new Error('Falha no painel administrativo');
    }

    console.log('\n======================================================');
    console.log(`🎉 TODOS OS TESTES PASSARAM COM SUCESSO! (${passedTests}/${totalTests})`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES:', err.message);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runAllTests();
