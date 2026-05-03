import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Home, Users, Package, DollarSign, ShoppingBag, Landmark,
  TrendingUp, ShoppingCart, Handshake, Gem, RefreshCw,
  UserCog, FileText, BarChart3, Settings,
  ChevronDown, ChevronRight, ExternalLink, CalendarDays,
  Sun, Moon,
} from 'lucide-react';

import FileUpload       from './components/FileUpload';
import Dashboard        from './components/Dashboard';
import MainTable        from './components/MainTable';
import VerifiedTable    from './components/VerifiedTable';
import DuplicatesTable  from './components/DuplicatesTable';
import BackupTable      from './components/BackupTable';
import ReportsPage      from './components/ReportsPage';
import CredentialsPage  from './components/CredentialsPage';
import RecycleBin       from './components/RecycleBin';
import ShareMarket      from './components/ShareMarket';
import BackupPage       from './components/BackupPage';
import Amazon           from './components/Amazon';
import Placeholder        from './components/_Placeholder';
import BankAccountsPage   from './components/CashBank/BankAccountsPage';
import CashInHandPage     from './components/CashBank/CashInHandPage';
import FixedAssetsPage    from './components/CashBank/FixedAssetsPage';
import LoansGivenPage     from './components/CashBank/LoansGivenPage';
import GiftCardsPage      from './components/CashBank/GiftCardsPage';
import CreditCardsPage    from './components/CashBank/CreditCardsPage';
import PartiesPage        from './components/Parties/PartiesPage';
import ItemsPage          from './components/Items/ItemsPage';
import SaleInvoicesPage   from './components/Sale/SaleInvoicesPage';
import PurchaseInvoicesPage from './components/Purchase/PurchaseInvoicesPage';
import DevToolsPage       from './components/Settings/DevToolsPage';

// ─── Sidebar definition ──────────────────────────────────────────────────────
// Each top-level entry is either:
//   { id, label, Icon, view }                       → leaf
//   { id, label, Icon, children: [{id,label,view}] } → group (collapsible)

