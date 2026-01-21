import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form } from 'react-bootstrap';
import { FaPlus, FaEnvelope, FaSms, FaWhatsapp, FaTelegram, FaPhone, FaEdit, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CHANNEL_ICONS = {
  EMAIL_SMTP: FaEnvelope,
  EMAIL_MANDRILL: FaEnvelope,
  EMAIL_SENDGRID: FaEnvelope,
  SMS: FaSms,
  WHATSAPP_WEB: FaWhatsapp,
  WHATSAPP_API: FaWhatsapp,
  TELEGRAM: FaTelegram,
  VOICE: FaPhone,
};

const CHANNEL_COLORS = {
  EMAIL_SMTP: 'primary',
  EMAIL_MANDRILL: 'primary',
  EMAIL_SENDGRID: 'primary',
  SMS: 'success',
  WHATSAPP_WEB: 'success',
  WHATSAPP_API: 'success',
  TELEGRAM: 'info',
  VOICE: 'warning',
};

const CHANNEL_LABELS = {
  EMAIL_SMTP: 'Email (SMTP)',
  EMAIL_MANDRILL: 'Email (Mandrill)',
  EMAIL_SENDGRID: 'Email (SendGrid)',
  SMS: 'SMS (Twilio)',
  WHATSAPP_WEB: 'WhatsApp Web',
  WHATSAPP_API: 'WhatsApp API',
  TELEGRAM: 'Telegram',
  VOICE: 'Voice Call',
};

function ChannelList() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState('');

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

  const handleTest = async (id) => {
    try {
      await api.post(`/channels/${id}/test`);
      toast.success('Test message sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Test failed');
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
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Communication Channels</h1>
        <Button variant="primary" onClick={() => setShowModal(true)}>
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
            <Button variant="primary" onClick={() => setShowModal(true)}>Add Channel</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Daily Limit</th>
                <th>Sent Today</th>
                <th>Default</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const Icon = CHANNEL_ICONS[channel.channelType] || FaEnvelope;
                return (
                  <tr key={channel.id}>
                    <td>
                      <Icon className="me-2 text-muted" />
                      <strong>{channel.name}</strong>
                    </td>
                    <td>
                      <Badge bg={CHANNEL_COLORS[channel.channelType]}>
                        {CHANNEL_LABELS[channel.channelType]}
                      </Badge>
                    </td>
                    <td>
                      <Badge bg={channel.isActive ? 'success' : 'secondary'}>
                        {channel.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>{channel.dailyLimit || 'Unlimited'}</td>
                    <td>{channel.sentToday || 0}</td>
                    <td>
                      {channel.isDefault ? (
                        <FaCheck className="text-success" />
                      ) : (
                        <FaTimes className="text-muted" />
                      )}
                    </td>
                    <td>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="me-1"
                        onClick={() => handleTest(channel.id)}
                        title="Test"
                      >
                        Test
                      </Button>
                      <Button variant="outline-primary" size="sm" className="me-1">
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

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Communication Channel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3">Select the type of channel you want to configure:</p>
          <div className="d-grid gap-2">
            {Object.entries(CHANNEL_LABELS).map(([type, label]) => {
              const Icon = CHANNEL_ICONS[type];
              return (
                <Button
                  key={type}
                  variant={selectedType === type ? 'primary' : 'outline-primary'}
                  className="text-start"
                  onClick={() => setSelectedType(type)}
                >
                  <Icon className="me-2" />
                  {label}
                </Button>
              );
            })}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!selectedType}>
            Continue
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default ChannelList;
