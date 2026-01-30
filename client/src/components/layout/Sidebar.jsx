import { NavLink } from 'react-router-dom';
import {
  FaHome,
  FaUsers,
  FaBullhorn,
  FaComments,
  FaFileAlt,
  FaDatabase,
  FaPlug,
  FaChartBar,
  FaCog,
  FaUsersCog,
  FaTimes,
  FaUserFriends,
} from 'react-icons/fa';
import useAuthStore from '../../store/authStore';

const navItems = [
  {
    section: 'Main',
    items: [
      { path: '/', icon: FaHome, label: 'Dashboard' },
      { path: '/leads', icon: FaUsers, label: 'Leads' },
      { path: '/prospects', icon: FaUserFriends, label: 'Prospects' },
      { path: '/campaigns', icon: FaBullhorn, label: 'Campaigns' },
      { path: '/conversations', icon: FaComments, label: 'Conversations' },
    ],
  },
  {
    section: 'Content',
    items: [
      { path: '/templates', icon: FaFileAlt, label: 'Templates' },
    ],
  },
  {
    section: 'Data',
    items: [
      { path: '/data-sources', icon: FaDatabase, label: 'Data Sources' },
      { path: '/channels', icon: FaPlug, label: 'Channels' },
    ],
  },
  {
    section: 'Reports',
    items: [
      { path: '/analytics', icon: FaChartBar, label: 'Analytics' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { path: '/settings/users', icon: FaUsersCog, label: 'Users', minRole: 'TENANT_ADMIN' },
      { path: '/settings', icon: FaCog, label: 'Settings' },
    ],
  },
];

function Sidebar({ collapsed, mobileOpen, onCloseMobile }) {
  const { hasRole } = useAuthStore();

  const sidebarClass = `sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-lg-none"
          style={{ zIndex: 999 }}
          onClick={onCloseMobile}
        />
      )}

      <aside className={sidebarClass}>
        {/* Mobile close button */}
        <div className="d-lg-none p-3 text-end">
          <button className="btn btn-link text-white" onClick={onCloseMobile}>
            <FaTimes />
          </button>
        </div>

        <nav className="nav flex-column">
          {navItems.map((section) => (
            <div key={section.section}>
              {!collapsed && (
                <div className="sidebar-section">{section.section}</div>
              )}
              {section.items.map((item) => {
                // Check role requirement
                if (item.minRole && !hasRole(item.minRole)) {
                  return null;
                }

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onCloseMobile}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  >
                    <item.icon />
                    <span className="nav-text">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
