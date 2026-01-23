import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Row, Col, Alert } from 'react-bootstrap';
import { FaPlus, FaEnvelope, FaSms, FaWhatsapp, FaTelegram, FaPhone, FaEdit, FaTrash, FaArrowLeft } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

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
    fields: [
      { name: 'sessionName', label: 'Session Name', required: true },
    ],
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
    label: 'Telegram Bot',
    icon: FaTelegram,
    color: 'info',
    provider: 'telegram',
    fields: [
      { name: 'botToken', label: 'Bot Token', type: 'password', required: true },
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

  // Edit mode
  const [editingChannel, setEditingChannel] = useState(null);

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const response = await api.get('/channels');
      setChannels(response.data.data);
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

  const handleEdit = (channel) => {
    setEditingChannel(channel);
    setSelectedType(channel.channelType);
    setFormData({
      name: channel.name,
      credentials: {}, // Don't prefill credentials for security
    });
    setModalStep(2);
    setShowModal(true);
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

  const renderCredentialsForm = () => {
    const config = CHANNEL_TYPES[selectedType];
    if (!config) return null;

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

        {config.fields.map((field) => (
          <Form.Group key={field.name} className="mb-3">
            <Form.Label>{field.label}</Form.Label>
            {field.type === 'checkbox' ? (
              <Form.Check
                type="checkbox"
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
        ))}

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
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="me-1"
                        onClick={() => handleTest(channel)}
                        disabled={testing === channel.id}
                      >
                        {testing === channel.id ? 'Sending...' : 'Test'}
                      </Button>
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
    </div>
  );
}

export default ChannelList;
