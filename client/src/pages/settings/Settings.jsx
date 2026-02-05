import { useState, useEffect } from 'react';
import { Card, Row, Col, Form, Button, Tab, Nav, Table, Modal, InputGroup, Badge, Spinner, Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaRobot, FaCheck, FaTimes, FaEye, FaEyeSlash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function Settings() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  // Positions state
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionSearch, setPositionSearch] = useState('');
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [positionName, setPositionName] = useState('');

  // Industries state
  const [industries, setIndustries] = useState([]);
  const [industriesLoading, setIndustriesLoading] = useState(false);
  const [industrySearch, setIndustrySearch] = useState('');
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState(null);
  const [industryName, setIndustryName] = useState('');

  // AI Settings state
  const [aiSettings, setAiSettings] = useState({ hasApiKey: false, envConfigured: false, source: 'none', availableModels: [] });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

  const profileForm = useForm();
  const passwordForm = useForm();
  const tenantForm = useForm();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'positions') {
      fetchPositions();
    }
  }, [activeTab, positionSearch]);

  useEffect(() => {
    if (activeTab === 'industries') {
      fetchIndustries();
    }
  }, [activeTab, industrySearch]);

  useEffect(() => {
    if (activeTab === 'ai' && ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role)) {
      fetchAiSettings();
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      // Get current user profile
      profileForm.reset({
        name: user?.name || '',
        email: user?.email || '',
      });

      // Get tenant settings if admin
      if (['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role)) {
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

  const fetchPositions = async () => {
    setPositionsLoading(true);
    try {
      const params = new URLSearchParams();
      if (positionSearch) params.append('search', positionSearch);
      params.append('limit', '100');
      const response = await api.get(`/positions?${params}`);
      setPositions(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      toast.error('Failed to load positions');
    } finally {
      setPositionsLoading(false);
    }
  };

  const openPositionModal = (position = null) => {
    setEditingPosition(position);
    setPositionName(position?.name || '');
    setShowPositionModal(true);
  };

  const closePositionModal = () => {
    setShowPositionModal(false);
    setEditingPosition(null);
    setPositionName('');
  };

  const savePosition = async () => {
    if (!positionName.trim()) {
      toast.error('Position name is required');
      return;
    }
    try {
      if (editingPosition) {
        await api.patch(`/positions/${editingPosition.id}`, { name: positionName.trim() });
        toast.success('Position updated');
      } else {
        await api.post('/positions', { name: positionName.trim() });
        toast.success('Position created');
      }
      closePositionModal();
      fetchPositions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save position');
    }
  };

  const deletePosition = async (position) => {
    if (position._count?.contacts > 0) {
      toast.error(`Cannot delete position with ${position._count.contacts} associated contacts`);
      return;
    }
    if (!window.confirm(`Delete position "${position.name}"?`)) return;
    try {
      await api.delete(`/positions/${position.id}`);
      toast.success('Position deleted');
      fetchPositions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete position');
    }
  };

  // Industries functions
  const fetchIndustries = async () => {
    setIndustriesLoading(true);
    try {
      const params = new URLSearchParams();
      if (industrySearch) params.append('search', industrySearch);
      params.append('limit', '100');
      const response = await api.get(`/industries?${params}`);
      setIndustries(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch industries:', error);
      toast.error('Failed to load industries');
    } finally {
      setIndustriesLoading(false);
    }
  };

  const openIndustryModal = (industry = null) => {
    setEditingIndustry(industry);
    setIndustryName(industry?.name || '');
    setShowIndustryModal(true);
  };

  const closeIndustryModal = () => {
    setShowIndustryModal(false);
    setEditingIndustry(null);
    setIndustryName('');
  };

  const saveIndustry = async () => {
    if (!industryName.trim()) {
      toast.error('Industry name is required');
      return;
    }
    try {
      if (editingIndustry) {
        await api.patch(`/industries/${editingIndustry.id}`, { name: industryName.trim() });
        toast.success('Industry updated');
      } else {
        await api.post('/industries', { name: industryName.trim() });
        toast.success('Industry created');
      }
      closeIndustryModal();
      fetchIndustries();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save industry');
    }
  };

  const deleteIndustry = async (industry) => {
    if (industry._count?.leads > 0) {
      toast.error(`Cannot delete industry with ${industry._count.leads} associated leads`);
      return;
    }
    if (!window.confirm(`Delete industry "${industry.name}"?`)) return;
    try {
      await api.delete(`/industries/${industry.id}`);
      toast.success('Industry deleted');
      fetchIndustries();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete industry');
    }
  };

  // AI Settings functions
  const fetchAiSettings = async () => {
    setAiLoading(true);
    try {
      const response = await api.get('/ai/settings');
      setAiSettings(response.data.data);
      setSelectedModel(response.data.data.model || 'gpt-4o-mini');
    } catch (error) {
      console.error('Failed to fetch AI settings:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const saveAiSettings = async () => {
    if (!aiApiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }
    setAiLoading(true);
    try {
      await api.put('/ai/settings', { apiKey: aiApiKey.trim(), model: selectedModel });
      toast.success('API key saved successfully');
      setAiApiKey('');
      setAiTestResult(null);
      fetchAiSettings();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to save API key');
    } finally {
      setAiLoading(false);
    }
  };

  const saveModelSelection = async (newModel) => {
    setSelectedModel(newModel);
    try {
      await api.put('/ai/settings', { model: newModel });
      toast.success('Model updated');
      fetchAiSettings();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to update model');
    }
  };

  const removeAiApiKey = async () => {
    if (!window.confirm('Are you sure you want to remove the API key?')) return;
    setAiLoading(true);
    try {
      await api.put('/ai/settings', { apiKey: null });
      toast.success('API key removed');
      setAiTestResult(null);
      fetchAiSettings();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to remove API key');
    } finally {
      setAiLoading(false);
    }
  };

  const testAiConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const response = await api.post('/ai/test', { apiKey: aiApiKey.trim() || undefined });
      setAiTestResult(response.data.data);
    } catch (error) {
      setAiTestResult({ working: false, error: error.response?.data?.error?.message || 'Test failed' });
    } finally {
      setAiTesting(false);
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
                  {['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && (
                    <Nav.Item>
                      <Nav.Link eventKey="organization">Organization</Nav.Link>
                    </Nav.Item>
                  )}
                  <Nav.Item>
                    <Nav.Link eventKey="positions">Positions</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="industries">Industries</Nav.Link>
                  </Nav.Item>
                  {['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && (
                    <Nav.Item>
                      <Nav.Link eventKey="ai">
                        <FaRobot className="me-1" /> AI Settings
                      </Nav.Link>
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
              {['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && (
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

              {/* Positions Tab */}
              <Tab.Pane eventKey="positions">
                <Card>
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Manage Positions</h5>
                    <Button variant="primary" size="sm" onClick={() => openPositionModal()}>
                      <FaPlus className="me-1" /> Add Position
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    <InputGroup className="mb-3" style={{ maxWidth: '300px' }}>
                      <InputGroup.Text><FaSearch /></InputGroup.Text>
                      <Form.Control
                        type="text"
                        placeholder="Search positions..."
                        value={positionSearch}
                        onChange={(e) => setPositionSearch(e.target.value)}
                      />
                    </InputGroup>
                    {positionsLoading ? (
                      <div className="text-center py-4">Loading...</div>
                    ) : positions.length === 0 ? (
                      <div className="text-center py-4 text-muted">
                        No positions found. Add your first position to get started.
                      </div>
                    ) : (
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Position Name</th>
                            <th style={{ width: '120px' }}>Contacts</th>
                            <th style={{ width: '120px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((position) => (
                            <tr key={position.id}>
                              <td>{position.name}</td>
                              <td>{position._count?.contacts || 0}</td>
                              <td>
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  className="me-1"
                                  onClick={() => openPositionModal(position)}
                                >
                                  <FaEdit />
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => deletePosition(position)}
                                  disabled={position._count?.contacts > 0}
                                >
                                  <FaTrash />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </Card.Body>
                </Card>
              </Tab.Pane>

              {/* Industries Tab */}
              <Tab.Pane eventKey="industries">
                <Card>
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Manage Industries</h5>
                    <Button variant="primary" size="sm" onClick={() => openIndustryModal()}>
                      <FaPlus className="me-1" /> Add Industry
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    <InputGroup className="mb-3" style={{ maxWidth: '300px' }}>
                      <InputGroup.Text><FaSearch /></InputGroup.Text>
                      <Form.Control
                        type="text"
                        placeholder="Search industries..."
                        value={industrySearch}
                        onChange={(e) => setIndustrySearch(e.target.value)}
                      />
                    </InputGroup>
                    {industriesLoading ? (
                      <div className="text-center py-4">Loading...</div>
                    ) : industries.length === 0 ? (
                      <div className="text-center py-4 text-muted">
                        No industries found. Industries are auto-created when importing data sources.
                      </div>
                    ) : (
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Industry Name</th>
                            <th style={{ width: '120px' }}>Leads</th>
                            <th style={{ width: '120px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {industries.map((industry) => (
                            <tr key={industry.id}>
                              <td>{industry.name}</td>
                              <td>{industry._count?.leads || 0}</td>
                              <td>
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  className="me-1"
                                  onClick={() => openIndustryModal(industry)}
                                >
                                  <FaEdit />
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => deleteIndustry(industry)}
                                  disabled={industry._count?.leads > 0}
                                >
                                  <FaTrash />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </Card.Body>
                </Card>
              </Tab.Pane>

              {/* AI Settings Tab */}
              {['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && (
                <Tab.Pane eventKey="ai">
                  <Card>
                    <Card.Header>
                      <h5 className="mb-0">
                        <FaRobot className="me-2" />
                        AI Settings (OpenAI)
                      </h5>
                    </Card.Header>
                    <Card.Body>
                      {aiLoading && !aiSettings ? (
                        <div className="text-center py-4">
                          <Spinner animation="border" size="sm" /> Loading...
                        </div>
                      ) : (
                        <>
                          {/* Current Status */}
                          <div className="mb-4">
                            <h6>Current Status</h6>
                            <div className="d-flex align-items-center gap-2 mb-2">
                              {aiSettings.hasApiKey || aiSettings.envConfigured ? (
                                <Badge bg="success">
                                  <FaCheck className="me-1" /> Configured
                                </Badge>
                              ) : (
                                <Badge bg="warning">
                                  <FaTimes className="me-1" /> Not Configured
                                </Badge>
                              )}
                              {aiSettings.source === 'database' && (
                                <Badge bg="info">Using Custom API Key</Badge>
                              )}
                              {aiSettings.source === 'environment' && (
                                <Badge bg="secondary">Using Server Default</Badge>
                              )}
                            </div>
                          </div>

                          {/* Model Selection */}
                          <div className="mb-4">
                            <h6>Model Selection</h6>
                            <Form.Group className="mb-3">
                              <Form.Label>OpenAI Model</Form.Label>
                              <Form.Select
                                value={selectedModel}
                                onChange={(e) => saveModelSelection(e.target.value)}
                                style={{ maxWidth: '350px' }}
                              >
                                {(aiSettings.availableModels || []).map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Text className="text-muted">
                                {aiSettings.availableModels?.find(m => m.id === selectedModel)?.description || ''}
                              </Form.Text>
                            </Form.Group>
                          </div>

                          <hr />

                          {/* API Key Configuration */}
                          <div className="mb-4">
                            <h6>Configure OpenAI API Key</h6>
                            <p className="text-muted small">
                              Enter your OpenAI API key to enable AI-powered template generation.
                              Your API key is encrypted before storage.
                            </p>

                            <Form.Group className="mb-3">
                              <Form.Label>API Key</Form.Label>
                              <InputGroup>
                                <Form.Control
                                  type={showApiKey ? 'text' : 'password'}
                                  placeholder={aiSettings.hasApiKey ? '••••••••••••••••••••••••' : 'sk-...'}
                                  value={aiApiKey}
                                  onChange={(e) => setAiApiKey(e.target.value)}
                                />
                                <Button
                                  variant="outline-secondary"
                                  onClick={() => setShowApiKey(!showApiKey)}
                                >
                                  {showApiKey ? <FaEyeSlash /> : <FaEye />}
                                </Button>
                              </InputGroup>
                              <Form.Text className="text-muted">
                                Get your API key from{' '}
                                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                                  OpenAI Dashboard
                                </a>
                              </Form.Text>
                            </Form.Group>

                            {/* Test Result */}
                            {aiTestResult && (
                              <Alert variant={aiTestResult.working ? 'success' : 'danger'} className="mb-3">
                                {aiTestResult.working ? (
                                  <>
                                    <FaCheck className="me-2" />
                                    Connection successful! Model: {aiTestResult.model}
                                  </>
                                ) : (
                                  <>
                                    <FaTimes className="me-2" />
                                    Connection failed: {aiTestResult.error}
                                  </>
                                )}
                              </Alert>
                            )}

                            <div className="d-flex gap-2">
                              <Button
                                variant="outline-primary"
                                onClick={testAiConnection}
                                disabled={aiTesting || (!aiApiKey && !aiSettings.hasApiKey)}
                              >
                                {aiTesting ? (
                                  <>
                                    <Spinner animation="border" size="sm" className="me-1" />
                                    Testing...
                                  </>
                                ) : (
                                  'Test Connection'
                                )}
                              </Button>
                              <Button
                                variant="primary"
                                onClick={saveAiSettings}
                                disabled={aiLoading || !aiApiKey}
                              >
                                {aiLoading ? 'Saving...' : 'Save API Key'}
                              </Button>
                              {aiSettings.hasApiKey && (
                                <Button
                                  variant="outline-danger"
                                  onClick={removeAiApiKey}
                                  disabled={aiLoading}
                                >
                                  Remove Key
                                </Button>
                              )}
                            </div>
                          </div>

                          <hr />

                          {/* Info */}
                          <div>
                            <h6>About AI Template Generation</h6>
                            <p className="text-muted small mb-0">
                              When enabled, AI will generate multiple unique message variations for your templates.
                              Each recipient in a campaign will receive a randomly selected variation,
                              making your outreach feel more personal and less like mass messaging.
                            </p>
                          </div>
                        </>
                      )}
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

      {/* Position Modal */}
      <Modal show={showPositionModal} onHide={closePositionModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingPosition ? 'Edit Position' : 'Add Position'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Position Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter position name (e.g., CEO, Manager, Developer)"
              value={positionName}
              onChange={(e) => setPositionName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && savePosition()}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closePositionModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={savePosition}>
            {editingPosition ? 'Update' : 'Create'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Industry Modal */}
      <Modal show={showIndustryModal} onHide={closeIndustryModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingIndustry ? 'Edit Industry' : 'Add Industry'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Industry Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter industry name (e.g., IT, SaaS, Healthcare)"
              value={industryName}
              onChange={(e) => setIndustryName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && saveIndustry()}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeIndustryModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveIndustry}>
            {editingIndustry ? 'Update' : 'Create'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Settings;
