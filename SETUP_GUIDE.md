# ResearchFinder - Setup & Deployment Guide

ResearchFinder adalah platform penelitian akademik modern dengan desain Liquid Glass premium, integrasi pencarian real-time dari OpenAlex & Crossref, dan fitur lengkap untuk manajemen artikel yang disimpan.

## Requirements

- Node.js >= 20.9
- npm, yarn, pnpm, atau bun
- Browser modern dengan support untuk:
  - CSS Grid & Flexbox
  - CSS Custom Properties (Variables)
  - localStorage API
  - Fetch API

## Quick Start

### 1. Clone Repository & Install Dependencies

```bash
# Menggunakan pnpm (recommended)
pnpm install

# Atau menggunakan npm
npm install

# Atau menggunakan yarn
yarn install

# Atau menggunakan bun
bun install
```

### 2. Development Server

```bash
# Menggunakan pnpm
pnpm dev

# Atau menggunakan npm
npm run dev

# Atau menggunakan yarn
yarn dev

# Atau menggunakan bun
bun dev
```

Server akan berjalan di `http://localhost:3000`

### 3. Build untuk Production

```bash
# Menggunakan pnpm
pnpm build
pnpm start

# Atau menggunakan npm
npm run build
npm start

# Atau menggunakan yarn
yarn build
yarn start

# Atau menggunakan bun
bun run build
bun start
```

## Fitur Utama

### 1. **Pencarian Real-time** (Bilingual: Indo/English)
- Integrasi dengan OpenAlex dan Crossref API
- Autocomplete dengan debounce optimization
- Filtering berdasarkan tahun, Open Access status, dan sorting
- Cache in-memory untuk performa optimal

### 2. **Desain Liquid Glass Premium**
- Glassmorphism terinspirasi dari iOS 26
- Theme toggle Light/Dark dengan gradient aurora yang indah
- Responsive design dari 320px hingga ultra-wide
- Aksesibilitas penuh dengan ARIA labels dan keyboard navigation

### 3. **Export Sitasi**
- BibTeX format dengan DOI content negotiation
- RIS format untuk import ke reference manager
- Fallback generator jika DOI tidak tersedia
- Download langsung ke disk

### 4. **Link Checker**
- Validasi aksesibilitas URL artikel
- Status indicator yang halus
- Cache dengan TTL 5 menit
- Fallback ke DOI resolver

### 5. **Saved Articles**
- LocalStorage-based system (tidak perlu login)
- Deduplication berbasis DOI
- Sorting berdasarkan waktu penyimpanan
- Full result card untuk view & export

### 6. **External Search Links**
- Quick access ke Garuda Indonesia
- Quick access ke SINTA (database nasional)
- Dengan query forwarding otomatis

## Struktur Project

```
project/
├── app/
│   ├── api/
│   │   ├── search/           # Main search API (OpenAlex + Crossref)
│   │   ├── autocomplete/     # Autocomplete suggestions
│   │   ├── export/           # BibTeX & RIS export
│   │   └── linkcheck/        # Link validation
│   ├── saved/
│   │   └── page.tsx          # Saved articles page
│   ├── layout.tsx            # Root layout dengan theme provider
│   ├── page.tsx              # Home/search page
│   ├── globals.css           # Glassmorphism tokens & utilities
│   ├── loading.tsx           # Suspense boundary
│   └── ...
├── components/
│   ├── top-bar.tsx           # Navigation & brand
│   ├── theme-toggle.tsx      # Dark/light toggle
│   ├── footer.tsx            # Credit footer
│   ├── search-input.tsx      # Search box dengan autocomplete
│   ├── search-filters.tsx    # Advanced filters panel
│   ├── result-card.tsx       # Article result card
│   ├── result-skeleton.tsx   # Loading skeleton
│   ├── external-search-links.tsx  # Garuda & SINTA links
│   └── ui/                   # shadcn components
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   └── utils.ts              # Utility functions & a11y helpers
├── hooks/
│   └── use-toast.ts          # Toast notifications
├── public/
│   └── ...                   # Static assets
├── tsconfig.json
├── package.json
└── next.config.mjs
```

