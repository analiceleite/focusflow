# FocusFlow — Timer App com Angular + Firebase

## Estrutura do Projeto

```
focusflow/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── timer.service.ts
│   │   │   │   └── session.service.ts
│   │   │   └── guards/
│   │   │       └── auth.guard.ts
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── timer/
│   │   │   │   └── timer.component.ts
│   │   │   └── dashboard/
│   │   │       └── dashboard.component.ts
│   │   ├── shared/
│   │   │   └── components/
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── environments/
│   │   └── environment.ts
│   └── styles.scss
├── angular.json
└── package.json
```

## Setup

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar Firebase
1. Acesse https://console.firebase.google.com
2. Crie um novo projeto
3. Ative **Authentication** → Email/Password
4. Ative **Firestore Database**
5. Copie as credenciais do projeto
6. Cole em `src/environments/environment.ts`

### 3. Rodar o projeto
```bash
ng serve
```

## Funcionalidades
- ✅ Autenticação com Firebase (email + senha)
- ✅ Timer Pomodoro configurável
- ✅ Cronômetro livre
- ✅ Tipos de atividade customizáveis (Estudo, Trabalho, Exercício, Leitura, Meditação, Projeto pessoal...)
- ✅ Presets salvos por usuário
- ✅ Dashboard com tempo por tipo de atividade
- ✅ Dias de ofensiva (streak)
- ✅ Dados isolados por usuário no Firestore