const NAV_GROUPS = [
  { id: 'home',    label: 'Home',    Icon: Home,    view: 'dashboard' },
  { id: 'parties', label: 'Parties', Icon: Users,   view: 'parties' },
  { id: 'items',   label: 'Items',   Icon: Package, view: 'items' },

  { id: 'sale', label: 'Sale', Icon: DollarSign, children: [
    { id: 'sale-invoices',     label: 'Sale Invoices',         view: 'sale/invoices' },
    { id: 'sale-estimates',    label: 'Estimate / Quotation',  view: 'sale/estimates' },
    { id: 'sale-payment-in',   label: 'Payment-In',            view: 'sale/payment-in' },
    { id: 'sale-orders',       label: 'Sale Order',            view: 'sale/orders' },
    { id: 'sale-returns',      label: 'Sale Return / CN',      view: 'sale/returns' },
    { id: 'sale-pos',          label: 'POS',                   view: 'sale/pos' },
    { id: 'sale-other-income', label: 'Other Income',          view: 'sale/other-income' },
  ]},

  { id: 'purchase', label: 'Purchase', Icon: ShoppingBag, children: [
    { id: 'purchase-bills',       label: 'Purchase Bills',        view: 'purchase/bills' },
    { id: 'purchase-payment-out', label: 'Payment-Out',           view: 'purchase/payment-out' },
    { id: 'purchase-expenses',    label: 'Expenses',              view: 'purchase/expenses' },
    { id: 'purchase-orders',      label: 'Purchase Order',        view: 'purchase/orders' },
    { id: 'purchase-returns',     label: 'Purchase Return / DN',  view: 'purchase/returns' },
    { id: 'purchase-fa',          label: 'Purchase FA',           view: 'purchase/fa' },
  ]},

  { id: 'cash-bank', label: 'Cash, Bank & Assets', Icon: Landmark, children: [
    { id: 'cb-banks',        label: 'Bank Accounts',  view: 'cash-bank/banks' },
    { id: 'cb-cash',         label: 'Cash in Hand',   view: 'cash-bank/cash' },
    { id: 'cb-loans',        label: 'Loans Given',    view: 'cash-bank/loans' },
    { id: 'cb-fixed-assets', label: 'Fixed Assets',   view: 'cash-bank/fixed-assets' },
    { id: 'cb-gift-cards',   label: 'Gift Cards',     view: 'cash-bank/gift-cards' },
    { id: 'cb-credit-cards', label: 'Credit Cards',   view: 'cash-bank/credit-cards' },
  ]},

  { id: 'share-market', label: 'Share Market', Icon: TrendingUp, children: [
    { id: 'sm-holders',   label: 'Account Holders', view: 'share-market/holders' },
    { id: 'sm-brokers',   label: 'Brokers',         view: 'share-market/brokers' },
    { id: 'sm-trades',    label: 'Trades',          view: 'share-market/trades' },
    { id: 'sm-holdings',  label: 'Holdings',        view: 'share-market/holdings' },
    { id: 'sm-dividends', label: 'Dividends',       view: 'share-market/dividends' },
  ]},

  { id: 'amazon-cards', label: 'Amazon Cards', Icon: ShoppingCart, children: [
    { id: 'amz-cards',     label: 'Cards',            view: 'amazon-cards/cards' },
    { id: 'amz-loads',     label: 'Card Loads',       view: 'amazon-cards/loads' },
    { id: 'amz-orders',    label: 'Amazon Orders',    view: 'amazon-cards/orders' },
    { id: 'amz-transfers', label: 'Card Transfers',   view: 'amazon-cards/transfers' },
    { id: 'amz-shipments', label: 'Import Shipments', view: 'amazon-cards/shipments' },
  ]},

  { id: 'partners', label: 'Partners', Icon: Handshake, children: [
    { id: 'pt-master',        label: 'Partner Master',       view: 'partners/master' },
    { id: 'pt-capital',       label: 'Partner Capital',      view: 'partners/capital' },
    { id: 'pt-distributions', label: 'Profit Distributions', view: 'partners/distributions' },
  ]},

  { id: 'investments', label: 'Investments', Icon: Gem, children: [
    { id: 'inv-businesses',    label: 'Businesses / Projects',   view: 'investments/businesses' },
    { id: 'inv-inter-company', label: 'Inter-company Transfers', view: 'investments/inter-company' },
  ]},

  { id: 'bank-statement', label: 'Bank Statement', Icon: RefreshCw, children: [
    { id: 'bs-upload',           label: 'Upload',           view: 'bank-statement/upload' },
    { id: 'bs-transactions',     label: 'Transactions',     view: 'bank-statement/transactions' },
    { id: 'bs-verified',         label: 'Verified',         view: 'bank-statement/verified' },
    { id: 'bs-duplicates',       label: 'Duplicates',       view: 'bank-statement/duplicates' },
    { id: 'bs-backup',           label: 'Backup',           view: 'bank-statement/backup' },
    { id: 'bs-cash-conversions', label: 'Cash Conversions', view: 'bank-statement/cash-conversions' },
    { id: 'bs-recycle-bin',      label: 'Recycle Bin',      view: 'bank-statement/recycle-bin' },
  ]},

  { id: 'staff', label: 'Staff', Icon: UserCog, children: [
    { id: 'st-employees',  label: 'Employees',       view: 'staff/employees' },
    { id: 'st-salary',     label: 'Salary Payments', view: 'staff/salary' },
    { id: 'st-petty-cash', label: 'Petty Cash',      view: 'staff/petty-cash' },
  ]},

  { id: 'tax', label: 'Tax & Compliance', Icon: FileText, children: [
    { id: 'tx-tds',        label: 'TDS Receivable', view: 'tax/tds' },
    { id: 'tx-gst-input',  label: 'GST Input',      view: 'tax/gst-input' },
    { id: 'tx-gst-output', label: 'GST Output',     view: 'tax/gst-output' },
  ]},

  { id: 'reports', label: 'Reports', Icon: BarChart3, view: 'reports' },

  { id: 'settings', label: 'Settings', Icon: Settings, children: [
    { id: 'set-company',     label: 'Company / Firm',     view: 'settings/company' },
    { id: 'set-users',       label: 'Users & Roles',      view: 'settings/users' },
    { id: 'set-backup',      label: 'Backup & Restore',   view: 'settings/backup' },
    { id: 'set-credentials', label: 'Credentials',        view: 'settings/credentials' },
    { id: 'set-recurring',   label: 'Recurring Rules',    view: 'settings/recurring' },
    ...(import.meta.env.DEV ? [{ id: 'set-dev-tools', label: 'Dev Tools', view: 'settings/dev-tools' }] : []),
  ]},
];

