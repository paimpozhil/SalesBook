import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Spinner, Alert, Accordion } from 'react-bootstrap';
import { FaPlus, FaFileAlt, FaEdit, FaTrash, FaEnvelope, FaWhatsapp, FaPhone, FaSms, FaTelegram, FaRobot, FaMagic, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CHANNEL_TYPES = [
  { value: 'EMAIL_SMTP', label: 'Email', icon: FaEnvelope, color: 'primary' },
  { value: 'WHATSAPP_WEB', label: 'WhatsApp Web', icon: FaWhatsapp, color: 'success' },
  { value: 'WHATSAPP_BUSINESS', label: 'WhatsApp Business API', icon: FaWhatsapp, color: 'success' },
  { value: 'TELEGRAM', label: 'Telegram', icon: FaTelegram, color: 'info' },
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

const VARIATION_COUNTS = [5, 10, 15, 20, 30, 50];

const EMPTY_FORM = {
  name: '',
  channelType: 'EMAIL_SMTP',
  subject: '',
  body: '',
  useAi: false,
  aiPrompt: '',
  variations: [],
};

function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // AI state
  const [aiStatus, setAiStatus] = useState({ configured: false, checking: true });
  const [variationCount, setVariationCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [editingVariationIndex, setEditingVariationIndex] = useState(null);

  useEffect(() => {
    fetchTemplates();
    checkAiStatus();
  }, []);

  const checkAiStatus = async () => {
    try {
      const response = await api.get('/ai/status');
      setAiStatus({ ...response.data.data, checking: false });
    } catch (error) {
      console.error('Failed to check AI status:', error);
      setAiStatus({ configured: false, checking: false });
    }
  };

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

  const openModal = async (template = null) => {
    if (template) {
      // Fetch full template with variations
      try {
        const response = await api.get(`/templates/${template.id}`);
        const fullTemplate = response.data.data;
        setEditingTemplate(fullTemplate);
        setFormData({
          name: fullTemplate.name,
          channelType: fullTemplate.channelType,
          subject: fullTemplate.subject || '',
          body: fullTemplate.body || '',
          useAi: fullTemplate.useAi || false,
          aiPrompt: fullTemplate.aiPrompt || '',
          variations: fullTemplate.variations || [],
        });
      } catch (error) {
        console.error('Failed to fetch template details:', error);
        toast.error('Failed to load template');
        return;
      }
    } else {
      setEditingTemplate(null);
      setFormData(EMPTY_FORM);
    }
    setEditingVariationIndex(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData(EMPTY_FORM);
    setEditingVariationIndex(null);
  };

  const handleGenerateVariations = async () => {
    if (!formData.aiPrompt || formData.aiPrompt.trim().length < 10) {
      toast.error('Please enter a prompt (at least 10 characters)');
      return;
    }

    setGenerating(true);
    try {
      const response = await api.post('/ai/generate-variations', {
        prompt: formData.aiPrompt,
        channelType: formData.channelType,
        count: variationCount,
      });

      const newVariations = response.data.data.variations;
      setFormData({ ...formData, variations: newVariations });
      toast.success(`Generated ${newVariations.length} variations`);
    } catch (error) {
      console.error('Failed to generate variations:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to generate variations');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      toast.error('Please enter a template name');
      return;
    }

    if (formData.useAi) {
      if (formData.variations.length === 0) {
        toast.error('Please generate variations first');
        return;
      }
    } else {
      if (!formData.body) {
        toast.error('Please enter a message body');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        channelType: formData.channelType,
        subject: formData.subject || null,
        body: formData.useAi ? (formData.variations[0]?.body || '') : formData.body,
        useAi: formData.useAi,
        aiPrompt: formData.useAi ? formData.aiPrompt : null,
        variations: formData.useAi ? formData.variations : [],
      };

      if (editingTemplate) {
        await api.patch(`/templates/${editingTemplate.id}`, payload);
        toast.success('Template updated');
      } else {
        await api.post('/templates', payload);
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

  const updateVariation = (index, field, value) => {
    const newVariations = [...formData.variations];
    newVariations[index] = { ...newVariations[index], [field]: value };
    setFormData({ ...formData, variations: newVariations });
  };

  const removeVariation = (index) => {
    const newVariations = formData.variations.filter((_, i) => i !== index);
    setFormData({ ...formData, variations: newVariations });
    if (editingVariationIndex === index) {
      setEditingVariationIndex(null);
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
                <th>Type</th>
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
                  <td>
                    {template.useAi ? (
                      <Badge bg="info">
                        <FaRobot className="me-1" />
                        AI ({template._count?.variations || 0} variations)
                      </Badge>
                    ) : (
                      <Badge bg="secondary">Static</Badge>
                    )}
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
                onChange={(e) => setFormData({ ...formData, channelType: e.target.value, variations: [] })}
                disabled={!!editingTemplate}
              >
                {CHANNEL_TYPES.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            {/* AI Generation Toggle */}
            <Card className="mb-3 bg-light">
              <Card.Body>
                <Form.Check
                  type="switch"
                  id="useAi"
                  label={
                    <span>
                      <FaRobot className="me-2" />
                      Use AI to Generate Variations
                    </span>
                  }
                  checked={formData.useAi}
                  onChange={(e) => setFormData({ ...formData, useAi: e.target.checked })}
                  disabled={!aiStatus.configured}
                />
                {!aiStatus.configured && !aiStatus.checking && (
                  <small className="text-muted d-block mt-1">
                    AI generation requires OpenAI API key to be configured on the server.
                  </small>
                )}
                {formData.useAi && (
                  <small className="text-muted d-block mt-1">
                    AI will create multiple unique message variations that will be randomly sent to different recipients.
                  </small>
                )}
              </Card.Body>
            </Card>

            {/* AI Prompt Section */}
            {formData.useAi && (
              <Card className="mb-3 border-info">
                <Card.Header className="bg-info text-white">
                  <FaMagic className="me-2" />
                  AI Generation
                </Card.Header>
                <Card.Body>
                  <Form.Group className="mb-3">
                    <Form.Label>AI Prompt</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={formData.aiPrompt}
                      onChange={(e) => setFormData({ ...formData, aiPrompt: e.target.value })}
                      placeholder="Describe the message you want to create. Example: Create professional messages promoting our CRM service for small businesses. Highlight ease of use and affordability."
                    />
                    <Form.Text className="text-muted">
                      Be specific about tone, key points to include, and target audience.
                    </Form.Text>
                  </Form.Group>

                  <div className="d-flex gap-3 align-items-end">
                    <Form.Group style={{ width: '150px' }}>
                      <Form.Label>Variations</Form.Label>
                      <Form.Select
                        value={variationCount}
                        onChange={(e) => setVariationCount(parseInt(e.target.value))}
                      >
                        {VARIATION_COUNTS.map((count) => (
                          <option key={count} value={count}>
                            {count} variations
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>

                    <Button
                      variant="info"
                      onClick={handleGenerateVariations}
                      disabled={generating || !formData.aiPrompt}
                    >
                      {generating ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FaMagic className="me-2" />
                          Generate Variations
                        </>
                      )}
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            )}

            {/* Variations List */}
            {formData.useAi && formData.variations.length > 0 && (
              <Card className="mb-3">
                <Card.Header>
                  Generated Variations ({formData.variations.length})
                </Card.Header>
                <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <Accordion>
                    {formData.variations.map((variation, index) => (
                      <Accordion.Item key={index} eventKey={index.toString()}>
                        <Accordion.Header>
                          <div className="d-flex justify-content-between align-items-center w-100 me-3">
                            <span>
                              Variation {index + 1}
                              {needsSubject && variation.subject && (
                                <small className="text-muted ms-2">- {variation.subject.substring(0, 40)}...</small>
                              )}
                            </span>
                          </div>
                        </Accordion.Header>
                        <Accordion.Body>
                          {needsSubject && (
                            <Form.Group className="mb-3">
                              <Form.Label>Subject</Form.Label>
                              <Form.Control
                                type="text"
                                value={variation.subject || ''}
                                onChange={(e) => updateVariation(index, 'subject', e.target.value)}
                              />
                            </Form.Group>
                          )}
                          <Form.Group className="mb-3">
                            <Form.Label>Message</Form.Label>
                            <Form.Control
                              as="textarea"
                              rows={4}
                              value={variation.body}
                              onChange={(e) => updateVariation(index, 'body', e.target.value)}
                            />
                          </Form.Group>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => removeVariation(index)}
                          >
                            <FaTimes className="me-1" />
                            Remove Variation
                          </Button>
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </Card.Body>
              </Card>
            )}

            {/* Standard Template (non-AI) */}
            {!formData.useAi && (
              <>
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
                    required={!formData.useAi}
                  />
                  <Form.Text className="text-muted">
                    Available variables: {'{{contact.name}}'}, {'{{contact.email}}'}, {'{{contact.phone}}'}, {'{{contact.position}}'}, {'{{lead.company_name}}'}, {'{{lead.website}}'}, {'{{lead.industry}}'}, {'{{current_date}}'}, {'{{unsubscribe_link}}'}
                  </Form.Text>
                </Form.Group>
              </>
            )}
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
