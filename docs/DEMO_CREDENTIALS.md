# Credenciais do Ambiente de Demonstração

O sistema já vem pré-configurado com o condomínio **Residencial Jardim** e dados de teste para demonstração completa.

## 🏢 Condomínio
- **Nome:** Residencial Jardim
- **Endereço:** Av. das Palmeiras, 1000 - Jardim Primavera
- **QR Code Principal:** Token `qr-demo-jardim-principal`
  - URL Visitante: `http://localhost:3000/v/qr-demo-jardim-principal`
- **QR Code Portão de Pedestres:** Token `qr-demo-jardim-pedestres`
  - URL Visitante: `http://localhost:3000/v/qr-demo-jardim-pedestres`

---

## 🔑 Administrador / Síndico
- **E-mail:** `admin@interfone.com`
- **Senha:** `admin123`
- **Acesso:** `http://localhost:3001`

---

## 🏠 Moradores (Casas 1 a 6)

| Residência | Bloco | Morador(es) | E-mail | Senha |
|---|---|---|---|---|
| **Casa 1** | Bloco A | João da Silva<br>Maria da Silva | `joao.casa1@interfone.com`<br>`maria.casa1@interfone.com` | `morador123`<br>`morador123` |
| **Casa 2** | Bloco A | Carlos Santos | `morador.casa2@interfone.com` | `morador123` |
| **Casa 3** | Bloco A | Ana Oliveira | `morador.casa3@interfone.com` | `morador123` |
| **Casa 4** | Bloco B | Roberto Souza | `morador.casa4@interfone.com` | `morador123` |
| **Casa 5** | Bloco B | Fernanda Lima | `morador.casa5@interfone.com` | `morador123` |
| **Casa 6** | Bloco B | Paulo Mendes | `morador.casa6@interfone.com` | `morador123` |

> 💡 **Dica de Teste Multi-morador:** Abra duas abas no navegador em `http://localhost:3002`. Na primeira, faça login como **João da Silva (Casa 1)**. Na segunda, faça login como **Maria da Silva (Casa 1)**. Na aba do visitante (`http://localhost:3000`), chame a **Casa 1**. Ambos os aparelhos tocarão simultaneamente; assim que João atender, a tela de Maria exibirá *"Chamada atendida por outro morador"* e o toque cessará.
