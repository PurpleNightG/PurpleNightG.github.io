import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Users, BookOpen, FileCheck, UserMinus, ChevronDown, FileText, Video, Monitor } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

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
}

export const CollapsibleSection = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: CollapsibleSectionProps) => (
  <div className="mb-1">
    <button
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group ${
        isExpanded
          ? "bg-gray-700/40 text-white"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/20"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`transition-colors ${
            isExpanded ? "text-purple-400" : "text-gray-500 group-hover:text-gray-400"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <motion.div
        animate={{ rotate: isExpanded ? 180 : 0 }}
        transition={{ duration: 0.25 }}
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

interface SubNavItemProps {
  path: string;
  label: string;
}

export const SubNavItem = ({ path, label }: SubNavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === path;

  return (
    <Link to={path} className="group block">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          isActive
            ? "bg-purple-600/20 text-purple-300"
            : "text-gray-500 hover:text-gray-300 hover:bg-gray-700/20"
        }`}
      >
        <div
          className={`w-1 h-1 rounded-full transition-colors flex-shrink-0 ${
            isActive ? "bg-purple-400" : "bg-gray-600 group-hover:bg-gray-500"
          }`}
        />
        <span className="text-sm">{label}</span>
      </div>
    </Link>
  );
};

interface NavItemProps {
  path: string;
  icon: React.ReactNode;
  label: string;
}

export const NavItem = ({ path, icon, label }: NavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === path;

  return (
    <Link to={path} className="group block mb-1">
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${
          isActive
            ? "bg-purple-600/20 text-purple-300"
            : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/20"
        }`}
      >
        <span
          className={`transition-colors ${
            isActive ? "text-purple-400" : "text-gray-500 group-hover:text-gray-400"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
};

const mobileSidebarVariants = {
  hidden: { x: "-100%" },
  visible: { x: 0 },
};

const AdminSidebarLogo = () => (
  <div className="relative h-16 flex items-center px-4 border-b border-gray-700/30 overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-transparent to-transparent" />
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

const AdminNav = ({ expandedMenus, toggleMenu }: AdminNavProps) => (
  <nav className="flex-1 overflow-y-auto py-4 px-3">
    <NavItem path="/admin" icon={<Home size={20} />} label="首页" />
    <CollapsibleSection title="成员管理" icon={<Users size={20} />}
      isExpanded={expandedMenus.includes("成员管理")} onToggle={() => toggleMenu("成员管理")}>
      <SubNavItem path="/admin/members/list" label="成员列表" />
      <SubNavItem path="/admin/members/leave" label="请假记录" />
      <SubNavItem path="/admin/members/violations" label="黑点记录" />
    </CollapsibleSection>
    <CollapsibleSection title="课程管理" icon={<BookOpen size={20} />}
      isExpanded={expandedMenus.includes("课程管理")} onToggle={() => toggleMenu("课程管理")}>
      <SubNavItem path="/admin/courses/list" label="课程列表" />
      <SubNavItem path="/admin/courses/progress" label="进度分配" />
    </CollapsibleSection>
    <CollapsibleSection title="考核管理" icon={<FileCheck size={20} />}
      isExpanded={expandedMenus.includes("考核管理")} onToggle={() => toggleMenu("考核管理")}>
      <SubNavItem path="/admin/assessments/records" label="考核记录" />
      <SubNavItem path="/admin/assessments/approval" label="考核审批" />
      <SubNavItem path="/admin/assessments/guidelines" label="考核须知管理" />
      <SubNavItem path="/admin/assessments/videos" label="视频公开管理" />
      <SubNavItem path="/admin/assessments/upload" label="视频上传管理" />
    </CollapsibleSection>
    <CollapsibleSection title="退队管理" icon={<UserMinus size={20} />}
      isExpanded={expandedMenus.includes("退队管理")} onToggle={() => toggleMenu("退队管理")}>
      <SubNavItem path="/admin/leave-team/reminders" label="催促名单" />
      <SubNavItem path="/admin/leave-team/approval" label="退队审批" />
      <SubNavItem path="/admin/leave-team/retention" label="留队管理" />
    </CollapsibleSection>
  </nav>
);

export const AdminSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["成员管理"]);

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
            className="md:hidden fixed inset-0 z-50 bg-gray-900 border-r border-gray-700/30 flex flex-col"
          >
            <AdminSidebarLogo />
            <AdminNav expandedMenus={expandedMenus} toggleMenu={toggleMenu} />
            <div className="p-3 border-t border-gray-700/30">
              <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 管理系统</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 bg-gray-800/50 border-b border-gray-700/30 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-7 h-7 rounded-md" />
          <span className="text-white font-bold text-sm">紫夜管理</span>
        </div>
        <AnimatedMenuToggle toggle={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-gray-800/30 backdrop-blur-xl border-r border-gray-700/30 fixed top-0 left-0 h-full">
        <AdminSidebarLogo />
        <AdminNav expandedMenus={expandedMenus} toggleMenu={toggleMenu} />
        <div className="p-3 border-t border-gray-700/30">
          <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 管理系统</p>
        </div>
      </aside>
    </>
  );
};

export { AnimatedMenuToggle };

const StudentSidebarLogo = () => (
  <div className="relative h-16 flex items-center px-4 border-b border-gray-700/30 overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-transparent to-transparent" />
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
  { path: '/student/videos', icon: <Video size={20} />, label: '公开视频查看' },
];

const StudentNav = () => (
  <nav className="flex-1 overflow-y-auto py-4 px-3">
    {studentMenuItems.map((item) => (
      <NavItem key={item.path} path={item.path} icon={item.icon} label={item.label} />
    ))}
    {/* Screen share - opens in new tab */}
    <a href="#/screen-share" target="_blank" rel="noopener noreferrer" className="group block mb-1">
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-gray-400 hover:text-gray-200 hover:bg-gray-700/20">
        <span className="text-gray-500 group-hover:text-gray-400 transition-colors"><Monitor size={20} /></span>
        <span className="text-sm font-medium">屏幕共享</span>
      </div>
    </a>
  </nav>
);

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
            className="md:hidden fixed inset-0 z-50 bg-gray-900 border-r border-gray-700/30 flex flex-col"
          >
            <StudentSidebarLogo />
            <StudentNav />
            <div className="p-3 border-t border-gray-700/30">
              <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 学员系统</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 bg-gray-800/50 border-b border-gray-700/30 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-7 h-7 rounded-md" />
          <span className="text-white font-bold text-sm">学员中心</span>
        </div>
        <AnimatedMenuToggle toggle={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-gray-800/30 backdrop-blur-xl border-r border-gray-700/30 fixed top-0 left-0 h-full">
        <StudentSidebarLogo />
        <StudentNav />
        <div className="p-3 border-t border-gray-700/30">
          <p className="text-xs text-gray-500 text-center">紫夜战术公会 · 学员系统</p>
        </div>
      </aside>
    </>
  );
};
