# Authentication Quick Start Guide

## For Developers - Get Running in 5 Minutes

### Step 1: Environment Setup
```bash
# Add to .env.local or Vercel environment variables:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Change for production
```

### Step 2: Database Setup
1. Go to Supabase Dashboard → SQL Editor
2. Create a new query and paste the contents of `/scripts/setup-database.sql`
3. Execute the query
4. Done! Tables and RLS policies are now in place

### Step 3: Test the Authentication Flow
```bash
npm run dev
```

Then visit:
- **Signup**: http://localhost:3000/auth/signup
- **Login**: http://localhost:3000/auth/login
- **Saved Articles** (requires login): http://localhost:3000/saved

---

## Common Scenarios

### Scenario 1: User Signs Up
```
1. User visits /auth/signup
2. Enters email: user@example.com, password: MyPass123!
3. Clicks "Create Account"
4. Verification email sent
5. User clicks link or enters 6-digit OTP
6. Account verified → can now login
```

**Validation Checks Applied**:
- Email format validated (RFC 5322)
- Password has 8+ chars, uppercase, lowercase, number, special char
- Passwords must match
- Rate limited: 5 signup attempts per 15 minutes per IP

---

### Scenario 2: User Logs In
```
1. User visits /auth/login
2. Enters verified email and password
3. System checks rate limit (5 attempts/15 min)
4. Password validated against bcrypt hash
5. Email verified status checked
6. Session created with HTTP-only cookie
7. User redirected to /saved page
```

**Security Checks Applied**:
- Rate limiting prevents brute force
- Passwords checked securely (no plaintext)
- Email must be verified first
- Generic error messages ("Invalid credentials") prevent email enumeration

---

### Scenario 3: User Saves an Article
```
1. User searches for articles on homepage
2. Finds relevant article
3. Clicks "Save" button
4. System checks authentication (using AuthProvider)
5. If not logged in → redirected to /auth/login
6. If logged in → article saved to database
7. Article only visible to that user (RLS enforces this)
```

**Security Checks Applied**:
- Authentication required (protected by AuthProvider)
- Article data validated
- Duplicate save prevented (unique constraint)
- User ID automatically set (cannot be manipulated)

---

### Scenario 4: User Searches for Articles
```
1. User types search query on homepage
2. System counts words in real-time
3. If < 5 words → shows warning "Minimum 5 words"
4. If ≥ 5 words → "Search" button enabled
5. User clicks search
6. Query validated and sanitized server-side
7. Search results returned
```

**Security Checks Applied**:
- Client-side validation for UX (5-word minimum)
- Server-side validation for security
- XSS patterns detected and blocked
- SQL patterns detected and blocked
- Input length limited (max 500 chars)

---

## Using the Auth Context in Components

### Example 1: Check if User is Logged In
```typescript
import { useAuth } from '@/components/auth-provider'

export function MyComponent() {
  const { user, isLoading, isAuthenticated } = useAuth()

  if (isLoading) return <div>Loading...</div>
  
  if (!isAuthenticated) {
    return <div>Please log in first</div>
  }

  return <div>Welcome, {user?.email}</div>
}
```

### Example 2: Save an Article
```typescript
import { useAuth } from '@/components/auth-provider'

export function SaveButton({ article }) {
  const { user, isAuthenticated } = useAuth()

  const handleSave = async () => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }

    const response = await fetch('/api/saved-articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article }),
    })

    const data = await response.json()
    if (data.success) {
      toast({ title: 'Saved!' })
    }
  }

  return <button onClick={handleSave}>Save Article</button>
}
```

### Example 3: Logout
```typescript
import { useAuth } from '@/components/auth-provider'

export function LogoutButton() {
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    // User is automatically redirected to /auth/login
  }

  return <button onClick={handleLogout}>Logout</button>
}
```

---

## Validation Functions Reference

### Check Email
```typescript
import { validateEmail } from '@/lib/validation'

const result = validateEmail('user@example.com')
if (!result.valid) {
  console.error(result.error) // "Invalid email format"
}
```

### Check Password
```typescript
import { validatePassword } from '@/lib/validation'

const result = validatePassword('MyPass123!')
if (!result.valid) {
  console.error(result.error) // "Password must contain at least one uppercase letter"
}
```

### Check Search Query
```typescript
import { validateSearchQuery } from '@/lib/validation'

const result = validateSearchQuery('machine learning deep neural networks research papers')
if (!result.valid) {
  console.error(result.error) // "Search query must contain at least 5 words"
}
```

