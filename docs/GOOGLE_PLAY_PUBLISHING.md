# Guia de Publicação na Google Play Store

Checklist completo para publicação do aplicativo do morador na Google Play:

## 1. Requisitos Prévios
- Conta de Desenvolvedor no Google Play Console (taxa única de US$ 25).
- Chave de assinatura de upload (`.keystore` ou gerenciada pelo Google Play App Signing).
- Ícone do app (512x512 PNG) e Imagem de Destaque (1024x500 PNG).
- Capturas de tela de celulares (ao menos 4 screenshots).
- URL de Política de Privacidade.

## 2. Gerar o Pacote Android App Bundle (.aab)
```bash
cd resident-app
eas build -p android --profile production
```
O comando gerará o arquivo `.aab` otimizado.

## 3. Submissão no Google Play Console
1. Acesse o [Google Play Console](https://play.google.com/console).
2. Clique em **"Criar app"** ➔ Preencha o nome ("Interfone Morador"), idioma padrão ("Português - Brasil") e tipo ("App Gratuito").
3. Preencha a **Ficha da Loja principal**:
   - Descrição curta: *"Atenda o interfone do seu condomínio com áudio e vídeo pelo celular."*
   - Descrição completa detalhando o recebimento de chamadas por QR Code.
   - Envie os prints e ícones.
4. Na seção **Conteúdo do app**:
   - Responda ao questionário de classificação de conteúdo.
   - Declare as permissões de Câmera, Microfone e Notificações (FCM).
5. Crie uma **Versão de Produção** e faça o upload do arquivo `.aab`.
6. Envie para análise da equipe do Google Play.
