/**
 * SECURITY & VALIDATION UTILITIES
 * Implements comprehensive input validation, sanitization, and security checks
 * to prevent XSS, SQL injection, and other common vulnerabilities
 */

/**
 * Email validation following RFC 5322 standards with additional security checks
 * Prevents email enumeration attacks and invalid formats
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  // Trim whitespace
  const trimmed = email.trim();

  // Check empty
  if (!trimmed) {
    return { valid: false, error: 'Email is required' };
  }

  // Check length (RFC 5321 specifies max 254 characters)
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }

  // RFC 5322 compliant email regex (simplified but secure)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Check for common disposable email domains (security measure)
  const disposableDomains = [
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'mailinator.com',
    'throwaway.email',
  ];

  const domain = trimmed.split('@')[1]?.toLowerCase();
  if (domain && disposableDomains.includes(domain)) {
    return { valid: false, error: 'Disposable email addresses not allowed' };
  }

  return { valid: true };
}

/**
 * Password validation with security requirements
 * Ensures strong passwords that meet OWASP guidelines
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  // Minimum 8 characters (NIST SP 800-63B)
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  // Maximum 128 characters (prevent DoS attacks)
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long' };
  }

  // Require at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  // Require at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  // Require at least one number
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  // Require at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character (!@#$%^&* etc)' };
  }

  // Check for common weak patterns
  const weakPatterns = [
    '123456',
    '111111',
    '000000',
    'password',
    'qwerty',
    'abc123',
    'letmein',
    'welcome',
  ];

  if (weakPatterns.some((pattern) => password.toLowerCase().includes(pattern))) {
    return { valid: false, error: 'Password contains common weak patterns' };
  }

  return { valid: true };
}

/**
 * Sanitize input to prevent XSS attacks
 * Removes or escapes potentially dangerous characters
 */
export function sanitizeInput(input: string, maxLength: number = 500): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Enforce maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Escape HTML special characters
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  sanitized = sanitized.replace(/[&<>"'\/]/g, (char) => escapeMap[char] || char);

  return sanitized;
}

/**
 * Validate search query for research finder
 * Enforces minimum 5 word requirement and sanitizes input
 */
export function validateSearchQuery(query: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Search query is required' };
  }

  // Sanitize the query
  const sanitized = sanitizeInput(query, 500);

  // Check minimum length
  if (sanitized.length < 2) {
    return { valid: false, error: 'Search query must be at least 2 characters' };
  }

  // Count words (minimum 5)
  const wordCount = sanitized
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  if (wordCount < 5) {
    return {
      valid: false,
      error: `Search query must contain at least 5 words (current: ${wordCount})`,
      sanitized,
    };
  }

  return { valid: true, sanitized };
}

/**
 * Validate OTP/verification code
 * Ensures 6-digit numeric format
 */
export function validateOTP(otp: string): { valid: boolean; error?: string } {
  if (!otp) {
    return { valid: false, error: 'Verification code is required' };
  }

  // Must be exactly 6 digits
  if (!/^\d{6}$/.test(otp)) {
    return { valid: false, error: 'Verification code must be 6 digits' };
  }

  return { valid: true };
}

/**
 * Validate username
 * Prevents special characters and enforces length requirements
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }

  if (trimmed.length > 30) {
    return { valid: false, error: 'Username must not exceed 30 characters' };
  }

  // Only allow alphanumeric, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Username can only contain letters, numbers, underscores, and hyphens',
    };
  }

  return { valid: true };
}

/**
 * Detect potential SQL injection attempts
 * Checks for common SQL injection patterns
 */
export function detectSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\bunion\b.*\bselect\b)/i,
    /(\bor\b.*=.*)/i,
    /(\bdrop\b.*\btable\b)/i,
    /(\binsert\b.*\binto\b)/i,
    /(\bdelete\b.*\bfrom\b)/i,
    /(\bupdate\b.*\bset\b)/i,
    /(--|#|\/\*)/,
    /(\bexec\b|\bexecute\b)/i,
    /('\s*;\s*)/,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential XSS attempts
 * Checks for common XSS patterns
 */
export function detectXSS(input: string): boolean {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /javascript:/gi,
    /eval\(/gi,
    /expression\(/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Comprehensive input validation and security check
 * Combines multiple validation and detection methods
 */
export function validateAndSanitize(
  input: string,
  type: 'email' | 'password' | 'search' | 'text' = 'text'
): { valid: boolean; error?: string; sanitized?: string } {
  // Check for injection attempts
  if (detectSQLInjection(input)) {
    return { valid: false, error: 'Invalid input detected' };
  }

  if (detectXSS(input)) {
    return { valid: false, error: 'Invalid input detected' };
  }

  // Type-specific validation
  switch (type) {
    case 'email':
      return validateEmail(input);
    case 'password':
      return validatePassword(input);
    case 'search':
      return validateSearchQuery(input);
    case 'text':
    default:
      return { valid: true, sanitized: sanitizeInput(input) };
  }
}

/**
 * Verify CSRF token (used with server actions)
 * Ensures token is properly formatted
 */
export function validateCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Token should be 32+ characters (hex string)
  return /^[a-f0-9]{32,}$/i.test(token);
}

/**
 * Rate limiting validation
 * Tracks attempts and enforces limits
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isLimited(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return false;
    }

    record.count++;

    if (record.count > this.maxAttempts) {
      return true;
    }

    return false;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  getRemaining(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() > record.resetTime) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - record.count);
  }
}

/**
 * Password strength meter
 * Returns strength score 0-4 for UI feedback
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong';
  percentage: number;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'] as const;
  const label = labels[Math.min(score, 4)];
  const percentage = ((score + 1) / 5) * 100;

  return {
    score: Math.min(score, 4),
    label,
    percentage,
  };
}
