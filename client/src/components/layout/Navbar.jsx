import { Navbar as BSNavbar, Container, Nav, NavDropdown } from 'react-bootstrap';
import { FaBars, FaUser, FaCog, FaSignOutAlt } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

function Navbar({ onToggleSidebar, onToggleMobileSidebar }) {
  const { user, tenant, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <BSNavbar bg="white" expand="lg" fixed="top" className="border-bottom">
      <Container fluid>
        <button
          className="btn btn-link text-dark d-none d-lg-block me-2"
          onClick={onToggleSidebar}
        >
          <FaBars />
        </button>
        <button
          className="btn btn-link text-dark d-lg-none me-2"
          onClick={onToggleMobileSidebar}
        >
          <FaBars />
        </button>

        <BSNavbar.Brand as={Link} to="/" className="text-primary">
          BlazeHexa Leads
        </BSNavbar.Brand>

        {tenant && (
          <span className="text-muted d-none d-md-inline ms-2">
            | {tenant.name}
          </span>
        )}

        <Nav className="ms-auto">
          <NavDropdown
            title={
              <span>
                <FaUser className="me-1" />
                {user?.name || 'User'}
              </span>
            }
            id="user-dropdown"
            align="end"
          >
            <NavDropdown.Item as={Link} to="/settings">
              <FaCog className="me-2" />
              Settings
            </NavDropdown.Item>
            <NavDropdown.Divider />
            <NavDropdown.Item onClick={handleLogout}>
              <FaSignOutAlt className="me-2" />
              Logout
            </NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Container>
    </BSNavbar>
  );
}

export default Navbar;
