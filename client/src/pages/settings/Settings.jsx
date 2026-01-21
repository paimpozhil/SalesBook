import { useState, useEffect } from 'react';
import { Card, Row, Col, Form, Button, Tab, Nav } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function Settings() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  const profileForm = useForm();
  const passwordForm = useForm();
  const tenantForm = useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user profile
      profileForm.reset({
        name: user?.name || '',
        email: user?.email || '',
      });

      // Get tenant settings if admin
      if (user?.role === 'TENANT_ADMIN') {
        const response = await api.get('/auth/me');
        if (response.data.user?.tenant) {
          setTenant(response.data.user.tenant);
          tenantForm.reset({
            name: response.data.user.tenant.name,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const onProfileSubmit = async (data) => {
    try {
      const response = await api.put('/users/me', data);
      setUser(response.data.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const onPasswordSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed');
      passwordForm.reset();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Password change failed');
    }
  };

  const onTenantSubmit = async (data) => {
    try {
      await api.put('/tenants/current', data);
      toast.success('Organization settings updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <Tab.Container activeKey={activeTab} onSelect={setActiveTab}>
        <Row>
          <Col md={3}>
            <Card className="mb-4">
              <Card.Body className="p-2">
                <Nav variant="pills" className="flex-column">
                  <Nav.Item>
                    <Nav.Link eventKey="profile">Profile</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="password">Password</Nav.Link>
                  </Nav.Item>
                  {user?.role === 'TENANT_ADMIN' && (
                    <Nav.Item>
                      <Nav.Link eventKey="organization">Organization</Nav.Link>
                    </Nav.Item>
                  )}
                  <Nav.Item>
                    <Nav.Link eventKey="notifications">Notifications</Nav.Link>
                  </Nav.Item>
                </Nav>
              </Card.Body>
            </Card>
          </Col>
          <Col md={9}>
            <Tab.Content>
              {/* Profile Tab */}
              <Tab.Pane eventKey="profile">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Profile Settings</h5>
                  </Card.Header>
                  <Card.Body>
                    <Form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Name</Form.Label>
                            <Form.Control
                              type="text"
                              {...profileForm.register('name', { required: true })}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Email</Form.Label>
                            <Form.Control
                              type="email"
                              {...profileForm.register('email')}
                              disabled
                            />
                            <Form.Text className="text-muted">
                              Email cannot be changed
                            </Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Button type="submit" variant="primary">
                        Save Changes
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Tab.Pane>

              {/* Password Tab */}
              <Tab.Pane eventKey="password">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Change Password</h5>
                  </Card.Header>
                  <Card.Body>
                    <Form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                      <Form.Group className="mb-3">
                        <Form.Label>Current Password</Form.Label>
                        <Form.Control
                          type="password"
                          {...passwordForm.register('currentPassword', { required: true })}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>New Password</Form.Label>
                        <Form.Control
                          type="password"
                          {...passwordForm.register('newPassword', {
                            required: true,
                            minLength: 8,
                          })}
                        />
                        <Form.Text className="text-muted">
                          Minimum 8 characters
                        </Form.Text>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Confirm New Password</Form.Label>
                        <Form.Control
                          type="password"
                          {...passwordForm.register('confirmPassword', { required: true })}
                        />
                      </Form.Group>
                      <Button type="submit" variant="primary">
                        Change Password
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Tab.Pane>

              {/* Organization Tab */}
              {user?.role === 'TENANT_ADMIN' && (
                <Tab.Pane eventKey="organization">
                  <Card>
                    <Card.Header>
                      <h5 className="mb-0">Organization Settings</h5>
                    </Card.Header>
                    <Card.Body>
                      <Form onSubmit={tenantForm.handleSubmit(onTenantSubmit)}>
                        <Form.Group className="mb-3">
                          <Form.Label>Organization Name</Form.Label>
                          <Form.Control
                            type="text"
                            {...tenantForm.register('name', { required: true })}
                          />
                        </Form.Group>
                        <Button type="submit" variant="primary">
                          Save Changes
                        </Button>
                      </Form>
                    </Card.Body>
                  </Card>
                </Tab.Pane>
              )}

              {/* Notifications Tab */}
              <Tab.Pane eventKey="notifications">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Notification Preferences</h5>
                  </Card.Header>
                  <Card.Body>
                    <Form>
                      <Form.Check
                        type="switch"
                        id="email-notifications"
                        label="Email notifications for new leads"
                        className="mb-3"
                        defaultChecked
                      />
                      <Form.Check
                        type="switch"
                        id="reply-notifications"
                        label="Email notifications for lead replies"
                        className="mb-3"
                        defaultChecked
                      />
                      <Form.Check
                        type="switch"
                        id="campaign-notifications"
                        label="Campaign completion notifications"
                        className="mb-3"
                        defaultChecked
                      />
                      <Form.Check
                        type="switch"
                        id="scraper-notifications"
                        label="Scraper job notifications"
                        className="mb-3"
                      />
                      <Button type="submit" variant="primary">
                        Save Preferences
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>
    </div>
  );
}

export default Settings;
