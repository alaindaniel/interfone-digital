# Sistema de Interfone Digital por QR Code

Solução completa de interfone inteligente para condomínios, vilas residenciais e conjuntos habitacionais. Permite que visitantes realizem chamadas em tempo real (áudio e vídeo WebRTC) diretamente do navegador do celular ao escanear uma placa com QR Code na entrada, sem necessidade de instalar aplicativos. Os moradores recebem a notificação e atendem pelo aplicativo Android com toque e conferência bidirecional.

---

## 📱 Componentes do Sistema

1. **Backend & Servidor de Sinalização WebRTC (`/backend`)**:
   - API REST segura (Express.js) e Banco de Dados Multi-tenant persistente.
   - Servidor WebSocket (Socket.IO) para sinalização WebRTC P2P e disparo de notificações push (FCM).
   - Mecanismos de segurança: Anti-Spam / Rate Limiter, timeout configurável (60s), logs de auditoria e resolução de concorrência multi-morador.
   - Porta padrão: `4000`.

2. **Interface do Visitante (`/web-visitor`)**:
   - Web App responsivo ultra-leve (React + Vite + TailwindCSS).
   - Fluxo simplificado e acessível para idosos: Identificação por Nome ➔ Seleção dinâmica de residência com status em tempo real ➔ Chamada WebRTC com vídeo/áudio e encerramento.
   - Porta padrão: `3000`.

3. **Aplicativo do Morador (`/resident-app`)**:
   - Aplicativo Android (React Native / Expo + Web Preview para testes imediatos).
   - Login seguro e atalhos rápidos para alternar entre as Casas 1 a 6 no ambiente de demonstração.
   - Alerta fullscreen com ringtone, dados do visitante e botões gigantes ATENDER / RECUSAR.
   - Suporte a múltiplos moradores na mesma residência (o primeiro a atender ganha a chamada e os outros são notificados).
   - Porta padrão: `3002`.

4. **Painel Administrativo Web (`/admin-dashboard`)**:
   - Interface completa para síndicos e administradores (React + Vite + TailwindCSS).
   - KPIs em tempo real, gestão multi-tenant de condomínios e acessos, CRUD de residências e moradores.
   - **Gerador de Folha de Impressão de QR Code (Placard A4)** pronto para imprimir e afixar na portaria.
   - Histórico geral e auditoria de chamadas.
   - Porta padrão: `3001`.

---

## 🚀 Como Executar o Sistema

### Pré-requisitos
- Node.js v18+ instalado.

### 1. Iniciar o Backend
```bash
cd backend
npm install
npm start
```
O backend iniciará na porta `4000` e auto-configurará o banco de dados com o condomínio de demonstração **"Residencial Jardim"** (Casas 1 a 6).

### 2. Iniciar a Interface do Visitante
```bash
cd web-visitor
npm install
npm run dev
```
Acesse no navegador do celular ou computador: `http://localhost:3000/v/qr-demo-jardim-principal`

### 3. Iniciar o Aplicativo do Morador
```bash
cd resident-app
npm install
npm run dev
```
Acesse no navegador ou dispositivo: `http://localhost:3002`

### 4. Iniciar o Painel Administrativo
```bash
cd admin-dashboard
npm install
npm run dev
```
Acesse: `http://localhost:3001` (Login: `admin@interfone.com` / Senha: `admin123`)

---

## 🧪 Executando os Testes Automatizados E2E

Para executar a bateria de testes automatizados ponta a ponta que valida todos os 8 cenários exigidos:
```bash
npm test
```
