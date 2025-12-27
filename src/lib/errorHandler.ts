/**
 * Error sanitization utility to prevent information disclosure
 * Maps database errors to user-friendly messages while keeping details server-side
 */

export const sanitizeError = (error: Error | unknown): string => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  
  // Log full error for debugging (would go to proper logging in production)
  console.error('[Error]:', error);
  
  // Map to user-friendly messages
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return 'This item already exists';
  }
  if (message.includes('foreign key')) {
    return 'Referenced item not found';
  }
  if (message.includes('violates row-level security') || message.includes('new row violates')) {
    return 'You do not have permission to perform this action';
  }
  if (message.includes('permission denied')) {
    return 'Access denied';
  }
  if (message.includes('not authenticated') || message.includes('JWT')) {
    return 'Please sign in to continue';
  }
  if (message.includes('timeout') || message.includes('network')) {
    return 'Connection error. Please try again';
  }
  if (message.includes('Invalid login credentials')) {
    return 'Invalid email or password';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please verify your email address';
  }
  if (message.includes('User already registered')) {
    return 'An account with this email already exists';
  }
  
  // Generic fallback for unknown errors
  return 'An error occurred. Please try again';
};
