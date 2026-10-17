import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useLogin() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [redirectPath, setRedirectPath] = useState('')

  // Safety timeout and bounce-back detection to avoid infinite loading screens in cross-site iframes
  useEffect(() => {
    if (!showLoading) return

    const timer = setTimeout(() => {
      setShowLoading(false)
      setIsLoading(false)
      setIsGuestLoading(false)
      const msg = 'Session could not be established in this embedded view. If third-party cookies are blocked by your browser, please open BITS directly in a new tab.'
      setGuestError(msg)
      setValidationErrors((prev) => ({ ...prev, password: msg }))
    }, 6000)

    const checkBounce = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('from')) {
          setShowLoading(false)
          setIsLoading(false)
          setIsGuestLoading(false)
          const msg = 'Browser blocked session cookies inside this iframe. Please open BITS in a new tab or allow cross-site cookies.'
          setGuestError(msg)
          setValidationErrors((prev) => ({ ...prev, password: msg }))
        }
      }
    }

    const interval = setInterval(checkBounce, 500)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [showLoading])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    const trimmed = identifier.trim()

    if (!trimmed) {
      newErrors.identifier = 'Email or Employee ID is required'
    } else if (trimmed.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        newErrors.identifier = 'Please enter a valid email address'
      }
    } else {
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)) {
        newErrors.identifier = 'Employee ID must be 3-20 characters (letters, numbers, -, _)'
      }
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setValidationErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 403) {
          setValidationErrors({
            ...validationErrors,
            password: data.message || 'Access denied',
          })
          setIsLoading(false)
          return
        }
        setValidationErrors({
          ...validationErrors,
          password: data.message || 'Login failed',
        })
        setIsLoading(false)
        return
      }

      // Determine redirect path
      let path = '/login'
      if (data.employee.needsPasswordChange) {
        path = '/employee/profile'
      } else if (data.employee.role === 'HR') {
        path = '/hr'
      } else if (data.employee.role === 'MANAGER') {
        path = '/manager/dashboard'
      } else if (data.employee.role === 'ADMIN') {
        path = '/dashboard'
      } else if (data.employee.role === 'USER') {
        path = '/employee'
      }

      setRedirectPath(path)
      // Show continuous loading screen during client-side transition
      setShowLoading(true)
      router.push(path)
    } catch (error: any) {
      setValidationErrors({
        ...validationErrors,
        password: 'Network error. Please check if backend is running.',
      })
      setIsLoading(false)
    }
  }

  const [isGuestLoading, setIsGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState<string | null>(null)

  const handleGuestLogin = async (role: 'ADMIN' | 'HR' | 'MANAGER' | 'USER' = 'ADMIN') => {
    setIsGuestLoading(true)
    setGuestError(null)
    setValidationErrors({})
    try {
      const res = await fetch('/api/auth/guest-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      const data = await res.json()
      if (!res.ok) {
        setGuestError(data.message || 'Failed to start guest session')
        setIsGuestLoading(false)
        return
      }

      setShowLoading(true)
      router.push('/dashboard')
    } catch {
      setGuestError('Network error starting guest mode. Please check if the server is running.')
      setIsGuestLoading(false)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return {
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
    setGuestError,
    showLoading,
    handleSubmit,
    handleGuestLogin
  }
}
