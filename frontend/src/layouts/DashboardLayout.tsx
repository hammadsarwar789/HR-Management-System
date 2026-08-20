import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  CreditCard,
  Package,
  Receipt,
  Award,
  Bell,
  ShieldCheck,
  LogOut,
  UserCheck,
  ChevronRight,
  Search,
  X,
  ArrowRight,
  User,
  Plus,
  Play,
  CheckCircle,
  FileText,
  Globe,
  Target,
  Check,
  ChevronDown,
  Lock,
  TrendingUp,
  FolderOpen,
  MessageSquare,
  FolderKanban,
  CheckSquare,
  Zap
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api, getAvatarUrl } from '../lib/api';
import { connectSocket } from '../services/socket';
import { chatApi } from '../services/chatApi';


interface LayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = getAvatarUrl(user?.employee?.profile_picture_url);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.employee?.profile_picture_url]);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  // Fetch today's attendance status from DB on mount & navigation
  useEffect(() => {
    fetchTodayAttendance();
  }, [location.pathname]);

  const fetchTodayAttendance = async () => {
    try {
      const res = await api.get('/attendance/today');
      const data = res.data;
      if (data.is_checked_out) {
        setIsCheckedIn(false);
        setIsCheckedOut(true);
        setCheckInTime(data.check_in);
        setCheckOutTime(data.check_out);
      } else if (data.is_checked_in) {
        setIsCheckedIn(true);
        setIsCheckedOut(false);
        setCheckInTime(data.check_in);
        setCheckOutTime(null);
      } else {
        setIsCheckedIn(false);
        setIsCheckedOut(false);
        setCheckInTime(null);
        setCheckOutTime(null);
      }
    } catch (e) {
      console.error('Error fetching today attendance status', e);
    }
  };

  const handleCheckInToggle = async () => {
    if (isCheckedOut) return;
    try {
      if (!isCheckedIn) {
        const res = await api.post('/attendance/check-in');
        const t = res.data.check_in || 'Active';
        setIsCheckedIn(true);
        setCheckInTime(t);
        fetchTodayAttendance();
      } else {
        const res = await api.post('/attendance/check-out');
        const t = res.data.check_out || 'Done';
        setIsCheckedIn(false);
        setIsCheckedOut(true);
        setCheckOutTime(t);
        fetchTodayAttendance();
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || 'Attendance action failed';
      alert(msg);
      console.error('Check-in error', e);
    }
  };

  // Notifications State & Ref
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Topbar Profile Popover Menu State & Ref
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close popovers & command palette on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileMenuOpen(false);
        setIsNotificationsOpen(false);
        setIsPaletteOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Clear topbar notifications badge and chat unread counter when entering /chat page
  useEffect(() => {
    if (location.pathname === '/chat') {
      setChatUnreadTotal(0);
      if (unreadCount > 0) {
        setUnreadCount(0);
        api.post('/notifications/mark-read').catch(() => { });
      }
    }
  }, [location.pathname]);

  // Fetch notifications on mount and set up real-time WebSocket listener with Page Visibility API Smart Polling
  useEffect(() => {
    fetchNotifications();

    let timer = setInterval(fetchNotifications, document.visibilityState === 'visible' ? 5000 : 60000);

    const handleVisibilityChange = () => {
      clearInterval(timer);
      if (document.visibilityState === 'visible') {
        fetchNotifications();
        timer = setInterval(fetchNotifications, 5000);
      } else {
        timer = setInterval(fetchNotifications, 60000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (user) {
      const socket = connectSocket({
        id: user.id,
        role: user.role,
        department_id: user.employee?.department_id,
      });

      const handleRealtimeNotification = (newNotif: any) => {
        setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        setUnreadCount((prev) => prev + 1);
        if (newNotif.type === 'chat_message') {
          setChatUnreadTotal((prev) => prev + 1);
        }
      };

      const handleChatMessageReceived = (newMsg: any) => {
        if (location.pathname !== '/chat' && newMsg.sender_id !== user.id) {
          setChatUnreadTotal((prev) => prev + 1);
          setUnreadCount((prev) => prev + 1);
        }
      };

      socket.on('notification:new', handleRealtimeNotification);
      socket.on('chat:message_received', handleChatMessageReceived);

      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        socket.off('notification:new', handleRealtimeNotification);
        socket.off('chat:message_received', handleChatMessageReceived);
      };
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, location.pathname]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);

      const unreadData = await chatApi.getUnreadCount();
      setChatUnreadTotal(unreadData.total_unread || 0);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  // Detect active module scope from current URL path
  const getModuleScopeFromPath = (path: string) => {
    if (path.includes('/payroll')) return 'payroll';
    if (path.includes('/employees')) return 'employees';
    if (path.includes('/attendance')) return 'attendance';
    if (path.includes('/leave')) return 'leave';
    if (path.includes('/assets')) return 'assets';
    if (path.includes('/expenses')) return 'expenses';
    if (path.includes('/performance')) return 'performance';
    return 'global';
  };

  const currentRouteScope = getModuleScopeFromPath(location.pathname);

  // Command Palette State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [activeScope, setActiveScope] = useState<string>(currentRouteScope);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    actions: any[];
    navigation: any[];
    employees: any[];
    payroll: any[];
    leaves: any[];
  }>({
    actions: [],
    navigation: [],
    employees: [],
    payroll: [],
    leaves: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isFinanceRole = user?.role === 'Super Admin' || user?.role === 'HR Manager' || user?.role === 'Finance Admin';

  const navigationGroups = [
    {
      title: 'OVERVIEW',
      items: [{ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, role: 'All' }]
    },
    {
      title: 'PEOPLE',
      items: [
        { name: 'My ESS Profile', path: '/profile', icon: User, role: 'All' },
        { name: 'Employee Directory', path: '/employees', icon: Users, role: 'All' },
        { name: 'Document Hub', path: '/documents', icon: FolderOpen, role: 'All' },
        { name: 'Team Chat & HR AI', path: '/chat', icon: MessageSquare, role: 'All' },
        { name: 'Projects & Tasks', path: '/tasks', icon: FolderKanban, role: 'All' },
        { name: 'Agile Board & Backlog', path: '/tasks/agile', icon: Zap, role: 'All' }
      ]
    },
    {
      title: 'TIME',
      items: [
        { name: 'Attendance & Logs', path: '/attendance', icon: Clock, role: 'All' },
        { name: 'Leave Entitlements', path: '/leave', icon: CalendarDays, role: 'All' }
      ]
    },
    {
      title: 'FINANCE',
      items: [
        { name: 'Revenue & Inflow', path: '/revenue', icon: TrendingUp, role: 'Finance' },
        { name: 'Payroll & 5% Holdback', path: '/payroll', icon: CreditCard, role: 'Finance' },
        { name: 'Expense Claims', path: '/expenses', icon: Receipt, role: 'All' }
      ]
    },
    {
      title: 'RESOURCES',
      items: [
        { name: 'Assets Inventory', path: '/assets', icon: Package, role: 'All' },
        { name: 'Performance & KPIs', path: '/performance', icon: Award, role: 'All' },
        { name: 'Holidays & Notices', path: '/notices', icon: Bell, role: 'All' }
      ]
    },
    {
      title: 'GOVERNANCE',
      items: [{ name: 'Audit & Activity Logs', path: '/audit', icon: ShieldCheck, role: 'Admin' }]
    }
  ];

  // Sync active scope when palette opens or route changes
  useEffect(() => {
    if (isPaletteOpen) {
      setActiveScope(currentRouteScope);
    }
  }, [isPaletteOpen, location.pathname]);

  // Shortcut Listener for Cmd+K / Ctrl+K and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsNotificationsOpen(false);
        setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch categorized search results from backend API (debounced 200ms) with scope parameter
  useEffect(() => {
    if (!isPaletteOpen) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get(
          `/search?q=${encodeURIComponent(paletteQuery.trim())}&scope=${encodeURIComponent(activeScope)}`
        );
        setSearchResults({
          actions: res.data.actions || [],
          navigation: res.data.navigation || [],
          employees: res.data.employees || [],
          payroll: res.data.payroll || [],
          leaves: res.data.leaves || []
        });
        setSelectedIndex(0);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [paletteQuery, activeScope, isPaletteOpen]);



  const handleSelectItem = (item: any) => {
    setIsPaletteOpen(false);
    setPaletteQuery('');
    if (item.url) {
      navigate(item.url);
    }
  };

  // Flattened array for keyboard arrow navigation
  const flatResultItems = [
    ...(searchResults.actions || []),
    ...(searchResults.navigation || []),
    ...(searchResults.employees || []),
    ...(searchResults.payroll || []),
    ...(searchResults.leaves || [])
  ];

  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(flatResultItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatResultItems.length) % Math.max(flatResultItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResultItems[selectedIndex]) {
        handleSelectItem(flatResultItems[selectedIndex]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setActiveScope((prev) => (prev === 'global' ? currentRouteScope : 'global'));
    }
  };

  let globalCounter = 0;
  const userInitial = user?.employee?.first_name ? user.employee.first_name[0] : user?.email ? user.email[0].toUpperCase() : 'U';

  const handleSingleNotificationDismiss = (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    api.delete(`/notifications/${notifId}`).catch(() => { });
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleSingleNotificationClick = (notif: any) => {
    api.patch(`/notifications/${notif.id}/read`).catch(() => { });
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    setIsNotificationsOpen(false);
    if (notif.url) navigate(notif.url);
  };

  return (
    <div
      className={
        location.pathname === '/chat'
          ? 'h-screen max-h-screen overflow-hidden bg-[#F8FAFC] blueprint-grid flex text-[#0F172A]'
          : 'min-h-screen bg-[#F8FAFC] blueprint-grid flex text-[#0F172A]'
      }
    >
      {/* Deep Navy Left Rail Sidebar (264px) matching Payslip Header Palette */}
      <aside className="w-[264px] bg-[#0F172A] border-r border-[#1E293B] flex flex-col justify-between hidden md:flex sticky top-0 h-screen z-20 shrink-0 shadow-lg">
        <div>
          {/* Brand Header */}
          <div className="h-16 px-5 border-b border-[#1E293B] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-[#14B8A6] flex items-center justify-center text-[#0F172A] font-extrabold text-sm shadow-sm">
                M
              </div>
              <div>
                <h1 className="font-extrabold text-xs tracking-wider text-white">MAXENIUS</h1>
                <p className="text-[9px] font-mono text-teal-400 tracking-widest uppercase">HRMS ENTERPRISE</p>
              </div>
            </div>
            <span className="px-1.5 py-0.5 text-[9px] font-mono bg-white/10 border border-white/10 text-slate-300 rounded">
              v1.0
            </span>
          </div>

          {/* User Profile Card - Clickable to ESS Profile */}
          <Link to="/profile" className="p-3.5 mx-3 my-3 bg-[#1E293B] hover:bg-[#334155] border border-slate-700/60 rounded flex items-center gap-3 transition-colors group">
            <div className="w-8 h-8 rounded-full bg-[#0F172A] border border-teal-500/50 flex items-center justify-center font-mono font-bold text-xs text-teal-400 group-hover:border-teal-400 overflow-hidden shrink-0">
              {!avatarFailed && avatarSrc ? (
                <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} className="w-full h-full object-cover" />
              ) : (
                userInitial
              )}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors truncate">
                {user?.employee ? `${user.employee.first_name} ${user.employee.last_name}` : user?.email}
              </p>
              <span className="inline-block text-[9px] font-mono font-semibold text-teal-300 uppercase tracking-wider">
                {user?.role || 'User'} • MY PROFILE
              </span>
            </div>
          </Link>

          {/* Quick Check-In Punch Widget */}
          <div className="px-3 mb-3">
            <button
              onClick={handleCheckInToggle}
              className={`w-full py-2 px-3 rounded font-mono text-[11px] font-semibold flex items-center justify-between transition-all border ${isCheckedIn
                  ? 'bg-rose-950/40 text-rose-300 border-rose-500/40 hover:bg-rose-950/60'
                  : 'bg-teal-950/40 text-teal-300 border-teal-500/40 hover:bg-teal-950/60'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCheckedIn ? 'bg-rose-400 animate-pulse' : 'bg-teal-400'}`} />
                <span>{isCheckedIn ? `PUNCHED IN (${checkInTime || 'Active'})` : 'PUNCH IN'}</span>
              </div>
              <span className="text-[9px] text-slate-400 font-normal">{isCheckedIn ? 'OUT' : 'IN'}</span>
            </button>
          </div>

          {/* Grouped Sidebar Navigation */}
          <nav className="px-3 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">
            {navigationGroups.map((group) => (
              <div key={group.title}>
                <div className="text-[10px] font-mono font-bold text-slate-400 tracking-widest uppercase mb-1.5 px-1">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    if (item.role === 'Admin' && user?.role !== 'Super Admin' && user?.role !== 'HR Manager') {
                      return null;
                    }
                    if (item.role === 'Finance' && !isFinanceRole) {
                      return null;
                    }
                    const isActive = location.pathname === item.path || (item.path === '/employees' && (location.pathname === '/employees' || location.pathname === '/directory'));
                    const isChatNavItem = item.path === '/chat';
                    const hasChatUnread = isChatNavItem && chatUnreadTotal > 0;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-all ${isActive
                            ? 'bg-teal-500 text-white font-bold shadow-sm'
                            : hasChatUnread
                              ? 'bg-indigo-950/80 text-white font-bold border border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30'
                              : 'text-slate-300 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : hasChatUnread ? 'text-indigo-400' : 'text-slate-400'}`} />
                          <span className={hasChatUnread ? 'font-bold text-white tracking-wide truncate' : 'truncate'}>
                            {item.name}
                          </span>
                        </div>
                        {hasChatUnread ? (
                          <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full animate-pulse shadow-sm shrink-0">
                            {chatUnreadTotal}
                          </span>
                        ) : (
                          isActive && <ChevronRight className="w-3 h-3 text-white shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Logout */}
        <div className="p-3 border-t border-[#1E293B]">
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-mono text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 rounded transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>TERMINATE SESSION</span>
          </button>
        </div>
      </aside>

      {/* Main App Container */}
      <div className={location.pathname === '/chat' ? 'flex-1 flex flex-col min-w-0 h-full overflow-hidden' : 'flex-1 flex flex-col min-w-0'}>
        {/* Sticky Executive Topbar */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0] sticky top-0 z-40 px-6 flex items-center justify-between shadow-sm overflow-visible">
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono font-bold tracking-widest text-[#0D9488] uppercase">
              {location.pathname.split('/').filter(Boolean).map(s => s.replace(/-/g, ' ')).join(' / ').toUpperCase() || 'DASHBOARD'}
            </span>

            {/* Department Scope Pill */}
            {user?.role === 'Department Manager' && (
              <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD] rounded uppercase tracking-wider">
                SCOPE — {user.employee?.department || 'ENGINEERING'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Real Interactive Command Palette Trigger */}
            <button
              onClick={() => setIsPaletteOpen(true)}
              className="py-1.5 px-3 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#64748B] hover:text-[#0F172A] hover:border-[#0D9488] text-xs font-mono flex items-center gap-2 transition-all shadow-xs"
            >
              <Search className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>Search employees, pages, or commands...</span>
              <kbd className="px-1.5 py-0.5 text-[9px] bg-white border border-[#CBD5E1] rounded font-mono shadow-xs font-bold text-[#0F172A]">⌘K</kbd>
            </button>

            {/* Interactive Notifications Bell Button & Popover Panel */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsProfileMenuOpen(false);
                }}
                className="w-8 h-8 rounded bg-[#F1F5F9] border border-[#CBD5E1] hover:border-[#0D9488] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] transition-all relative shadow-xs"
              >
                <Bell className="w-4 h-4 text-[#0D9488]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D97706] text-white text-[9px] font-mono font-bold flex items-center justify-center shadow-xs animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Popover Panel */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#CBD5E1] rounded-xl shadow-2xl z-50 overflow-hidden font-sans animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#0D9488]" />
                      <span className="text-xs font-bold text-[#0F172A] uppercase">SYSTEM NOTIFICATIONS</span>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/notifications/mark-all-read');
                        } catch (e) {
                          api.post('/notifications/mark-read').catch(() => { });
                        }
                        setNotifications([]);
                        setUnreadCount(0);
                        setIsNotificationsOpen(false);
                      }}
                      className="text-[10px] font-bold text-[#0D9488] hover:text-[#0F766E] uppercase flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> MARK ALL READ
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-[#F1F5F9] p-1">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleSingleNotificationClick(n)}
                          className="w-full text-left p-3 hover:bg-[#F0FDFA] transition-colors rounded-lg flex items-start justify-between gap-3 group cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.badge_color === 'amber' ? 'bg-[#D97706]' : n.badge_color === 'teal' ? 'bg-[#0D9488]' : 'bg-[#0284C7]'
                              }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold text-[#0F172A] group-hover:text-[#0D9488] truncate">{n.title}</span>
                                <span className="text-[9px] font-mono text-[#94A3B8] shrink-0">{n.timestamp}</span>
                              </div>
                              <p className="text-[11px] text-[#475569] mt-0.5 leading-snug">{n.message}</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleSingleNotificationDismiss(e, n.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded transition shrink-0 opacity-0 group-hover:opacity-100"
                            title="Dismiss notification"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-slate-400 text-xs font-medium">
                        No new notifications
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Topbar Profile Avatar & Popover Menu */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(!isProfileMenuOpen);
                  setIsNotificationsOpen(false);
                }}
                className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-[#F1F5F9] transition-all group border border-transparent hover:border-[#CBD5E1]"
              >
                {/* Circular Profile Picture / Avatar Icon */}
                <div className="w-8 h-8 rounded-full bg-[#0F172A] border-2 border-[#0D9488] text-[#14B8A6] font-mono font-bold text-xs flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                  {!avatarFailed && avatarSrc ? (
                    <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} className="w-full h-full object-cover" />
                  ) : (
                    userInitial
                  )}
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-[#0F172A] leading-tight group-hover:text-[#0D9488] transition-colors">
                    {user?.employee ? `${user.employee.first_name} ${user.employee.last_name}` : user?.email}
                  </p>
                  <p className="text-[10px] font-mono text-[#0D9488] font-semibold uppercase">{user?.role}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B] group-hover:text-[#0F172A] transition-colors" />
              </button>

              {/* Profile Dropdown Popover */}
              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-[#CBD5E1] rounded-lg shadow-xl z-50 overflow-hidden font-sans flex flex-col gap-1 p-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] rounded-md flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-full bg-[#0F172A] border-2 border-[#14B8A6] text-[#14B8A6] font-mono font-bold text-sm flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                      {!avatarFailed && avatarSrc ? (
                        <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} className="w-full h-full object-cover" />
                      ) : (
                        userInitial
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-[#0F172A] truncate">
                        {user?.employee ? `${user.employee.first_name} ${user.employee.last_name}` : user?.email}
                      </p>
                      <span className="text-[9px] font-mono font-bold text-[#0D9488] uppercase block">
                        {user?.role}
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/profile"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs font-mono font-semibold rounded-md transition-colors ${location.pathname === '/profile'
                        ? 'bg-teal-50 text-teal-700 font-bold'
                        : 'text-slate-700 hover:bg-teal-50 hover:text-teal-700'
                      }`}
                  >
                    <User className="w-4 h-4 text-[#0D9488]" />
                    <span>MY ESS PROFILE</span>
                  </Link>

                  <Link
                    to="/employees"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs font-mono font-semibold rounded-md transition-colors ${location.pathname === '/employees' || location.pathname === '/directory'
                        ? 'bg-teal-50 text-teal-700 font-bold'
                        : 'text-slate-700 hover:bg-teal-50 hover:text-teal-700'
                      }`}
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>EMPLOYEE DIRECTORY</span>
                  </Link>

                  <div className="border-t border-[#E2E8F0] my-1" />

                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 text-[#DC2626] hover:bg-rose-50 rounded-md transition-colors flex items-center gap-2.5 font-mono text-xs font-bold"
                  >
                    <LogOut className="w-4 h-4 text-[#DC2626]" />
                    <span>TERMINATE SESSION</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main
          className={
            location.pathname === '/chat'
              ? 'flex-1 p-4 h-[calc(100vh-4rem)] w-full overflow-hidden flex flex-col'
              : 'flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6'
          }
        >
          {children}
        </main>
      </div>

      {/* Styled Enterprise Command Palette (⌘K) Modal with Contextual Scoping & Mode Toggle */}
      {isPaletteOpen && (
        <div
          onClick={() => setIsPaletteOpen(false)}
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-sm z-50 flex items-start justify-center pt-16 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handlePaletteKeyDown}
            className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Search Input Header with Interactive Scope Toggle Badge */}
            <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-3 bg-[#F8FAFC]">
              <Search className="w-5 h-5 text-[#0D9488] shrink-0" />
              <input
                type="text"
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder={
                  activeScope === 'global'
                    ? "Global Search: employees, payslips, actions, or pages..."
                    : `Search inside ${activeScope.toUpperCase()} (or click badge to switch)...`
                }
                className="w-full text-xs font-mono bg-transparent border-none outline-none text-[#0F172A] placeholder-[#94A3B8]"
              />

              {/* Interactive Scope Toggle Badge (Tab or Click) */}
              <button
                type="button"
                onClick={() => setActiveScope((prev) => (prev === 'global' ? currentRouteScope : 'global'))}
                title="Click or press Tab to toggle between Module Scoped & Global Search"
                className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${activeScope === 'global'
                    ? 'bg-[#E0F2FE] text-[#0284C7] border-[#BAE6FD] hover:bg-[#BAE6FD]'
                    : 'bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4] hover:bg-[#99F6E4]'
                  }`}
              >
                {activeScope === 'global' ? (
                  <>
                    <Globe className="w-3 h-3 text-[#0284C7]" />
                    <span>🌐 SCOPE: GLOBAL</span>
                  </>
                ) : (
                  <>
                    <Target className="w-3 h-3 text-[#0F766E]" />
                    <span>🎯 SCOPE: {activeScope.toUpperCase()}</span>
                  </>
                )}
              </button>

              {isSearching && <span className="text-[10px] font-mono text-[#0D9488] animate-pulse">...</span>}
            </div>

            {/* Results Body grouped into 5 categories */}
            <div className="max-h-[440px] overflow-y-auto p-3 space-y-4">
              {/* 1. QUICK ACTIONS */}
              {searchResults.actions && searchResults.actions.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-[#0D9488] uppercase bg-[#CCFBF1] rounded border border-[#99F6E4] mb-1.5 flex items-center justify-between">
                    <span>⚡ QUICK ACTIONS</span>
                    <span className="text-[9px] opacity-80">ADMIN OPERATIONAL SHORTCUTS</span>
                  </div>
                  <div className="space-y-1">
                    {searchResults.actions.map((act) => {
                      const itemIdx = globalCounter++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <button
                          key={act.action_type}
                          onClick={() => handleSelectItem(act)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center justify-between group border ${isSelected
                              ? 'bg-[#CCFBF1] border-[#99F6E4] shadow-xs'
                              : 'bg-white hover:bg-[#F8FAFC] border-transparent hover:border-[#E2E8F0]'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-[#0D9488] text-white' : 'bg-[#F1F5F9] text-[#0D9488]'
                              }`}>
                              ⚡
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#0F172A]">{act.title}</div>
                              <p className="text-[11px] text-[#64748B]">{act.subtitle}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-[#0D9488] uppercase bg-white px-2 py-0.5 rounded border border-[#99F6E4]">
                            EXECUTE ↵
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. NAVIGATION */}
              {searchResults.navigation && searchResults.navigation.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase mb-1.5 flex items-center justify-between">
                    <span>🧭 NAVIGATION</span>
                    <span className="text-[9px]">DIRECT MODULE JUMP</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {searchResults.navigation.map((nav) => {
                      const itemIdx = globalCounter++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <button
                          key={nav.url}
                          onClick={() => handleSelectItem(nav)}
                          className={`text-left p-2.5 rounded-lg transition-all flex items-center justify-between border ${isSelected
                              ? 'bg-[#CCFBF1] border-[#99F6E4]'
                              : 'bg-[#F8FAFC] hover:bg-[#F0FDFA] border-[#E2E8F0]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs">🧭</span>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#0F172A] truncate">{nav.title}</div>
                              <p className="text-[10px] text-[#64748B] truncate">{nav.subtitle}</p>
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-[#0D9488] shrink-0 ml-1" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. EMPLOYEES & SALARY DATA */}
              {searchResults.employees && searchResults.employees.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-[#0F766E] uppercase bg-[#CCFBF1] rounded border border-[#99F6E4] mb-1.5 flex items-center justify-between">
                    <span>👤 EMPLOYEES & SALARIES ({searchResults.employees.length})</span>
                    <span className="text-[9px]">BASIC & 5% ESCROW PROFILE</span>
                  </div>
                  <div className="space-y-1.5">
                    {searchResults.employees.map((emp) => {
                      const itemIdx = globalCounter++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => handleSelectItem(emp)}
                          className={`w-full text-left p-3 rounded-lg transition-all flex items-center justify-between border ${isSelected
                              ? 'bg-[#CCFBF1] border-[#0D9488] shadow-xs'
                              : 'bg-[#F8FAFC] hover:bg-[#F0FDFA] border-[#E2E8F0]'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded bg-[#0F172A] text-white font-mono font-bold text-xs flex items-center justify-center">
                              {emp.title[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#0F172A]">{emp.title}</span>
                                <span className="text-[9px] font-mono font-bold bg-[#CCFBF1] text-[#0F766E] px-1.5 py-0.5 rounded border border-[#99F6E4]">
                                  {emp.code}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#475569] mt-0.5">{emp.subtitle}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. PAYROLL & PAYSLIPS */}
              {searchResults.payroll && searchResults.payroll.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-[#0F172A] uppercase bg-[#F1F5F9] rounded border border-[#CBD5E1] mb-1.5 flex items-center justify-between">
                    <span>🧾 PAYROLL & PAYSLIP RECORDS ({searchResults.payroll.length})</span>
                    <span className="text-[9px]">NET DISBURSED & PDF</span>
                  </div>
                  <div className="space-y-1">
                    {searchResults.payroll.map((pay) => {
                      const itemIdx = globalCounter++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <button
                          key={pay.id}
                          onClick={() => handleSelectItem(pay)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center justify-between border ${isSelected
                              ? 'bg-[#CCFBF1] border-[#99F6E4]'
                              : 'bg-white hover:bg-[#F8FAFC] border-[#E2E8F0]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-[#0D9488] shrink-0" />
                            <div>
                              <div className="text-xs font-bold text-[#0F172A]">{pay.title}</div>
                              <p className="text-[10px] font-mono text-[#64748B]">{pay.subtitle}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-[#047857] bg-[#ECFDF5] px-2 py-0.5 rounded border border-[#A7F3D0]">
                            VIEW PAYSLIP
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. LEAVE REQUESTS */}
              {searchResults.leaves && searchResults.leaves.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase mb-1.5">
                    🏖 LEAVE APPLICATIONS ({searchResults.leaves.length})
                  </div>
                  <div className="space-y-1">
                    {searchResults.leaves.map((l) => {
                      const itemIdx = globalCounter++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <button
                          key={l.id}
                          onClick={() => handleSelectItem(l)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center justify-between border ${isSelected
                              ? 'bg-[#CCFBF1] border-[#99F6E4]'
                              : 'bg-white hover:bg-[#F8FAFC] border-[#E2E8F0]'
                            }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-[#0F172A]">{l.title}</div>
                            <p className="text-[10px] font-mono text-[#64748B]">{l.subtitle}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Zero-state fallback */}
              {flatResultItems.length === 0 && !isSearching && (
                <div className="p-8 text-center text-xs font-mono text-[#64748B]">
                  No matching items found for "{paletteQuery}" in scope {activeScope.toUpperCase()}.
                </div>
              )}
            </div>

            {/* Footer Keyboard Hints */}
            <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between text-[10px] font-mono text-[#64748B]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#CBD5E1] rounded text-[9px] shadow-xs">Tab</kbd> Toggle Scope
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#CBD5E1] rounded text-[9px] shadow-xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#CBD5E1] rounded text-[9px] shadow-xs">↓</kbd> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#CBD5E1] rounded text-[9px] shadow-xs">↵</kbd> Select / Execute
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-[#CBD5E1] rounded text-[9px] shadow-xs">ESC</kbd> Close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
