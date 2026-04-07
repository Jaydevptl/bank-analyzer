import React, { useState, useCallback, useEffect } from 'react';
import {
  LayoutDashboard, ArrowUpDown, Upload, Landmark,
  Menu, X, CheckCircle2, Copy, FileBarChart, CalendarDays,
  Sun, Moon, ShieldCheck, Lock, Trash2, ExternalLink, TrendingUp
} from 'lucide-react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import MainTable from './components/MainTable';
import VerifiedTable from './components/VerifiedTable';
import DuplicatesTable from './components/DuplicatesTable';
import BackupTable from './components/BackupTable';
import ReportsPage from './components/ReportsPage';
import CredentialsPage from './components/CredentialsPage';
import RecycleBin from './components/RecycleBin';
import ShareMarket from './components/ShareMarket';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',      Icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions',    Icon: ArrowUpDown,    openable: true },
  { id: 'verified',     label: 'Verified',        Icon: CheckCircle2,   openable: true },
  { id: 'duplicates',   label: 'Duplicates',      Icon: Copy            },
  { id: 'backup',       label: 'Backup',          Icon: ShieldCheck     },
  { id: 'sharemarket',  label: 'Share Market',    Icon: TrendingUp,     openable: true },
  { id: 'reports',      label: 'Reports',         Icon: FileBarChart    },
  { id: 'credentials',  label: 'Credentials',     Icon: Lock            },
  { id: 'recycle',      label: 'Recycle Bin',     Icon: Trash2          },
  { id: 'upload',       label: 'Upload',          Icon: Upload          },
];

const COLLAPSED_W = 60;
const EXPANDED_W = 230;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function App() {
  const [activeView, setActiveView]   = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') || 'dashboard';
  });
  const [refreshKey, setRefreshKey]   = useState(0);
  const [hovered, setHovered]         = useState(false);

  // Theme
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('banklens-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('banklens-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const handleUploadSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setActiveView('reports');
  }, []);

  const expanded = hovered;
  const sidebarW = expanded ? EXPANDED_W : COLLAPSED_W;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: sidebarW,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: 50,
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div style={{
          padding: expanded ? '24px 20px 20px' : '24px 12px 20px',
          borderBottom: '1px solid var(--border)',
          transition: 'padding 0.3s',
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Landmark size={20} color="#1A1A2E" strokeWidth={2.5} />
            </div>
            <div style={{
              opacity: expanded ? 1 : 0,
              transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.25s, transform 0.25s',
              overflow: 'hidden',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                BankLens
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                Statement Analyzer
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: expanded ? '16px 12px' : '12px 6px', flex: 1, transition: 'padding 0.3s' }}>
          {NAV.map(({ id, label, Icon, openable }) => {
            const active = activeView === id;
            return (
              <div key={id} style={{ position: 'relative', marginBottom: 4 }}>
              <button
                onClick={() => setActiveView(id)}
                title={expanded ? undefined : label}
                style={{
                  width: expanded ? '100%' : 44,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: expanded ? '0 14px' : '0',
                  justifyContent: expanded ? 'flex-start' : 'center',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#1A1A2E' : 'var(--text-secondary)',
                  background: active ? 'var(--accent)' : 'transparent',
                  textAlign: 'left',
                  marginBottom: 0,
                  marginLeft: expanded ? 0 : 2,
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? 'var(--accent)' : 'transparent'; }}
              >
                <Icon size={19} strokeWidth={active ? 2.5 : 2} style={{ flexShrink: 0, minWidth: 19 }} />
                <span style={{
                  opacity: expanded ? 1 : 0,
                  width: expanded ? 'auto' : 0,
                  transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
                  transition: 'opacity 0.2s, transform 0.2s, width 0.2s',
                  transitionDelay: expanded ? '0.05s' : '0s',
                }}>
                  {label}
                </span>
              </button>
              {expanded && openable && active && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}?view=${id}`, '_blank'); }}
                  title="Open in new tab"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', padding: 2,
                    opacity: 0.6, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  <ExternalLink size={12} />
                </button>
              )}
              </div>
            );
          })}
        </nav>

        {/* Theme Toggle + Footer */}
        <div style={{ padding: expanded ? '12px 12px 14px' : '12px 6px 14px', borderTop: '1px solid var(--border)', transition: 'padding 0.3s' }}>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={expanded ? undefined : (theme === 'light' ? 'Dark Mode' : 'Light Mode')}
            style={{
              justifyContent: expanded ? 'flex-start' : 'center',
              padding: expanded ? '8px 14px' : '8px 0',
              width: expanded ? '100%' : 44,
              marginLeft: expanded ? 0 : 2,
              transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            {theme === 'light' ? <Moon size={16} style={{ flexShrink: 0, minWidth: 16 }} /> : <Sun size={16} style={{ flexShrink: 0, minWidth: 16 }} />}
            <span style={{
              opacity: expanded ? 1 : 0,
              width: expanded ? 'auto' : 0,
              transition: 'opacity 0.2s',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}>
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </span>
          </button>
          {expanded && (
            <div style={{
              fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
              marginTop: 8, textAlign: 'center',
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.3s',
            }}>
              BankLens v2.0
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{
        marginLeft: COLLAPSED_W,
        flex: 1,
        minHeight: '100vh',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Top bar */}
        <header style={{
          height: 64,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {getGreeting()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <CalendarDays size={12} />
              {formatDate()}
            </div>
          </div>
        </header>

        {/* Views */}
        <div style={{ padding: 28 }}>
          {activeView === 'dashboard' && <Dashboard key={`dash-${refreshKey}`} />}
          {activeView === 'transactions' && <MainTable key={`txn-${refreshKey}`} />}
          {activeView === 'verified' && <VerifiedTable key={`ver-${refreshKey}`} />}
          {activeView === 'duplicates' && <DuplicatesTable key={`dup-${refreshKey}`} />}
          {activeView === 'backup' && <BackupTable key={`bak-${refreshKey}`} />}
          {activeView === 'reports' && <ReportsPage key={`rep-${refreshKey}`} />}
          {activeView === 'credentials' && <CredentialsPage key={`cred-${refreshKey}`} />}
          {activeView === 'recycle' && <RecycleBin key={`rec-${refreshKey}`} />}
          {activeView === 'sharemarket' && <ShareMarket key={`sm-${refreshKey}`} />}
          {activeView === 'upload' && <FileUpload onSuccess={handleUploadSuccess} />}
        </div>
      </main>
    </div>
  );
}
