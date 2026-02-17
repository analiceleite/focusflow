# 🚀 FocusFlow — Guia de Setup Completo

## Pré-requisitos
- Node.js 18+ instalado
- Angular CLI instalado: `npm install -g @angular/cli`
- Conta Google para usar o Firebase

---

## 1. Configurar o Firebase

### 1.1 Criar o projeto
1. Acesse [https://console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Nome: `focusflow` (ou qualquer nome)
4. Desative o Google Analytics (opcional)
5. Clique em **"Criar projeto"**

### 1.2 Ativar Authentication
1. No menu lateral, vá em **Authentication**
2. Clique em **"Primeiros passos"**
3. Em **"Sign-in method"**, ative **Email/senha**
4. Salve

### 1.3 Criar o Firestore Database
1. No menu lateral, vá em **Firestore Database**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Começar no modo de produção"**
4. Escolha a região mais próxima (ex.: `southamerica-east1` para Brasil)
5. Clique em **"Criar"**

### 1.4 Configurar as regras de segurança do Firestore
1. Ainda no Firestore, vá na aba **"Regras"**
2. Substitua o conteúdo pelo conteúdo do arquivo `firestore.rules`
3. Clique em **"Publicar"**

### 1.5 Criar o índice composto (necessário para queries)
1. No Firestore, aba **"Índices"**
2. Clique em **"Adicionar índice"**
3. Coleção: `sessions`
4. Campos:
   - `userId` → Crescente
   - `startedAt` → Decrescente
5. Escopo da query: Coleção
6. Clique em **"Criar"** (pode levar alguns minutos)

### 1.6 Obter as credenciais do app
1. No menu lateral, clique na engrenagem ⚙️ → **"Configurações do projeto"**
2. Role até **"Seus apps"**
3. Clique em **"</>"** (Web app)
4. Registre o app com qualquer nome (ex.: `focusflow-web`)
5. **NÃO precisa** ativar Firebase Hosting agora
6. Copie o objeto `firebaseConfig`

---

## 2. Configurar o projeto Angular

### 2.1 Colar as credenciais
Abra o arquivo `src/environments/environment.ts` e substitua os valores:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSy...',           // ← substitua
    authDomain: 'meu-app.firebaseapp.com',  // ← substitua
    projectId: 'meu-app-id',       // ← substitua
    storageBucket: 'meu-app.appspot.com',   // ← substitua
    messagingSenderId: '123456789',// ← substitua
    appId: '1:123456789:web:abc...'// ← substitua
  }
};
```

### 2.2 Instalar dependências
```bash
cd focusflow
npm install
```

### 2.3 Rodar o projeto
```bash
ng serve
```

Acesse: [http://localhost:4200](http://localhost:4200)

---

## 3. Usar o App

### Primeiro acesso
1. Clique em **"Criar conta"** e cadastre seu e-mail e senha
2. Na primeira vez, dados padrão serão criados automaticamente:
   - Tipos: Estudo, Trabalho, Exercício, Leitura, Meditação, Projeto Pessoal
   - Presets: 25 min, 50 min, 90 min

### Timer Pomodoro
- Selecione um tipo de atividade
- Escolha um preset ou digite minutos customizados
- Clique em **Iniciar**
- Ao terminar, salve a sessão

### Cronômetro livre
- Mude para **Cronômetro**
- Clique em **Iniciar** e foque o quanto quiser
- Clique em **Salvar** quando terminar

### Dashboard
- Veja o tempo total por tipo de atividade
- Monitore sua ofensiva de dias consecutivos
- Filtre por 7 dias, 30 dias ou todo o histórico

---

## 4. Build para Produção (opcional)

```bash
ng build
```

Para fazer deploy no Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
ng build
firebase deploy
```

---

## 5. Estrutura dos dados no Firestore

```
activityTypes/
  {docId}/
    userId: "uid_do_usuario"
    name: "Estudo"
    icon: "📚"
    color: "#6C63FF"

presets/
  {docId}/
    userId: "uid_do_usuario"
    label: "25 min"
    minutes: 25

sessions/
  {docId}/
    userId: "uid_do_usuario"
    activityTypeId: "id_do_tipo"
    activityTypeName: "Estudo"
    activityColor: "#6C63FF"
    durationSeconds: 1500
    mode: "pomodoro" | "stopwatch"
    date: "2026-02-17"
    startedAt: 1708200000000
    completedAt: 1708201500000

userMeta/
  {userId}/
    seeded: true
```
