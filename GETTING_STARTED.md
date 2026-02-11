# ResearchFinder - Getting Started Checklist

Panduan lengkap untuk memulai ResearchFinder dari nol hingga siap deploy ke production.

## ✅ Pre-Setup Checklist

Pastikan sistem Anda memenuhi requirements:

- [ ] Node.js >= 20.9 terinstall
  ```bash
  node --version  # Harus >= v20.9.0
  ```

- [ ] npm >= 10.0 terinstall
  ```bash
  npm --version
  ```

- [ ] Git terinstall (untuk version control)
  ```bash
  git --version
  ```

- [ ] Browser modern (Chrome, Firefox, Safari, Edge)
- [ ] Terminal/Command Prompt siap
- [ ] Text editor (VS Code recommended)
- [ ] Internet connection stabil

---

## 🚀 Step 1: Installation (5-10 minutes)

### Option A: Using npm (Standard)

```bash
# 1. Clone or download project
cd path/to/researchfinder

# 2. Install dependencies
npm install

# ✅ Wait untuk completion (biasanya 2-3 menit)
# Status: "added XXX packages"
```

### Option B: Using pnpm (Faster - Recommended)

```bash
# 1. Install pnpm (global)
npm install -g pnpm

# 2. Install dependencies
pnpm install

# ✅ Much faster! (~30 detik)
```

### Option C: Using Yarn

```bash
# 1. Install yarn (if not already)
npm install -g yarn

# 2. Install dependencies
yarn install
```

### Option D: Using Bun (Fastest)

```bash
# 1. Install bun
curl -fsSL https://bun.sh/install | bash

# 2. Install dependencies
bun install
```

---

## 🎯 Step 2: Start Development Server (2 minutes)

### Run dev server:

```bash
# Using npm
npm run dev

# OR using pnpm (faster)
pnpm dev

# OR using yarn
yarn dev

# OR using bun
bun dev
```

### Expected output:
```
> next dev

  ▲ Next.js 16.0.10
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.3s
```

### ✅ Open browser:
```
Go to: http://localhost:3000
```

You should see ResearchFinder homepage dengan:
- Search input (glassmorphic design)
- Intro section (Sparkles icon)
- Beautiful gradient background
- Dark mode toggle (top-right)
- Responsive untuk semua ukuran

---

## 🧪 Step 3: Test Core Features (10 minutes)

### ✅ Test Search:
1. Click search input
2. Type: "artificial intelligence" (minimal 2 karakter)
3. See autocomplete suggestions appear
4. Press Enter atau klik suggestion
5. Tunggu results (1-2 detik)
6. Verify: artikel dari OpenAlex & Crossref tampil

### ✅ Test Filters:
1. Klik "OA / Open Access" badge
2. Toggle on/off
3. Results auto-update
4. Ubah tahun range (From/To)
5. Change sort order (Relevance/Newest/Most Cited)
6. Verify: filters bekerja smooth

### ✅ Test Save Article:
1. Klik "Simpan / Save" pada artikel
2. Toast "Tersimpan / Saved" appears
3. Button now shows "Disimpan / Saved" state
4. Go to "Tersimpan / Saved" link (top-right)
5. Verify: artikel tampil di saved page
6. Klik "Disimpan / Saved" untuk unsave
7. Artikel hilang dari saved page ✅

### ✅ Test Export:
1. Klik "BibTeX" pada artikel with DOI
2. File `.bib` auto-download
3. Open file, verify BibTeX format correct
4. Go back, klik "RIS"
5. File `.ris` auto-download
6. Verify RIS format correct ✅

### ✅ Test Link Checker:
1. Klik "Cek Link / Check Link" pada artikel
2. Loading spinner appears
3. After 2-3 detik, status badge shows:
   - Green "Valid" jika link accessible
   - Red "Error" jika not accessible ✅

### ✅ Test Theme Toggle:
1. Klik moon/sun icon (top-right)
2. Page berubah ke dark mode
3. All components have dark theme
4. Gradient background berubah (midnight gradient)
5. Glass elements tetap transparent
6. Klik lagi untuk balik ke light mode ✅

