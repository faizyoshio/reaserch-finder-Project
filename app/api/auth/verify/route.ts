/**
 * POST /api/auth/verify
 * Handles OTP verification for email confirmation
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, validateOTP, RateLimiter } from '@/lib/validation';
import { verifyOTP } from '@/lib/auth';

// Initialize rate limiter (10 attempts per 15 minutes for verification)
const verifyLimiter = new RateLimiter(10, 15 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Check rate limit
    if (verifyLimiter.isLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many verification attempts. Please try again in 15 minutes.',
        },
        { status: 429 }
      );
    }

    // Parse request body
    const { email, otp } = await request.json();

    // Validate inputs
    if (!email || !otp) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and verification code are required',
        },
        { status: 400 }
      );
    }

    // Validate and sanitize email
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

    // Validate OTP format
    const otpValidation = validateOTP(otp.toString());

    if (!otpValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: otpValidation.error || 'Invalid verification code format',
        },
        { status: 400 }
      );
    }

    // Attempt to verify OTP
    const verifyResult = await verifyOTP(sanitizedEmail, otp.toString());

    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.error || 'Verification failed',
        },
        { status: 401 }
      );
    }

    // Success - email verified
    return NextResponse.json(
      {
        success: true,
        message: 'Email verified successfully',
        user: {
          id: verifyResult.user?.id,
          email: verifyResult.user?.email,
          email_verified: verifyResult.user?.email_verified,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth API] Verification error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during verification',
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
