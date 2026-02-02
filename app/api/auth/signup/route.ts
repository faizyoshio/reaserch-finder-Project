/**
 * POST /api/auth/signup
 * Securely handles user registration with email verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, validatePassword, validateAndSanitize, RateLimiter } from '@/lib/validation';
import { signUp } from '@/lib/auth';

// Initialize rate limiter (5 attempts per 15 minutes)
const signupLimiter = new RateLimiter(5, 15 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Check rate limit
    if (signupLimiter.isLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many signup attempts. Please try again in 15 minutes.',
        },
        { status: 429 }
      );
    }

    // Parse request body
    const { email, password, confirmPassword } = await request.json();

    // Validate inputs are provided
    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email, password, and confirmation are required',
        },
        { status: 400 }
      );
    }

    // Sanitize email input
    const sanitizedEmail = email.trim().toLowerCase();

    // Validate email
    const emailValidation = validateEmail(sanitizedEmail);
    if (!emailValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: emailValidation.error,
        },
        { status: 400 }
      );
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: passwordValidation.error,
        },
        { status: 400 }
      );
    }

    // Check passwords match
    if (password !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Passwords do not match',
        },
        { status: 400 }
      );
    }

    // Attempt to sign up
    const signupResult = await signUp(sanitizedEmail, password);

    if (!signupResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: signupResult.error || 'Sign up failed',
        },
        { status: 400 }
      );
    }

    // Success - user created and verification email sent
    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully. Please check your email to verify your address.',
        user: {
          id: signupResult.user?.id,
          email: signupResult.user?.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Auth API] Signup error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during sign up',
      },
      { status: 500 }
    );
  }
}

// SECURITY HEADERS for API route
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
