import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form } from 'react-bootstrap';
import { FaPlus, FaFileAlt, FaEdit, FaTrash, FaEnvelope, FaWhatsapp, FaPhone, FaSms } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CHANNEL_TYPES = [
  { value: 'EMAIL_SMTP', label: 'Email', icon: FaEnvelope, color: 'primary' },
  { value: 'WHATSAPP_WEB', label: 'WhatsApp Web', icon: FaWhatsapp, color: 'success' },
  { value: 'WHATSAPP_BUSINESS', label: 'WhatsApp Business API', icon: FaWhatsapp, color: 'success' },
  { value: 'SMS', label: 'SMS', icon: FaSms, color: 'info' },
  { value: 'VOICE', label: 'Voice', icon: FaPhone, color: 'warning' },
];

const CHANNEL_COLORS = {
  EMAIL_SMTP: 'primary',
  EMAIL_API: 'primary',
  SMS: 'info',
  WHATSAPP_WEB: 'success',
  WHATSAPP_BUSINESS: 'success',
  TELEGRAM: 'info',
  VOICE: 'warning',
};

const EMPTY_FORM = {
  name: '',
  channelType: 'EMAIL_SMTP',
  subject: '',
  body: '',
};

function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/templates');
      setTemplates(response.data.data);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        channelType: template.channelType,
        subject: template.subject || '',
        body: template.body || '',
      });
    } else {
      setEditingTemplate(null);
      setFormData(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.body) {
      toast.error('Please fill in name and body');
      return;
    }

    setSaving(true);
    try {
      if (editingTemplate) {
        await api.patch(`/templates/${editingTemplate.id}`, formData);
        toast.success('Template updated');
      } else {
        await api.post('/templates', formData);
        toast.success('Template created');
      }
      closeModal();
      fetchTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.delete(`/templates/${id}`);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to delete template');
    }
  };

  const needsSubject = ['EMAIL_SMTP', 'EMAIL_API'].includes(formData.channelType);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Templates</h1>
        <Button variant="primary" onClick={() => openModal()}>
          <FaPlus className="me-2" />
          Create Template
        </Button>
      </div>

      <Card>
        {templates.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaFileAlt size={48} className="text-muted mb-3" />
            <h5>No templates yet</h5>
            <p className="text-muted">Create reusable message templates for your campaigns.</p>
            <Button variant="primary" onClick={() => openModal()}>Create Template</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Channel</th>
                <th>Subject</th>
                <th>Created By</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    <strong>{template.name}</strong>
                  </td>
                  <td>
                    <Badge bg={CHANNEL_COLORS[template.channelType] || 'secondary'}>
                      {template.channelType.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: '200px' }}>
                    {template.subject || '-'}
                  </td>
                  <td>{template.createdBy?.name || '-'}</td>
                  <td>{new Date(template.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="me-1"
                      onClick={() => openModal(template)}
                    >
                      <FaEdit />
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      <FaTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal show={showModal} onHide={closeModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingTemplate ? 'Edit Template' : 'Create Template'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Template Name</Form.Label>
              <Form.Control
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Welcome Email, Follow-up Message"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Channel Type</Form.Label>
              <Form.Select
                value={formData.channelType}
                onChange={(e) => setFormData({ ...formData, channelType: e.target.value })}
                disabled={!!editingTemplate}
              >
                {CHANNEL_TYPES.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            {needsSubject && (
              <Form.Group className="mb-3">
                <Form.Label>Subject</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Email subject line"
                />
                <Form.Text className="text-muted">
                  You can use variables like {'{{contact.name}}'}, {'{{lead.company_name}}'}
                </Form.Text>
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Message Body</Form.Label>
              <Form.Control
                as="textarea"
                rows={10}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Write your message here..."
                required
              />
              <Form.Text className="text-muted">
                Available variables: {'{{contact.name}}'}, {'{{contact.email}}'}, {'{{contact.phone}}'}, {'{{contact.position}}'}, {'{{lead.company_name}}'}, {'{{lead.website}}'}, {'{{lead.industry}}'}, {'{{current_date}}'}, {'{{unsubscribe_link}}'}
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default TemplateList;
