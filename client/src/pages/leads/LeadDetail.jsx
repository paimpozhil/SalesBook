import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Row, Col, Badge, Button, Tab, Tabs, ListGroup, Modal, Form } from 'react-bootstrap';
import {
  FaArrowLeft, FaEdit, FaTrash, FaEnvelope, FaPhone, FaGlobe, FaBuilding, FaPlus, FaStickyNote,
  FaPaperPlane, FaEnvelopeOpen, FaMousePointer, FaReply, FaComments, FaBullhorn, FaUserPlus, FaHistory,
  FaWhatsapp
} from 'react-icons/fa';
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

const EMPTY_CONTACT = { name: '', email: '', phone: '', position: '', isPrimary: false };

// Activity type icons and colors
const ACTIVITY_CONFIG = {
  LEAD_CREATED: { icon: FaUserPlus, color: 'success', label: 'Lead Created' },
  CONTACT_ATTEMPT: { icon: FaPaperPlane, color: 'primary', label: 'Message Sent' },
  EMAIL_OPENED: { icon: FaEnvelopeOpen, color: 'info', label: 'Email Opened' },
  EMAIL_CLICKED: { icon: FaMousePointer, color: 'warning', label: 'Link Clicked' },
  EMAIL_REPLIED: { icon: FaReply, color: 'success', label: 'Replied' },
  CONVERSATION_STARTED: { icon: FaComments, color: 'primary', label: 'Conversation Started' },
  NOTE_ADDED: { icon: FaStickyNote, color: 'secondary', label: 'Note Added' },
  CAMPAIGN_ENROLLED: { icon: FaBullhorn, color: 'info', label: 'Added to Campaign' },
};

// Get icon based on channel type for contact attempts
const getContactAttemptIcon = (channelType) => {
  switch (channelType) {
    case 'EMAIL_SMTP':
    case 'EMAIL_API':
      return { icon: FaEnvelope, color: 'primary', label: 'Email Sent' };
    case 'WHATSAPP_BUSINESS':
    case 'WHATSAPP_WEB':
      return { icon: FaWhatsapp, color: 'success', label: 'WhatsApp Sent' };
    case 'VOICE':
      return { icon: FaPhone, color: 'warning', label: 'Call Made' };
    case 'SMS':
      return { icon: FaComments, color: 'info', label: 'SMS Sent' };
    default:
      return { icon: FaPaperPlane, color: 'primary', label: 'Message Sent' };
  }
};