### Sanitize Input
```typescript
import { sanitizeInput } from '@/lib/validation'

const clean = sanitizeInput('<script>alert("XSS")</script>')
// Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
```

### Detect Threats
```typescript
import { detectXSS, detectSQLInjection } from '@/lib/validation'

if (detectXSS(userInput)) {
  console.warn('XSS attempt detected')
}

if (detectSQLInjection(userInput)) {
  console.warn('SQL injection attempt detected')
}
```

---

## API Endpoints Reference

### Authentication Endpoints

#### POST /api/auth/signup
Registers a new user
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MyPass123!",
    "confirmPassword": "MyPass123!"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Account created successfully. Please check your email to verify your address.",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

#### POST /api/auth/login
Logs in a user
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MyPass123!"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Logged in successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": true
  }
}
```

#### POST /api/auth/verify
Verifies email with OTP
```bash
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "otp": "123456"
  }'
```

#### POST /api/auth/logout
Logs out current user
```bash
curl -X POST http://localhost:3000/api/auth/logout
```

#### GET /api/auth/me
Gets current user
```bash
curl http://localhost:3000/api/auth/me
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": true,
    "created_at": "2026-02-03T...",
    "updated_at": "2026-02-03T..."
  }
}
```

### Saved Articles Endpoints

#### GET /api/saved-articles
Get user's saved articles (requires auth)
```bash
curl http://localhost:3000/api/saved-articles \
  -H "Authorization: Bearer {session_token}"
```

#### POST /api/saved-articles
Save a new article (requires auth)
```bash
curl -X POST http://localhost:3000/api/saved-articles \
  -H "Content-Type: application/json" \
  -d '{
    "article": {
      "id": "article-123",
      "title": "Deep Learning",
      "authors": ["Author 1"],
      "year": 2024,
      "source": "openAlex",
      "citedBy": 100,
      "openAccess": true
    }
  }'
```

#### DELETE /api/saved-articles
Remove a saved article (requires auth)
```bash
curl -X DELETE http://localhost:3000/api/saved-articles \
  -H "Content-Type: application/json" \
  -d '{"articleId": "article-123"}'
```

---

## Rate Limiting Info

### Limits Applied
| Action | Limit | Window |
|--------|-------|--------|
| Signup | 5 attempts | 15 minutes |
| Login | 5 attempts | 15 minutes |
| Email Verification | 10 attempts | 15 minutes |

### What Triggers Limit
- Client IP address (based on request headers)
- Returns HTTP 429 when exceeded
- Limit resets after time window expires

---

## Error Messages & What They Mean

### Authentication Errors
| Message | Cause | Solution |
|---------|-------|----------|
| "Email is required" | Empty email field | Enter your email |
| "Invalid email format" | Email doesn't match RFC 5322 | Check email format |
| "Disposable email addresses not allowed" | Using tempmail, guerrillamail, etc | Use real email |
| "Password must be at least 8 characters" | Password too short | Make password longer |
| "Invalid email or password" | Credentials don't match | Check caps lock, try again |
| "Please verify your email before logging in" | Email not verified | Check verification email |
| "Too many login attempts" | Rate limit exceeded | Wait 15 minutes |

### Validation Errors
| Message | Cause | Solution |
|---------|-------|----------|
| "Search query must contain at least 5 words" | Query has <5 words | Add more words |
| "Verification code must be 6 digits" | OTP wrong format | Enter 6-digit code |
| "Article already saved" | Article exists in collection | Already in saved list |

---

## Security Reminders

✅ Always use HTTPS in production
✅ Never log passwords or API keys
✅ Never store tokens in localStorage (HTTP-only cookies used)
✅ Always validate on server-side, not just client-side
✅ Use environment variables for secrets
✅ Monitor audit logs for suspicious activity
✅ Regular security updates for dependencies

---

## Troubleshooting

### "No project information available"
**Problem**: Environment variables not set
**Solution**: Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local

### "RLS policy violation"
**Problem**: User trying to access another user's data
**Solution**: This is working correctly! RLS prevents data leaks. Check user ID matches.

### "Rate limit exceeded"
**Problem**: Too many attempts in short time
**Solution**: Wait 15 minutes before trying again

### "Email verification not working"
**Problem**: OTP email not received
**Solution**: Check spam folder, verify email address is correct, ensure Supabase email is configured

---

**Happy Coding!** 🚀
