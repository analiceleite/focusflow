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

```bash
npm install
ng serve
```

## CI / Deploy (GitHub Actions)

This repository uses a GitHub Actions workflow to generate `src/environments/environment.ts` from repository Secrets during the CI build, so your private Firebase credentials are never stored in the repo.

Required repository Secrets (set in GitHub Settings → Secrets):
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_TOKEN` (used to authenticate `firebase deploy`)

The workflow will run `node scripts/generate-env.js` (which reads the secrets) before the build and then deploy to Firebase Hosting.

Local developer setup:
1. Copy the example env file:
```sh
cp src/environments/environment.example.ts src/environments/environment.ts
```
2. Fill `src/environments/environment.ts` with your own Firebase credentials (these are not committed).

To test the PWA (requires production build):

```bash
ng build
serve dist/focusflow/browser
```

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
