import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Badge, Button, Form, InputGroup, Row, Col } from 'react-bootstrap';
import {
  FaArrowLeft, FaEnvelope, FaPaperPlane, FaUser, FaBuilding,
  FaPhone, FaCheckCircle, FaTimesCircle
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  OPEN: 'success',
  CLOSED: 'secondary',
};

function ConversationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [emailChannels, setEmailChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');

  useEffect(() => {
    fetchConversation();
    fetchMessages();
    fetchEmailChannels();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversation = async () => {
    try {
      const response = await api.get(`/conversations/${id}`);
      setConversation(response.data.data);
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
      if (error.response?.status === 404) {
        toast.error('Conversation not found');
        navigate('/conversations');
      }
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/conversations/${id}/messages?limit=100`);
      setMessages(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailChannels = async () => {
    try {
      const response = await api.get('/channels');
      const channels = response.data.data.filter(
        (ch) => ch.isActive && ['EMAIL_SMTP', 'EMAIL_API'].includes(ch.channelType)
      );
      setEmailChannels(channels);
      if (channels.length > 0) {
        setSelectedChannel(channels[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim() || !selectedChannel) return;

    setSending(true);
    try {
      // Send via channel
      await api.post(`/channels/${selectedChannel}/send`, {
        contactId: conversation.contact.id,
        leadId: conversation.leadId,
        subject: `Re: ${getSubjectFromMessages()}`,
        body: replyContent,
      });

      toast.success('Reply sent');
      setReplyContent('');

      // Refresh messages
      setTimeout(() => {
        fetchMessages();
      }, 1000);
    } catch (error) {
      console.error('Failed to send reply:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const getSubjectFromMessages = () => {
    // Find the first message with a subject
    const msgWithSubject = messages.find((m) => m.metadata?.subject);
    return msgWithSubject?.metadata?.subject || 'Conversation';
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const response = await api.patch(`/conversations/${id}`, { status: newStatus });
      setConversation(response.data.data);
      toast.success(`Conversation ${newStatus === 'CLOSED' ? 'closed' : 'reopened'}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const formatMessageDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading && !conversation) {
    return <LoadingSpinner />;
  }

  if (!conversation) {
    return (
      <div className="text-center py-5">
        <h3>Conversation not found</h3>
        <Button as={Link} to="/conversations" variant="primary">
          Back to Conversations
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" as={Link} to="/conversations">
            <FaArrowLeft />
          </Button>
          <div>
            <h1 className="mb-0">
              <FaEnvelope className="me-2" />
              {conversation.contact?.name || conversation.contact?.email || 'Conversation'}
            </h1>
            <span className="text-muted">{getSubjectFromMessages()}</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Badge bg={STATUS_COLORS[conversation.status]} className="py-2 px-3">
            {conversation.status}
          </Badge>
          {conversation.status === 'OPEN' ? (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => handleStatusChange('CLOSED')}
            >
              Close
            </Button>
          ) : (
            <Button
              variant="outline-success"
              size="sm"
              onClick={() => handleStatusChange('OPEN')}
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      <Row className="g-4">
        <Col lg={8}>
          <Card className="h-100">
            <Card.Header>
              <strong>Messages</strong>
            </Card.Header>
            <Card.Body
              className="p-3"
              style={{ height: '500px', overflowY: 'auto', backgroundColor: '#f8f9fa' }}
            >
              {messages.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <FaEnvelope size={32} className="mb-2" />
                  <p>No messages yet</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`d-flex ${message.direction === 'OUTBOUND' ? 'justify-content-end' : 'justify-content-start'}`}
                    >
                      <div
                        className={`p-3 rounded-3 ${
                          message.direction === 'OUTBOUND'
                            ? 'bg-primary text-white'
                            : 'bg-white border'
                        }`}
                        style={{ maxWidth: '75%' }}
                      >
                        {message.metadata?.subject && (
                          <div
                            className={`small fw-bold mb-2 pb-2 border-bottom ${
                              message.direction === 'OUTBOUND' ? 'border-light' : ''
                            }`}
                          >
                            {message.metadata.subject}
                          </div>
                        )}
                        <div
                          className="message-content"
                          dangerouslySetInnerHTML={{ __html: message.content }}
                          style={{ wordBreak: 'break-word' }}
                        />
                        <div
                          className={`small mt-2 ${
                            message.direction === 'OUTBOUND' ? 'text-white-50' : 'text-muted'
                          }`}
                        >
                          {message.direction === 'INBOUND' && message.metadata?.fromName && (
                            <span className="me-2">{message.metadata.fromName}</span>
                          )}
                          {formatMessageDate(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </Card.Body>
            <Card.Footer className="bg-white">
              <Form onSubmit={handleSendReply}>
                {emailChannels.length === 0 ? (
                  <div className="text-center text-muted py-2">
                    No email channel configured.{' '}
                    <Link to="/channels">Configure one</Link> to send replies.
                  </div>
                ) : (
                  <>
                    <Form.Group className="mb-2">
                      <Form.Select
                        size="sm"
                        value={selectedChannel}
                        onChange={(e) => setSelectedChannel(e.target.value)}
                        style={{ width: '200px' }}
                      >
                        {emailChannels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                    <InputGroup>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        placeholder="Type your reply..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        disabled={sending}
                      />
                      <Button
                        variant="primary"
                        type="submit"
                        disabled={sending || !replyContent.trim()}
                      >
                        {sending ? '...' : <FaPaperPlane />}
                      </Button>
                    </InputGroup>
                    <Form.Text className="text-muted">
                      Reply will be sent to {conversation.contact?.email}
                    </Form.Text>
                  </>
                )}
              </Form>
            </Card.Footer>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="mb-4">
            <Card.Header>Contact Info</Card.Header>
            <Card.Body>
              <div className="mb-3">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <FaUser className="text-muted" />
                  <strong>{conversation.contact?.name || 'Unknown'}</strong>
                </div>
                {conversation.contact?.email && (
                  <a href={`mailto:${conversation.contact.email}`} className="text-muted small">
                    <FaEnvelope className="me-1" />
                    {conversation.contact.email}
                  </a>
                )}
                {conversation.contact?.phone && (
                  <div className="text-muted small">
                    <FaPhone className="me-1" />
                    {conversation.contact.phone}
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>

          {conversation.lead && (
            <Card>
              <Card.Header>Lead Info</Card.Header>
              <Card.Body>
                <div className="d-flex align-items-center gap-2">
                  <FaBuilding className="text-muted" />
                  <Link to={`/leads/${conversation.lead.id}`}>
                    {conversation.lead.companyName}
                  </Link>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}

export default ConversationDetail;
