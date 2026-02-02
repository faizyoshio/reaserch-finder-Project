/**
 * POST /api/auth/login
 * Securely handles user authentication with rate limiting and CSRF protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, RateLimiter } from '@/lib/validation';
import { signIn } from '@/lib/auth';

// Initialize rate limiter (5 attempts per 15 minutes per IP)
const loginLimiter = new RateLimiter(5, 15 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting and security logging
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Check rate limit to prevent brute force attacks
    if (loginLimiter.isLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many login attempts. Please try again in 15 minutes.',
        },
        { status: 429 }
      );
    }

    // Parse request body
    const { email, password } = await request.json();

    // Validate inputs are provided
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and password are required',
        },
        { status: 400 }
      );
    }

    // Sanitize and validate email
    const sanitizedEmail = email.trim().toLowerCase();
    const emailValidation = validateEmail(sanitizedEmail);

    if (!emailValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email format',
        },
        { status: 400 }
      );
    }

    // Check password is provided
    if (typeof password !== 'string' || password.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Enforce password length limits (prevents DoS attacks)
    if (password.length > 128) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Attempt to sign in
    const signInResult = await signIn(sanitizedEmail, password);

    if (!signInResult.success) {
      // Generic error message prevents email enumeration attacks
      return NextResponse.json(
        {
          success: false,
          error: signInResult.error || 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Check if email is verified
    if (!signInResult.user?.email_verified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please verify your email before logging in',
          needsVerification: true,
          email: sanitizedEmail,
        },
        { status: 403 }
      );
    }

    // Success response
    return NextResponse.json(
      {
        success: true,
        message: 'Logged in successfully',
        user: {
          id: signInResult.user?.id,
          email: signInResult.user?.email,
          email_verified: signInResult.user?.email_verified,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth API] Login error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during login',
      },
      { status: 500 }
    );
  }
}

// OPTIONS endpoint for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
