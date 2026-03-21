import { useState } from 'react'

export default function Login({ onSubmit, loading, error }) {
  const [form, setForm] = useState({
    email: 'admin@blockerp.local',
    password: 'ChangeMe123!',
  })

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-[0.2em] uppercase text-blue">BlockERP</p>
          <h1 className="text-3xl font-bold text-text-primary mt-3">Retail ERP Login</h1>
          <p className="text-text-secondary mt-2">
            Sign in with email and password. MetaMask wallet linking happens after login.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(form)
          }}
        >
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue px-4 py-2.5 text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
