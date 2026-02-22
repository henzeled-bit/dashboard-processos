import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function Layout({ children, activeTab }) {
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(15,23,42,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚖️</span>
          <span style={{ color: '#fff', fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px' }}>
            Dashboard PGJ
          </span>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: '4px' }}>
          <Link href="/dashboard" style={{
            padding: '8px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            background: activeTab === 'dashboard' ? 'rgba(59,130,246,0.2)' : 'transparent',
            color: activeTab === 'dashboard' ? '#60a5fa' : 'rgba(255,255,255,0.5)',
            border: activeTab === 'dashboard' ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            transition: 'all 0.2s'
          }}>
            📊 Dashboard
          </Link>
          <Link href="/configuracoes" style={{
            padding: '8px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            background: activeTab === 'config' ? 'rgba(59,130,246,0.2)' : 'transparent',
            color: activeTab === 'config' ? '#60a5fa' : 'rgba(255,255,255,0.5)',
            border: activeTab === 'config' ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            transition: 'all 0.2s'
          }}>
            ⚙️ Configurações
          </Link>
        </nav>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
            {user?.name || user?.email}
          </span>
          <button onClick={handleLogout} style={{
            padding: '7px 16px',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            Sair
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: '32px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
