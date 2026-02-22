import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(email, password)
    if (result.error) {
      setError(result.error)
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Georgia', serif"
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        padding: '48px',
        width: '100%',
        maxWidth: '420px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Logo / Título */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '64px', height: '64px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '16px',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px'
          }}>⚖️</div>
          <h1 style={{ color: '#fff', fontSize: '24px', margin: '0 0 8px', fontWeight: '700', letterSpacing: '-0.5px' }}>
            Dashboard PGJ
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', margin: 0 }}>
            Gestão de Processos
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '12px 16px', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px', color: '#fff', fontSize: '15px',
                outline: 'none', transition: 'border-color 0.2s'
              }}
              placeholder="seu@email.com"
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '12px 16px', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px', color: '#fff', fontSize: '15px',
                outline: 'none'
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', padding: '12px 16px', color: '#fca5a5',
              fontSize: '14px', marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', letterSpacing: '0.3px'
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
