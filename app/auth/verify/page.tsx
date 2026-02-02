'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle, Loader, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [verified, setVerified] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Get email from query params or use state
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam))
    }
  }, [searchParams])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    try {
      // Validate OTP format (6 digits)
      if (!/^\d{6}$/.test(otp)) {
        setErrors({ otp: 'Please enter a 6-digit code' })
        setLoading(false)
        return
      }

      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrors({ general: data.error || 'Verification failed' })
        toast({
          title: 'Verification failed',
          description: data.error || 'Please try again',
          variant: 'destructive',
        })
        return
      }

      setVerified(true)
      toast({
        title: 'Email verified!',
        description: 'Your account is now active. Redirecting to login...',
      })

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/auth/login')
      }, 2000)
    } catch (error) {
      const errorMsg = 'An error occurred during verification'
      setErrors({ general: errorMsg })
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0) return

    setResendLoading(true)
    setErrors({})

    try {
      // In a real app, this would call an API to resend the verification email
      // For now, we'll just show a message
      toast({
        title: 'Code resent',
        description: `A new verification code has been sent to ${email}`,
      })

      setResendCooldown(60) // 60 second cooldown
    } catch (error) {
      setErrors({ general: 'Failed to resend code' })
    } finally {
      setResendLoading(false)
    }
  }

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-background to-background/95">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center animate-pulse">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Email Verified!</h1>
            <p className="text-foreground/60">Your account is now active and ready to use.</p>
          </div>

          <p className="text-sm text-foreground/50">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-background to-background/95">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Verify Your Email</h1>
          <p className="text-foreground/60">
            We sent a verification code to <span className="font-medium">{email || 'your email'}</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleVerify} className="space-y-5">
          {/* Error message */}
          {errors.general && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{errors.general}</p>
            </div>
          )}

          {/* OTP field */}
          <div className="space-y-2">
            <label htmlFor="otp" className="block text-sm font-medium text-foreground">
              Verification Code
            </label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otp}
              onChange={(e) => {
                // Only allow digits, limit to 6 characters
                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                setOtp(value)
              }}
              maxLength={6}
              required
              className="w-full text-center text-2xl tracking-widest font-mono"
            />
            <p className="text-xs text-foreground/50">Enter the 6-digit code from your email</p>
            {errors.otp && <p className="text-xs text-destructive">{errors.otp}</p>}
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full h-10 text-base font-medium"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Email'
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-foreground/10"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-foreground/50">or</span>
          </div>
        </div>

        {/* Resend code */}
        <div className="space-y-3">
          <p className="text-center text-sm text-foreground/60">Didn't receive the code?</p>
          <Button
            type="button"
            onClick={handleResendCode}
            disabled={resendLoading || resendCooldown > 0}
            variant="outline"
            className="w-full"
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : resendLoading
                ? 'Sending...'
                : 'Resend Code'}
          </Button>
        </div>

        {/* Email change link */}
        <div className="text-center">
          <p className="text-xs text-foreground/50">
            Wrong email?{' '}
            <Link
              href="/auth/signup"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Create new account
            </Link>
          </p>
        </div>

        {/* Security note */}
        <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-lg">
          <p className="text-xs text-foreground/60">
            This verification code is valid for 24 hours. Do not share your code with anyone.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-foreground/50" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