function ActivityItem({ activity }) {
  // For contact attempts, use channel-specific icon
  const config = activity.type === 'CONTACT_ATTEMPT' && activity.data?.channelType
    ? getContactAttemptIcon(activity.data.channelType)
    : ACTIVITY_CONFIG[activity.type] || { icon: FaHistory, color: 'secondary', label: activity.type };
  const Icon = config.icon;

  const renderDescription = () => {
    const { data, type } = activity;

    switch (type) {
      case 'LEAD_CREATED':
        return (
          <>
            Lead created{data.createdBy?.name && ` by ${data.createdBy.name}`}
            {data.source?.name && <span className="text-muted"> from {data.source.name}</span>}
          </>
        );
      case 'CONTACT_ATTEMPT':
        return (
          <>
            {data.direction === 'OUTBOUND' ? 'Sent' : 'Received'} {data.channelType?.toLowerCase()} to{' '}
            <strong>{data.contact?.name || data.contact?.email || 'contact'}</strong>
            {data.subject && <div className="text-muted small mt-1">"{data.subject}"</div>}
            {data.campaign && <Badge bg="light" text="dark" className="ms-2">{data.campaign.name}</Badge>}
            <div className="mt-1">
              <Badge bg={data.status === 'SENT' ? 'success' : data.status === 'FAILED' ? 'danger' : 'secondary'} className="me-1">
                {data.status}
              </Badge>
            </div>
          </>
        );
      case 'EMAIL_OPENED':
        return (
          <>
            <strong>{data.contact?.name || data.contact?.email}</strong> opened email
            {data.subject && <span className="text-muted"> "{data.subject}"</span>}
          </>
        );
      case 'EMAIL_CLICKED':
        return (
          <>
            <strong>{data.contact?.name || data.contact?.email}</strong> clicked a link
            {data.subject && <span className="text-muted"> in "{data.subject}"</span>}
          </>
        );
      case 'EMAIL_REPLIED':
        return (
          <>
            <strong>{data.contact?.name || data.contact?.email}</strong> replied
            {data.subject && <span className="text-muted"> to "{data.subject}"</span>}
          </>
        );
      case 'CONVERSATION_STARTED':
        return (
          <>
            Conversation started with <strong>{data.contact?.name || data.contact?.email}</strong>
            <span className="text-muted"> via {data.channelType?.toLowerCase()}</span>
            {data.messageCount > 0 && <Badge bg="light" text="dark" className="ms-2">{data.messageCount} messages</Badge>}
          </>
        );
      case 'NOTE_ADDED':
        return (
          <>
            {data.createdBy?.name || 'Someone'} added a note
            <div className="text-muted small mt-1" style={{ whiteSpace: 'pre-wrap' }}>{data.content}</div>
          </>
        );
      case 'CAMPAIGN_ENROLLED':
        return (
          <>
            Added to campaign <strong>{data.campaign?.name}</strong>
            <Badge bg={data.status === 'ACTIVE' ? 'success' : 'secondary'} className="ms-2">{data.status}</Badge>
          </>
        );
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div className="d-flex gap-3 mb-3 pb-3 border-bottom">
      <div
        className={`rounded-circle d-flex align-items-center justify-content-center bg-${config.color} bg-opacity-10`}
        style={{ width: 40, height: 40, minWidth: 40 }}
      >
        <Icon className={`text-${config.color}`} />
      </div>
      <div className="flex-grow-1">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <strong className="d-block">{config.label}</strong>
            <div className="small">{renderDescription()}</div>
          </div>
          <small className="text-muted text-nowrap ms-2">
            {new Date(activity.timestamp).toLocaleString()}
          </small>
        </div>
      </div>
    </div>
  );
}

function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteContent, setNoteContent] = useState('');

  // Activity state
  const [activities, setActivities] = useState([]);
  const [activitySummary, setActivitySummary] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Email state
  const [emailChannels, setEmailChannels] = useState([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(null);
  const [emailForm, setEmailForm] = useState({ channelId: '', subject: '', body: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  // WhatsApp state
  const [whatsappChannels, setWhatsappChannels] = useState([]);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [whatsappRecipient, setWhatsappRecipient] = useState(null);
  const [whatsappForm, setWhatsappForm] = useState({ channelId: '', body: '' });
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  // Voice call state
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callRecipient, setCallRecipient] = useState(null);
  const [callForm, setCallForm] = useState({ channelId: '', body: '' });
  const [makingCall, setMakingCall] = useState(false);

  useEffect(() => {
    fetchLead();
    fetchNotes();
    fetchActivity();
    fetchEmailChannels();
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

  const fetchNotes = async () => {
    try {
      const response = await api.get(`/notes/lead/${id}`);
      setNotes(response.data.data);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    }
  };

  const fetchActivity = async () => {
    setLoadingActivity(true);
    try {
      const response = await api.get(`/activity/lead/${id}`);
      setActivities(response.data.data.activities);
      setActivitySummary(response.data.data.summary);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const fetchEmailChannels = async () => {
    try {
      const response = await api.get('/channels');
      const channels = response.data.data.filter((ch) => ch.isActive);
      setEmailChannels(channels.filter((ch) => ['EMAIL_SMTP', 'EMAIL_API'].includes(ch.channelType)));
      setWhatsappChannels(channels.filter((ch) => ch.channelType === 'WHATSAPP_BUSINESS'));
      setVoiceChannels(channels.filter((ch) => ch.channelType === 'VOICE'));
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  const openEmailModal = (contact) => {
    if (!contact.email) {
      toast.error('Contact has no email address');
      return;
    }
    if (emailChannels.length === 0) {
      toast.error('No email channel configured. Go to Channels to set up SMTP.');
      return;
    }
    setEmailRecipient(contact);
    setEmailForm({
      channelId: emailChannels[0]?.id || '',
      subject: '',
      body: '',
    });
    setShowEmailModal(true);
  };

  const closeEmailModal = () => {
    setShowEmailModal(false);
    setEmailRecipient(null);
    setEmailForm({ channelId: '', subject: '', body: '' });
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailForm.channelId || !emailForm.subject || !emailForm.body) {
      toast.error('Please fill in all fields');
      return;
    }

    setSendingEmail(true);
    try {
      await api.post(`/channels/${emailForm.channelId}/send`, {
        contactId: emailRecipient.id,
        leadId: parseInt(id),
        subject: emailForm.subject,
        body: emailForm.body,
      });
      toast.success(`Email sent to ${emailRecipient.email}`);
      closeEmailModal();
      fetchActivity();
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  };

  const openWhatsappModal = (contact) => {
    if (!contact.phone) {
      toast.error('Contact has no phone number');
      return;
    }
    if (whatsappChannels.length === 0) {
      toast.error('No WhatsApp channel configured. Go to Channels to set up WhatsApp Business API.');
      return;
    }
    setWhatsappRecipient(contact);
    setWhatsappForm({
      channelId: whatsappChannels[0]?.id || '',
      body: '',
    });
    setShowWhatsappModal(true);
  };

  const closeWhatsappModal = () => {
    setShowWhatsappModal(false);
    setWhatsappRecipient(null);
    setWhatsappForm({ channelId: '', body: '' });
  };

  const handleSendWhatsapp = async (e) => {
    e.preventDefault();
    if (!whatsappForm.channelId || !whatsappForm.body) {
      toast.error('Please fill in all fields');
      return;
    }

    setSendingWhatsapp(true);
    try {
      await api.post(`/channels/${whatsappForm.channelId}/send`, {
        contactId: whatsappRecipient.id,
        leadId: parseInt(id),
        body: whatsappForm.body,
      });
      toast.success(`WhatsApp message sent to ${whatsappRecipient.phone}`);
      closeWhatsappModal();
      fetchActivity();
    } catch (error) {
      console.error('Failed to send WhatsApp:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to send WhatsApp message');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const openCallModal = (contact) => {
    if (!contact.phone) {
      toast.error('Contact has no phone number');
      return;
    }
    if (voiceChannels.length === 0) {
      toast.error('No voice channel configured. Go to Channels to set up Twilio Voice.');
      return;
    }
    setCallRecipient(contact);
    setCallForm({
      channelId: voiceChannels[0]?.id || '',
      body: '',
    });
    setShowCallModal(true);
  };

  const closeCallModal = () => {
    setShowCallModal(false);
    setCallRecipient(null);
    setCallForm({ channelId: '', body: '' });
  };

  const handleMakeCall = async (e) => {
    e.preventDefault();
    if (!callForm.channelId) {
      toast.error('Please select a channel');
      return;
    }

    setMakingCall(true);
    try {
      await api.post(`/channels/${callForm.channelId}/send`, {
        contactId: callRecipient.id,
        leadId: parseInt(id),
        body: callForm.body || '',
      });
      toast.success(`Call initiated to ${callRecipient.phone}`);
      closeCallModal();
      fetchActivity();
    } catch (error) {
      console.error('Failed to make call:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to initiate call');
    } finally {
      setMakingCall(false);
    }
  };

  const openNoteModal = (note = null) => {
    if (note) {
      setEditingNote(note);
      setNoteContent(note.content);
    } else {
      setEditingNote(null);
      setNoteContent('');
    }
    setShowNoteModal(true);
  };

  const closeNoteModal = () => {
    setShowNoteModal(false);
    setEditingNote(null);
    setNoteContent('');
  };

  const handleNoteSave = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setSaving(true);
    try {
      if (editingNote) {
        await api.patch(`/notes/${editingNote.id}`, { content: noteContent });
        toast.success('Note updated');
      } else {
        await api.post('/notes', { leadId: parseInt(id), content: noteContent });
        toast.success('Note added');
      }
      closeNoteModal();
      fetchNotes();
    } catch (error) {
      console.error('Failed to save note:', error);
      toast.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleNoteDelete = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.delete(`/notes/${noteId}`);
      toast.success('Note deleted');
      fetchNotes();
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
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

  const openContactModal = (contact = null) => {
    if (contact) {
      setEditingContact(contact);
      setContactForm({
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        position: contact.position || '',
        isPrimary: contact.isPrimary || false,
      });
    } else {
      setEditingContact(null);
      setContactForm(EMPTY_CONTACT);
    }
    setShowContactModal(true);
  };

  const closeContactModal = () => {
    setShowContactModal(false);
    setEditingContact(null);
    setContactForm(EMPTY_CONTACT);
  };

  const handleContactSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingContact) {
        await api.patch(`/contacts/${editingContact.id}`, contactForm);
        toast.success('Contact updated');
      } else {
        await api.post('/contacts', { ...contactForm, leadId: parseInt(id) });
        toast.success('Contact added');
      }
      closeContactModal();
      fetchLead();
    } catch (error) {
      console.error('Failed to save contact:', error);
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleContactDelete = async (contactId) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;

    try {
      await api.delete(`/contacts/${contactId}`);
      toast.success('Contact deleted');
      fetchLead();
    } catch (error) {
      console.error('Failed to delete contact:', error);
      toast.error('Failed to delete contact');
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
                <strong className="d-block text-muted small">Industries</strong>
                {lead.industries?.length > 0 ? (
                  <div className="d-flex flex-wrap gap-1">
                    {lead.industries.map((li) => (
                      <Badge key={li.industry.id} bg="info">
                        {li.industry.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  '-'
                )}
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
            <Card.Body>
              <Tabs defaultActiveKey="contacts" className="mb-3">
                <Tab eventKey="contacts" title={`Contacts (${lead.contacts?.length || 0})`}>
                  <div className="d-flex justify-content-end mb-3">
                    <Button variant="outline-primary" size="sm" onClick={() => openContactModal()}>
                      <FaPlus className="me-1" /> Add Contact
                    </Button>
                  </div>
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
                            <div className="d-flex gap-1">
                              {contact.email && (
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  onClick={() => openEmailModal(contact)}
                                  title="Send Email"
                                >
                                  <FaEnvelope />
                                </Button>
                              )}
                              {contact.phone && (
                                <>
                                  <Button
                                    variant="outline-success"
                                    size="sm"
                                    onClick={() => openWhatsappModal(contact)}
                                    title="Send WhatsApp"
                                  >
                                    <FaWhatsapp />
                                  </Button>
                                  <Button
                                    variant="outline-warning"
                                    size="sm"
                                    onClick={() => openCallModal(contact)}
                                    title="Make Call"
                                  >
                                    <FaPhone />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                onClick={() => openContactModal(contact)}
                              >
                                <FaEdit />
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => handleContactDelete(contact.id)}
                              >
                                <FaTrash />
                              </Button>
                            </div>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <FaBuilding size={32} className="mb-2" />
                      <p>No contacts added yet</p>
                    </div>
                  )}
                </Tab>

                <Tab eventKey="activity" title={`Activity (${activities.length})`}>
                  {activitySummary && (
                    <div className="d-flex gap-3 mb-3 text-muted small">
                      <span><FaPaperPlane className="me-1" />{activitySummary.totalContactAttempts} emails</span>
                      <span><FaComments className="me-1" />{activitySummary.totalConversations} conversations</span>
                      <span><FaStickyNote className="me-1" />{activitySummary.totalNotes} notes</span>
                      <span><FaBullhorn className="me-1" />{activitySummary.totalCampaigns} campaigns</span>
                    </div>
                  )}
                  {loadingActivity ? (
                    <div className="text-center py-4">Loading activity...</div>
                  ) : activities.length > 0 ? (
                    <div className="activity-timeline">
                      {activities.map((activity, idx) => (
                        <ActivityItem key={`${activity.type}-${idx}`} activity={activity} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <FaHistory size={32} className="mb-2" />
                      <p>No activity yet</p>
                    </div>
                  )}
                </Tab>

                <Tab eventKey="notes" title={`Notes (${notes.length})`}>
                  <div className="d-flex justify-content-end mb-3">
                    <Button variant="outline-primary" size="sm" onClick={() => openNoteModal()}>
                      <FaPlus className="me-1" /> Add Note
                    </Button>
                  </div>
                  {notes.length > 0 ? (
                    <ListGroup variant="flush">
                      {notes.map((note) => (
                        <ListGroup.Item key={note.id} className="px-0">
                          <div className="d-flex justify-content-between align-items-start">
                            <div className="flex-grow-1">
                              <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>{note.content}</p>
                              <small className="text-muted">
                                {note.createdBy?.name || 'Unknown'} - {new Date(note.createdAt).toLocaleString()}
                              </small>
                            </div>
                            <div className="d-flex gap-1 ms-2">
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => openNoteModal(note)}
                              >
                                <FaEdit />
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => handleNoteDelete(note.id)}
                              >
                                <FaTrash />
                              </Button>
                            </div>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <FaStickyNote size={32} className="mb-2" />
                      <p>No notes added yet</p>
                    </div>
                  )}
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal show={showContactModal} onHide={closeContactModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingContact ? 'Edit Contact' : 'Add Contact'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleContactSave}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="text"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Contact name"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="email@example.com"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Phone</Form.Label>
              <Form.Control
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Position</Form.Label>
              <Form.Control
                type="text"
                value={contactForm.position}
                onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })}
                placeholder="e.g., CEO, CTO"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Primary contact"
                checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeContactModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showNoteModal} onHide={closeNoteModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingNote ? 'Edit Note' : 'Add Note'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleNoteSave}>
          <Modal.Body>
            <Form.Group>
              <Form.Label>Note</Form.Label>
              <Form.Control
                as="textarea"
                rows={5}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter your note here..."
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeNoteModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving || !noteContent.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showEmailModal} onHide={closeEmailModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaEnvelope className="me-2" />
            Send Email to {emailRecipient?.name || emailRecipient?.email}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSendEmail}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>To</Form.Label>
              <Form.Control type="text" value={emailRecipient?.email || ''} disabled />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Send via Channel</Form.Label>
              <Form.Select
                value={emailForm.channelId}
                onChange={(e) => setEmailForm({ ...emailForm, channelId: e.target.value })}
                required
              >
                {emailChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.channelType === 'EMAIL_SMTP' ? 'SMTP' : 'API'})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Subject</Form.Label>
              <Form.Control
                type="text"
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                placeholder="Email subject"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Message</Form.Label>
              <Form.Control
                as="textarea"
                rows={8}
                value={emailForm.body}
                onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                placeholder="Write your email message here..."
                required
              />
              <Form.Text className="text-muted">
                You can use HTML for formatting (e.g., &lt;b&gt;bold&lt;/b&gt;, &lt;br&gt; for line breaks)
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeEmailModal}>
              Cancel
            </Button>
            <Button
              variant="success"
              type="submit"
              disabled={sendingEmail || !emailForm.subject || !emailForm.body}
            >
              {sendingEmail ? 'Sending...' : 'Send Email'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showWhatsappModal} onHide={closeWhatsappModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            <FaWhatsapp className="me-2 text-success" />
            Send WhatsApp to {whatsappRecipient?.name || whatsappRecipient?.phone}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSendWhatsapp}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>To</Form.Label>
              <Form.Control type="text" value={whatsappRecipient?.phone || ''} disabled />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Send via Channel</Form.Label>
              <Form.Select
                value={whatsappForm.channelId}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, channelId: e.target.value })}
                required
              >
                {whatsappChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Message</Form.Label>
              <Form.Control
                as="textarea"
                rows={5}
                value={whatsappForm.body}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, body: e.target.value })}
                placeholder="Write your WhatsApp message here..."
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeWhatsappModal}>
              Cancel
            </Button>
            <Button
              variant="success"
              type="submit"
              disabled={sendingWhatsapp || !whatsappForm.body}
            >
              {sendingWhatsapp ? 'Sending...' : 'Send WhatsApp'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showCallModal} onHide={closeCallModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            <FaPhone className="me-2 text-warning" />
            Call {callRecipient?.name || callRecipient?.phone}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleMakeCall}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>To</Form.Label>
              <Form.Control type="text" value={callRecipient?.phone || ''} disabled />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Call via Channel</Form.Label>
              <Form.Select
                value={callForm.channelId}
                onChange={(e) => setCallForm({ ...callForm, channelId: e.target.value })}
                required
              >
                {voiceChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Message to Speak (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={callForm.body}
                onChange={(e) => setCallForm({ ...callForm, body: e.target.value })}
                placeholder="Leave empty to just ring, or enter a message to be spoken..."
              />
              <Form.Text className="text-muted">
                If provided, this text will be read aloud when the call is answered.
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeCallModal}>
              Cancel
            </Button>
            <Button
              variant="warning"
              type="submit"
              disabled={makingCall}
            >
              {makingCall ? 'Calling...' : 'Call Now'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default LeadDetail;
