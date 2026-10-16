# Guia de Configuração do Firebase & Notificações Push (FCM)

Para ativar notificações push mesmo com o aplicativo fechado ou em segundo plano no Android:

## Passo 1: Criar Projeto no Firebase Console
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **"Adicionar Projeto"** e informe o nome (ex: `Interfone-Digital`).
3. Desative o Google Analytics (opcional para desenvolvimento) e conclua a criação.

## Passo 2: Registrar o Aplicativo Android
1. No painel do projeto, clique no ícone **Android**.
2. Informe o nome do pacote: `br.com.interfone.morador` (conforme definido no `app.json`).
3. Baixe o arquivo `google-services.json` e coloque em `resident-app/android/app/google-services.json`.

## Passo 3: Obter Credenciais de Conta de Serviço para o Backend
1. Vá em **Configurações do Projeto** ➔ **Contas de Serviço**.
2. Clique em **"Gerar nova chave privada"**.
3. Salve o arquivo JSON como `backend/secrets/firebase-service-account.json`. Este arquivo é uma credencial privada e não deve ser enviado ao Git.

## Passo 4: Variáveis de Ambiente
Para executar localmente, copie `backend/.env.example` para `backend/.env` e mantenha:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

Ao executar pelo Docker Compose, o mesmo arquivo é montado automaticamente como `/app/secrets/firebase-service-account.json`.

## Passo 5: Gerar o novo APK
Depois de incluir o `google-services.json`, execute na pasta `resident-app`:

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

Instale o APK gerado em `android/app/build/outputs/apk/debug/app-debug.apk`. No primeiro acesso, entre na conta do morador e permita notificações. O APK então registra seu token FCM no backend automaticamente.

## Como testar
1. Abra o APK, faça login e aceite a permissão de notificações.
2. Deixe o aplicativo em segundo plano.
3. Pelo Firebase Console, envie uma mensagem de teste ao token registrado, ou faça uma chamada pelo QR Code.
4. O celular deverá exibir uma notificação de alta prioridade. Ao tocá-la, o APK abre a tela de chamada.

> No Android, "fechado" significa removido da tela recente ou em segundo plano. Se o usuário usar **Forçar parada** nas configurações do sistema, o Android bloqueia recebimentos até que ele abra o app novamente.
