import { useState, useEffect } from "react";
import { useBadges } from "../../contexts/BadgeContext";
import { useSurveyPending } from "../../contexts/SurveyPendingContext";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Users, BookOpen, FileCheck, UserMinus, ChevronDown, FileText, Video, Monitor, AlertTriangle, Calendar, BookMarked, ClipboardList, Mailbox, Shield, GraduationCap, Table2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { assistantAPI } from "../../utils/api";

function readAssistantFlagFromStorage(): boolean {
  try {
    const raw = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser');
    if (!raw) return false;
    const u = JSON.parse(raw);
    return !!(Number(u?.is_ziye_assistant) === 1 || u?.stage_role === '紫夜助教');
  } catch {
    return false;
  }
}

function patchStudentUserAssistant(member: Record<string, unknown> | null | undefined) {
  if (!member) return;
  const storages = [localStorage, sessionStorage] as const;
  for (const storage of storages) {
    const raw = storage.getItem('studentUser');
    if (!raw) continue;
    try {
      const prev = JSON.parse(raw);
      storage.setItem(
        'studentUser',
        JSON.stringify({
          ...prev,
          is_ziye_assistant: member.is_ziye_assistant ?? prev.is_ziye_assistant,
          stage_role: member.stage_role ?? prev.stage_role,
        })
      );
    } catch {
      /* ignore */
    }
  }
}

