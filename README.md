# 🌱 Streakies — Build Better Habits, One Day at a Time

> A beautifully designed habit tracker that helps you build lasting routines, stay accountable, and celebrate every win — big or small.
<img width="1796" height="970" alt="image" src="https://github.com/user-attachments/assets/3dc07a7d-cda9-4cf3-bba1-3d3bf562c81a" />

<img width="1919" height="973" alt="image" src="https://github.com/user-attachments/assets/49888da5-77cd-482c-8058-5039bce88cb7" />

<img width="1919" height="982" alt="image" src="https://github.com/user-attachments/assets/cc4407d8-9850-4258-be3b-90e6c54dcd1c" />

<img width="1919" height="982" alt="image" src="https://github.com/user-attachments/assets/5551360a-8460-4dc8-bae8-ace6ef750f47" />




---

## 📖 About

**Streakies** is a habit tracking app built for people who want a *simple, rewarding* way to build consistent routines. Whether you're trying to exercise daily, read more, drink more water, or meditate — Streakies helps you track, visualise, and stay motivated from day one.

Unlike most habit trackers that feel like a chore, Streakies gamifies the experience with streaks and a daily coach, and lets you connect with friends to stay accountable together.

---

## ✨ Key Features

### 🎯 Core Habit Management
- Create, edit, and delete habits with custom categories, icons, and colors
- Set daily, weekly, or fully custom frequencies per habit
- Define specific goals (e.g. "Run 3km" not just "Run")
- Smart reminders with adaptive notification timing

### ✅ Daily Tracking & Check-in
- One-tap check-in from the home screen or a lock screen widget
- Streak counter with visual fire indicators
- Log partial completions or skipped days with a reason
- Add short notes to any check-in for personal reflection

### 📊 Analytics & Progress
- GitHub-style streak heatmap (365-day view)
- Weekly and monthly success rate charts
- Best streak badges and milestone celebrations
- Export your data as CSV or PDF at any time

### 🏆 Gamification
- Earn XP points for every completed habit
- Level up and unlock achievement badges
- Use *Streak Freeze* tokens on tough days to protect your streak
- Daily challenge mode for bonus XP

### 👥 Social & Accountability
- Pair up with a *Habit Buddy* for shared accountability
- Join or create group challenges with friends
- Public leaderboards (opt-in)
- Share your progress card to social media

### 🤖 Streak Coach
- Daily coach card with a rotating motivational message
- Built-in chat that answers questions about your streaks, stats, and habits that need attention
- Quick habit-building tips on request
- Rule-based today — no external AI model, so it always responds instantly and never costs anything to run

### 💚 Wellbeing & Mental Health
- Daily mood check-in tied to your habits
- Optional journal entry per habit
- Scheduled rest days to prevent burnout
- Gentle burnout warnings when you're overloading your list

### 🎨 Personalisation
- Light, dark, and custom color themes
- Home screen and lock screen widgets (iOS & Android)
- Choose from a large habit icon library
- Daily motivational quotes (or turn them off)
- Reorder and pin your most important habits

### 🔐 Auth & Data
- Sign up via Email, Google, or Apple
- Cloud sync across all your devices
- Full offline-first support — works without internet
- Granular privacy controls (public/private habits)
- One-click data backup and restore

---

## 🗺️ User Journey

```
Sign up → Onboarding quiz → Add first habit → Daily check-in → Build streak → View insights → Level up
```

---

## 🚀 Build Roadmap

The project is broken into 4 phases to keep development focused and shippable:

### Phase 1 — Foundation (MVP)
- [ ] Authentication (Email + Google)
- [ ] Habit CRUD (create, read, update, delete)
- [ ] Daily check-in flow
- [ ] Streak tracking
- [ ] Push notifications (basic reminders)
- [ ] Offline-first local storage

### Phase 2 — Engagement
- [ ] Analytics dashboard (heatmap + charts)
- [ ] Gamification (XP, levels, badges)
- [ ] Streak Freeze tokens
- [ ] Home screen widget
- [ ] Dark mode + themes

### Phase 3 — Growth
- [ ] Social features (buddies, challenges, leaderboards)
- [ ] AI habit suggestions
- [ ] Mood tracker integration
- [ ] AI coach prompts
- [ ] Share progress card

### Phase 4 — Polish & Launch
- [ ] Onboarding redesign
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Performance optimisation
- [ ] App Store & Play Store submission
- [ ] Analytics & crash reporting (Firebase / Sentry)
- [ ] Monetisation (Free + Pro tier)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS & JavaScript (no framework, no build step) |
| Charts | Chart.js (CDN) |
| Fonts & Icons | Google Fonts (Inter) + Material Symbols |
| PWA | Web App Manifest + Service Worker (installable, offline-aware caching) |
| Backend | Node.js (ESM) + Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT (access + refresh tokens) + bcrypt password hashing |
| Validation | express-validator |
| Email | Nodemailer + Mailgen (SMTP via Brevo) |
| Hosting | Vercel |
| Dev tooling | nodemon |

---

## 📐 Design Principles

**1. Frictionless by default** — Check-ins should take under 3 seconds. No bloated UI.

**2. Celebrate progress, not perfection** — Missing one day is okay. The app never punishes, always encourages.

**3. Smart without being creepy** — Coaching feels helpful, not intrusive. Privacy is a first-class feature.

**4. Built for humans** — Accessible, inclusive design. Supports multiple languages from day one.

---

## 🧩 Project Structure (Planned)

```
habitflow/
├── apps/
│   ├── mobile/          # React Native app
│   └── web/             # React web app
├── packages/
│   ├── ui/              # Shared component library
│   ├── api-client/      # API SDK
│   └── types/           # Shared TypeScript types
├── backend/
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── models/      # Database models
│   │   └── middleware/  # Auth, rate limiting
│   └── prisma/          # DB schema & migrations
├── docs/                # Design docs & ADRs
└── README.md
```

---

## 🤝 Contributing

This project is currently in the design phase. Contributions, feedback, and ideas are very welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for our code of conduct and contribution guidelines.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙌 Acknowledgements

Inspired by the science of habit formation ([Atomic Habits by James Clear](https://jamesclear.com/atomic-habits)), the design philosophy of calm technology, and everyone who has ever tried to build a better version of themselves.

---

> *"You do not rise to the level of your goals. You fall to the level of your systems."* — James Clear

---

Made with ❤️ | Currently in design phase — Star ⭐ to follow along!
