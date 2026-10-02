import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword, updateProfile } from '../api/client'
import { UserIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../lib/format'

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setEmail(user.email)
    setPhone(user.phone ?? '')
  }, [user])

  // Success confirmations fade out on their own rather than lingering.
  useEffect(() => {
    if (!profileSuccess && !passwordSuccess) return
    const t = setTimeout(() => {
      setProfileSuccess(false)
      setPasswordSuccess(false)
    }, 3000)
    return () => clearTimeout(t)
  }, [profileSuccess, passwordSuccess])

  if (!user) return null

  const isDirty = name !== user.name || email !== user.email || (phone || '') !== (user.phone ?? '')

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(false)
    setSavingProfile(true)

    try {
      await updateProfile({ name, email, phone: phone || null })
      await refreshUser()
      setProfileSuccess(true)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('409')) {
        setProfileError('That email is already in use')
      } else {
        setProfileError('Could not save changes. Please try again.')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    setSavingPassword(true)
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordSuccess(true)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('400')) {
        setPasswordError('Current password is incorrect')
      } else {
        setPasswordError('Could not update password. Please try again.')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Profile</h1>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-beige-200 bg-white p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-600 text-white">
          {getInitials(user.name) ? (
            <span className="text-lg font-semibold">{getInitials(user.name)}</span>
          ) : (
            <UserIcon className="h-7 w-7" />
          )}
        </div>
        <div>
          <p className="font-medium text-neutral-900">{user.name}</p>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="mt-6 space-y-4 rounded-2xl border border-beige-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Account details</h2>

        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-neutral-700">
            Name
          </label>
          <input
            id="profile-name"
            autoComplete="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-neutral-700">
            Email
          </label>
          <input
            id="profile-email"
            autoComplete="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium text-neutral-700">
            Phone
          </label>
          <input
            id="profile-phone"
            autoComplete="tel"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        {profileError && <p role="alert" className="text-sm text-red-600">{profileError}</p>}
        {profileSuccess && !profileError && <p role="status" className="text-sm text-sage-700">Saved.</p>}

        <button
          type="submit"
          disabled={!isDirty || savingProfile}
          className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="mt-4 space-y-4 rounded-2xl border border-beige-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Change password</h2>

        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-neutral-700">
            Current password
          </label>
          <input
            id="current-password"
            autoComplete="current-password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-neutral-700">
            New password
          </label>
          <input
            id="new-password"
            autoComplete="new-password"
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-neutral-700">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            autoComplete="new-password"
            type="password"
            required
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-beige-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </div>

        {passwordError && <p role="alert" className="text-sm text-red-600">{passwordError}</p>}
        {passwordSuccess && !passwordError && <p role="status" className="text-sm text-sage-700">Password updated.</p>}

        <button
          type="submit"
          disabled={savingPassword}
          className="rounded-xl border border-beige-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-beige-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingPassword ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-xl border border-beige-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
