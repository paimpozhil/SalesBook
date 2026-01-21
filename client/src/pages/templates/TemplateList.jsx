import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge } from 'react-bootstrap';
import { FaPlus, FaFileAlt, FaEdit, FaTrash } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CHANNEL_COLORS = {
  EMAIL_SMTP: 'primary',
  EMAIL_API: 'primary',
  SMS: 'success',
  WHATSAPP_WEB: 'success',
  WHATSAPP_BUSINESS: 'success',
  TELEGRAM: 'info',
  VOICE: 'warning',
};

function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Templates</h1>
        <Button variant="primary">
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
            <Button variant="primary">Create Template</Button>
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
                    <Button variant="outline-primary" size="sm" className="me-1">
                      <FaEdit />
                    </Button>
                    <Button variant="outline-danger" size="sm">
                      <FaTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default TemplateList;
