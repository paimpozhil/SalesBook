import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Row, Col, Alert } from 'react-bootstrap';
import { FaPlus, FaEnvelope, FaSms, FaWhatsapp, FaTelegram, FaPhone, FaEdit, FaTrash, FaArrowLeft, FaInbox, FaSync, FaQrcode, FaCheckCircle } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import WhatsAppWebConnect from '../../components/channels/WhatsAppWebConnect';
import TelegramConnect from '../../components/channels/TelegramConnect';

const CHANNEL_TYPES = {
  EMAIL_SMTP: {
    label: 'Email (SMTP)',
    icon: FaEnvelope,
    color: 'primary',
    provider: 'smtp',
    fields: [
      { name: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', required: true },
      { name: 'port', label: 'Port', placeholder: '587', type: 'number', required: true },
      { name: 'secure', label: 'Use SSL/TLS', type: 'checkbox' },
      { name: 'user', label: 'Username', placeholder: 'your-email@gmail.com', required: true },
      { name: 'pass', label: 'Password', placeholder: 'App password', type: 'password', required: true },
      { name: 'fromName', label: 'From Name', placeholder: 'SalesBook' },
      { name: 'fromEmail', label: 'From Email', placeholder: 'noreply@example.com', required: true },
      // IMAP settings for receiving emails
      { name: '_imapDivider', type: 'divider', label: 'Inbound Email (IMAP)' },
      { name: 'imapEnabled', label: 'Enable IMAP to receive replies', type: 'checkbox' },
      { name: 'imapHost', label: 'IMAP Host', placeholder: 'imap.gmail.com' },
      { name: 'imapPort', label: 'IMAP Port', placeholder: '993', type: 'number' },
      { name: 'imapUser', label: 'IMAP Username', placeholder: 'Same as SMTP username' },
      { name: 'imapPass', label: 'IMAP Password', placeholder: 'Same as SMTP password', type: 'password' },
    ],
  },
  EMAIL_API: {
    label: 'Email (API)',
    icon: FaEnvelope,
    color: 'primary',
    provider: 'api',
    fields: [
      { name: 'provider', label: 'Provider', type: 'select', options: ['sendgrid', 'mandrill', 'mailgun', 'ses'], required: true },
      { name: 'apiKey', label: 'API Key', placeholder: 'Your API key', type: 'password', required: true },
      { name: 'fromName', label: 'From Name', placeholder: 'SalesBook' },
      { name: 'fromEmail', label: 'From Email', placeholder: 'noreply@example.com', required: true },
    ],
  },
  SMS: {
    label: 'SMS (Twilio)',
    icon: FaSms,
    color: 'success',
    provider: 'twilio',
    fields: [
      { name: 'accountSid', label: 'Account SID', required: true },
      { name: 'authToken', label: 'Auth Token', type: 'password', required: true },
      { name: 'fromNumber', label: 'From Number', placeholder: '+1234567890', required: true },
    ],
  },
  WHATSAPP_WEB: {
    label: 'WhatsApp Web',
    icon: FaWhatsapp,
    color: 'success',
    provider: 'whatsapp-web',
    description: 'Connect via QR code scanning - no API keys needed',
    fields: [], // No credential fields needed - connection handled via QR
  },
  WHATSAPP_BUSINESS: {
    label: 'WhatsApp Business API',
    icon: FaWhatsapp,
    color: 'success',
    provider: 'whatsapp-business',
    fields: [
      { name: 'phoneNumberId', label: 'Phone Number ID', required: true },
      { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
    ],
  },
  TELEGRAM: {
    label: 'Telegram',
    icon: FaTelegram,
    color: 'info',
    provider: 'telegram',
    description: 'Connect using Telegram API credentials - supports prospects and campaigns',
    fields: [
      { name: 'apiId', label: 'API ID', placeholder: 'e.g., 12345678', required: true },
      { name: 'apiHash', label: 'API Hash', placeholder: 'e.g., a1b2c3d4e5f6...', required: true },
    ],
  },
  VOICE: {
    label: 'Voice Call (Twilio)',
    icon: FaPhone,
    color: 'warning',
    provider: 'twilio-voice',
    fields: [
      { name: 'accountSid', label: 'Account SID', required: true },
      { name: 'authToken', label: 'Auth Token', type: 'password', required: true },
      { name: 'fromNumber', label: 'From Number', placeholder: '+1234567890', required: true },
    ],
  },
};

function ChannelList() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({ name: '', credentials: {} });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [pollingImap, setPollingImap] = useState(null);
  const [testingImap, setTestingImap] = useState(null);

  // Edit mode
  const [editingChannel, setEditingChannel] = useState(null);

  // WhatsApp Web connection modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppChannel, setWhatsAppChannel] = useState(null);

  // Telegram connection modal
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramChannel, setTelegramChannel] = useState(null);

  // Connection status cache
  const [telegramStatus, setTelegramStatus] = useState({}); // channelId -> 'CONNECTED' | 'DISCONNECTED'
  const [whatsappStatus, setWhatsappStatus] = useState({}); // channelId -> { status, profile }

  useEffect(() => {
    fetchChannels();
  }, []);

  // Fetch Telegram status for all Telegram channels
  const fetchTelegramStatuses = async (channelList) => {
    const telegramChannels = channelList.filter(c => c.channelType === 'TELEGRAM');
    const statuses = {};

    await Promise.all(
      telegramChannels.map(async (channel) => {
        try {
          const response = await api.get(`/channels/${channel.id}/telegram/status`);
          statuses[channel.id] = response.data.data.status;
        } catch {
          statuses[channel.id] = 'DISCONNECTED';
        }
      })
    );

    setTelegramStatus(statuses);
  };

  // Fetch WhatsApp Web status for all WhatsApp Web channels
  const fetchWhatsAppStatuses = async (channelList) => {
    const waChannels = channelList.filter(c => c.channelType === 'WHATSAPP_WEB');
    const statuses = {};

    await Promise.all(
      waChannels.map(async (channel) => {
        try {
          const response = await api.get(`/channels/${channel.id}/whatsapp-web/status`);
          statuses[channel.id] = {
            status: response.data.data.status,
            profile: response.data.data.profile,
          };
        } catch {
          statuses[channel.id] = { status: 'DISCONNECTED', profile: null };
        }
      })
    );

    setWhatsappStatus(statuses);
  };

  const fetchChannels = async () => {
    try {
      const response = await api.get('/channels');
      const channelList = response.data.data;
      setChannels(channelList);
      // Fetch statuses in background
      fetchTelegramStatuses(channelList);
      fetchWhatsAppStatuses(channelList);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setModalStep(1);
    setSelectedType('');
    setFormData({ name: '', credentials: {} });
    setEditingChannel(null);
  };

  const handleEdit = async (channel) => {
    try {
      // Fetch full channel details including masked credentials
      const response = await api.get(`/channels/${channel.id}`);
      const fullChannel = response.data.data;

      setEditingChannel(fullChannel);
      setSelectedType(fullChannel.channelType);
      setFormData({
        name: fullChannel.name,
        credentials: fullChannel.maskedCredentials || {}, // Pre-fill with safe values
      });
      setModalStep(2);
      setShowModal(true);
    } catch (error) {
      console.error('Failed to fetch channel details:', error);
      // Fallback to basic edit
      setEditingChannel(channel);
      setSelectedType(channel.channelType);
      setFormData({
        name: channel.name,
        credentials: {},
      });
      setModalStep(2);
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalStep(1);
    setSelectedType('');
    setFormData({ name: '', credentials: {} });
    setEditingChannel(null);
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setFormData({
      name: CHANNEL_TYPES[type].label,
      credentials: {},
    });
  };

  const handleContinue = () => {
    if (selectedType) {
      setModalStep(2);
    }
  };

  const handleBack = () => {
    if (editingChannel) {
      handleCloseModal();
    } else {
      setModalStep(1);
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setFormData((prev) => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [fieldName]: value,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingChannel) {
        // Update existing channel
        const updateData = { name: formData.name };

        // Only include credentials if any field was filled
        const hasCredentials = Object.values(formData.credentials).some(v => v !== '' && v !== undefined);
        if (hasCredentials) {
          updateData.credentials = formData.credentials;
        }

        await api.patch(`/channels/${editingChannel.id}`, updateData);
        toast.success('Channel updated successfully');
      } else {
        // Create new channel
        const channelConfig = CHANNEL_TYPES[selectedType];
        await api.post('/channels', {
          name: formData.name,
          channelType: selectedType,
          provider: channelConfig.provider,
          credentials: formData.credentials,
          settings: {},
        });
        toast.success('Channel created successfully');
      }

      handleCloseModal();
      fetchChannels();
    } catch (error) {
      console.error('Failed to save channel:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel) => {
    // Determine prompt based on channel type
    let promptText = 'Enter test email address:';
    let successMessage = 'Test email sent successfully!';

    if (['SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'VOICE'].includes(channel.channelType)) {
      promptText = 'Enter test phone number (with country code, e.g., +919876543210):';
      successMessage = channel.channelType === 'VOICE'
        ? 'Test call initiated successfully!'
        : channel.channelType.includes('WHATSAPP')
          ? 'Test WhatsApp message sent successfully!'
          : 'Test SMS sent successfully!';
    } else if (channel.channelType === 'TELEGRAM') {
      promptText = 'Enter Telegram chat ID:';
      successMessage = 'Test Telegram message sent successfully!';
    }

    const recipient = prompt(promptText);
    if (!recipient) return;

    setTesting(channel.id);
    try {
      const response = await api.post(`/channels/${channel.id}/test`, { recipient });
      toast.success(response.data.data.message || successMessage);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Test failed');
    } finally {
      setTesting(null);
    }
  };

  const handleTestImap = async (channel) => {
    setTestingImap(channel.id);
    try {
      const response = await api.post(`/channels/${channel.id}/test-imap`);
      toast.success(response.data.data.message || 'IMAP connection successful!');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'IMAP test failed');
    } finally {
      setTestingImap(null);
    }
  };

  const handlePollImap = async (channel) => {
    setPollingImap(channel.id);
    try {
      const response = await api.post(`/channels/${channel.id}/poll-imap`);
      toast.success(response.data.data.message || 'IMAP polling completed!');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'IMAP polling failed');
    } finally {
      setPollingImap(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this channel?')) {
      return;
    }
    try {
      await api.delete(`/channels/${id}`);
      toast.success('Channel deleted');
      fetchChannels();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Delete failed');
    }
  };

  const handleToggleActive = async (channel) => {
    try {
      await api.patch(`/channels/${channel.id}`, { isActive: !channel.isActive });
      toast.success(`Channel ${channel.isActive ? 'deactivated' : 'activated'}`);
      fetchChannels();
    } catch (error) {
      toast.error('Failed to update channel');
    }
  };

  const handleWhatsAppConnect = (channel) => {
    setWhatsAppChannel(channel);
    setShowWhatsAppModal(true);
  };

  const handleWhatsAppModalClose = () => {
    setShowWhatsAppModal(false);
    setWhatsAppChannel(null);
    // Refresh status after modal closes
    fetchWhatsAppStatuses(channels);
  };

  const handleTelegramConnect = (channel) => {
    setTelegramChannel(channel);
    setShowTelegramModal(true);
  };

  const handleTelegramModalClose = () => {
    setShowTelegramModal(false);
    setTelegramChannel(null);
    // Refresh status after modal closes
    fetchTelegramStatuses(channels);
  };

  const renderCredentialsForm = () => {
    const config = CHANNEL_TYPES[selectedType];
    if (!config) return null;

    // Special handling for WhatsApp Web - no credentials needed
    if (selectedType === 'WHATSAPP_WEB') {
      return (
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Channel Name</Form.Label>
            <Form.Control
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </Form.Group>

          <Alert variant="info">
            <FaWhatsapp className="me-2" />
            <strong>No credentials required!</strong>
            <p className="mb-0 mt-2 small">
              WhatsApp Web uses QR code authentication. After creating this channel,
              click the "Connect" button to scan the QR code with your phone.
            </p>
          </Alert>

          <div className="d-flex justify-content-between mt-4">
            <Button variant="outline-secondary" onClick={handleBack}>
              <FaArrowLeft className="me-2" />
              {editingChannel ? 'Cancel' : 'Back'}
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingChannel ? 'Update Channel' : 'Create Channel'}
            </Button>
          </div>
        </Form>
      );
    }

    return (
      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label>Channel Name</Form.Label>
          <Form.Control
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </Form.Group>

        <hr />
        <h6 className="text-muted mb-3">Credentials</h6>

        {editingChannel && (
          <Alert variant="success" className="small">
            <strong>Credentials saved securely.</strong> Leave fields empty to keep existing values, or enter new values to update.
          </Alert>
        )}

        {config.fields.map((field) => {
          // Handle divider type
          if (field.type === 'divider') {
            return (
              <div key={field.name} className="mt-4 mb-3">
                <hr />
                <h6 className="text-muted">{field.label}</h6>
              </div>
            );
          }

          return (
          <Form.Group key={field.name} className="mb-3">
            {field.type !== 'checkbox' && <Form.Label>{field.label}</Form.Label>}
            {field.type === 'checkbox' ? (
              <Form.Check
                type="checkbox"
                label={field.label}
                checked={formData.credentials[field.name] || false}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
              />
            ) : field.type === 'select' ? (
              <Form.Select
                value={formData.credentials[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                required={!editingChannel && field.required}
              >
                <option value="">Select {field.label}</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </Form.Select>
            ) : (
              <Form.Control
                type={field.type || 'text'}
                placeholder={editingChannel && field.type === 'password' ? '(unchanged)' : field.placeholder}
                value={formData.credentials[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                required={!editingChannel && field.required}
              />
            )}
          </Form.Group>
          );
        })}

        <div className="d-flex justify-content-between mt-4">
          <Button variant="outline-secondary" onClick={handleBack}>
            <FaArrowLeft className="me-2" />
            {editingChannel ? 'Cancel' : 'Back'}
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingChannel ? 'Update Channel' : 'Create Channel'}
          </Button>
        </div>
      </Form>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Communication Channels</h1>
        <Button variant="primary" onClick={handleOpenModal}>
          <FaPlus className="me-2" />
          Add Channel
        </Button>
      </div>

      <Card>
        {channels.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaEnvelope size={48} className="text-muted mb-3" />
            <h5>No channels configured</h5>
            <p className="text-muted">Set up email, SMS, WhatsApp, or other channels to communicate with leads.</p>
            <Button variant="primary" onClick={handleOpenModal}>Add Channel</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Provider</th>
                <th>Created By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const config = CHANNEL_TYPES[channel.channelType] || {};
                const Icon = config.icon || FaEnvelope;
                return (
                  <tr key={channel.id}>
                    <td>
                      <Icon className="me-2 text-muted" />
                      <strong>{channel.name}</strong>
                    </td>
                    <td>
                      <Badge bg={config.color || 'secondary'}>
                        {config.label || channel.channelType}
                      </Badge>
                    </td>
                    <td>{channel.provider}</td>
                    <td>{channel.createdBy?.name || '-'}</td>
                    <td>
                      <Badge
                        bg={channel.isActive ? 'success' : 'secondary'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleToggleActive(channel)}
                      >
                        {channel.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      {channel.channelType === 'WHATSAPP_WEB' && (
                        <Button
                          variant={whatsappStatus[channel.id]?.status === 'CONNECTED' ? 'success' : 'outline-success'}
                          size="sm"
                          className="me-1"
                          onClick={() => handleWhatsAppConnect(channel)}
                        >
                          {whatsappStatus[channel.id]?.status === 'CONNECTED' ? (
                            <>
                              <FaCheckCircle className="me-1" /> Connected
                            </>
                          ) : (
                            <>
                              <FaQrcode className="me-1" /> Connect
                            </>
                          )}
                        </Button>
                      )}
                      {channel.channelType === 'TELEGRAM' && (
                        <Button
                          variant={telegramStatus[channel.id] === 'CONNECTED' ? 'success' : 'outline-info'}
                          size="sm"
                          className="me-1"
                          onClick={() => handleTelegramConnect(channel)}
                        >
                          {telegramStatus[channel.id] === 'CONNECTED' ? (
                            <>
                              <FaCheckCircle className="me-1" /> Connected
                            </>
                          ) : (
                            <>
                              <FaTelegram className="me-1" /> Connect
                            </>
                          )}
                        </Button>
                      )}
                      {channel.channelType !== 'WHATSAPP_WEB' && channel.channelType !== 'TELEGRAM' && (
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="me-1"
                          onClick={() => handleTest(channel)}
                          disabled={testing === channel.id}
                        >
                          {testing === channel.id ? 'Sending...' : 'Test'}
                        </Button>
                      )}
                      {channel.channelType === 'EMAIL_SMTP' && (
                        <>
                          <Button
                            variant="outline-info"
                            size="sm"
                            className="me-1"
                            onClick={() => handleTestImap(channel)}
                            disabled={testingImap === channel.id}
                            title="Test IMAP Connection"
                          >
                            {testingImap === channel.id ? '...' : <FaInbox />}
                          </Button>
                          <Button
                            variant="outline-success"
                            size="sm"
                            className="me-1"
                            onClick={() => handlePollImap(channel)}
                            disabled={pollingImap === channel.id}
                            title="Check for New Emails"
                          >
                            {pollingImap === channel.id ? '...' : <FaSync />}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        className="me-1"
                        onClick={() => handleEdit(channel)}
                      >
                        <FaEdit />
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDelete(channel.id)}
                      >
                        <FaTrash />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal show={showModal} onHide={handleCloseModal} size={modalStep === 2 ? 'lg' : undefined}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingChannel
              ? `Edit ${CHANNEL_TYPES[selectedType]?.label}`
              : modalStep === 1
                ? 'Add Communication Channel'
                : `Configure ${CHANNEL_TYPES[selectedType]?.label}`
            }
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalStep === 1 ? (
            <>
              <p className="text-muted mb-3">Select the type of channel you want to configure:</p>
              <Row>
                {Object.entries(CHANNEL_TYPES).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <Col md={6} key={type} className="mb-2">
                      <Button
                        variant={selectedType === type ? 'primary' : 'outline-primary'}
                        className="w-100 text-start py-3"
                        onClick={() => handleTypeSelect(type)}
                      >
                        <Icon className="me-2" />
                        {config.label}
                      </Button>
                    </Col>
                  );
                })}
              </Row>
            </>
          ) : (
            renderCredentialsForm()
          )}
        </Modal.Body>
        {modalStep === 1 && (
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!selectedType} onClick={handleContinue}>
              Continue
            </Button>
          </Modal.Footer>
        )}
      </Modal>

      {/* WhatsApp Web Connection Modal */}
      <Modal show={showWhatsAppModal} onHide={handleWhatsAppModalClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaWhatsapp className="me-2 text-success" />
            Connect WhatsApp Web - {whatsAppChannel?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {whatsAppChannel && (
            <WhatsAppWebConnect
              channelId={whatsAppChannel.id}
              onConnected={() => {
                // Refresh channel list to update status
                fetchChannels();
              }}
              onDisconnected={() => {
                // Refresh channel list to update status
                fetchChannels();
              }}
            />
          )}
          <Alert variant="info" className="mt-3">
            <strong>How it works:</strong>
            <ul className="mb-0 mt-2">
              <li>Click "Connect WhatsApp" to open a browser window</li>
              <li>Scan the QR code with WhatsApp on your phone</li>
              <li>Once connected, you can send campaigns via WhatsApp Web</li>
              <li>Messages will be sent with 5-30 second delays to appear natural</li>
            </ul>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleWhatsAppModalClose}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Telegram Connection Modal */}
      <Modal show={showTelegramModal} onHide={handleTelegramModalClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaTelegram className="me-2 text-info" />
            Connect Telegram - {telegramChannel?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {telegramChannel && (
            <TelegramConnect
              channelId={telegramChannel.id}
              onConnected={() => {
                fetchChannels();
              }}
              onDisconnected={() => {
                fetchChannels();
              }}
            />
          )}
          <Alert variant="info" className="mt-3">
            <strong>How to get Telegram API credentials:</strong>
            <ol className="mb-0 mt-2">
              <li>Go to <a href="https://my.telegram.org/auth" target="_blank" rel="noopener noreferrer">my.telegram.org</a></li>
              <li>Log in with your phone number</li>
              <li>Go to "API development tools"</li>
              <li>Create a new application to get API ID and Hash</li>
            </ol>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleTelegramModalClose}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default ChannelList;
