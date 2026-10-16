const bcrypt = require('bcryptjs');
const db = require('./db');

function seedDatabase() {
  console.log('[SEED] Initializing seed data for Residencial Jardim...');

  // Reset database tables
  db.clear();

  const orgId = 'org-jardim-001';
  db.insert('organizations', {
    id: orgId,
    name: 'Residencial Jardim',
    slug: 'residencial-jardim',
    address: 'Av. das Palmeiras, 1000 - Jardim Primavera',
    status: 'ACTIVE'
  });

  // Settings
  db.insert('settings', {
    id: 'set-jardim-001',
    organizationId: orgId,
    callTimeoutSeconds: 60,
    allowVideo: true,
    allowAudio: true,
    allowMultiResidentRinging: true,
    maxSimultaneousCalls: 10,
    maintenanceMode: false,
    unavailabilityMessage: 'No momento os moradores desta residência não estão disponíveis.'
  });

  // Access Points
  const accMain = db.insert('access_points', {
    id: 'acc-main-001',
    organizationId: orgId,
    name: 'Entrada Principal',
    locationDescription: 'Guarita / Portão Central com Câmera',
    status: 'ACTIVE'
  });

  const accPed = db.insert('access_points', {
    id: 'acc-ped-002',
    organizationId: orgId,
    name: 'Portão de Pedestres',
    locationDescription: 'Acesso lateral para moradores e entregas',
    status: 'ACTIVE'
  });

  // QR Codes
  db.insert('qr_codes', {
    id: 'qr-001',
    accessPointId: accMain.id,
    organizationId: orgId,
    token: 'qr-demo-jardim-principal',
    status: 'ACTIVE',
    expiresAt: null
  });

  db.insert('qr_codes', {
    id: 'qr-002',
    accessPointId: accPed.id,
    organizationId: orgId,
    token: 'qr-demo-jardim-pedestres',
    status: 'ACTIVE',
    expiresAt: null
  });

  // Properties (Casa 1 to Casa 6)
  const properties = [];
  for (let i = 1; i <= 6; i++) {
    const block = i <= 3 ? 'Bloco A' : 'Bloco B';
    const prop = db.insert('properties', {
      id: `prop-casa-${i}`,
      organizationId: orgId,
      name: `Casa ${i}`,
      code: `C0${i}`,
      block: block,
      unitNumber: `${i}`,
      status: 'AVAILABLE' // AVAILABLE, UNAVAILABLE, DND, NO_RESIDENT
    });
    properties.push(prop);
  }

  // Admin User
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  db.insert('users', {
    id: 'usr-admin-001',
    organizationId: orgId,
    name: 'Administrador Síndico',
    email: 'admin@interfone.com',
    phone: '(11) 99999-0000',
    passwordHash: adminPasswordHash,
    role: 'ADMIN',
    status: 'ACTIVE'
  });

  // Resident Users
  const residentPasswordHash = bcrypt.hashSync('morador123', 10);

  // Casa 1 has 2 residents (Multi-resident test scenario: João and Maria)
  const joao = db.insert('users', {
    id: 'usr-res-c1-joao',
    organizationId: orgId,
    name: 'João da Silva',
    email: 'joao.casa1@interfone.com',
    phone: '(11) 98888-1111',
    passwordHash: residentPasswordHash,
    role: 'RESIDENT',
    status: 'ACTIVE',
    availability: 'AVAILABLE'
  });
  db.insert('resident_properties', {
    id: 'rp-c1-joao',
    userId: joao.id,
    propertyId: 'prop-casa-1',
    isPrimary: true
  });

  const maria = db.insert('users', {
    id: 'usr-res-c1-maria',
    organizationId: orgId,
    name: 'Maria da Silva',
    email: 'maria.casa1@interfone.com',
    phone: '(11) 98888-1112',
    passwordHash: residentPasswordHash,
    role: 'RESIDENT',
    status: 'ACTIVE',
    availability: 'AVAILABLE'
  });
  db.insert('resident_properties', {
    id: 'rp-c1-maria',
    userId: maria.id,
    propertyId: 'prop-casa-1',
    isPrimary: false
  });
  const moradorC1 = db.insert('users', {
    id: 'usr-res-c1-morador',
    organizationId: orgId,
    name: 'Morador Casa 1',
    email: 'morador.casa1@interfone.com',
    phone: '(11) 98888-1110',
    passwordHash: residentPasswordHash,
    role: 'RESIDENT',
    status: 'ACTIVE',
    availability: 'AVAILABLE'
  });
  db.insert('resident_properties', {
    id: 'rp-c1-morador',
    userId: moradorC1.id,
    propertyId: 'prop-casa-1',
    isPrimary: false
  });

  // Casa 2 to Casa 6 Residents
  const names = ['', '', 'Carlos Santos', 'Ana Oliveira', 'Roberto Souza', 'Fernanda Lima', 'Paulo Mendes'];
  for (let i = 2; i <= 6; i++) {
    const resident = db.insert('users', {
      id: `usr-res-c${i}`,
      organizationId: orgId,
      name: `${names[i]} (Casa ${i})`,
      email: `morador.casa${i}@interfone.com`,
      phone: `(11) 98888-${i}${i}${i}${i}`,
      passwordHash: residentPasswordHash,
      role: 'RESIDENT',
      status: 'ACTIVE',
      availability: 'AVAILABLE'
    });

    db.insert('resident_properties', {
      id: `rp-c${i}`,
      userId: resident.id,
      propertyId: `prop-casa-${i}`,
      isPrimary: true
    });
  }

  // Initial Audit Log
  db.insert('audit_logs', {
    id: 'log-seed-001',
    organizationId: orgId,
    userId: 'usr-admin-001',
    action: 'SYSTEM_INITIALIZED',
    ipAddress: '127.0.0.1',
    resourceId: orgId,
    details: 'Banco de dados inicializado com condomínio Residencial Jardim e Casas 1 a 6.'
  });

  console.log('[SEED] Seed data successfully populated!');
  console.log(`- Condomínio: Residencial Jardim (${orgId})`);
  console.log(`- QR Token Principal: qr-demo-jardim-principal`);
  console.log(`- Admin: admin@interfone.com / admin123`);
  console.log(`- Moradores: morador.casa1..6@interfone.com / morador123`);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