### ✅ Test Responsive:
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set size: 320px (mobile)
4. Verify: layout tetap rapi, no horizontal scroll
5. Tap search input, keyboard appears
6. Change ke 768px (tablet)
7. Verify: layout optimal untuk tablet
8. Change ke 1200px (desktop)
9. Verify: full desktop experience ✅

### ✅ Test Keyboard Navigation:
1. Press Tab repeatedly
2. Verify: focus ring visible (blue outline)
3. Focus ke search input
4. Type query, press Down Arrow
5. Select suggestion, press Enter
6. In results, press Tab
7. Navigate buttons dengan Tab/Shift+Tab
8. Press Space pada Save button ✅

---

## 🛠 Step 4: Understand File Structure (5 minutes)

Key files untuk diketahui:

### Frontend Pages:
- **`/app/page.tsx`** - Homepage dengan search
- **`/app/saved/page.tsx`** - Saved articles
- **`/app/layout.tsx`** - Root layout, theme setup

### API Routes:
- **`/app/api/search/route.ts`** - Search implementation
- **`/app/api/autocomplete/route.ts`** - Suggestions
- **`/app/api/export/route.ts`** - BibTeX & RIS
- **`/app/api/linkcheck/route.ts`** - Link validation

### Components:
- **`/components/top-bar.tsx`** - Navigation header
- **`/components/search-input.tsx`** - Search + autocomplete
- **`/components/result-card.tsx`** - Result display
- **`/components/search-filters.tsx`** - Filter controls

### Styling:
- **`/app/globals.css`** - All glass design tokens
- **`/lib/utils.ts`** - Utility functions

---

## 📚 Step 5: Read Documentation (5 minutes)

Baca semua docs yang disediakan:

1. **`PROJECT_SUMMARY.md`** - Full technical overview
   - Architecture & design system
   - Feature descriptions
   - Performance optimizations
   - Security measures

2. **`SETUP_GUIDE.md`** - Detailed setup & deployment
   - Installation instructions
   - API documentation
   - Troubleshooting
   - Docker & Vercel setup

3. **`COMMANDS.md`** - Complete command reference
   - Terminal commands untuk semua package managers
   - Development, build, & deployment
   - Docker commands
   - Troubleshooting commands

4. **`SHORTCUTS.md`** - Keyboard navigation
   - All keyboard shortcuts
   - Accessibility features
   - Screen reader commands
   - Tips & tricks

---

## 🔧 Step 6: Customize (Optional - 10 minutes)

### Change branding:

1. **Update page title & metadata:**
   ```typescript
   // /app/layout.tsx
   export const metadata: Metadata = {
     title: 'Your Name - Research Platform',  // Change this
     description: 'Your description',  // And this
   }
   ```

2. **Update footer:**
   ```typescript
   // /components/footer.tsx
   // Change 'faizyoshio.my.id' ke nama Anda
   ```

3. **Change gradient colors:**
   ```css
   /* /app/globals.css */
   :root {
     --aurora-light-1: 239deg 100% 85%;  /* Ubah hue/sat/light */
     --aurora-light-2: 280deg 100% 75%;
     --aurora-light-3: 320deg 100% 75%;
   }
   ```

4. **Change primary color:**
   ```css
   /* Replace all blue-600 dengan warna Anda */
   /* Contoh: dari blue ke purple */
   ```

---

## 🚀 Step 7: Build for Production (5 minutes)

### Build project:

```bash
npm run build

# Expected output:
# ✓ Compiled successfully
# ✓ Collected static files
# ✓ Server: 123kb
# ✓ Client: 456kb
```

### Test production build locally:

```bash
npm start

# Open: http://localhost:3000
# Test same features sebagai Step 3
```

---

## 🌐 Step 8: Deploy to Production (Choose One)

### Option A: Vercel (Easiest - Recommended)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# 3. Follow prompts, answer questions
# 4. Get URL: https://researchfinder-xyz.vercel.app
```

### Option B: Railway.app (Also Easy)

```bash
# 1. Sign up at railway.app
# 2. Connect GitHub repo
# 3. Deploy with one click
# 4. Get automatic updates on git push
```

### Option C: Docker (Any Server)

```bash
# 1. Build Docker image
docker build -t researchfinder:latest .

