# Guia de Compilação do Aplicativo Android (APK / AAB)

O aplicativo do morador foi estruturado em React Native / Expo com suporte nativo a WebRTC e notificações em segundo plano.

## Opção A: Gerar APK com Expo Application Services (EAS Build - Recomendado)

1. Instale o EAS CLI:
```bash
npm install -g eas-cli
```
2. Acesse a pasta do aplicativo:
```bash
cd resident-app
```
3. Faça login na sua conta Expo:
```bash
eas login
```
4. Configure o projeto para build Android:
```bash
eas build:configure
```
5. Gere o arquivo APK de instalação direta:
```bash
eas build -p android --profile preview
```
O EAS gerará o link direto para download do `.apk` instalável em qualquer celular Android.

---

## Opção B: Build Local com Android Studio / Gradle

1. Faça o prebuild do projeto nativo:
```bash
npx expo prebuild
```
2. Acesse a pasta gerada `resident-app/android`:
```bash
cd android
./gradlew assembleRelease
```
O APK será gerado em `android/app/build/outputs/apk/release/app-release.apk`.
