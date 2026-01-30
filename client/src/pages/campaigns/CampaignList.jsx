import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Row, Col, ListGroup, Alert, ProgressBar, InputGroup } from 'react-bootstrap';
import { FaPlus, FaBullhorn, FaPlay, FaPause, FaTrash, FaEnvelope, FaWhatsapp, FaPhone, FaUsers, FaUserPlus, FaClock, FaRocket, FaListOl, FaEye, FaSync, FaCheckCircle, FaTimesCircle, FaSpinner, FaFilter, FaSearch, FaBolt, FaTelegram } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
};

const CAMPAIGN_TYPES = [
  {
    value: 'IMMEDIATE',
    label: 'Immediate',
    icon: FaRocket,
    description: 'Send to all recipients right away',
    details: 'All messages will be sent immediately when you start the campaign. Best for announcements or time-sensitive communications.'
  },
  {
    value: 'SCHEDULED',
    label: 'Scheduled',
    icon: FaClock,
    description: 'Schedule for a specific date and time',
    details: 'Messages will be sent at your chosen date and time. Perfect for planning campaigns in advance.'
  },
  {
    value: 'SEQUENCE',
    label: 'Sequence (Drip)',
    icon: FaListOl,
    description: 'Multi-step campaign with delays between steps',
    details: 'Send a series of messages over time. First message sends immediately, then subsequent messages follow your configured delays. Ideal for nurture campaigns.'
  },
];

const CHANNEL_ICONS = {
  EMAIL_SMTP: FaEnvelope,
  EMAIL_API: FaEnvelope,
  WHATSAPP_BUSINESS: FaWhatsapp,
  WHATSAPP_WEB: FaWhatsapp,
  TELEGRAM: FaTelegram,
  VOICE: FaPhone,
};

const EMPTY_FORM = {
  name: '',
  type: 'IMMEDIATE',
  messageIntervalMinutes: 0, // Delay between sending to each recipient (in minutes)
};

const EMPTY_STEP = {
  channelConfigId: '',
  templateId: '',
  delayDays: 0,
  delayHours: 0,
  delayMinutes: 0,
};

