/**
 * POST /api/auth/logout
 * Securely logs out the user and clears session
 */

import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Sign out from Supabase
    const result = await signOut();

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Logout failed',
        },
        { status: 400 }
      );
    }

    // Clear auth-related cookies
    const response = NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully',
      },
      { status: 200 }
    );

    // Clear any auth tokens from cookies (Supabase handles this, but explicit for security)
    response.cookies.delete('sb-auth-token');
    response.cookies.delete('sb-refresh-token');

    return response;
  } catch (error) {
    console.error('[Auth API] Logout error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during logout',
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
