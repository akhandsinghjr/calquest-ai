# 🥗 CalQuest AI — Gamified Calorie Tracker (`gemini-4-argon`)

A personal, Duolingo-style gamified calorie & macro tracker for Android. Snap a photo of any meal and **Gemini 4 Argon** (`gemini-4-argon`) analyzes the food items, portion sizes, calories, macronutrients, and a 1–100 Health Score using the official `@google/genai` Interactions API.

---

## ✨ Features

- **📸 Instant Photo Calorie & Macro Breakdown**:
  - Calls `gemini-4-argon` via `client.interactions.create()` with inline image analysis and structured JSON output (`response_format`).
  - Itemizes every food component on your plate so you can toggle individual items on/off or adjust a portion multiplier (`0.5x` – `1.5x`) before logging.
  - Supports an optional meal note (e.g., *"cooked in 1 tbsp olive oil"*) and persistent dietary context in Settings.
- **🎮 Gamification (Duolingo-Style)**:
  - **Daily Streaks & Streak Freeze Shields**: Keep your flame alive (`🔥`) and earn Streak Freeze shields (`❄️`) every 7 days.
  - **XP & Leveling Curve**: Earn Base XP (`+50 XP`) + Health Score Bonus XP (`+1` to `+50 XP`) for every meal logged, climbing from *Lv. 1 Calorie Cadet* to *Lv. 20 Argon Titan*.
  - **Daily Quests**: 4 daily challenges with one-tap XP reward claims and confetti celebrations.
  - **12 Achievement Badges**: Unlock badges like *First Snap*, *7-Day Inferno*, *Clean Plate Club*, *Protein Powerhouse*, and *Calorie Bullseye*.
- **🔒 Personal-First Architecture**:
  - Works out of the box with a baked-in `GEMINI_API_KEY` from GitHub Secrets **or** an in-app API Key field in the **Settings** tab.
  - All meal logs, streaks, and XP are stored locally on your phone with 1-tap JSON Export/Import backup.

---

## 📱 How to Build & Download the APK via GitHub Actions

1. **Create a GitHub Repository** and push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: CalQuest AI with Gemini 4 Argon"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **(Optional but Recommended) Add your Gemini API Key as a GitHub Secret**:
   - Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API Key from Google AI Studio.
   - *(Note: Even if you skip this step, you can paste or change your API key anytime inside the app's **Settings** tab on your phone!)*

3. **Download & Install `CalQuest-AI.apk` on Your Phone**:
   - Every push to `main` (or manual trigger in the **Actions** tab) runs [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).
   - Once the workflow finishes (~2–3 minutes):
     - **Option A (Fastest on Phone)**: Open your GitHub repo's **Releases** page on your phone and tap **`CalQuest-AI.apk`** under the `latest-apk` release to download and install it.
     - **Option B (Actions Artifact)**: Go to the **Actions** tab → click the latest workflow run → download **`CalQuest-AI-APK`** at the bottom.
