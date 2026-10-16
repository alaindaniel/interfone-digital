# Documentação de Arquitetura do Sistema

## 1. Topologia de Rede & Comunicação

```
                               ┌────────────────────────────────┐
                               │       BACKEND API & SIGNALING  │
                               │  - Node.js / Express REST API  │
                               │  - Socket.IO WebRTC Signaling  │
                               │  - Call Session State Manager  │
                               │  - Anti-Spam / Rate Limiter    │
                               │  - Multi-tenant JSON Database  │
                               └─────────▲──────────────▲───────┘
                                         │              │
                    Sinalização / HTTP   │              │   Sinalização / HTTP
                                         │              │
                   ┌─────────────────────┴──┐        ┌──┴──────────────────────┐
                   │  INTERFACE DO VISITANTE│        │  APLICATIVO DO MORADOR  │
                   │    (Navegador Web)     │        │    (Android / React)    │
                   └───────────▲────────────┘        └──▲──────────────────────┘
                               │                        │
                               └────── WebRTC P2P ──────┘
                                 (Áudio & Vídeo Seguro)
```

## 2. Modelo de Dados Relacional Multi-Tenant

- `organizations`: Entidade do condomínio (id, name, slug, address, status, createdAt).
- `access_points`: Portarias e entradas (id, organizationId, name, locationDescription, status).
- `qr_codes`: Tokens seguros criptográficos (id, accessPointId, organizationId, token, status, expiresAt).
- `properties`: Unidades/Casas/Apartamentos (id, organizationId, name, code, block, unitNumber, status).
- `users`: Usuários e moradores (id, organizationId, name, email, phone, role, passwordHash, status, availability).
- `resident_properties`: Relacionamento N:N entre moradores e residências.
- `calls`: Registro auditável de chamadas (id, organizationId, accessPointId, propertyId, visitorName, status, answeredByUserId, durationSeconds, startedAt, endedAt).
- `call_participants`: Moradores notificados em cada chamada.
- `audit_logs`: Trilha de auditoria imutável de eventos e segurança.
- `settings`: Configurações parametrizáveis do condomínio.

## 3. WebRTC Signaling Protocol

1. **Visitor:** Envia `POST /api/visitor/call` ➔ Backend registra chamada com status `RINGING` e emite `incoming_call` para a sala dos moradores.
2. **Resident:** Clica em "ATENDER" ➔ Emite `answer_call` ➔ Backend atualiza status para `IN_PROGRESS` e emite `call_answered` para o visitante e `call_answered_by_another` para os outros moradores da casa.
3. **Visitor:** Cria `RTCPeerConnection`, gera `webrtc_offer` e emite via socket.
4. **Resident:** Recebe `webrtc_offer`, define remote description, gera `webrtc_answer` e emite de volta.
5. **ICE Exchange:** Ambos trocam `webrtc_ice_candidate` via servidor até estabelecer conexão direta P2P.
6. **Encerramento:** Qualquer parte emite `end_call` ➔ Backend calcula a duração e grava no histórico como `ENDED`.
