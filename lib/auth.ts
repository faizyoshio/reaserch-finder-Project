/**
 * SUPABASE AUTHENTICATION UTILITIES
 * Handles secure authentication, session management, and user operations
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (uses environment variables automatically)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type User = {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  user: User | null;
  isAuthenticated: boolean;
};

/**
 * Get current user session
 * Returns null if no active session
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email!,
      email_verified: data.user.email_confirmed_at !== null,
      created_at: data.user.created_at,
      updated_at: data.user.updated_at || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Auth] Error getting current user:', error);
    return null;
  }
}

/**
 * Sign up new user with email and password
 * Sends verification email automatically
 */
export async function signUp(email: string, password: string): Promise<{
  success: boolean;
  error?: string;
  user?: { id: string; email: string };
}> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify`,
      },
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Sign up failed',
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'User creation failed',
      };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email!,
      },
    };
  } catch (error) {
    console.error('[Auth] Sign up error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign up',
    };
  }
}

/**
 * Sign in user with email and password
 * Returns session if successful
 */
export async function signIn(email: string, password: string): Promise<{
  success: boolean;
  error?: string;
  user?: User;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Generic error message to prevent email enumeration
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Sign in failed',
      };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email!,
        email_verified: data.user.email_confirmed_at !== null,
        created_at: data.user.created_at,
        updated_at: data.user.updated_at || new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[Auth] Sign in error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign in',
    };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Password reset failed',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('[Auth] Password reset error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Verify OTP for email confirmation
 */
export async function verifyOTP(email: string, otp: string): Promise<{
  success: boolean;
  error?: string;
  user?: User;
}> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Verification failed',
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Verification failed',
      };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email!,
        email_verified: data.user.email_confirmed_at !== null,
        created_at: data.user.created_at,
        updated_at: data.user.updated_at || new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[Auth] OTP verification error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during verification',
    };
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: error.message || 'Sign out failed',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('[Auth] Sign out error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign out',
    };
  }
}

/**
 * Create saved article record in database
 * Only authenticated users can save articles
 */
export async function saveArticleToDatabase(
  userId: string,
  article: {
    id: string;
    title: string;
    authors: string[];
    year: number;
    doi?: string;
    url?: string;
    source: string;
    abstract?: string;
    citedBy: number;
    openAccess: boolean;
    venue?: string;
  }
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.from('saved_articles').insert({
      user_id: userId,
      article_id: article.id,
      article_title: article.title,
      article_doi: article.doi,
      article_year: article.year,
      article_source: article.source,
      saved_at: new Date().toISOString(),
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to save article',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('[Auth] Save article error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Get user's saved articles from database
 */
export async function getSavedArticles(userId: string): Promise<{
  success: boolean;
  articles?: any[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('saved_articles')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch saved articles',
      };
    }

    return {
      success: true,
      articles: data || [],
    };
  } catch (error) {
    console.error('[Auth] Get saved articles error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Remove saved article from database
 */
export async function removeArticleFromDatabase(
  userId: string,
  articleId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase
      .from('saved_articles')
      .delete()
      .eq('user_id', userId)
      .eq('article_id', articleId);

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to remove article',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('[Auth] Remove article error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}
