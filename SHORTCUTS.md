# ResearchFinder - Keyboard Shortcuts Guide

Complete keyboard navigation guide untuk ResearchFinder. Semua shortcuts mengikuti standar web accessibility.

## Global Navigation

| Shortcut | Action |
|----------|--------|
| `Tab` | Pindah ke elemen fokus berikutnya |
| `Shift + Tab` | Pindah ke elemen fokus sebelumnya |
| `Enter` / `Space` | Aktivasi button atau link fokus |
| `Escape` | Tutup dropdown/modal |

## Search Input

| Shortcut | Action |
|----------|--------|
| `Tab` | Focus ke search input |
| Type text | Mulai mengetik query |
| `Backspace` | Hapus karakter terakhir |
| `Ctrl + A` (Mac: `Cmd + A`) | Select all text |
| `Ctrl + X` (Mac: `Cmd + X`) | Cut text |
| `Ctrl + C` (Mac: `Cmd + C`) | Copy text |
| `Ctrl + V` (Mac: `Cmd + V`) | Paste text |
| `ArrowUp` / `ArrowDown` | Navigate autocomplete suggestions |
| `Enter` | Select suggestion atau trigger search |
| `Escape` | Close autocomplete dropdown |

## Search Results

| Shortcut | Action |
|----------|--------|
| `Tab` | Pindah ke result card berikutnya |
| `Enter` | Open link pada fokus card |
| `Space` | Toggle save button pada fokus card |
| `Shift + C` | Copy DOI (pada card dengan DOI) |
| `Shift + E` | Open export menu (untuk BibTeX/RIS) |
| `Shift + L` | Check link status |

## Filter Panel

| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate antar filter controls |
| `Space` / `Enter` | Toggle checkbox atau button |
| `ArrowUp` / `ArrowDown` | Navigate dropdown options |
| `Home` | Jump ke opsi pertama |
| `End` | Jump ke opsi terakhir |

## Buttons & Controls

### Sort Dropdown
```
Tab -> Buka dropdown
ArrowUp/Down -> Pilih opsi
Enter -> Konfirmasi
Escape -> Tutup tanpa mengubah
```

### Year Filters
```
Tab -> Navigate antar year input
ArrowUp/Down -> Increment/decrement tahun
Type -> Input tahun langsung
```

### Save/Bookmark Button
```
Space -> Toggle save status
Tab -> Focus button
Shift+Space -> Select multiple (future feature)
```

## Export & Download

| Shortcut | Action |
|----------|--------|
| `Shift + B` | Export BibTeX |
| `Shift + R` | Export RIS |
| `Shift + L` | Check link validity |
| `Ctrl + S` (Mac: `Cmd + S`) | Save hasil search (browser default) |

## Pagination

| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate pagination buttons |
| `ArrowLeft` / `ArrowUp` | Prev page (if focused on page info) |
| `ArrowRight` / `ArrowDown` | Next page (if focused on page info) |
| `Home` | Jump ke halaman pertama |
| `End` | Jump ke halaman terakhir |

## Navigation Bar

| Shortcut | Action |
|----------|--------|
| `Alt + 1` (Windows) / `Option + 1` (Mac) | Go to Home |
| `Alt + 2` (Windows) / `Option + 2` (Mac) | Go to Saved |
| `Alt + T` (Windows) / `Option + T` (Mac) | Toggle theme |
| `Tab` | Navigate brand logo, nav links, theme toggle |

## Saved Page

| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate saved articles |
| `Space` | Unsave artikel (pada fokus card) |
| `Enter` | Open artikel link |
| `Shift + B` | Export BibTeX dari saved |
| `Shift + R` | Export RIS dari saved |

## Screen Reader Commands (NVDA/JAWS)

| Command | Result |
|---------|--------|
| `Ctrl + Home` | Jump ke page start |
| `Ctrl + End` | Jump ke page end |
| `H` | Announce heading |
| `L` | Announce list |
| `B` | Announce button |
| `F` | Announce form field |
| `G` | Go to main content |

## Mobile Shortcuts (via soft keyboard)

