import { useState, useEffect } from 'react';
import { Card, Table, Badge, Button, Form, InputGroup, Row, Col } from 'react-bootstrap';
import { FaComments, FaEnvelope, FaWhatsapp, FaSms, FaPhone, FaSearch, FaEye, FaFilter } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CHANNEL_ICONS = {
  EMAIL_SMTP: FaEnvelope,
  EMAIL_API: FaEnvelope,
  WHATSAPP_BUSINESS: FaWhatsapp,
  SMS: FaSms,
  VOICE: FaPhone,
};

const STATUS_COLORS = {
  OPEN: 'success',
  CLOSED: 'secondary',
};

function ConversationList() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', leadId: '', search: '' });

  // Lead autocomplete state
  const [leadSearch, setLeadSearch] = useState('');
  const [leadSuggestions, setLeadSuggestions] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [pagination.page, filters.status, filters.leadId]);

  // Debounced lead search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (leadSearch.trim().length >= 2) {
        searchLeads(leadSearch);
      } else {
        setLeadSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearch]);

  const searchLeads = async (query) => {
    setSearchingLeads(true);
    try {
      const response = await api.get(`/leads?search=${encodeURIComponent(query)}&limit=10`);
      setLeadSuggestions(response.data.data || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to search leads:', error);
    } finally {
      setSearchingLeads(false);
    }
  };

  const handleSelectLead = (lead) => {
    setSelectedLead(lead);
    setLeadSearch(lead.companyName);
    setFilters({ ...filters, leadId: lead.id.toString() });
    setPagination((prev) => ({ ...prev, page: 1 }));
    setShowSuggestions(false);
  };

  const clearLeadFilter = () => {
    setSelectedLead(null);
    setLeadSearch('');
    setFilters({ ...filters, leadId: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
      });
      if (filters.status) params.append('status', filters.status);
      if (filters.leadId) params.append('leadId', filters.leadId);

      const response = await api.get(`/conversations?${params}`);
      setConversations(response.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.meta?.pagination?.total || 0,
        totalPages: response.data.meta?.pagination?.totalPages || 1,
      }));
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const getChannelIcon = (channelType) => {
    const Icon = CHANNEL_ICONS[channelType] || FaComments;
    return <Icon />;
  };

  const truncateContent = (content, maxLength = 60) => {
    if (!content) return 'No message';
    // Strip HTML tags for preview
    const text = content.replace(/<[^>]*>/g, '');
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading && conversations.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            <FaComments className="me-2" />
            Conversations
          </h1>
          <p className="text-muted mb-0">View email threads and messages with your contacts</p>
        </div>
      </div>

      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <Form.Select
                size="sm"
                style={{ width: '130px' }}
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <option value="">All Status</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </Form.Select>
              <div style={{ position: 'relative', width: '220px' }}>
                <InputGroup size="sm">
                  <InputGroup.Text>
                    <FaSearch size={12} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search lead..."
                    value={leadSearch}
                    onChange={(e) => {
                      setLeadSearch(e.target.value);
                      if (!e.target.value) {
                        clearLeadFilter();
                      }
                    }}
                    onFocus={() => leadSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  {selectedLead && (
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={clearLeadFilter}
                      style={{ borderLeft: 'none' }}
                    >
                      &times;
                    </Button>
                  )}
                </InputGroup>
                {showSuggestions && leadSuggestions.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'white',
                      border: '1px solid #dee2e6',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {leadSuggestions.map((lead) => (
                      <div
                        key={lead.id}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                        onMouseDown={() => handleSelectLead(lead)}
                        onMouseEnter={(e) => (e.target.style.backgroundColor = '#f8f9fa')}
                        onMouseLeave={(e) => (e.target.style.backgroundColor = 'white')}
                      >
                        <div style={{ fontWeight: 500 }}>{lead.companyName}</div>
                        {lead.industry && (
                          <small className="text-muted">{lead.industry}</small>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {searchingLeads && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'white',
                      border: '1px solid #dee2e6',
                      borderRadius: '0.25rem',
                      padding: '8px 12px',
                      zIndex: 1000,
                    }}
                  >
                    <small className="text-muted">Searching...</small>
                  </div>
                )}
              </div>
              {(filters.status || filters.leadId) && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    setFilters({ status: '', leadId: '', search: '' });
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    setSelectedLead(null);
                    setLeadSearch('');
                  }}
                >
                  Clear All
                </Button>
              )}
            </div>
            <span className="text-muted small">{pagination.total} conversations</span>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {conversations.length === 0 ? (
            <div className="text-center py-5">
              <FaComments size={48} className="text-muted mb-3" />
              <h5>No conversations yet</h5>
              <p className="text-muted">
                Conversations will appear here when contacts reply to your emails.
              </p>
            </div>
          ) : (
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}></th>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Last Message</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th style={{ width: '100px' }}>Date</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr
                    key={conv.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/conversations/${conv.id}`)}
                  >
                    <td className="text-center text-muted">
                      {getChannelIcon(conv.channelType)}
                    </td>
                    <td>
                      <strong>{conv.contact?.name || 'Unknown'}</strong>
                      <div className="small text-muted">{conv.contact?.email}</div>
                    </td>
                    <td>
                      {conv.lead?.companyName || '-'}
                    </td>
                    <td className="text-muted">
                      {conv.messages?.[0] && (
                        <>
                          {conv.messages[0].direction === 'INBOUND' ? (
                            <Badge bg="info" className="me-1">In</Badge>
                          ) : (
                            <Badge bg="secondary" className="me-1">Out</Badge>
                          )}
                          {truncateContent(conv.messages[0].content)}
                        </>
                      )}
                    </td>
                    <td>
                      <Badge bg={STATUS_COLORS[conv.status]}>{conv.status}</Badge>
                    </td>
                    <td className="text-muted small">
                      {formatDate(conv.lastMessageAt)}
                    </td>
                    <td>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/conversations/${conv.id}`);
                        }}
                      >
                        <FaEye />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {pagination.totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
            >
              Previous
            </Button>
            <span className="text-muted small">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
            </Button>
          </Card.Footer>
        )}
      </Card>
    </div>
  );
}

export default ConversationList;