const AnimatedMenuToggle = ({
  toggle,
  isOpen,
}: {
  toggle: () => void;
  isOpen: boolean;
}) => (
  <button
    onClick={toggle}
    aria-label="Toggle menu"
    className="focus:outline-none p-1"
  >
    <motion.svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      initial="closed"
      animate={isOpen ? "open" : "closed"}
      transition={{ duration: 0.3 }}
      className="text-gray-300"
    >
      <motion.path
        fill="transparent"
        strokeWidth="2.5"
        stroke="currentColor"
        strokeLinecap="round"
        variants={{
          closed: { d: "M 2 2.5 L 22 2.5" },
          open: { d: "M 3 16.5 L 17 2.5" },
        }}
      />
      <motion.path
        fill="transparent"
        strokeWidth="2.5"
        stroke="currentColor"
        strokeLinecap="round"
        variants={{
          closed: { d: "M 2 12 L 22 12", opacity: 1 },
          open: { opacity: 0 },
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        fill="transparent"
        strokeWidth="2.5"
        stroke="currentColor"
        strokeLinecap="round"
        variants={{
          closed: { d: "M 2 21.5 L 22 21.5" },
          open: { d: "M 3 2.5 L 17 16.5" },
        }}
      />
    </motion.svg>
  </button>
);

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: number;
}

export const CollapsibleSection = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  badge,
}: CollapsibleSectionProps) => (
  <div className="mb-1">
    <button
      className={`student-glass-nav-item w-full justify-between ${
        isExpanded ? "student-glass-nav-item--active" : ""
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`transition-colors shrink-0 ${
            isExpanded ? "text-purple-400" : "text-gray-500"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium truncate">{title}</span>
        {!!badge && badge > 0 && (
          <span className="bg-purple-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none shrink-0">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <motion.div
        animate={{ rotate: isExpanded ? 180 : 0 }}
        transition={{ duration: 0.25 }}
        className="shrink-0"
      >
        <ChevronDown size={14} className={isExpanded ? "text-purple-400" : "text-gray-600"} />
      </motion.div>
    </button>
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="mt-1 space-y-0.5 ml-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

interface NestedNavGroupProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/** 一级菜单内的二级折叠分组（如考核管理 → 反作弊） */
export const NestedNavGroup = ({
  title,
  isExpanded,
  onToggle,
  children,
}: NestedNavGroupProps) => (
  <div className="mt-0.5">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`student-glass-nav-item w-full justify-between py-2 ${
        isExpanded ? "student-glass-nav-item--active" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={`w-1 h-1 rounded-full flex-shrink-0 ${
            isExpanded ? "bg-purple-400" : "bg-gray-600"
          }`}
        />
        <span className="text-sm truncate">{title}</span>
      </div>
      <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
        <ChevronDown size={12} className={isExpanded ? "text-purple-400" : "text-gray-600"} />
      </motion.div>
    </button>
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          key="nested"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-1">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

interface SubNavItemProps {
  path: string;
  label: string;
  badge?: number;
}

export const SubNavItem = ({ path, label, badge }: SubNavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === path;

  return (
    <Link to={path} className="group block">
      <div
        className={`student-glass-nav-item py-2 ${
          isActive ? "student-glass-nav-item--active" : ""
        }`}
      >
        <div
          className={`w-1 h-1 rounded-full transition-colors flex-shrink-0 ${
            isActive ? "bg-purple-400" : "bg-gray-600 group-hover:bg-gray-500"
          }`}
        />
        <span className="text-sm flex-1">{label}</span>
        {!!badge && badge > 0 && (
          <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
};

interface NavItemProps {
  path: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

export const NavItem = ({ path, icon, label, badge }: NavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === path || (path !== '/student' && path !== '/admin' && path !== '/assistant' && location.pathname.startsWith(path));

  return (
    <Link to={path} className="group block mb-1">
      <div
        className={`student-glass-nav-item ${
          isActive ? "student-glass-nav-item--active" : ""
        }`}
      >
        <span
          className={`transition-colors ${
            isActive ? "text-purple-400" : "text-gray-500 group-hover:text-gray-400"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium flex-1">{label}</span>
        {!!badge && badge > 0 && (
          <span className="bg-amber-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none animate-pulse">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
};

const mobileSidebarVariants = {
  hidden: { x: "-100%" },
  visible: { x: 0 },
};

const AdminSidebarLogo = () => (
  <div className="relative h-16 flex items-center px-4 border-b border-white/10 overflow-hidden shrink-0">
    <div className="relative flex items-center gap-3 w-full">
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg blur opacity-30 group-hover:opacity-50 transition-opacity" />
        <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="relative w-9 h-9 rounded-lg shadow-lg" />
      </div>
      <div className="flex flex-col">
        <span className="text-white font-bold text-lg tracking-tight">紫夜管理</span>
        <span className="text-gray-500 text-xs">Admin System</span>
      </div>
    </div>
  </div>
);

interface AdminNavProps {
  expandedMenus: string[];
  toggleMenu: (name: string) => void;
}

const AdminNav = ({ expandedMenus, toggleMenu }: AdminNavProps) => {
  const badges = useBadges();
  const leaveBadge = badges.leavePending + badges.leaveEndPending;
  const membersBadge = leaveBadge + (badges.assistantPending || 0);
  return (
  <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 scrollbar-none">
    <NavItem path="/admin" icon={<Home size={20} />} label="首页" />
    <CollapsibleSection title="成员管理" icon={<Users size={20} />}
      isExpanded={expandedMenus.includes("成员管理")} onToggle={() => toggleMenu("成员管理")}
      badge={membersBadge}>
      <SubNavItem path="/admin/members/list" label="成员列表" />
      <SubNavItem path="/admin/members/assistants" label="助教管理" badge={badges.assistantPending} />
      <SubNavItem path="/admin/members/leave" label="请假记录" badge={leaveBadge} />
      <SubNavItem path="/admin/members/violations" label="黑点记录" />
    </CollapsibleSection>
    <CollapsibleSection title="课程管理" icon={<BookOpen size={20} />}
      isExpanded={expandedMenus.includes("课程管理")} onToggle={() => toggleMenu("课程管理")}>
      <SubNavItem path="/admin/courses/list" label="课程列表" />
      <SubNavItem path="/admin/courses/progress" label="进度分配" />
    </CollapsibleSection>
    <CollapsibleSection title="考核管理" icon={<FileCheck size={20} />}
      isExpanded={expandedMenus.includes("考核管理")} onToggle={() => toggleMenu("考核管理")}
      badge={badges.assessmentPending}>
      <SubNavItem path="/admin/assessments/records" label="考核记录" />
      <SubNavItem path="/admin/assessments/approval" label="考核审批" badge={badges.assessmentPending} />
      <SubNavItem path="/admin/assessments/guidelines" label="考核须知管理" />
      <SubNavItem path="/admin/assessments/videos" label="报告公开管理" />
      <SubNavItem path="/admin/assessments/upload" label="视频上传管理" />
      <NestedNavGroup
        title="反作弊"
        isExpanded={expandedMenus.includes("反作弊")}
        onToggle={() => toggleMenu("反作弊")}
      >
        <SubNavItem path="/admin/anticheat/tickets" label="准考证导入" />
        <SubNavItem path="/admin/anticheat/configs" label="考核配置" />
        <SubNavItem path="/admin/anticheat/monitor" label="考试监控" />
        <SubNavItem path="/admin/anticheat/dll-whitelist" label="DLL白名单" />
        <SubNavItem path="/admin/anticheat/settings" label="反作弊设置" />
      </NestedNavGroup>
    </CollapsibleSection>
    <CollapsibleSection title="退队管理" icon={<UserMinus size={20} />}
      isExpanded={expandedMenus.includes("退队管理")} onToggle={() => toggleMenu("退队管理")}
      badge={badges.reminderCount}>
      <SubNavItem path="/admin/leave-team/reminders" label="催促名单" badge={badges.reminderCount} />
      <SubNavItem path="/admin/leave-team/approval" label="退队审批" />
      <SubNavItem path="/admin/leave-team/retention" label="留队管理" />
    </CollapsibleSection>
    <NavItem path="/admin/docs" icon={<BookMarked size={20} />} label="文档管理" />
    <NavItem path="/admin/sheets" icon={<Table2 size={20} />} label="表格文档" />
    <NavItem path="/admin/surveys" icon={<ClipboardList size={20} />} label="填表管理" />
    <NavItem path="/admin/opinion-box" icon={<Mailbox size={20} />} label="意见箱" badge={badges.opinionPending} />
    <NavItem path="/admin/account-security" icon={<Shield size={20} />} label="账户安全" />
    {/* Screen share - opens in new tab */}
    <a href="#/screen-share" target="_blank" rel="noopener noreferrer" className="group block mb-1">
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-gray-400 hover:text-gray-200 hover:bg-gray-700/20">
        <span className="text-gray-500 group-hover:text-gray-400 transition-colors"><Monitor size={20} /></span>
        <span className="text-sm font-medium">屏幕共享</span>
      </div>
    </a>
  </nav>
  );
};

export const AdminSidebar = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["成员管理"]);

  useEffect(() => {
    if (location.pathname.startsWith("/admin/anticheat")) {
      setExpandedMenus((prev) => {
        const next = new Set(prev);
        next.add("考核管理");
        next.add("反作弊");
        return Array.from(next);
      });
    }
  }, [location.pathname]);

  const toggleMenu = (name: string) =>
    setExpandedMenus((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );

  return (
    <>
      {/* Mobile sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={mobileSidebarVariants}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden fixed inset-0 z-50 student-glass-sidebar flex flex-col"
          >
            <AdminSidebarLogo />
            <AdminNav expandedMenus={expandedMenus} toggleMenu={toggleMenu} />
            <div className="p-3 border-t border-white/10">
              <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 管理系统</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 student-glass-sidebar border-b border-white/10 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-7 h-7 rounded-md" />
          <span className="text-white font-bold text-sm">紫夜管理</span>
        </div>
        <AnimatedMenuToggle toggle={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      </div>

      {/* Desktop sidebar — 悬浮玻璃，过高时内部滚动 */}
      <aside className="hidden md:flex flex-col w-60 student-glass-sidebar fixed z-40 top-3 left-3 max-h-[calc(100vh-1.5rem)]">
        <AdminSidebarLogo />
        <AdminNav expandedMenus={expandedMenus} toggleMenu={toggleMenu} />
        <div className="p-3 border-t border-white/10 shrink-0">
          <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 管理系统</p>
        </div>
      </aside>
    </>
  );
};

export { AnimatedMenuToggle };

const StudentSidebarLogo = () => (
  <div className="relative h-16 flex items-center px-4 border-b border-white/10 overflow-hidden shrink-0">
    <div className="relative flex items-center gap-3 w-full">
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg blur opacity-30 group-hover:opacity-50 transition-opacity" />
        <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="relative w-9 h-9 rounded-lg shadow-lg" />
      </div>
      <div className="flex flex-col">
        <span className="text-white font-bold text-lg tracking-tight">学员中心</span>
        <span className="text-gray-500 text-xs">Student Center</span>
      </div>
    </div>
  </div>
);

const studentMenuItems = [
  { path: '/student', icon: <Home size={20} />, label: '首页' },
  { path: '/student/progress', icon: <BookOpen size={20} />, label: '课程进度' },
  { path: '/student/classmates', icon: <Users size={20} />, label: '同期学员' },
  { path: '/student/apply-assessment', icon: <FileCheck size={20} />, label: '申请考核' },
  { path: '/student/assessment-report', icon: <FileText size={20} />, label: '新训考核报告' },
  { path: '/student/blackpoints', icon: <AlertTriangle size={20} />, label: '黑点记录' },
  { path: '/student/leave', icon: <Calendar size={20} />, label: '请假记录' },
  { path: '/student/videos', icon: <Video size={20} />, label: '公开报告查看' },
  { path: '/student/surveys', icon: <ClipboardList size={20} />, label: '填表' },
  { path: '/student/sheets', icon: <Table2 size={20} />, label: '表格文档' },
  { path: '/student/opinion-box', icon: <Mailbox size={20} />, label: '意见箱' },
  { path: '/student/account-security', icon: <Shield size={20} />, label: '账户安全' },
];

const StudentNavItem = ({
  path,
  icon,
  label,
  badge,
}: {
  path: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) => {
  const location = useLocation();
  const isActive =
    location.pathname === path ||
    (path !== "/student" && location.pathname.startsWith(path));

  return (
    <Link to={path} className="block">
      <div
        className={`student-glass-nav-item ${
          isActive ? "student-glass-nav-item--active" : ""
        }`}
      >
        <span
          className={`transition-colors ${
            isActive ? "text-purple-400" : "text-gray-500 group-hover:text-gray-400"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium flex-1">{label}</span>
        {!!badge && badge > 0 && (
          <span className="bg-amber-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none animate-pulse">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
};

const StudentNav = () => {
  const { count } = useSurveyPending();
  const [isAssistant, setIsAssistant] = useState(readAssistantFlagFromStorage);

  useEffect(() => {
    let cancelled = false;
    // 以服务端助教身份为准，避免本地缓存缺 is_ziye_assistant 导致入口消失
    assistantAPI
      .me()
      .then((res) => {
        if (cancelled) return;
        const member = res.data?.member;
        patchStudentUserAssistant(member);
        setIsAssistant(true);
      })
      .catch(() => {
        if (cancelled) return;
        // 非助教或无权限：保留 storage 里的判断（可能离线），不强行隐藏已显示入口
        setIsAssistant(readAssistantFlagFromStorage());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
  <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 px-3 scrollbar-none">
    {isAssistant && (
      <Link to="/assistant" className="block mb-1">
        <div className="student-glass-nav-item">
          <span className="text-teal-400"><GraduationCap size={20} /></span>
          <span className="text-sm font-medium text-teal-200">助教工作台</span>
        </div>
      </Link>
    )}
    {studentMenuItems.map((item) => (
      <StudentNavItem
        key={item.path}
        path={item.path}
        icon={item.icon}
        label={item.label}
        badge={item.path === '/student/surveys' ? count : undefined}
      />
    ))}
    <a href="#/screen-share" target="_blank" rel="noopener noreferrer" className="block">
      <div className="student-glass-nav-item">
        <span className="text-gray-500"><Monitor size={20} /></span>
        <span className="text-sm font-medium">屏幕共享</span>
      </div>
    </a>
  </nav>
  );
};

export const StudentSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="student-mobile-sidebar"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{ hidden: { x: "-100%" }, visible: { x: 0 } }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden fixed inset-0 z-50 student-glass-sidebar flex flex-col"
          >
            <StudentSidebarLogo />
            <StudentNav />
            <div className="p-3 border-t border-white/10">
              <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 学员系统</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 student-glass-sidebar border-b border-white/10 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-7 h-7 rounded-md" />
          <span className="text-white font-bold text-sm">学员中心</span>
        </div>
        <AnimatedMenuToggle toggle={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      </div>

      {/* Desktop sidebar — 悬浮卡片，过高时内部滚动（无滚动条） */}
      <aside className="hidden md:flex flex-col w-60 student-glass-sidebar fixed z-40 top-3 left-3 max-h-[calc(100vh-1.5rem)]">
        <StudentSidebarLogo />
        <StudentNav />
        <div className="p-3 border-t border-white/10 shrink-0">
          <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 学员系统</p>
        </div>
      </aside>
    </>
  );
};