## API Routes

### GET /api/search
Pencarian artikel dengan OpenAlex & Crossref paralel

**Query Parameters:**
- `q` (required): Query string, minimal 2 karakter
- `page` (optional): Halaman, default 1
- `perPage` (optional): Hasil per halaman, default 10, max 100
- `yearFrom` (optional): Tahun mulai
- `yearTo` (optional): Tahun akhir
- `oaOnly` (optional): Filter Open Access only, true/false
- `sort` (optional): relevance|year|citedBy

**Response:**
```json
{
  "articles": [...],
  "total": 1234,
  "page": 1,
  "perPage": 10,
  "hasMore": true
}
```

### GET /api/autocomplete
Saran autocomplete dari OpenAlex

**Query Parameters:**
- `q` (required): Query string, minimal 2 karakter

**Response:**
```json
[
  {
    "title": "Article Title",
    "id": "W123456",
    "doi": "10.xxxx/xxxxx",
    "year": 2024
  }
]
```

### POST /api/export
Export artikel dalam BibTeX atau RIS

**Body:**
```json
{
  "doi": "10.xxxx/xxxxx",
  "format": "bibtex" | "ris",
  "title": "Article Title",
  "authors": ["Author 1", "Author 2"],
  "year": 2024,
  "venue": "Journal Name",
  "url": "https://..."
}
```

### POST /api/linkcheck
Validasi aksesibilitas link

**Body:**
```json
{
  "url": "https://..."
}
```

**Response:**
```json
{
  "ok": true,
  "statusCode": 200,
  "finalUrl": "https://...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Environment Variables

Tidak ada environment variables yang diperlukan untuk API eksternal. OpenAlex dan Crossref adalah public APIs dengan rate limiting yang generous untuk research use.

## Performance Optimizations

1. **In-Memory Caching**
   - Search results: TTL 60 detik
   - Link checks: TTL 5 menit
   - Autocomplete: Per-request debounce

2. **Code Splitting**
   - Dynamic imports untuk komponen besar
   - Route-based code splitting

3. **Image Optimization**
   - No external images (performance first)
   - Inline SVG icons via Lucide React

4. **Bundle Size**
   - Minimal dependencies (~2.5MB total)
   - Tree-shaking enabled
   - Dynamic imports untuk lazy loading

## Browser Support

- Chrome/Edge: >= 90
- Firefox: >= 88
- Safari: >= 14
- Mobile browsers: >= iOS 14, >= Android 9

## Accessibility Features

- Full keyboard navigation
- Screen reader support dengan ARIA labels
- High contrast mode compatible
- Font scaling support
- prefers-reduced-motion respected
- Focus rings visible
- Semantic HTML structure

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t researchfinder .
docker run -p 3000:3000 researchfinder
```

### Manual (Any Node.js Host)

```bash
npm install
npm run build
npm start
```

## Troubleshooting

### API Rate Limiting
- OpenAlex: 100k requests/day (generous)
- Crossref: 50 requests/second
- Resolution: Caching layer menangani ini automatically

### Search Tidak Mengembalikan Hasil
- Pastikan query minimal 2 karakter
- Cek koneksi internet
- Coba dengan query yang lebih spesifik

### Theme Tidak Persist
- Periksa localStorage di browser settings
- Pastikan 3rd-party cookies enabled jika cross-domain

### Mobile Layout Issues
- Clear browser cache
- Cek viewport meta tag di HTML
- Test dengan DevTools responsive mode

## Contributing

Improvements welcome! Areas untuk contribution:
- Integrasi API source baru (PubMed, arXiv, dll)
- UI/UX enhancements
- Accessibility improvements
- Performance optimizations
- Translation ke bahasa lain

## License

MIT License - Gratis untuk penggunaan komersial & non-komersial

## Support

- Issues & bugs: Laporkan via GitHub issues
- Feature requests: Buat discussion thread
- Questions: Tanyakan di discussions

---

**Made with ❤️ by faizyoshio.my.id**

Terima kasih telah menggunakan ResearchFinder! Happy researching! 🎓
