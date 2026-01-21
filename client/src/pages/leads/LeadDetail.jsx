import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Row, Col, Badge, Button, Tab, Tabs, ListGroup } from 'react-bootstrap';
import { FaArrowLeft, FaEdit, FaTrash, FaEnvelope, FaPhone, FaGlobe, FaBuilding } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  NEW: 'primary',
  CONTACTED: 'warning',
  QUALIFIED: 'success',
  NEGOTIATION: 'info',
  CONVERTED: 'success',
  LOST: 'danger',
};

const SIZE_LABELS = {
  MICRO: '1-10 employees',
  SMALL: '11-50 employees',
  MEDIUM: '51-200 employees',
  LARGE: '201-1000 employees',
  ENTERPRISE: '1000+ employees',
};

function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLead();
  }, [id]);

  const fetchLead = async () => {
    try {
      const response = await api.get(`/leads/${id}`);
      setLead(response.data.data);
    } catch (error) {
      console.error('Failed to fetch lead:', error);
      if (error.response?.status === 404) {
        navigate('/leads');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;

    try {
      await api.delete(`/leads/${id}`);
      toast.success('Lead deleted');
      navigate('/leads');
    } catch (error) {
      console.error('Failed to delete lead:', error);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await api.patch(`/leads/${id}`, { status: newStatus });
      setLead({ ...lead, status: newStatus });
      toast.success('Status updated');
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!lead) {
    return (
      <div className="text-center py-5">
        <h3>Lead not found</h3>
        <Button as={Link} to="/leads" variant="primary">
          Back to Leads
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" as={Link} to="/leads">
            <FaArrowLeft />
          </Button>
          <div>
            <h1 className="mb-0">{lead.companyName}</h1>
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-muted">
                <FaGlobe className="me-1" />
                {lead.website}
              </a>
            )}
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-danger" onClick={handleDelete}>
            <FaTrash className="me-2" />
            Delete
          </Button>
        </div>
      </div>

      <Row className="g-4">
        <Col lg={4}>
          <Card className="mb-4">
            <Card.Header>Lead Information</Card.Header>
            <Card.Body>
              <div className="mb-3">
                <strong className="d-block text-muted small">Status</strong>
                <Badge bg={STATUS_COLORS[lead.status]} className="me-2">
                  {lead.status}
                </Badge>
                <div className="btn-group mt-2">
                  {['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST'].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={lead.status === status ? 'primary' : 'outline-secondary'}
                      onClick={() => handleStatusChange(status)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <strong className="d-block text-muted small">Industry</strong>
                {lead.industry || '-'}
              </div>

              <div className="mb-3">
                <strong className="d-block text-muted small">Company Size</strong>
                {lead.size ? SIZE_LABELS[lead.size] : '-'}
              </div>

              <div className="mb-3">
                <strong className="d-block text-muted small">Source</strong>
                {lead.source?.name || 'Manual'}
              </div>

              <div className="mb-3">
                <strong className="d-block text-muted small">Tags</strong>
                {lead.tags?.length > 0 ? (
                  <div className="d-flex flex-wrap gap-1">
                    {lead.tags.map((tag, idx) => (
                      <Badge key={idx} bg="secondary">{tag}</Badge>
                    ))}
                  </div>
                ) : (
                  '-'
                )}
              </div>

              <div className="mb-3">
                <strong className="d-block text-muted small">Created</strong>
                {new Date(lead.createdAt).toLocaleString()}
              </div>

              {lead.createdBy && (
                <div className="mb-3">
                  <strong className="d-block text-muted small">Created By</strong>
                  {lead.createdBy.name}
                </div>
              )}
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>Activity</Card.Header>
            <Card.Body>
              <div className="text-center text-muted py-3">
                <p className="mb-2">
                  {lead._count?.contactAttempts || 0} contact attempts
                </p>
                <p className="mb-0">
                  {lead._count?.conversations || 0} conversations
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card>
            <Card.Header>
              <Tabs defaultActiveKey="contacts" className="card-header-tabs">
                <Tab eventKey="contacts" title={`Contacts (${lead.contacts?.length || 0})`} />
                <Tab eventKey="activity" title="Activity" />
                <Tab eventKey="notes" title="Notes" />
              </Tabs>
            </Card.Header>
            <Card.Body>
              <Tabs defaultActiveKey="contacts">
                <Tab eventKey="contacts" title="">
                  {lead.contacts?.length > 0 ? (
                    <ListGroup variant="flush">
                      {lead.contacts.map((contact) => (
                        <ListGroup.Item key={contact.id} className="px-0">
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <strong>
                                {contact.name || 'Unnamed Contact'}
                                {contact.isPrimary && (
                                  <Badge bg="primary" className="ms-2">Primary</Badge>
                                )}
                              </strong>
                              {contact.position && (
                                <div className="text-muted small">{contact.position}</div>
                              )}
                              <div className="mt-2">
                                {contact.email && (
                                  <a href={`mailto:${contact.email}`} className="me-3">
                                    <FaEnvelope className="me-1" />
                                    {contact.email}
                                  </a>
                                )}
                                {contact.phone && (
                                  <a href={`tel:${contact.phone}`}>
                                    <FaPhone className="me-1" />
                                    {contact.phone}
                                  </a>
                                )}
                              </div>
                            </div>
                            <Button variant="outline-primary" size="sm">
                              <FaEdit />
                            </Button>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <FaBuilding size={32} className="mb-2" />
                      <p>No contacts added yet</p>
                      <Button variant="outline-primary" size="sm">
                        Add Contact
                      </Button>
                    </div>
                  )}
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default LeadDetail;
