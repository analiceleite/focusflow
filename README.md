# FocusFlow

Timer de produtividade pessoal com foco em consistência e clareza.

---

## Features — v1.0

**Timer**
- Modo Pomodoro com duração configurável
- Modo cronômetro livre (sem tempo definido)
- Presets salvos pelo usuário (ex.: 25 min, 50 min, 90 min)
- Seleção de tipo de atividade por sessão
- Barra de progresso animada
- Som de notificação ao fim do Pomodoro
- Picture-in-Picture — bloquinho flutuante com tempo e progresso enquanto usa outras janelas

**Tipos de atividade**
- Tipos padrão: Estudo, Trabalho, Exercício, Leitura, Meditação, Projeto Pessoal
- Criação de tipos customizados com nome, emoji e cor
- Cada sessão registrada com o tipo selecionado

**Dashboard**
- Tempo total por tipo de atividade com barras de progresso
- Ofensiva atual (dias consecutivos) e recorde pessoal
- Calendário visual dos últimos 70 dias
- Total de sessões, média por sessão e tempo acumulado
- Filtros por 7 dias, 30 dias ou todo o histórico
- Lista das sessões recentes

**Autenticação**
- Cadastro e login com e-mail e senha
- Dados isolados por usuário — cada conta vê apenas o seu histórico

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Framework | Angular 17 (Standalone Components) |
| Estado | Angular Signals |
| Autenticação | Firebase Authentication |
| Banco de dados | Cloud Firestore |
| Hospedagem | Firebase Hosting |
| PWA | @angular/pwa (instalável como app desktop) |
| Estilo | SCSS inline (CSS modular por componente) |
| PiP | Canvas API + Picture-in-Picture API (nativas do browser) |

---

## Estrutura

```
src/app/
├── core/
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── session.service.ts
│   │   ├── timer.service.ts
│   │   └── pip.service.ts
│   └── guards/
│       ├── auth.guard.ts
│       └── public.guard.ts
└── features/
    ├── auth/login/
    ├── timer/
    └── dashboard/
```

---

## Rodar localmente

```bash
npm install
ng serve
```

Para testar o PWA (requer build de produção):

```bash
ng build
serve dist/focusflow/browser
```