```
Search Input:
- Tap once: Focus & show keyboard
- Tap search icon: Trigger search
- X button: Clear text

Filter Controls:
- Tap OA badge: Toggle filter
- Tap year select: Open picker
- Swipe left/right: Navigate year options

Results:
- Swipe up/down: Scroll
- Tap "Open": Open in browser
- Tap "Save": Add to saved
- Long press: Show context menu (if available)

Navigation:
- Swipe left: Go to previous page (if available)
- Swipe right: Go to next page (if available)
- Tap hamburger: Open menu (if available)
```

## Browser Built-in Shortcuts

| Shortcut | Action |
|----------|--------|
| `F11` | Enter/exit fullscreen |
| `Ctrl + F` (Mac: `Cmd + F`) | Find in page |
| `Ctrl + P` (Mac: `Cmd + P`) | Print page / Save as PDF |
| `Ctrl + Shift + Delete` | Clear browsing data |
| `F12` | Open DevTools |

## Quick Navigation Tips

### Efficient Workflow:

**1. Minimal Search:**
```
Press Tab to reach search input
Type: "quantum computing"
Press Enter or Down Arrow then Enter for suggestion
Result loads automatically
```

**2. Quick Save:**
```
Navigate results with Tab
Press Space to save current article
Toast confirmation appears
Repeat for multiple articles
```

**3. Export Multiple:**
```
Tab to first result
Shift+B to export BibTeX
Tab to next result
Shift+R to export RIS
Repeat as needed
```

**4. Filter & Search Again:**
```
Tab to filter section
ArrowDown to year dropdown
Input year range
Enter to apply
Search results auto-update
```

## Accessibility Features Summary

✅ **Full keyboard support** - Semua fitur accessible via keyboard
✅ **ARIA labels** - Screen readers announce correctly
✅ **Focus indicators** - Visible blue ring menunjukkan fokus
✅ **Semantic HTML** - Proper heading hierarchy dan structure
✅ **Color contrast** - 4.5:1 minimum untuk readability
✅ **Skip links** - Jump langsung ke main content
✅ **Form labels** - Associated dengan inputs
✅ **Error messages** - Clear & actionable
✅ **Loading states** - Announced to screen readers
✅ **Toast notifications** - Accessible announcements

## Testing Keyboard Navigation

### Checklist:
```
□ Tab ke search input
□ Type query dan press Enter
□ Navigate results dengan Tab
□ Space untuk save
□ Shift+B untuk export BibTeX
□ Tab ke filter controls
□ Space untuk toggle OA filter
□ ArrowUp/Down di year dropdown
□ Enter untuk apply filters
□ Tab ke pagination buttons
□ Arrow keys untuk prev/next page
□ Escape untuk close dropdowns
□ Shift+Tab untuk reverse navigate
□ Home/End untuk jump positions
□ Alt shortcuts untuk nav (browser specific)
```

## Troubleshooting

### Shortcuts not working?

1. **Check active element**: Press Tab to ensure focus on correct input
2. **Browser extensions**: Some extensions override shortcuts
3. **IME input**: Disable IME if using non-English keyboards
4. **Screen reader conflict**: Disable temporarily to test

### Screen reader issues?

1. **NVDA (Windows)**: Press Alt+Insert+H for help
2. **JAWS**: Press Insert+F1 for help
3. **VoiceOver (Mac)**: Press VO+? for help
4. **Safari (iOS)**: Settings > Accessibility > VoiceOver

## Custom Shortcuts Per Device

### Windows:
- Ctrl = Control
- Alt = Alt
- Shift = Shift
- Cmd equivalent = N/A

### macOS:
- Cmd = Command (⌘)
- Option = Option (⌥)
- Shift = Shift (⇧)
- Ctrl = Control (⌃)

### Linux:
- Ctrl = Ctrl
- Alt = Alt
- Super = Windows key
- Shift = Shift

## Future Shortcut Plans

Potential shortcuts untuk versi mendatang:

```
Ctrl+L - Focus search (like browsers)
Ctrl+/ - Open shortcuts help modal
Ctrl+K - Command palette (search + actions)
Ctrl+B - Toggle saved sidebar
Ctrl+, - Open settings
S - Sort menu (hotkey when results visible)
F - Filter menu (hotkey when results visible)
A - Save article (hotkey when card focused)
? - Show this help page
```

---

**Remember**: Semua shortcuts mengikuti standar web accessibility.
Press `?` pada future versions untuk quick reference modal!

Happy navigating! ⌨️
