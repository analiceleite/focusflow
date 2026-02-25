# FocusFlow

Personal productivity timer focused on consistency and clarity.

## Login screen
![Login](./src/assets/demo/login.png)

## Timer screen
![Timer](./src/assets/demo/timer.png)


## Statistics screen
![Statistics](./src/assets/demo/stats.png)

## Picture and picture preview

![Picture and Picture](./src/assets/demo/pip-demo.png)

---

## Features in Detail

**Timer**
- Pomodoro mode with configurable duration
- Free stopwatch mode (no time limit)
- User-saved presets (e.g., 25 min, 50 min, 90 min)
- Activity type selection per session
- Animated progress bar
- Notification sound at Pomodoro completion
- Picture-in-Picture — floating mini window with time and progress while using other applications
- Detailed statistics displayed in the timer view, including:
	- Current focus data:
		- Hours focused today
		- Hours focused in the last 7 days
		- Hours focused in the last 30 days
	- Averages and trends:
		- Daily average (last 7 days)
		- Weekly average (last 4 weeks / 28 days)
		- Monthly average (last 12 months)

**Activity Types**
- Default types: Study, Work, Exercise, Reading, Meditation, Personal Project
- Custom type creation with name, emoji, and color
- Each session recorded with selected type

**Dashboard**
- Total time per activity type with progress bars
- Current streak (consecutive days) and personal record
- Visual calendar of the last 70 days
- Total sessions, average per session, and accumulated time
- Filters for 7 days, 30 days, or all history
- Filters with interactive calendar
- Recent sessions list

**Authentication**
- Email and password registration and login
- User-isolated data — each account sees only their own history

---

## Technologies

| Layer | Technology |
|---|---|
| Framework | Angular 17 (Standalone Components) |
| State | Angular Signals |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Hosting | Firebase Hosting |
| PWA | @angular/pwa (installable as desktop app) |
| Styling | SCSS inline (modular CSS per component) |
| PiP | Canvas API + Picture-in-Picture API (native browser APIs) |

---

## Run Locally

> **Note:** This project uses Firebase (Auth + Firestore + Hosting). The Firebase credentials are **not stored in the repository** intentionally — this protects the author's Firebase account from unauthorized usage and billing.
>
> To run this project locally, you need to **create your own Firebase project** (free tier is sufficient).

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** (Email/Password provider)
4. Enable **Firestore Database** (start in test mode)
5. Register a **Web App** and copy the config object

### 2. Set up local environment

```sh
cp src/environments/environment.example.ts src/environments/environment.ts
```

Open `src/environments/environment.ts` and fill in with your Firebase config:

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  }
};
```

> `environment.ts` is in `.gitignore` — your credentials will never be committed.

### 3. Install and run

```bash
npm install
ng serve
```

---

## CI / Deploy (GitHub Actions)

If you want to deploy your own fork, the workflow generates `environment.ts` from GitHub Secrets at build time.

Required secrets (Settings → Secrets and variables → Actions):

| Secret | Where to find it |
|---|---|
| `FIREBASE_API_KEY` | Firebase console → Project settings → Your app |
| `FIREBASE_AUTH_DOMAIN` | same |
| `FIREBASE_PROJECT_ID` | same |
| `FIREBASE_STORAGE_BUCKET` | same |
| `FIREBASE_MESSAGING_SENDER_ID` | same |
| `FIREBASE_APP_ID` | same |
| `FIREBASE_SERVICE_ACCOUNT_FOCUSFLOW_IO` | Firebase console → Project settings → Service accounts → Generate new private key |

The last secret is generated automatically if you connect the repo via `firebase init hosting` and let the Firebase CLI create the GitHub Action for you.

---

## Features in Detail

### 🍅 **Pomodoro Timer**
- Customizable work sessions (default 25 minutes)
- Visual progress ring with smooth animations
- Audio notifications when sessions complete
- Pause/resume functionality
- Activity type tracking for each session

### ⏱️ **Stopwatch Mode**
- Free-running timer for flexible work sessions
- Track unlimited time without preset boundaries
- Perfect for creative work or open-ended tasks

### 📊 **Analytics Dashboard**
- Visual activity breakdown with color-coded progress bars
- Daily streak tracking with personal records
- Interactive calendar heatmap (70-day history)
- Session statistics with averages and totals
- Time period filtering (today, 7d, 30d, all time)
- Time period filtered using interactive calendar

### 🖼️ **Picture-in-Picture**
- Ultra-compact floating timer (110x120px)
- Works across all applications and browser tabs
- Real-time progress display
- Light/dark theme support
- Minimal CPU usage with canvas optimization

### 🎨 **Theme System**
- Seamless light/dark mode switching
- Persistent user preference storage
- System theme detection
- Consistent theming across all components including PiP

### 📱 **Progressive Web App**
- Install as native desktop/mobile app
- Offline functionality with service worker
- Native app-like experience
- Custom app icons and splash screens

---

## Technical Highlights

- **Modern Angular 17**: Standalone components, signals-based state management
- **Firebase Integration**: Authentication, Firestore database, hosting
- **Performance Optimized**: Lazy loading, OnPush change detection
- **Responsive Design**: Mobile-first approach with desktop enhancements
- **Accessibility**: ARIA labels, keyboard navigation support
- **Type Safety**: Full TypeScript implementation
- **Component Architecture**: Modular, reusable components with SCSS styling

---

## Browser Compatibility

- **Chrome/Edge**: Full support including Picture-in-Picture
- **Firefox**: Full support (PiP support varies)
- **Safari**: Full support on macOS/iOS
- **PWA Install**: Supported on all modern browsers

---

## Contributing

This is a personal productivity project built for learning modern Angular patterns and Firebase integration. Feel free to fork and customize for your own needs!

---

## License

MIT License - Feel free to use and modify as needed.