// ─── view → component map (existing pages + placeholders) ────────────────────
const VIEW_REGISTRY = {
  'dashboard': () => <Dashboard />,

  'parties': () => <PartiesPage />,
  'items':   () => <ItemsPage />,

  'sale/invoices': () => <SaleInvoicesPage />,

  'purchase/bills': () => <PurchaseInvoicesPage />,

  'bank-statement/upload':           () => <FileUpload />,
  'bank-statement/transactions':     () => <MainTable />,
  'bank-statement/verified':         () => <VerifiedTable />,
  'bank-statement/duplicates':       () => <DuplicatesTable />,
  'bank-statement/backup':           () => <BackupTable />,
  'bank-statement/recycle-bin':      () => <RecycleBin />,
  'bank-statement/cash-conversions': () => <Placeholder group="Bank Statement" title="Cash Conversions" />,

  'share-market/holders':   () => <ShareMarket />,
  'share-market/brokers':   () => <ShareMarket />,
  'share-market/trades':    () => <ShareMarket />,
  'share-market/holdings':  () => <ShareMarket />,
  'share-market/dividends': () => <ShareMarket />,

  'amazon-cards/cards':     () => <Amazon />,
  'amazon-cards/loads':     () => <Amazon />,
  'amazon-cards/orders':    () => <Amazon />,
  'amazon-cards/transfers': () => <Amazon />,
  'amazon-cards/shipments': () => <Amazon />,

  'cash-bank/banks':         () => <BankAccountsPage />,
  'cash-bank/cash':          () => <CashInHandPage />,
  'cash-bank/loans':         () => <LoansGivenPage />,
  'cash-bank/gift-cards':    () => <GiftCardsPage />,
  'cash-bank/credit-cards':  () => <CreditCardsPage />,
  'cash-bank/fixed-assets':  () => <FixedAssetsPage />,

  'reports':              () => <ReportsPage />,
  'settings/credentials': () => <CredentialsPage />,
  'settings/backup':      () => <BackupPage />,
  'settings/dev-tools':   () => <DevToolsPage />,
};

// view → { groupLabel, label } for placeholder titles
const VIEW_META = (() => {
  const m = {};
  for (const g of NAV_GROUPS) {
    if (g.view) m[g.view] = { groupLabel: null, label: g.label };
    if (g.children) for (const c of g.children) m[c.view] = { groupLabel: g.label, label: c.label };
  }
  return m;
})();

const COLLAPSED_W   = 60;
const EXPANDED_W    = 250;
const GROUPS_LS_KEY = 'fino_sidebar_groups';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning, Jaydev Patel';
  if (h < 17) return 'Good Afternoon, Jaydev Patel';
  return 'Good Evening, Jaydev Patel';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Backwards-compat: old view ids → new ones
const LEGACY_VIEW_MAP = {
  'transactions':  'bank-statement/transactions',
  'verified':      'bank-statement/verified',
  'duplicates':    'bank-statement/duplicates',
  'backup':        'bank-statement/backup',
  'recycle':       'bank-statement/recycle-bin',
  'sharemarket':   'share-market/holdings',
  'amazon':        'amazon-cards/cards',
  'backuprestore': 'settings/backup',
  'credentials':   'settings/credentials',
  'upload':        'bank-statement/upload',
};

function readInitialView() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view') || 'dashboard';
  return LEGACY_VIEW_MAP[v] || v;
}

function findGroupContaining(view) {
  for (const g of NAV_GROUPS) {
    if (g.children?.some(c => c.view === view)) return g.id;
  }
  return null;
}

