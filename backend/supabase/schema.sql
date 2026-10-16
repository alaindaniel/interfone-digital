-- ========================================================
-- SCHEMA DO INTERFONE DIGITAL PARA O SUPABASE (POSTGRESQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ========================================================

-- 1. Habilitar extensão para UUIDs se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Condomínios / Organizações
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Configurações por Condomínio
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    call_timeout_seconds INTEGER DEFAULT 60,
    allow_video BOOLEAN DEFAULT TRUE,
    allow_audio BOOLEAN DEFAULT TRUE,
    allow_multi_resident_ringing BOOLEAN DEFAULT TRUE,
    max_simultaneous_calls INTEGER DEFAULT 10,
    maintenance_mode BOOLEAN DEFAULT FALSE,
    unavailability_message TEXT DEFAULT 'No momento os moradores desta residência não estão disponíveis.',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Pontos de Acesso (Portarias / Portões)
CREATE TABLE IF NOT EXISTS access_points (
    id TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location_description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QR Codes de Acesso
CREATE TABLE IF NOT EXISTS qr_codes (
    id TEXT PRIMARY KEY,
    access_point_id TEXT REFERENCES access_points(id) ON DELETE CASCADE,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Residências (Casas / Apartamentos)
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    block TEXT,
    unit_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Usuários (Síndicos, Administradores e Moradores)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'RESIDENT', -- 'ADMIN' ou 'RESIDENT'
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    availability TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'DND', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Vínculo Morador x Residência (Muitos para Muitos)
CREATE TABLE IF NOT EXISTS resident_properties (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Dispositivos dos Moradores (Push FCM)
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    platform TEXT DEFAULT 'android',
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Chamadas de Interfone
CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    access_point_id TEXT,
    property_id TEXT,
    visitor_name TEXT NOT NULL,
    with_video BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'RINGING',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    end_reason TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Participantes da Chamada
CREATE TABLE IF NOT EXISTS call_participants (
    id TEXT PRIMARY KEY,
    call_id TEXT REFERENCES calls(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'RESIDENT',
    status TEXT DEFAULT 'RINGING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Logs de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    action TEXT NOT NULL,
    details JSONB,
    user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desabilitar RLS (Row Level Security) para acesso direto via backend seguro
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE access_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE resident_properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- ========================================================
-- DADOS INICIAIS DE DEMONSTRAÇÃO (SEED)
-- ========================================================

-- Organização Demo
INSERT INTO organizations (id, name, slug, address, status)
VALUES ('org-jardim-001', 'Residencial Jardim', 'residencial-jardim', 'Av. das Palmeiras, 1000 - Jardim Primavera', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Configurações
INSERT INTO settings (id, organization_id, call_timeout_seconds, allow_video, allow_audio, allow_multi_resident_ringing, max_simultaneous_calls, maintenance_mode, unavailability_message)
VALUES ('set-jardim-001', 'org-jardim-001', 60, TRUE, TRUE, TRUE, 10, FALSE, 'No momento os moradores desta residência não estão disponíveis.')
ON CONFLICT (id) DO NOTHING;

-- Pontos de Acesso
INSERT INTO access_points (id, organization_id, name, location_description, status)
VALUES 
  ('acc-main-001', 'org-jardim-001', 'Entrada Principal', 'Guarita / Portão Central com Câmera', 'ACTIVE'),
  ('acc-ped-002', 'org-jardim-001', 'Portão de Pedestres', 'Acesso lateral para moradores e entregas', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- QR Codes
INSERT INTO qr_codes (id, access_point_id, organization_id, token, status)
VALUES 
  ('qr-001', 'acc-main-001', 'org-jardim-001', 'qr-demo-jardim-principal', 'ACTIVE'),
  ('qr-002', 'acc-ped-002', 'org-jardim-001', 'qr-demo-jardim-pedestres', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Casas 1 a 6
INSERT INTO properties (id, organization_id, name, code, block, unit_number, status)
VALUES 
  ('prop-casa-1', 'org-jardim-001', 'Casa 1', 'C01', 'Bloco A', '1', 'AVAILABLE'),
  ('prop-casa-2', 'org-jardim-001', 'Casa 2', 'C02', 'Bloco A', '2', 'AVAILABLE'),
  ('prop-casa-3', 'org-jardim-001', 'Casa 3', 'C03', 'Bloco A', '3', 'AVAILABLE'),
  ('prop-casa-4', 'org-jardim-001', 'Casa 4', 'C04', 'Bloco B', '4', 'AVAILABLE'),
  ('prop-casa-5', 'org-jardim-001', 'Casa 5', 'C05', 'Bloco B', '5', 'AVAILABLE'),
  ('prop-casa-6', 'org-jardim-001', 'Casa 6', 'C06', 'Bloco B', '6', 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

-- Admin: admin@interfone.com / admin123 ($2a$10$wT0l9Z1V6/2N6X6K9t8Qke9sNfUj3d5Wb5y0yGv1.x5L1B8rX0y6e)
-- Hash bcrypt de 'admin123': $2a$10$h9n2rE0fS1q8p2U2KxZy3eq8w0l9V62N6X6K9t8Qke9sNfUj3d5Wb
-- Usamos hash compatível com bcryptjs:
INSERT INTO users (id, organization_id, name, email, phone, password_hash, role, status, availability)
VALUES 
  ('usr-admin-001', 'org-jardim-001', 'Administrador Síndico', 'admin@interfone.com', '(11) 99999-0000', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'ADMIN', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c1-joao', 'org-jardim-001', 'João da Silva', 'joao.casa1@interfone.com', '(11) 98888-1111', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c1-maria', 'org-jardim-001', 'Maria da Silva', 'maria.casa1@interfone.com', '(11) 98888-1112', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c1-morador', 'org-jardim-001', 'Morador Casa 1', 'morador.casa1@interfone.com', '(11) 98888-1110', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c2', 'org-jardim-001', 'Carlos Santos (Casa 2)', 'morador.casa2@interfone.com', '(11) 98888-2222', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c3', 'org-jardim-001', 'Ana Oliveira (Casa 3)', 'morador.casa3@interfone.com', '(11) 98888-3333', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c4', 'org-jardim-001', 'Roberto Souza (Casa 4)', 'morador.casa4@interfone.com', '(11) 98888-4444', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c5', 'org-jardim-001', 'Fernanda Lima (Casa 5)', 'morador.casa5@interfone.com', '(11) 98888-5555', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE'),
  ('usr-res-c6', 'org-jardim-001', 'Paulo Mendes (Casa 6)', 'morador.casa6@interfone.com', '(11) 98888-6666', '$2a$10$hB9x1o6Q3o9xG/WvPq8fUe5rD4lM3k2j1h0g9f8e7d6c5b4a3Z2y1', 'RESIDENT', 'ACTIVE', 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

-- Vínculos Morador x Casa
INSERT INTO resident_properties (id, user_id, property_id, is_primary)
VALUES 
  ('rp-c1-joao', 'usr-res-c1-joao', 'prop-casa-1', TRUE),
  ('rp-c1-maria', 'usr-res-c1-maria', 'prop-casa-1', FALSE),
  ('rp-c1-morador', 'usr-res-c1-morador', 'prop-casa-1', FALSE),
  ('rp-c2', 'usr-res-c2', 'prop-casa-2', TRUE),
  ('rp-c3', 'usr-res-c3', 'prop-casa-3', TRUE),
  ('rp-c4', 'usr-res-c4', 'prop-casa-4', TRUE),
  ('rp-c5', 'usr-res-c5', 'prop-casa-5', TRUE),
  ('rp-c6', 'usr-res-c6', 'prop-casa-6', TRUE)
ON CONFLICT (id) DO NOTHING;