function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [steps, setSteps] = useState([{ ...EMPTY_STEP }]);
  const [saving, setSaving] = useState(false);

  // Data for dropdowns
  const [channels, setChannels] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Recipients modal state
  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [addingRecipients, setAddingRecipients] = useState(false);

  // Filter state for recipients
  const [recipientFilters, setRecipientFilters] = useState({
    status: [],
    industryIds: [],
    sourceId: '',
    size: [],
    search: '',
  });
  const [industries, setIndustries] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [filteredLeadsCount, setFilteredLeadsCount] = useState(0);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [useFilters, setUseFilters] = useState(true); // true = filter mode, false = manual selection

  // Existing recipients state
  const [existingRecipients, setExistingRecipients] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [recipientModalTab, setRecipientModalTab] = useState('add'); // 'add', 'existing', or 'prospects'
  const [primaryOnly, setPrimaryOnly] = useState(true); // Default to primary contacts only

  // Prospect groups state (for Telegram campaigns)
  const [prospectGroups, setProspectGroups] = useState([]);
  const [selectedProspectGroups, setSelectedProspectGroups] = useState([]);
  const [loadingProspects, setLoadingProspects] = useState(false);

  // Start campaign modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [campaignToStart, setCampaignToStart] = useState(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [starting, setStarting] = useState(false);

  // Campaign detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [campaignDetail, setCampaignDetail] = useState(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState(null);
  const [campaignRecipients, setCampaignRecipients] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Trigger state
  const [triggering, setTriggering] = useState(null); // campaignId being triggered

  // Pagination and filter state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(''); // Empty means all except COMPLETED
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCampaigns();
    fetchChannelsAndTemplates();
  }, [page, statusFilter]);

  const fetchCampaigns = async () => {
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', limit);
      // By default show all except COMPLETED, or filter by specific status
      if (statusFilter === 'ALL') {
        // Show all campaigns including completed - don't add status filter
      } else if (statusFilter) {
        params.append('status', statusFilter);
      } else {
        // Default: Show DRAFT, ACTIVE, PAUSED (exclude COMPLETED)
        params.append('status', 'DRAFT,ACTIVE,PAUSED');
      }

      const response = await api.get(`/campaigns?${params.toString()}`);
      setCampaigns(response.data.data);
      // Pagination is under meta.pagination in the response
      setTotal(response.data.meta?.pagination?.total || response.data.data.length);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannelsAndTemplates = async () => {
    try {
      const [channelRes, templateRes] = await Promise.all([
        api.get('/channels'),
        api.get('/templates'),
      ]);
      setChannels(channelRes.data.data.filter((ch) => ch.isActive));
      setTemplates(templateRes.data.data);
    } catch (error) {
      console.error('Failed to fetch channels/templates:', error);
    }
  };

  const fetchLeads = async (filters = {}) => {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');

      if (filters.status?.length) params.append('status', filters.status.join(','));
      if (filters.industryIds?.length) params.append('industryId', filters.industryIds.join(','));
      if (filters.sourceId) params.append('sourceId', filters.sourceId);
      if (filters.size?.length) params.append('size', filters.size.join(','));
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/leads?${params.toString()}`);
      setLeads(response.data.data);
      setFilteredLeadsCount(response.data.meta?.pagination?.total || response.data.data.length);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoadingLeads(false);
    }
  };

  const fetchIndustries = async () => {
    try {
      const response = await api.get('/industries');
      setIndustries(response.data.data);
    } catch (error) {
      console.error('Failed to fetch industries:', error);
    }
  };

  const fetchDataSources = async () => {
    try {
      const response = await api.get('/data-sources');
      setDataSources(response.data.data);
    } catch (error) {
      console.error('Failed to fetch data sources:', error);
    }
  };

  const fetchExistingRecipients = async (campaignId) => {
    setLoadingExisting(true);
    try {
      const response = await api.get(`/campaigns/${campaignId}/recipients?limit=100`);
      setExistingRecipients(response.data.data);
    } catch (error) {
      console.error('Failed to fetch existing recipients:', error);
    } finally {
      setLoadingExisting(false);
    }
  };

  const fetchProspectGroups = async () => {
    setLoadingProspects(true);
    try {
      const response = await api.get('/telegram-prospects/groups');
      setProspectGroups(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch prospect groups:', error);
    } finally {
      setLoadingProspects(false);
    }
  };

  // Check if campaign uses TELEGRAM channel
  const campaignUsesTelegram = (campaign) => {
    if (!campaign?.steps) return false;
    return campaign.steps.some(step => {
      // Check channelConfig from step (when full campaign data is loaded)
      if (step.channelConfig?.channelType === 'TELEGRAM') return true;
      // Fallback: check channelType directly on step
      if (step.channelType === 'TELEGRAM') return true;
      // Fallback: look up in channels list
      const channel = channels.find(ch => ch.id === step.channelConfigId);
      return channel?.channelType === 'TELEGRAM';
    });
  };

  const handleRemoveRecipient = async (recipientId) => {
    if (!selectedCampaign) return;
    try {
      await api.delete(`/campaigns/${selectedCampaign.id}/recipients/${recipientId}`);
      toast.success('Recipient removed');
      fetchExistingRecipients(selectedCampaign.id);
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to remove recipient:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to remove recipient');
    }
  };

  const handleClearAllRecipients = async () => {
    if (!selectedCampaign) return;
    if (!window.confirm(`Remove all recipients from "${selectedCampaign.name}"?`)) return;
    try {
      const response = await api.delete(`/campaigns/${selectedCampaign.id}/recipients`);
      toast.success(response.data.data.message || 'All recipients removed');
      setExistingRecipients([]);
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to clear recipients:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to clear recipients');
    }
  };

  const openRecipientsModal = async (campaign) => {
    setSelectedLeads([]);
    setSelectedProspectGroups([]);
    setRecipientFilters({
      status: [],
      industryIds: [],
      sourceId: '',
      size: [],
      search: '',
    });
    setUseFilters(true);
    setRecipientModalTab(campaign._count?.recipients > 0 ? 'existing' : 'add');
    fetchLeads({});
    fetchIndustries();
    fetchDataSources();
    fetchExistingRecipients(campaign.id);

    // Fetch full campaign details to get steps
    try {
      const response = await api.get(`/campaigns/${campaign.id}`);
      const fullCampaign = response.data.data;
      setSelectedCampaign(fullCampaign);

      // Fetch prospect groups for TELEGRAM campaigns
      if (campaignUsesTelegram(fullCampaign)) {
        fetchProspectGroups();
      }
    } catch (error) {
      console.error('Failed to fetch campaign details:', error);
      setSelectedCampaign(campaign); // Fallback to partial data
    }

    setShowRecipientsModal(true);
  };

  const closeRecipientsModal = () => {
    setShowRecipientsModal(false);
    setSelectedCampaign(null);
    setSelectedLeads([]);
    setSelectedProspectGroups([]);
    setProspectGroups([]);
    setExistingRecipients([]);
    setRecipientModalTab('add');
    setRecipientFilters({
      status: [],
      industryIds: [],
      sourceId: '',
      size: [],
      search: '',
    });
  };

  const handleFilterChange = (field, value) => {
    const newFilters = { ...recipientFilters, [field]: value };
    setRecipientFilters(newFilters);
    fetchLeads(newFilters);
  };

  const toggleFilterValue = (field, value) => {
    const currentValues = recipientFilters[field] || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];
    handleFilterChange(field, newValues);
  };

  const clearFilters = () => {
    const emptyFilters = {
      status: [],
      industryIds: [],
      sourceId: '',
      size: [],
      search: '',
    };
    setRecipientFilters(emptyFilters);
    fetchLeads(emptyFilters);
  };

  const hasActiveFilters = () => {
    return (
      recipientFilters.status.length > 0 ||
      recipientFilters.industryIds.length > 0 ||
      recipientFilters.sourceId ||
      recipientFilters.size.length > 0 ||
      recipientFilters.search
    );
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeads((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    );
  };

  const selectAllLeads = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map((l) => l.id));
    }
  };

  const handleAddRecipients = async (useFilterMode = true) => {
    setAddingRecipients(true);
    try {
      let payload = { primaryOnly };

      if (useFilterMode && hasActiveFilters()) {
        // Use filter-based addition
        payload.filters = {
          status: recipientFilters.status.length > 0 ? recipientFilters.status : undefined,
          industryIds: recipientFilters.industryIds.length > 0 ? recipientFilters.industryIds : undefined,
          sourceId: recipientFilters.sourceId ? parseInt(recipientFilters.sourceId) : undefined,
          size: recipientFilters.size.length > 0 ? recipientFilters.size : undefined,
          search: recipientFilters.search || undefined,
        };
      } else if (selectedLeads.length > 0) {
        // Use manual selection
        payload.leadIds = selectedLeads;
      } else if (!hasActiveFilters()) {
        // Add all leads - payload already has primaryOnly
      } else {
        toast.error('Please select leads or set filters');
        setAddingRecipients(false);
        return;
      }

      const response = await api.post(`/campaigns/${selectedCampaign.id}/recipients`, payload);
      toast.success(response.data.data.message || 'Recipients added');
      // Refresh existing recipients and switch to that tab
      fetchExistingRecipients(selectedCampaign.id);
      setRecipientModalTab('existing');
      setSelectedLeads([]);
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to add recipients:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to add recipients');
    } finally {
      setAddingRecipients(false);
    }
  };

  const handleAddProspectRecipients = async () => {
    if (selectedProspectGroups.length === 0) {
      toast.error('Please select at least one prospect group');
      return;
    }

    setAddingRecipients(true);
    try {
      const response = await api.post(`/campaigns/${selectedCampaign.id}/recipients`, {
        prospectGroupIds: selectedProspectGroups,
      });
      toast.success(response.data.data.message || 'Prospect recipients added');
      // Refresh existing recipients and switch to that tab
      fetchExistingRecipients(selectedCampaign.id);
      setRecipientModalTab('existing');
      setSelectedProspectGroups([]);
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to add prospect recipients:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to add prospect recipients');
    } finally {
      setAddingRecipients(false);
    }
  };

  const openModal = () => {
    setFormData(EMPTY_FORM);
    setSteps([{ ...EMPTY_STEP }]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(EMPTY_FORM);
    setSteps([{ ...EMPTY_STEP }]);
  };

  const addStep = () => {
    setSteps([...steps, { ...EMPTY_STEP }]);
  };

  const removeStep = (index) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;

    // Auto-select matching template channel type
    if (field === 'channelConfigId' && value) {
      const channel = channels.find((ch) => ch.id === parseInt(value));
      if (channel) {
        const matchingTemplates = templates.filter((t) => t.channelType === channel.channelType);
        if (matchingTemplates.length === 1) {
          newSteps[index].templateId = matchingTemplates[0].id;
        }
      }
    }

    setSteps(newSteps);
  };

  const getTemplatesForChannel = (channelConfigId) => {
    if (!channelConfigId) return templates;
    const channel = channels.find((ch) => ch.id === parseInt(channelConfigId));
    if (!channel) return templates;
    return templates.filter((t) => t.channelType === channel.channelType);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Please enter a campaign name');
      return;
    }

    const validSteps = steps.filter((s) => s.channelConfigId && s.templateId);
    if (validSteps.length === 0) {
      toast.error('Please add at least one step with channel and template');
      return;
    }

    setSaving(true);
    try {
      await api.post('/campaigns', {
        name: formData.name,
        type: formData.type,
        messageIntervalSeconds: (parseInt(formData.messageIntervalMinutes) || 0) * 60,
        steps: validSteps.map((step) => ({
          channelConfigId: parseInt(step.channelConfigId),
          templateId: parseInt(step.templateId),
          delayDays: parseInt(step.delayDays) || 0,
          delayHours: parseInt(step.delayHours) || 0,
          delayMinutes: parseInt(step.delayMinutes) || 0,
        })),
      });
      toast.success('Campaign created! Now add recipients to start it.');
      closeModal();
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  // Open start confirmation modal
  const openStartModal = (campaign) => {
    if ((campaign._count?.recipients || 0) === 0) {
      toast.error('Please add recipients before starting the campaign');
      openRecipientsModal(campaign);
      return;
    }

    setCampaignToStart(campaign);

    // Set default scheduled time to tomorrow at 9 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setScheduledTime('09:00');

    setShowStartModal(true);
  };

  const closeStartModal = () => {
    setShowStartModal(false);
    setCampaignToStart(null);
    setScheduledDate('');
    setScheduledTime('');
  };

  const handleStartCampaign = async () => {
    if (!campaignToStart) return;

    // For scheduled campaigns, validate date/time
    if (campaignToStart.type === 'SCHEDULED') {
      if (!scheduledDate || !scheduledTime) {
        toast.error('Please select a date and time for the scheduled campaign');
        return;
      }

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }

    setStarting(true);
    try {
      const payload = {};
      if (campaignToStart.type === 'SCHEDULED' && scheduledDate && scheduledTime) {
        payload.scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const response = await api.post(`/campaigns/${campaignToStart.id}/start`, payload);
      toast.success(response.data.data.message || 'Campaign started!');
      closeStartModal();
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to start campaign');
    } finally {
      setStarting(false);
    }
  };

  const handlePause = async (id) => {
    try {
      await api.post(`/campaigns/${id}/pause`);
      toast.success('Campaign paused');
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to pause campaign');
    }
  };

  // Trigger campaign processing immediately
  const handleTrigger = async (id) => {
    setTriggering(id);
    try {
      const response = await api.post(`/campaigns/${id}/trigger`);
      const { processed, message } = response.data.data;
      toast.success(message);
      fetchCampaigns();
      // If detail modal is open, refresh it
      if (showDetailModal && campaignDetail?.id === id) {
        refreshCampaignDetail();
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to trigger campaign');
    } finally {
      setTriggering(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await api.delete(`/campaigns/${id}`);
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete campaign');
    }
  };

  // Campaign Detail Functions
  const openDetailModal = async (campaign) => {
    setShowDetailModal(true);
    setCampaignDetail(campaign);
    setLoadingDetail(true);

    try {
      const [detailRes, analyticsRes, recipientsRes] = await Promise.all([
        api.get(`/campaigns/${campaign.id}`),
        api.get(`/campaigns/${campaign.id}/analytics`),
        api.get(`/campaigns/${campaign.id}/recipients?limit=50`),
      ]);

      setCampaignDetail(detailRes.data.data);
      setCampaignAnalytics(analyticsRes.data.data);
      setCampaignRecipients(recipientsRes.data.data);
    } catch (error) {
      console.error('Failed to fetch campaign details:', error);
      toast.error('Failed to load campaign details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setCampaignDetail(null);
    setCampaignAnalytics(null);
    setCampaignRecipients([]);
  };

  const refreshCampaignDetail = async () => {
    if (!campaignDetail) return;
    setLoadingDetail(true);
    try {
      const [detailRes, analyticsRes, recipientsRes] = await Promise.all([
        api.get(`/campaigns/${campaignDetail.id}`),
        api.get(`/campaigns/${campaignDetail.id}/analytics`),
        api.get(`/campaigns/${campaignDetail.id}/recipients?limit=50`),
      ]);

      setCampaignDetail(detailRes.data.data);
      setCampaignAnalytics(analyticsRes.data.data);
      setCampaignRecipients(recipientsRes.data.data);
      fetchCampaigns(); // Also refresh the list
    } catch (error) {
      console.error('Failed to refresh campaign details:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getRecipientStatusBadge = (status) => {
    const colors = {
      PENDING: 'secondary',
      IN_PROGRESS: 'primary',
      COMPLETED: 'success',
      FAILED: 'danger',
      UNSUBSCRIBED: 'warning',
    };
    return <Badge bg={colors[status] || 'secondary'}>{status}</Badge>;
  };

  const getTypeIcon = (type) => {
    const typeConfig = CAMPAIGN_TYPES.find(t => t.value === type);
    if (typeConfig) {
      const Icon = typeConfig.icon;
      return <Icon className="me-1" />;
    }
    return null;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Campaigns</h1>
        <Button variant="primary" onClick={openModal}>
          <FaPlus className="me-2" />
          Create Campaign
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="align-items-center">
            <Col md={4}>
              <InputGroup size="sm">
                <InputGroup.Text><FaSearch /></InputGroup.Text>
                <Form.Control
                  placeholder="Search campaigns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col md={3}>
              <Form.Select
                size="sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All (except Completed)</option>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="COMPLETED">Completed</option>
                <option value="ALL">All (including Completed)</option>
              </Form.Select>
            </Col>
            <Col md={5} className="text-end">
              <small className="text-muted">
                Showing {campaigns.length} of {total} campaigns
              </small>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        {campaigns.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaBullhorn size={48} className="text-muted mb-3" />
            <h5>No campaigns yet</h5>
            <p className="text-muted">Create your first outreach campaign to start engaging with leads.</p>
            <Button variant="primary" onClick={openModal}>Create Campaign</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Schedule / Progress</th>
                <th>Recipients</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns
                .filter(campaign =>
                  !searchTerm ||
                  campaign.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <strong>{campaign.name}</strong>
                    <br />
                    <small className="text-muted">
                      Created {new Date(campaign.createdAt).toLocaleDateString()}
                    </small>
                  </td>
                  <td>
                    {getTypeIcon(campaign.type)}
                    {campaign.type}
                  </td>
                  <td>
                    <Badge bg={STATUS_COLORS[campaign.status]}>
                      {campaign.status}
                    </Badge>
                  </td>
                  <td>{campaign.createdBy?.name || '-'}</td>
                  <td>
                    {campaign.status === 'DRAFT' && (
                      <span className="text-muted">Not started</span>
                    )}
                    {campaign.status === 'ACTIVE' && campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date() && (
                      <span className="text-info">
                        <FaClock className="me-1" />
                        Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}
                      </span>
                    )}
                    {campaign.status === 'ACTIVE' && (!campaign.scheduledAt || new Date(campaign.scheduledAt) <= new Date()) && (
                      <span className="text-success">
                        <FaSpinner className="me-1 fa-spin" />
                        Running since {campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : 'now'}
                      </span>
                    )}
                    {campaign.status === 'PAUSED' && (
                      <span className="text-warning">Paused</span>
                    )}
                    {campaign.status === 'COMPLETED' && (
                      <span className="text-info">
                        <FaCheckCircle className="me-1" />
                        Completed
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge bg="secondary">{campaign._count?.recipients || 0}</Badge>
                    <small className="text-muted ms-1">
                      ({campaign._count?.steps || 0} steps)
                    </small>
                  </td>
                  <td>
                    <Button
                      variant="outline-info"
                      size="sm"
                      className="me-1"
                      onClick={() => openDetailModal(campaign)}
                      title="View Details"
                    >
                      <FaEye />
                    </Button>
                    {campaign.status === 'DRAFT' && (
                      <>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="me-1"
                          onClick={() => openRecipientsModal(campaign)}
                          title="Add Recipients"
                        >
                          <FaUserPlus />
                        </Button>
                        <Button
                          variant="outline-success"
                          size="sm"
                          className="me-1"
                          onClick={() => openStartModal(campaign)}
                          title="Start Campaign"
                        >
                          <FaPlay />
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDelete(campaign.id)}
                          title="Delete Campaign"
                        >
                          <FaTrash />
                        </Button>
                      </>
                    )}
                    {campaign.status === 'ACTIVE' && (
                      <>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="me-1"
                          onClick={() => handleTrigger(campaign.id)}
                          disabled={triggering === campaign.id}
                          title="Trigger Now - Process pending messages immediately"
                        >
                          {triggering === campaign.id ? (
                            <FaSpinner className="fa-spin" />
                          ) : (
                            <FaBolt />
                          )}
                        </Button>
                        <Button
                          variant="outline-warning"
                          size="sm"
                          onClick={() => handlePause(campaign.id)}
                          title="Pause Campaign"
                        >
                          <FaPause />
                        </Button>
                      </>
                    )}
                    {campaign.status === 'PAUSED' && (
                      <Button
                        variant="outline-success"
                        size="sm"
                        onClick={() => openStartModal(campaign)}
                        title="Resume Campaign"
                      >
                        <FaPlay />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* Pagination */}
        {total > limit && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <div>
              Page {page} of {Math.ceil(total / limit)}
            </div>
            <div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="me-2"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </Card.Footer>
        )}
      </Card>

      {/* Create Campaign Modal */}
      <Modal show={showModal} onHide={closeModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Create Campaign</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Campaign Name</Form.Label>
              <Form.Control
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Welcome Sequence, Follow-up Campaign"
                required
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>Campaign Type</Form.Label>
              <div className="d-flex flex-column gap-2">
                {CAMPAIGN_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <Card
                      key={type.value}
                      className={`cursor-pointer ${formData.type === type.value ? 'border-primary bg-light' : ''}`}
                      onClick={() => setFormData({ ...formData, type: type.value })}
                      style={{ cursor: 'pointer' }}
                    >
                      <Card.Body className="py-2">
                        <div className="d-flex align-items-start">
                          <Form.Check
                            type="radio"
                            name="campaignType"
                            checked={formData.type === type.value}
                            onChange={() => setFormData({ ...formData, type: type.value })}
                            className="me-2 mt-1"
                          />
                          <div>
                            <div className="d-flex align-items-center">
                              <Icon className="me-2 text-primary" />
                              <strong>{type.label}</strong>
                            </div>
                            <small className="text-muted">{type.details}</small>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  );
                })}
              </div>
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>
                <FaClock className="me-1" />
                Message Interval (delay between each recipient)
              </Form.Label>
              <InputGroup>
                <Form.Control
                  type="number"
                  min="0"
                  value={formData.messageIntervalMinutes}
                  onChange={(e) => setFormData({ ...formData, messageIntervalMinutes: e.target.value })}
                  placeholder="0"
                />
                <InputGroup.Text>minutes</InputGroup.Text>
              </InputGroup>
              <Form.Text className="text-muted">
                Time to wait between sending messages to each recipient. Set to 0 for no delay.
                Recommended: 5+ minutes for Telegram/WhatsApp to avoid rate limits.
              </Form.Text>
            </Form.Group>

            <hr />
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0">Campaign Steps</h6>
              <Button variant="outline-primary" size="sm" onClick={addStep}>
                <FaPlus className="me-1" /> Add Step
              </Button>
            </div>

            {formData.type === 'SEQUENCE' && (
              <Alert variant="info" className="mb-3">
                <strong>Sequence Campaign:</strong> Step 1 sends immediately when started.
                Configure delays for subsequent steps (Step 2 onwards).
              </Alert>
            )}

            {steps.map((step, index) => (
              <Card key={index} className="mb-3">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <strong>
                      Step {index + 1}
                      {formData.type === 'SEQUENCE' && index === 0 && (
                        <Badge bg="info" className="ms-2">Sends immediately</Badge>
                      )}
                    </strong>
                    {steps.length > 1 && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeStep(index)}
                      >
                        <FaTrash />
                      </Button>
                    )}
                  </div>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Channel</Form.Label>
                        <Form.Select
                          value={step.channelConfigId}
                          onChange={(e) => updateStep(index, 'channelConfigId', e.target.value)}
                        >
                          <option value="">Select channel...</option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.name} ({ch.channelType.replace('_', ' ')})
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Template</Form.Label>
                        <Form.Select
                          value={step.templateId}
                          onChange={(e) => updateStep(index, 'templateId', e.target.value)}
                          disabled={!step.channelConfigId}
                        >
                          <option value="">Select template...</option>
                          {getTemplatesForChannel(step.channelConfigId).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Form.Select>
                        {step.channelConfigId && getTemplatesForChannel(step.channelConfigId).length === 0 && (
                          <Form.Text className="text-warning">
                            No templates found for this channel type. Create a template first.
                          </Form.Text>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>

                  {formData.type === 'SEQUENCE' && index > 0 && (
                    <Row>
                      <Col md={12}>
                        <Form.Label>
                          <FaClock className="me-1" />
                          Delay after previous step
                        </Form.Label>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Control
                            type="number"
                            min="0"
                            value={step.delayDays}
                            onChange={(e) => updateStep(index, 'delayDays', e.target.value)}
                          />
                          <Form.Text>Days</Form.Text>
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Control
                            type="number"
                            min="0"
                            max="23"
                            value={step.delayHours}
                            onChange={(e) => updateStep(index, 'delayHours', e.target.value)}
                          />
                          <Form.Text>Hours</Form.Text>
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Control
                            type="number"
                            min="0"
                            max="59"
                            value={step.delayMinutes}
                            onChange={(e) => updateStep(index, 'delayMinutes', e.target.value)}
                          />
                          <Form.Text>Minutes</Form.Text>
                        </Form.Group>
                      </Col>
                      {(parseInt(step.delayDays) > 0 || parseInt(step.delayHours) > 0 || parseInt(step.delayMinutes) > 0) && (
                        <Col md={12}>
                          <small className="text-muted">
                            This step will send {parseInt(step.delayDays) || 0}d {parseInt(step.delayHours) || 0}h {parseInt(step.delayMinutes) || 0}m after Step {index}.
                          </small>
                        </Col>
                      )}
                    </Row>
                  )}
                </Card.Body>
              </Card>
            ))}

            {channels.length === 0 && (
              <Alert variant="warning">
                No active channels found. Please configure a channel first in the Channels section.
              </Alert>
            )}

            {templates.length === 0 && (
              <Alert variant="warning">
                No templates found. Please create a template first in the Templates section.
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={saving || channels.length === 0 || templates.length === 0}
            >
              {saving ? 'Creating...' : 'Create Campaign'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Add Recipients Modal */}
      <Modal show={showRecipientsModal} onHide={closeRecipientsModal} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaUsers className="me-2" />
            Manage Recipients - {selectedCampaign?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Tab Toggle */}
          <div className="d-flex gap-2 mb-3 border-bottom pb-3">
            <Button
              variant={recipientModalTab === 'existing' ? 'primary' : 'outline-secondary'}
              onClick={() => setRecipientModalTab('existing')}
            >
              <FaUsers className="me-1" /> Current Recipients
              <Badge bg="light" text="dark" className="ms-2">{existingRecipients.length}</Badge>
            </Button>
            <Button
              variant={recipientModalTab === 'add' ? 'success' : 'outline-success'}
              onClick={() => setRecipientModalTab('add')}
            >
              <FaUserPlus className="me-1" /> Add from Leads
            </Button>
            {campaignUsesTelegram(selectedCampaign) && (
              <Button
                variant={recipientModalTab === 'prospects' ? 'info' : 'outline-info'}
                onClick={() => setRecipientModalTab('prospects')}
              >
                <FaTelegram className="me-1" /> Add from Prospects
                {prospectGroups.length > 0 && (
                  <Badge bg="light" text="dark" className="ms-2">{prospectGroups.length} groups</Badge>
                )}
              </Button>
            )}
          </div>

          {recipientModalTab === 'existing' ? (
            <>
              {/* Existing Recipients Tab */}
              {loadingExisting ? (
                <div className="text-center py-4">
                  <FaSpinner className="fa-spin me-2" /> Loading recipients...
                </div>
              ) : existingRecipients.length === 0 ? (
                <Alert variant="info">
                  No recipients added yet. Click "Add More" to add leads to this campaign.
                </Alert>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span>{existingRecipients.length} recipients in this campaign</span>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={handleClearAllRecipients}
                    >
                      <FaTrash className="me-1" /> Clear All
                    </Button>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <Table size="sm" hover>
                      <thead className="table-light sticky-top">
                        <tr>
                          <th>Company / Group</th>
                          <th>Contact / Prospect</th>
                          <th>Email / Channel</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingRecipients.map((recipient) => (
                          <tr key={recipient.id}>
                            <td>
                              {recipient.isProspect ? (
                                <Badge bg="info" className="me-1">Prospect</Badge>
                              ) : (
                                recipient.lead?.companyName || '-'
                              )}
                              {recipient.isProspect && recipient.prospectGroupName && (
                                <small className="text-muted">{recipient.prospectGroupName}</small>
                              )}
                            </td>
                            <td>
                              {recipient.isProspect ? (
                                <>
                                  {recipient.prospectName || '-'}
                                  {recipient.telegramUserId && (
                                    <small className="text-muted d-block">@{recipient.telegramUserId}</small>
                                  )}
                                </>
                              ) : (
                                recipient.contact?.name || '-'
                              )}
                            </td>
                            <td className="small text-muted">
                              {recipient.isProspect ? (
                                <span><FaTelegram className="me-1" />Telegram</span>
                              ) : (
                                recipient.contact?.email || '-'
                              )}
                            </td>
                            <td>
                              <Badge
                                bg={
                                  recipient.status === 'COMPLETED' ? 'success' :
                                  recipient.status === 'FAILED' ? 'danger' :
                                  recipient.status === 'IN_PROGRESS' ? 'primary' : 'secondary'
                                }
                                className="small"
                              >
                                {recipient.status}
                              </Badge>
                            </td>
                            <td>
                              {selectedCampaign?.status === 'DRAFT' && (
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => handleRemoveRecipient(recipient.id)}
                                  title="Remove recipient"
                                >
                                  <FaTrash />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
          {/* Add Recipients Tab - Mode Toggle */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex gap-2">
              <Button
                variant={useFilters ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setUseFilters(true)}
              >
                <FaFilter className="me-1" /> Filter Mode
              </Button>
              <Button
                variant={!useFilters ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setUseFilters(false)}
              >
                <FaUsers className="me-1" /> Manual Selection
              </Button>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Form.Check
                type="switch"
                id="primary-only-switch"
                label={primaryOnly ? 'Primary contacts only' : 'All contacts'}
                checked={primaryOnly}
                onChange={(e) => setPrimaryOnly(e.target.checked)}
              />
            </div>
          </div>

          {useFilters ? (
            <>
              {/* Filter Controls */}
              <Card className="mb-3">
                <Card.Body>
                  <Row className="g-3">
                    {/* Status Filter */}
                    <Col md={6} lg={3}>
                      <Form.Label className="small fw-bold">Lead Status</Form.Label>
                      <div className="d-flex flex-wrap gap-1">
                        {['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION'].map((status) => (
                          <Badge
                            key={status}
                            bg={recipientFilters.status.includes(status) ? 'primary' : 'light'}
                            text={recipientFilters.status.includes(status) ? 'white' : 'dark'}
                            style={{ cursor: 'pointer' }}
                            onClick={() => toggleFilterValue('status', status)}
                          >
                            {status}
                          </Badge>
                        ))}
                      </div>
                    </Col>

                    {/* Industry Filter */}
                    <Col md={6} lg={3}>
                      <Form.Label className="small fw-bold">Industry</Form.Label>
                      <Form.Select
                        size="sm"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            toggleFilterValue('industryIds', parseInt(e.target.value));
                          }
                        }}
                      >
                        <option value="">Select industry...</option>
                        {industries
                          .filter((ind) => !recipientFilters.industryIds.includes(ind.id))
                          .map((ind) => (
                            <option key={ind.id} value={ind.id}>
                              {ind.name}
                            </option>
                          ))}
                      </Form.Select>
                      {recipientFilters.industryIds.length > 0 && (
                        <div className="d-flex flex-wrap gap-1 mt-1">
                          {recipientFilters.industryIds.map((id) => {
                            const ind = industries.find((i) => i.id === id);
                            return (
                              <Badge
                                key={id}
                                bg="info"
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleFilterValue('industryIds', id)}
                              >
                                {ind?.name} ×
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </Col>

                    {/* Data Source Filter */}
                    <Col md={6} lg={3}>
                      <Form.Label className="small fw-bold">Data Source</Form.Label>
                      <Form.Select
                        size="sm"
                        value={recipientFilters.sourceId}
                        onChange={(e) => handleFilterChange('sourceId', e.target.value)}
                      >
                        <option value="">All sources</option>
                        {dataSources.map((ds) => (
                          <option key={ds.id} value={ds.id}>
                            {ds.name}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>

                    {/* Company Size Filter */}
                    <Col md={6} lg={3}>
                      <Form.Label className="small fw-bold">Company Size</Form.Label>
                      <div className="d-flex flex-wrap gap-1">
                        {['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'].map((size) => (
                          <Badge
                            key={size}
                            bg={recipientFilters.size.includes(size) ? 'success' : 'light'}
                            text={recipientFilters.size.includes(size) ? 'white' : 'dark'}
                            style={{ cursor: 'pointer', fontSize: '10px' }}
                            onClick={() => toggleFilterValue('size', size)}
                          >
                            {size}
                          </Badge>
                        ))}
                      </div>
                    </Col>

                    {/* Search */}
                    <Col md={12}>
                      <InputGroup size="sm">
                        <InputGroup.Text><FaSearch /></InputGroup.Text>
                        <Form.Control
                          placeholder="Search by company name or website..."
                          value={recipientFilters.search}
                          onChange={(e) => handleFilterChange('search', e.target.value)}
                        />
                        {hasActiveFilters() && (
                          <Button variant="outline-secondary" onClick={clearFilters}>
                            Clear All
                          </Button>
                        )}
                      </InputGroup>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Results Summary */}
              <Alert variant={filteredLeadsCount > 0 ? 'success' : 'warning'} className="d-flex justify-content-between align-items-center">
                <div>
                  {loadingLeads ? (
                    <><FaSpinner className="fa-spin me-2" /> Counting leads...</>
                  ) : (
                    <>
                      <strong>{filteredLeadsCount}</strong> leads match your criteria
                      {hasActiveFilters() && <span className="text-muted ms-2">(filtered)</span>}
                    </>
                  )}
                </div>
                {filteredLeadsCount > 0 && !loadingLeads && (
                  <Button
                    variant="success"
                    onClick={() => handleAddRecipients(true)}
                    disabled={addingRecipients}
                  >
                    {addingRecipients ? 'Adding...' : `Add All ${filteredLeadsCount} Matching Leads`}
                  </Button>
                )}
              </Alert>

              {/* Preview of matching leads */}
              {leads.length > 0 && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <small className="text-muted">Preview (first {Math.min(leads.length, 50)} leads):</small>
                  </div>
                  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <Table size="sm" hover className="mb-0">
                      <thead className="table-light sticky-top">
                        <tr>
                          <th>Company</th>
                          <th>Status</th>
                          <th>Industry</th>
                          <th>Source</th>
                          <th>Contacts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => (
                          <tr key={lead.id}>
                            <td>
                              <strong>{lead.companyName}</strong>
                              {lead.website && (
                                <div className="text-muted small text-truncate" style={{ maxWidth: '200px' }}>
                                  {lead.website}
                                </div>
                              )}
                            </td>
                            <td><Badge bg="secondary" className="small">{lead.status}</Badge></td>
                            <td>
                              {lead.industries?.slice(0, 2).map((li) => (
                                <Badge key={li.industry.id} bg="info" className="me-1 small">
                                  {li.industry.name}
                                </Badge>
                              ))}
                              {lead.industries?.length > 2 && (
                                <Badge bg="light" text="dark" className="small">+{lead.industries.length - 2}</Badge>
                              )}
                            </td>
                            <td className="small text-muted">{lead.source?.name || '-'}</td>
                            <td><Badge bg="secondary">{lead._count?.contacts || 0}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Manual Selection Mode */}
              <Alert variant="info" className="mb-3">
                Select individual leads to add as campaign recipients.
              </Alert>

              {leads.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted">No leads found. Create leads first to add them to campaigns.</p>
                </div>
              ) : (
                <>
                  <div className="d-flex justify-content-between mb-3">
                    <Button variant="link" onClick={selectAllLeads} className="p-0">
                      {selectedLeads.length === leads.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <span className="text-muted">
                      {selectedLeads.length} of {leads.length} selected
                    </span>
                  </div>

                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <ListGroup>
                      {leads.map((lead) => (
                        <ListGroup.Item
                          key={lead.id}
                          action
                          active={selectedLeads.includes(lead.id)}
                          onClick={() => toggleLeadSelection(lead.id)}
                          className="d-flex justify-content-between align-items-center"
                        >
                          <div>
                            <strong>{lead.companyName}</strong>
                            {lead.website && (
                              <small className="text-muted ms-2">{lead.website}</small>
                            )}
                          </div>
                          <Badge bg={selectedLeads.includes(lead.id) ? 'light' : 'secondary'}>
                            {lead._count?.contacts || 0} contacts
                          </Badge>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </div>
                </>
              )}
            </>
          )}
            </>
          )}

          {/* Prospects Tab - for TELEGRAM campaigns */}
          {recipientModalTab === 'prospects' && (
            <>
              <Alert variant="info" className="mb-3">
                <FaTelegram className="me-2" />
                Select Telegram prospect groups to add as campaign recipients.
                All prospects in the selected groups will be added to the campaign.
              </Alert>

              {loadingProspects ? (
                <div className="text-center py-4">
                  <FaSpinner className="fa-spin me-2" /> Loading prospect groups...
                </div>
              ) : prospectGroups.length === 0 ? (
                <Alert variant="warning">
                  No prospect groups found. Import prospects from Telegram groups first in the Prospects section.
                </Alert>
              ) : (
                <>
                  <div className="d-flex justify-content-between mb-3">
                    <Button
                      variant="link"
                      onClick={() => {
                        if (selectedProspectGroups.length === prospectGroups.length) {
                          setSelectedProspectGroups([]);
                        } else {
                          setSelectedProspectGroups(prospectGroups.map(g => g.id));
                        }
                      }}
                      className="p-0"
                    >
                      {selectedProspectGroups.length === prospectGroups.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <span className="text-muted">
                      {selectedProspectGroups.length} of {prospectGroups.length} groups selected
                    </span>
                  </div>

                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <ListGroup>
                      {prospectGroups.map((group) => (
                        <ListGroup.Item
                          key={group.id}
                          action
                          active={selectedProspectGroups.includes(group.id)}
                          onClick={() => {
                            setSelectedProspectGroups(prev =>
                              prev.includes(group.id)
                                ? prev.filter(id => id !== group.id)
                                : [...prev, group.id]
                            );
                          }}
                          className="d-flex justify-content-between align-items-center"
                        >
                          <div>
                            <strong>{group.name}</strong>
                            {group.telegramGroupName && (
                              <small className="text-muted ms-2">
                                (from: {group.telegramGroupName})
                              </small>
                            )}
                          </div>
                          <div>
                            <Badge bg={selectedProspectGroups.includes(group.id) ? 'light' : 'info'} text={selectedProspectGroups.includes(group.id) ? 'dark' : 'white'} className="me-2">
                              {group.prospectCount || group._count?.prospects || 0} prospects
                            </Badge>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </div>

                  {/* Summary */}
                  {selectedProspectGroups.length > 0 && (
                    <Alert variant="success" className="mt-3 mb-0">
                      <strong>
                        {selectedProspectGroups.reduce((total, groupId) => {
                          const group = prospectGroups.find(g => g.id === groupId);
                          return total + (group?.prospectCount || group?._count?.prospects || 0);
                        }, 0)}
                      </strong> prospects from {selectedProspectGroups.length} group(s) will be added.
                    </Alert>
                  )}
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeRecipientsModal}>
            Close
          </Button>
          {recipientModalTab === 'add' && !useFilters && (
            <Button
              variant="primary"
              onClick={() => handleAddRecipients(false)}
              disabled={addingRecipients || selectedLeads.length === 0}
            >
              {addingRecipients ? 'Adding...' : `Add ${selectedLeads.length} Lead(s)`}
            </Button>
          )}
          {recipientModalTab === 'prospects' && selectedProspectGroups.length > 0 && (
            <Button
              variant="info"
              onClick={() => handleAddProspectRecipients()}
              disabled={addingRecipients}
            >
              {addingRecipients ? 'Adding...' : `Add ${selectedProspectGroups.length} Group(s)`}
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* Start Campaign Confirmation Modal */}
      <Modal show={showStartModal} onHide={closeStartModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            <FaPlay className="me-2 text-success" />
            Start Campaign
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {campaignToStart && (
            <>
              <h5>{campaignToStart.name}</h5>

              <div className="mb-3">
                <Badge bg="primary" className="me-2">
                  {getTypeIcon(campaignToStart.type)} {campaignToStart.type}
                </Badge>
                <Badge bg="secondary">
                  {campaignToStart._count?.recipients || 0} recipients
                </Badge>
              </div>

              {campaignToStart.type === 'IMMEDIATE' && (
                <Alert variant="warning">
                  <strong>Immediate Campaign</strong>
                  <p className="mb-0 mt-2">
                    Messages will be sent to all {campaignToStart._count?.recipients || 0} recipients
                    immediately after you click Start. This action cannot be undone.
                  </p>
                </Alert>
              )}

              {campaignToStart.type === 'SCHEDULED' && (
                <>
                  <Alert variant="info">
                    <strong>Scheduled Campaign</strong>
                    <p className="mb-0 mt-2">
                      Choose when to send messages to all {campaignToStart._count?.recipients || 0} recipients.
                    </p>
                  </Alert>

                  <Row className="mt-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Time</Form.Label>
                        <Form.Control
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {scheduledDate && scheduledTime && (
                    <p className="mt-3 text-muted">
                      Campaign will start on <strong>{new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}</strong>
                    </p>
                  )}
                </>
              )}

              {campaignToStart.type === 'SEQUENCE' && (
                <Alert variant="info">
                  <strong>Sequence Campaign</strong>
                  <p className="mb-0 mt-2">
                    Step 1 will be sent to all {campaignToStart._count?.recipients || 0} recipients immediately.
                    Subsequent steps will follow the configured delays.
                  </p>
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeStartModal}>
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={handleStartCampaign}
            disabled={starting}
          >
            {starting ? 'Starting...' : 'Start Campaign'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Campaign Detail Modal */}
      <Modal show={showDetailModal} onHide={closeDetailModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaBullhorn className="me-2" />
            Campaign Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingDetail && !campaignDetail ? (
            <div className="text-center py-4">
              <LoadingSpinner />
            </div>
          ) : campaignDetail && (
            <>
              {/* Campaign Info */}
              <Card className="mb-3">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="mb-2">{campaignDetail.name}</h5>
                      <div className="mb-2">
                        <Badge bg={STATUS_COLORS[campaignDetail.status]} className="me-2">
                          {campaignDetail.status}
                        </Badge>
                        <Badge bg="primary">
                          {getTypeIcon(campaignDetail.type)} {campaignDetail.type}
                        </Badge>
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      {campaignDetail.status === 'ACTIVE' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleTrigger(campaignDetail.id)}
                          disabled={triggering === campaignDetail.id}
                          title="Process pending messages immediately"
                        >
                          {triggering === campaignDetail.id ? (
                            <><FaSpinner className="fa-spin me-1" /> Triggering...</>
                          ) : (
                            <><FaBolt className="me-1" /> Trigger Now</>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={refreshCampaignDetail}
                        disabled={loadingDetail}
                      >
                        <FaSync className={loadingDetail ? 'fa-spin' : ''} /> Refresh
                      </Button>
                    </div>
                  </div>

                  <Row className="mt-3">
                    <Col md={4}>
                      <small className="text-muted">Created</small>
                      <p className="mb-0">{new Date(campaignDetail.createdAt).toLocaleString()}</p>
                    </Col>
                    {campaignDetail.startedAt && (
                      <Col md={4}>
                        <small className="text-muted">Started</small>
                        <p className="mb-0">{new Date(campaignDetail.startedAt).toLocaleString()}</p>
                      </Col>
                    )}
                    {campaignDetail.scheduledAt && (
                      <Col md={4}>
                        <small className="text-muted">Scheduled For</small>
                        <p className="mb-0">
                          {new Date(campaignDetail.scheduledAt) > new Date() ? (
                            <span className="text-info">
                              <FaClock className="me-1" />
                              {new Date(campaignDetail.scheduledAt).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-success">
                              <FaCheckCircle className="me-1" />
                              {new Date(campaignDetail.scheduledAt).toLocaleString()} (executed)
                            </span>
                          )}
                        </p>
                      </Col>
                    )}
                  </Row>

                  {/* Steps */}
                  {campaignDetail.steps?.length > 0 && (
                    <div className="mt-3">
                      <small className="text-muted">Campaign Steps</small>
                      <div className="d-flex flex-wrap gap-2 mt-1">
                        {campaignDetail.steps.map((step, idx) => {
                          const ChannelIcon = CHANNEL_ICONS[step.channelType] || FaEnvelope;
                          return (
                            <Badge key={step.id} bg="light" text="dark" className="d-flex align-items-center">
                              <span className="me-1">Step {idx + 1}:</span>
                              <ChannelIcon className="me-1" />
                              {step.template?.name || 'Template'}
                              {idx > 0 && (step.delayDays + step.delayHours + (step.delayMinutes || 0)) > 0 && (
                                <span className="ms-1 text-muted">
                                  (after {step.delayDays}d {step.delayHours}h {step.delayMinutes || 0}m)
                                </span>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Analytics */}
              {campaignAnalytics && (
                <Card className="mb-3">
                  <Card.Header>
                    <strong>Progress & Analytics</strong>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={3} className="text-center">
                        <h3 className="mb-0">{campaignAnalytics.totalRecipients || 0}</h3>
                        <small className="text-muted">Total Recipients</small>
                      </Col>
                      <Col md={3} className="text-center">
                        <h3 className="mb-0 text-secondary">
                          {campaignAnalytics.byStatus?.PENDING || 0}
                        </h3>
                        <small className="text-muted">Pending</small>
                      </Col>
                      <Col md={3} className="text-center">
                        <h3 className="mb-0 text-primary">
                          {campaignAnalytics.byStatus?.IN_PROGRESS || 0}
                        </h3>
                        <small className="text-muted">In Progress</small>
                      </Col>
                      <Col md={3} className="text-center">
                        <h3 className="mb-0 text-success">
                          {campaignAnalytics.byStatus?.COMPLETED || 0}
                        </h3>
                        <small className="text-muted">Completed</small>
                      </Col>
                    </Row>

                    {/* Progress Bar */}
                    {campaignAnalytics.totalRecipients > 0 && (
                      <div className="mt-3">
                        <ProgressBar>
                          <ProgressBar
                            variant="success"
                            now={(campaignAnalytics.byStatus?.COMPLETED || 0) / campaignAnalytics.totalRecipients * 100}
                            key={1}
                            label={campaignAnalytics.byStatus?.COMPLETED > 0 ? `${campaignAnalytics.byStatus?.COMPLETED} done` : ''}
                          />
                          <ProgressBar
                            variant="primary"
                            now={(campaignAnalytics.byStatus?.IN_PROGRESS || 0) / campaignAnalytics.totalRecipients * 100}
                            key={2}
                          />
                          <ProgressBar
                            variant="secondary"
                            now={(campaignAnalytics.byStatus?.PENDING || 0) / campaignAnalytics.totalRecipients * 100}
                            key={3}
                          />
                        </ProgressBar>
                        <div className="d-flex justify-content-between mt-1">
                          <small className="text-muted">
                            {Math.round((campaignAnalytics.byStatus?.COMPLETED || 0) / campaignAnalytics.totalRecipients * 100)}% complete
                          </small>
                          <small className="text-muted">
                            {campaignAnalytics.totalRecipients - (campaignAnalytics.byStatus?.COMPLETED || 0)} remaining
                          </small>
                        </div>
                      </div>
                    )}

                    {/* Contact Attempts */}
                    {Object.keys(campaignAnalytics.attemptsByStatus || {}).length > 0 && (
                      <div className="mt-4">
                        <small className="text-muted d-block mb-2">Message Delivery Status</small>
                        <div className="d-flex flex-wrap gap-3">
                          {Object.entries(campaignAnalytics.attemptsByStatus).map(([status, count]) => (
                            <div key={status} className="text-center">
                              <Badge
                                bg={status === 'SENT' ? 'success' : status === 'FAILED' ? 'danger' : 'secondary'}
                                className="px-3 py-2"
                              >
                                {status}: {count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              )}

              {/* Recipients List */}
              <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <strong>Recipients</strong>
                  <small className="text-muted">
                    Showing {campaignRecipients.length} of {campaignAnalytics?.totalRecipients || 0}
                  </small>
                </Card.Header>
                <Card.Body style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {campaignRecipients.length === 0 ? (
                    <p className="text-muted text-center mb-0">No recipients added yet</p>
                  ) : (
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>Contact / Prospect</th>
                          <th>Company / Group</th>
                          <th>Status</th>
                          <th>Step History</th>
                          <th>Next Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignRecipients.map((recipient) => (
                          <tr key={recipient.id}>
                            <td>
                              {recipient.isProspect ? (
                                <>
                                  <Badge bg="info" className="me-1">P</Badge>
                                  <strong>{recipient.prospectName || 'Unknown'}</strong>
                                  <br />
                                  <small className="text-muted">
                                    <FaTelegram className="me-1" />Telegram
                                  </small>
                                </>
                              ) : (
                                <>
                                  <strong>{recipient.contact?.name || 'Unknown'}</strong>
                                  <br />
                                  <small className="text-muted">{recipient.contact?.email}</small>
                                </>
                              )}
                            </td>
                            <td>
                              {recipient.isProspect ? (
                                recipient.prospectGroupName || '-'
                              ) : (
                                recipient.lead?.companyName || '-'
                              )}
                            </td>
                            <td>{getRecipientStatusBadge(recipient.status)}</td>
                            <td>
                              {recipient.stepHistory?.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {recipient.stepHistory.map((step, idx) => (
                                    <Badge
                                      key={idx}
                                      bg={step.status === 'SENT' ? 'success' : step.status === 'FAILED' ? 'danger' : 'secondary'}
                                      title={`Step ${step.stepOrder}: ${step.status} at ${step.sentAt ? new Date(step.sentAt).toLocaleString() : '-'}`}
                                      style={{ fontSize: '10px' }}
                                    >
                                      S{step.stepOrder} {step.status === 'SENT' ? '✓' : step.status === 'FAILED' ? '✗' : '?'}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <small className="text-muted">-</small>
                              )}
                            </td>
                            <td>
                              {recipient.status === 'COMPLETED' ? (
                                <small className="text-success">Done</small>
                              ) : recipient.status === 'FAILED' ? (
                                <small className="text-danger">Failed</small>
                              ) : recipient.nextActionAt ? (
                                new Date(recipient.nextActionAt) > new Date() ? (
                                  <small className="text-info">
                                    Step {recipient.currentStep} @ {new Date(recipient.nextActionAt).toLocaleString()}
                                  </small>
                                ) : (
                                  <small className="text-warning">Processing Step {recipient.currentStep}...</small>
                                )
                              ) : (
                                <small className="text-muted">-</small>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card.Body>
              </Card>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeDetailModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default CampaignList;
