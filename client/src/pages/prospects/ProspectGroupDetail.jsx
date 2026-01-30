import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Form, Row, Col, Pagination, Modal } from 'react-bootstrap';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FaTelegram, FaArrowLeft, FaSync, FaUserPlus, FaComments, FaUser, FaExternalLinkAlt } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  PENDING: 'secondary',
  MESSAGED: 'info',
  REPLIED: 'success',
  CONVERTED: 'primary',
};

function ProspectGroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [converting, setConverting] = useState(null);
  const [polling, setPolling] = useState(false);

  // Messages modal
  const [showMessages, setShowMessages] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetchGroup();
    fetchProspects();
  }, [groupId]);

  useEffect(() => {
    fetchProspects();
  }, [pagination.page, statusFilter, search]);

  const fetchGroup = async () => {
    try {
      const response = await api.get(`/telegram-prospects/groups/${groupId}`);
      setGroup(response.data.data);
    } catch (error) {
      console.error('Failed to fetch group:', error);
      toast.error('Failed to load prospect group');
      navigate('/prospects');
    }
  };

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());
      if (statusFilter) params.append('status', statusFilter);
      if (search) params.append('search', search);

      const response = await api.get(`/telegram-prospects/groups/${groupId}/prospects?${params.toString()}`);
      setProspects(response.data.data);
      if (response.data.meta?.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.meta.pagination }));
      }
    } catch (error) {
      console.error('Failed to fetch prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToLead = async (prospectId) => {
    setConverting(prospectId);
    try {
      const response = await api.post(`/telegram-prospects/${prospectId}/convert`);
      toast.success('Prospect converted to lead!');
      fetchProspects();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to convert prospect');
    } finally {
      setConverting(null);
    }
  };

  const handlePollReplies = async () => {
    if (!group?.channelConfigId) return;

    setPolling(true);
    try {
      const response = await api.post('/telegram-prospects/poll-replies', {
        channelConfigId: group.channelConfigId,
      });
      const result = response.data.data;
      const { repliesFound, prospectsChecked, results, errors } = result;

      if (repliesFound > 0) {
        toast.success(`Found ${repliesFound} new replies!`);
        // Show details of who replied
        results?.forEach(r => {
          toast.success(`${r.prospectName} replied: "${r.replyText?.substring(0, 50)}..."`, { duration: 5000 });
        });
        fetchProspects();
      } else if (prospectsChecked === 0) {
        toast('No MESSAGED prospects to check', { icon: 'ℹ️' });
      } else {
        toast(`Checked ${prospectsChecked} prospects - no new replies`, { icon: 'ℹ️' });
      }

      // Show any errors
      if (errors?.length > 0) {
        console.error('Poll errors:', errors);
        toast.error(`${errors.length} prospects had errors checking replies`);
      }
    } catch (error) {
      console.error('Poll failed:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to poll replies');
    } finally {
      setPolling(false);
    }
  };

  const handleViewMessages = async (prospect) => {
    setSelectedProspect(prospect);
    setShowMessages(true);
    setLoadingMessages(true);

    try {
      const response = await api.get(`/telegram-prospects/${prospect.id}/messages`);
      setMessages(response.data.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  const renderPagination = () => {
    const { page, totalPages } = pagination;
    if (totalPages <= 1) return null;

    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    items.push(
      <Pagination.First key="first" onClick={() => handlePageChange(1)} disabled={page === 1} />,
      <Pagination.Prev key="prev" onClick={() => handlePageChange(page - 1)} disabled={page === 1} />
    );

    for (let i = start; i <= end; i++) {
      items.push(
        <Pagination.Item key={i} active={i === page} onClick={() => handlePageChange(i)}>
          {i}
        </Pagination.Item>
      );
    }

    items.push(
      <Pagination.Next key="next" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} />,
      <Pagination.Last key="last" onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} />
    );

    return <Pagination className="mb-0">{items}</Pagination>;
  };

  if (!group && loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <Link to="/prospects" className="text-decoration-none">
          <FaArrowLeft className="me-2" />
          Back to Prospect Groups
        </Link>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">
            <FaTelegram className="me-2 text-primary" />
            {group?.name}
          </h2>
          <p className="text-muted mb-0">
            <small>
              From: {group?.telegramGroupName || 'Unknown'} |{' '}
              Channel: {group?.channelConfig?.name || '-'} |{' '}
              {pagination.total} prospects
            </small>
          </p>
        </div>
        <Button variant="outline-primary" onClick={handlePollReplies} disabled={polling}>
          <FaSync className={`me-2 ${polling ? 'fa-spin' : ''}`} />
          {polling ? 'Checking...' : 'Check for Replies'}
        </Button>
      </div>

      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col md={4}>
              <Form.Group>
                <Form.Label>Search</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Search by name or username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchProspects()}
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Status</Form.Label>
                <Form.Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="MESSAGED">Messaged</option>
                  <option value="REPLIED">Replied</option>
                  <option value="CONVERTED">Converted</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={2}>
              <Button variant="primary" onClick={() => fetchProspects()}>
                Filter
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <LoadingSpinner />
            </div>
          ) : prospects.length === 0 ? (
            <div className="text-center py-5">
              <FaUser className="text-muted mb-3" size={48} />
              <p className="text-muted">No prospects found</p>
            </div>
          ) : (
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Last Activity</th>
                  <th style={{ width: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((prospect) => (
                  <tr key={prospect.id}>
                    <td>
                      <strong>
                        {[prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '-'}
                      </strong>
                    </td>
                    <td>
                      {prospect.username ? (
                        <a
                          href={`https://t.me/${prospect.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-decoration-none"
                        >
                          @{prospect.username}
                          <FaExternalLinkAlt className="ms-1" size={10} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{prospect.phone || '-'}</td>
                    <td>
                      <Badge bg={STATUS_COLORS[prospect.status]}>
                        {prospect.status}
                      </Badge>
                    </td>
                    <td>
                      <small className="text-muted">
                        {prospect.lastRepliedAt ? (
                          <>Replied: {new Date(prospect.lastRepliedAt).toLocaleDateString()}</>
                        ) : prospect.lastMessagedAt ? (
                          <>Messaged: {new Date(prospect.lastMessagedAt).toLocaleDateString()}</>
                        ) : (
                          'No activity'
                        )}
                      </small>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => handleViewMessages(prospect)}
                          title="View Messages"
                        >
                          <FaComments />
                        </Button>
                        {prospect.status === 'CONVERTED' ? (
                          <Link
                            to={`/leads/${prospect.convertedLeadId}`}
                            className="btn btn-outline-primary btn-sm"
                            title="View Lead"
                          >
                            <FaUser />
                          </Link>
                        ) : (
                          <Button
                            variant="outline-success"
                            size="sm"
                            onClick={() => handleConvertToLead(prospect.id)}
                            disabled={converting === prospect.id}
                            title="Convert to Lead"
                          >
                            {converting === prospect.id ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <FaUserPlus />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {pagination.totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <small className="text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </small>
            {renderPagination()}
          </Card.Footer>
        )}
      </Card>

      {/* Messages Modal */}
      <Modal show={showMessages} onHide={() => setShowMessages(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaComments className="me-2" />
            Messages - {selectedProspect && [selectedProspect.firstName, selectedProspect.lastName].filter(Boolean).join(' ')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loadingMessages ? (
            <div className="text-center py-4">
              <LoadingSpinner />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-muted text-center py-4">No messages yet</p>
          ) : (
            <div className="d-flex flex-column gap-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded ${
                    msg.direction === 'OUTBOUND'
                      ? 'bg-primary text-white ms-auto'
                      : 'bg-light me-auto'
                  }`}
                  style={{ maxWidth: '80%' }}
                >
                  <p className="mb-1">{msg.content}</p>
                  <small className={msg.direction === 'OUTBOUND' ? 'text-white-50' : 'text-muted'}>
                    {msg.direction === 'OUTBOUND' ? 'Sent' : 'Received'} -{' '}
                    {new Date(msg.createdAt).toLocaleString()}
                  </small>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMessages(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default ProspectGroupDetail;
