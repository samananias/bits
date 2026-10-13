import React from 'react'
import { Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react'
import { useLogin } from '../hooks/useLogin'

interface LoginFormProps {
  loginState: ReturnType<typeof useLogin>
}

export function LoginForm({ loginState }: LoginFormProps) {
  const {
    identifier,
    setIdentifier,
    password,
    setPassword,
    showPassword,
    togglePasswordVisibility,
    validationErrors,
    setValidationErrors,
    isLoading,
    isGuestLoading,
    guestError,
    handleSubmit,
    handleGuestLogin
  } = loginState

  return (
    <>
      <div className="relative mb-9">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <User className="h-7 w-7 text-red-600" />
            <h1 className="text-2xl font-bold text-gray-700">User Login</h1>
          </div>

          <button
            type="button"
            id="explore-as-guest"
            onClick={() => handleGuestLogin('ADMIN')}
            disabled={isLoading || isGuestLoading}
            aria-describedby="explore-as-guest-desc"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50/80 hover:bg-red-100/80 border border-red-200/80 transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-xs hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            title="Explore live demo views as guest (read-only)"
          >
            {isGuestLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" aria-hidden="true" />
            )}
            <span>Explore as Guest</span>
          </button>
          <span id="explore-as-guest-desc" className="sr-only">
            Read-only preview. No account needed.
          </span>
        </div>

        {guestError && (
          <p role="alert" className="mt-2 text-right text-xs text-red-600">
            {guestError}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <div className="relative">
            <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder="Email or Employee ID"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value)
                if (validationErrors.identifier) {
                  setValidationErrors({
                    ...validationErrors,
                    identifier: '',
                  })
                }
              }}
              disabled={isLoading}
              className="w-full border-b-2 border-gray-500 bg-transparent py-3 pl-12 pr-4 text-gray-800 placeholder-gray-900 focus:border-red-600 focus:outline-none disabled:opacity-50"
            />
          </div>
          {validationErrors.identifier && (
            <p className="mt-2 text-xs text-red-600">{validationErrors.identifier}</p>
          )}
        </div>

        <div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (validationErrors.password) {
                  setValidationErrors({
                    ...validationErrors,
                    password: '',
                  })
                }
              }}
              disabled={isLoading}
              className="w-full border-b-2 border-gray-500 bg-transparent py-3 pl-12 pr-12 text-gray-800 placeholder-gray-900 focus:border-red-600 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-600 disabled:opacity-50 cursor-pointer"
              disabled={isLoading}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {validationErrors.password && (
            <p className="mt-2 text-xs text-red-600">{validationErrors.password}</p>
          )}
        </div>

        <div className="flex justify-center pt-6">
          <button
            type="submit"
            disabled={isLoading || isGuestLoading}
            className="auth-login-btn inline-block rounded-full bg-red-600 px-8 py-3 font-bold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? 'LOGGING IN...' : 'LOG IN'}
          </button>
        </div>
      </form>

      <p className="mt-8 text-center text-xs text-gray-600">
        Biometric Integrated Timekeeping System Web Portal
      </p>

      <a
        href="/api/download-manual"
        className="mt-4 block text-xs text-center text-muted-foreground underline hover:text-primary transition-colors"
      >
        Download User Manual
      </a>
    </>
  )
}