# 2. Run container
docker run -p 3000:3000 researchfinder:latest

# 3. Container berjalan di port 3000
```

### Option D: Traditional Server (VPS/Dedicated)

```bash
# 1. SSH ke server
ssh user@your-server.com

# 2. Clone repo
git clone https://github.com/yourusername/researchfinder.git

# 3. Install & build
npm install
npm run build

# 4. Start dengan PM2 (process manager)
pm2 start "npm start" --name "researchfinder"
pm2 save  # Auto-restart on reboot

# 5. Setup reverse proxy (Nginx):
# upstream app { server localhost:3000; }
# server { listen 80; server_name yourdomain.com;
#   location / { proxy_pass http://app; } }
```

---

## ✅ Post-Deploy Checklist

Setelah deploy, verify:

- [ ] Homepage loads successfully
- [ ] Search returns results
- [ ] Autocomplete works
- [ ] Filters update results
- [ ] Save/unsave articles works
- [ ] Export BibTeX downloads
- [ ] Export RIS downloads
- [ ] Link checker responds
- [ ] Dark mode toggles
- [ ] Mobile responsive (DevTools)
- [ ] Keyboard navigation works
- [ ] No console errors (F12)
- [ ] No warnings dalam terminal
- [ ] Toast notifications appear
- [ ] Saved articles persist on refresh

---

## 🎓 Next Steps & Learning

### Beginner-friendly tasks:

1. **Change colors**
   - Edit `--aurora-light-*` variables in globals.css
   - Update `--primary` color

2. **Add new filter**
   - Edit `/components/search-filters.tsx`
   - Add new select/input
   - Pass to SearchParams

3. **Customize welcome message**
   - Edit description in `/app/page.tsx`
   - Add your own text

### Intermediate tasks:

1. **Add new API source** (PubMed, arXiv, etc)
   - Edit `/app/api/search/route.ts`
   - Add new fetch function
   - Merge results

2. **Add authentication**
   - Implement NextAuth.js or Supabase Auth
   - Store saved articles in database
   - Sync across devices

3. **Improve caching**
   - Add Redis for distributed cache
   - Implement database for persistent cache

### Advanced tasks:

1. **Full-stack backend**
   - Move to database (PostgreSQL, MongoDB)
   - Implement user system
   - Add social features (sharing, comments)

2. **AI features**
   - Add recommendation engine
   - Summarize articles
   - Auto-tag articles

3. **Mobile app**
   - Build React Native app
   - Share code between web & mobile

---

## 🆘 Troubleshooting Quick Links

| Problem | Solution |
|---------|----------|
| Port 3000 already in use | See COMMANDS.md - Kill Process |
| Node modules issue | `rm -rf node_modules && npm install` |
| API returning 404 | Check query params, min 2 chars |
| Search results empty | API might be rate limited, wait 1min |
| Theme not persisting | Check localStorage in DevTools |
| Keyboard shortcuts not working | Ensure focus on correct element |
| Mobile layout broken | Clear cache, check viewport meta |

---

## 📞 Get Help

Jika ada masalah:

1. **Check docs:**
   - Baca SETUP_GUIDE.md
   - Baca PROJECT_SUMMARY.md
   - Baca TROUBLESHOOTING section

2. **Check browser console:**
   - Press F12
   - Lihat console untuk error messages
   - Lihat network tab untuk API calls

3. **Check system:**
   - Verify Node.js version >= 20.9
   - Check npm version >= 10.0
   - Verify internet connection

4. **Ask for help:**
   - GitHub Issues (jika public repo)
   - Stack Overflow (tag: next.js)
   - Discord/Twitter

---

## 🎉 Congratulations!

Anda sudah berhasil setup & deploy ResearchFinder!

Next: Customize sesuai kebutuhan Anda, add features, dan share dengan community! 🚀

**Happy researching!** 📚