export default function App() {
  const [activeView, setActiveView] = useState(readInitialView);
  const [hovered, setHovered]       = useState(false);
  const [theme, setTheme]           = useState(() => localStorage.getItem('banklens-theme') || 'light');

  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const raw = localStorage.getItem(GROUPS_LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const g = findGroupContaining(readInitialView());
    return g ? { [g]: true } : {};
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('banklens-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(GROUPS_LS_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', activeView);
    window.history.replaceState({}, '', url.toString());
  }, [activeView]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleGroup = (id) => setOpenGroups(s => ({ ...s, [id]: !s[id] }));

  const navigate = useCallback((view, expandGroup = null) => {
    setActiveView(view);
    if (expandGroup) setOpenGroups(s => ({ ...s, [expandGroup]: true }));
  }, []);

  const expanded = hovered;
  const sidebarW = expanded ? EXPANDED_W : COLLAPSED_W;

  const ViewRenderer = useMemo(() => {
    const factory = VIEW_REGISTRY[activeView];
    if (factory) return factory;
    const meta = VIEW_META[activeView];
    return () => <Placeholder group={meta?.groupLabel} title={meta?.label || activeView} />;
  }, [activeView]);

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
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Fino
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                Financial OS
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{
          padding: expanded ? '10px 8px' : '10px 6px',
          flex: 1, transition: 'padding 0.3s',
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          {NAV_GROUPS.map((entry) => {
            const isLeaf = !entry.children;
            if (isLeaf) {
              const active = activeView === entry.view;
              return (
                <LeafButton
                  key={entry.id}
                  active={active}
                  expanded={expanded}
                  Icon={entry.Icon}
                  label={entry.label}
                  view={entry.view}
                  onClick={() => navigate(entry.view)}
                  showOpenInTab={expanded && active}
                />
              );
            }
            const isOpen = !!openGroups[entry.id];
            const containsActive = entry.children.some(c => c.view === activeView);
            return (
              <div key={entry.id} style={{ marginBottom: 2 }}>
                <GroupHeader
                  expanded={expanded}
                  Icon={entry.Icon}
                  label={entry.label}
                  open={isOpen}
                  highlighted={containsActive}
                  onClick={() => {
                    if (!expanded) {
                      navigate(entry.children[0].view, entry.id);
                    } else {
                      toggleGroup(entry.id);
                    }
                  }}
                />
                {expanded && isOpen && (
                  <div style={{ marginLeft: 20, marginTop: 2, marginBottom: 4, borderLeft: '1px solid var(--border)' }}>
                    {entry.children.map(c => (
                      <SubItem
                        key={c.id}
                        active={activeView === c.view}
                        label={c.label}
                        view={c.view}
                        onClick={() => navigate(c.view)}
                      />
                    ))}
                  </div>
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
            }}>
              Fino · Financial OS
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{
        marginLeft: sidebarW,
        flex: 1,
        minWidth: 0,
        minHeight: '100vh',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getGreeting()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <CalendarDays size={12} />
              {formatDate()}
            </div>
          </div>
        </header>

        <div style={{ padding: 28, minWidth: 0 }}>
          <ViewRenderer />
        </div>
      </main>
    </div>
  );
}

// ─── Sidebar building blocks ─────────────────────────────────────────────────

function LeafButton({ active, expanded, Icon, label, view, onClick, showOpenInTab }) {
  return (
    <div style={{ position: 'relative', marginBottom: 2 }}>
      <button
        onClick={onClick}
        title={expanded ? undefined : label}
        style={{
          width: expanded ? '100%' : 44,
          height: 38,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: expanded ? '0 12px' : '0',
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
          marginLeft: expanded ? 0 : 2,
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} style={{ flexShrink: 0 }} />
        {expanded && <span>{label}</span>}
      </button>
      {showOpenInTab && (
        <button
          onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}?view=${encodeURIComponent(view)}`, '_blank'); }}
          title="Open in new tab"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#1A1A2E', display: 'flex', padding: 2,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
        >
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}

function GroupHeader({ expanded, Icon, label, open, highlighted, onClick }) {
  return (
    <button
      onClick={onClick}
      title={expanded ? undefined : label}
      style={{
        width: expanded ? '100%' : 44,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: expanded ? '0 12px' : '0',
        justifyContent: expanded ? 'space-between' : 'center',
        borderRadius: 'var(--radius)',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font)',
        fontSize: 13,
        fontWeight: highlighted ? 600 : 500,
        color: highlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: 'transparent',
        textAlign: 'left',
        marginLeft: expanded ? 0 : 2,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Icon size={18} style={{ flexShrink: 0 }} />
        {expanded && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      </span>
      {expanded && (open
        ? <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
        : <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.7 }} />)}
    </button>
  );
}

function SubItem({ active, label, view, onClick }) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%',
          height: 32,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px 0 14px',
          borderRadius: 'var(--radius)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          fontSize: 12,
          fontWeight: active ? 600 : 500,
          color: active ? '#1A1A2E' : 'var(--text-secondary)',
          background: active ? 'var(--accent)' : 'transparent',
          textAlign: 'left',
          marginBottom: 1,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        {label}
      </button>
      {active && (
        <button
          onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}?view=${encodeURIComponent(view)}`, '_blank'); }}
          title="Open in new tab"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#1A1A2E', display: 'flex', padding: 2,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
        >
          <ExternalLink size={11} />
        </button>
      )}
    </div>
  );
}
