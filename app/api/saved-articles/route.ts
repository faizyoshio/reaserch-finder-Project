/**
 * API endpoints for managing saved articles
 * GET /api/saved-articles - Get user's saved articles
 * POST /api/saved-articles - Save a new article
 * DELETE /api/saved-articles - Remove a saved article
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/auth';

// GET - Retrieve all saved articles for the user
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    // Fetch saved articles from database (RLS ensures only user's articles)
    const { data, error } = await supabase
      .from('saved_articles')
      .select('*')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching saved articles:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch saved articles',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        articles: data || [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] GET saved articles error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// POST - Save a new article
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { article } = body;

    if (!article || !article.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid article data',
        },
        { status: 400 }
      );
    }

    // Insert saved article into database (RLS enforces user_id match)
    const { error } = await supabase.from('saved_articles').insert({
      user_id: user.id,
      article_id: article.id,
      article_title: article.title,
      article_doi: article.doi,
      article_year: article.year,
      article_source: article.source,
      article_abstract: article.abstract,
      article_authors: article.authors,
      article_url: article.url,
      saved_at: new Date().toISOString(),
    });

    if (error) {
      // Check if it's a unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'Article already saved',
          },
          { status: 409 }
        );
      }

      console.error('[API] Error saving article:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save article',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Article saved successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API] POST saved articles error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// DELETE - Remove a saved article
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Article ID is required',
        },
        { status: 400 }
      );
    }

    // Delete saved article (RLS ensures user can only delete their own)
    const { error } = await supabase
      .from('saved_articles')
      .delete()
      .eq('user_id', user.id)
      .eq('article_id', articleId);

    if (error) {
      console.error('[API] Error deleting article:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete article',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Article removed successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] DELETE saved articles error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
