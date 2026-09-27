import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LeafLogoIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(email, password)
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
      navigate(from, { replace: true })
    } catch {
      setError('Incorrect email or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-beige-50 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-beige-200 bg-cream-50 shadow-sm md:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-sage-100 p-10 md:flex">
          <div className="flex items-center gap-2">
            <LeafLogoIcon className="h-7 w-7" />
            <span className="text-lg font-semibold text-sage-900">PolicyPilot</span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold leading-tight text-sage-900">
              Your insurance.
              <br />
              Simplified.
            </h1>
            <p className="mt-3 max-w-xs text-sm text-sage-800/80">
              Understand your policies, get answers, and manage everything in one place.
            </p>
          </div>

          <svg viewBox="0 0 200 120" className="absolute bottom-0 right-0 h-40 w-52 opacity-70">
            <path d="M0 120 C 40 90, 80 100, 110 70 S 180 30, 200 0 L 200 120 Z" className="fill-sage-300" />
            <circle cx="150" cy="30" r="18" className="fill-peach-200" />
          </svg>
        </div>

        <div className="p-8 sm:p-10">
          <h2 className="text-xl font-semibold text-neutral-900">Welcome back</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Login to your PolicyPilot account
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-sage-700 py-2.5 text-sm font-semibold text-white hover:bg-sage-800 disabled:opacity-60"
            >
              {submitting ? 'Logging in…' : 'Login'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            Don't have an account?{' '}
            <button type="button" onClick={() => navigate('/signup')} className="font-medium text-teal-600 hover:underline">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
