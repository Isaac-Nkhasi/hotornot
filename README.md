# 🔥 HOT or NOT

A viral voting app for your uni. Upload images, let people vote, watch the ELO rankings unfold.

---

## Stack
- **Frontend**: React + Vite
- **Database**: Cloud Firestore
- **Auth**: Firebase Anonymous Auth
- **Images**: Cloudinary (free tier)
- **Animations**: Framer Motion

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Firebase setup (already done for you)
Your Firebase config is already in `src/firebase/firebaseConfig.js`.

In your Firebase console, make sure:
- **Firestore** is enabled (test mode or with the rules below)
- **Authentication → Anonymous** is enabled

### 3. Firestore Security Rules
Paste these in **Firebase Console → Firestore → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /meta/stats {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /images/{imageId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth != null
        && request.resource.data.keys().hasAny(['wins','losses','rating','votes','streak']);
    }
  }
}
```

### 4. Run the app
```bash
npm run dev
```

---

## How to seed images

1. Go to **Cloudinary.com** and upload your images
2. Copy the image URL (e.g. `https://res.cloudinary.com/your-cloud/image/upload/...`)
3. In the app, navigate to **/seed** (not in the nav bar — keep it private)
4. Enter the admin PIN: **hotornot** (change this in `src/pages/Seed.jsx`)
5. Paste the Cloudinary URL → preview → click "Add to HOT or NOT"

That's it. The app handles indexing and ELO automatically.

---

## Firestore Data Structure

```
meta/
  stats/
    totalImages: number   ← used for O(1) random image queries
    totalVotes:  number   ← displayed in navbar

images/
  {docId}/
    imageURL:  string     ← Cloudinary URL
    index:     number     ← used for O(1) lookup
    rating:    number     ← ELO (starts at 1000)
    wins:      number
    losses:    number
    votes:     number     ← total matchups
    streak:    number     ← current consecutive wins
    createdAt: timestamp
```

---

## Performance Features
- ✅ **O(1) random image queries** — index-based, never scans the whole collection
- ✅ **Batch voting** — votes queue locally, flush every 10 votes or 10 seconds
- ✅ **Image preloading** — next pair is preloaded in the background while you vote
- ✅ **Session spam prevention** — 1 vote per pair per browser session
- ✅ **Optimistic UI** — ELO updates show instantly without waiting for DB

## Bonus Feature: Hot Streak 🔥
- Images track consecutive wins in a `streak` field
- A badge shows on any image currently on a 3+ win streak
- Streak resets to 0 on any loss

## Bonus Feature: Crowd Consensus
- After every vote, a toast shows what % of all-time matchups the chosen image won
- "🔥 73% of voters agree with you!" or "👀 Controversial pick — only 31% chose this"

---

## Build for production
```bash
npm run build
```
Deploy the `dist/` folder to Firebase Hosting, Vercel, or Netlify.
