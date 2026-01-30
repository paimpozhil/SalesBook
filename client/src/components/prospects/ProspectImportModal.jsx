import { useState, useEffect } from 'react';
import { Modal, Form, Button, Table, Alert, Badge, Spinner, ListGroup } from 'react-bootstrap';
import { FaTelegram, FaWhatsapp, FaUsers, FaDownload, FaArrowRight, FaArrowLeft } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

const STEPS = {
  SELECT_CHANNEL: 1,
  SELECT_GROUP: 2,
  SELECT_CONTACTS: 3,
  NAME_GROUP: 4,
};

function ProspectImportModal({ show, onHide, onSuccess }) {
  const [step, setStep] = useState(STEPS.SELECT_CHANNEL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Channels
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);

  // Groups
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Contacts
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);

  // Custom name
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (show) {
      fetchChannels();
    }
  }, [show]);

  const resetForm = () => {
    setStep(STEPS.SELECT_CHANNEL);
    setSelectedChannel(null);
    setGroups([]);
    setSelectedGroup(null);
    setContacts([]);
    setSelectedContacts([]);
    setCustomName('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onHide();
  };

  const fetchChannels = async () => {
    setLoading(true);
    try {
      // Fetch both Telegram and WhatsApp Web channels
      const [telegramResponse, whatsappResponse] = await Promise.all([
        api.get('/channels?channelType=TELEGRAM'),
        api.get('/channels?channelType=WHATSAPP_WEB'),
      ]);

      const allChannels = [
        ...telegramResponse.data.data.map((ch) => ({ ...ch, channelType: 'TELEGRAM' })),
        ...whatsappResponse.data.data.map((ch) => ({ ...ch, channelType: 'WHATSAPP_WEB' })),
      ];
      setChannels(allChannels);
    } catch (err) {
      setError('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const isTelegram = selectedChannel?.channelType === 'TELEGRAM';
  const isWhatsApp = selectedChannel?.channelType === 'WHATSAPP_WEB';

  const getChannelIcon = (channelType) => {
    return channelType === 'TELEGRAM' ? (
      <FaTelegram className="me-2 text-primary" />
    ) : (
      <FaWhatsapp className="me-2 text-success" />
    );
  };

  const handleSelectChannel = async (channel) => {
    setSelectedChannel(channel);
    setLoading(true);
    setError(null);

    try {
      if (channel.channelType === 'TELEGRAM') {
        // Check if Telegram channel is connected
        const statusResponse = await api.get(`/channels/${channel.id}/telegram/status`);
        const { status } = statusResponse.data.data;

        if (status !== 'CONNECTED') {
          setError('This Telegram channel is not connected. Please connect it first in Channel settings.');
          return;
        }

        // Fetch Telegram groups
        const groupsResponse = await api.get(`/telegram-prospects/telegram-groups?channelConfigId=${channel.id}`);
        setGroups(groupsResponse.data.data);
      } else if (channel.channelType === 'WHATSAPP_WEB') {
        // Check if WhatsApp channel is connected
        const statusResponse = await api.get(`/channels/${channel.id}/whatsapp-web/status`);
        const { status } = statusResponse.data.data;

        if (status !== 'CONNECTED') {
          setError('This WhatsApp channel is not connected. Please connect it first in Channel settings.');
          return;
        }

        // Fetch WhatsApp groups
        const groupsResponse = await api.get(`/whatsapp-prospects/whatsapp-groups?channelConfigId=${channel.id}`);
        setGroups(groupsResponse.data.data);
      }

      setStep(STEPS.SELECT_GROUP);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGroup = async (group) => {
    setSelectedGroup(group);
    setLoading(true);
    setError(null);

    try {
      let fetchedContacts;

      if (isTelegram) {
        const response = await api.get(
          `/telegram-prospects/telegram-groups/${group.id}/contacts?channelConfigId=${selectedChannel.id}`
        );
        fetchedContacts = response.data.data;
      } else if (isWhatsApp) {
        const response = await api.get(
          `/whatsapp-prospects/whatsapp-groups/${encodeURIComponent(group.id)}/contacts?channelConfigId=${selectedChannel.id}`
        );
        fetchedContacts = response.data.data;
      }

      setContacts(fetchedContacts);
      setSelectedContacts(fetchedContacts.map((_, i) => i)); // Select all by default
      setCustomName(`${group.name} - ${new Date().toLocaleDateString()}`);
      setStep(STEPS.SELECT_CONTACTS);
      toast.success(`Found ${fetchedContacts.length} contacts`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (index) => {
    setSelectedContacts((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((_, i) => i));
    }
  };

  const handleProceedToName = () => {
    if (selectedContacts.length === 0) {
      setError('Please select at least one contact');
      return;
    }
    setStep(STEPS.NAME_GROUP);
  };

  const handleImport = async () => {
    if (!customName.trim()) {
      setError('Please enter a name for this prospect group');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const contactsToImport = selectedContacts.map((i) => contacts[i]);

      if (isTelegram) {
        // Get session key from channel status
        const statusResponse = await api.get(`/channels/${selectedChannel.id}/telegram/status`);
        const { sessionKey } = statusResponse.data.data;

        await api.post('/telegram-prospects/groups', {
          channelConfigId: selectedChannel.id,
          sessionKey,
          telegramGroupId: selectedGroup.id,
          telegramGroupName: selectedGroup.name,
          contacts: contactsToImport,
          customName: customName.trim(),
        });
      } else if (isWhatsApp) {
        await api.post('/whatsapp-prospects/groups', {
          channelConfigId: selectedChannel.id,
          whatsappGroupId: selectedGroup.id,
          whatsappGroupName: selectedGroup.name,
          contacts: contactsToImport,
          customName: customName.trim(),
        });
      }

      toast.success(`Imported ${contactsToImport.length} prospects as "${customName.trim()}"`);

      handleClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to import prospects');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    const channelLabel = isTelegram ? 'Telegram' : isWhatsApp ? 'WhatsApp' : '';
    switch (step) {
      case STEPS.SELECT_CHANNEL:
        return 'Select Channel';
      case STEPS.SELECT_GROUP:
        return `Select ${channelLabel} Group`;
      case STEPS.SELECT_CONTACTS:
        return `Select Contacts from ${selectedGroup?.name}`;
      case STEPS.NAME_GROUP:
        return 'Name Your Prospect Group';
      default:
        return 'Import Prospects';
    }
  };

  const getContactName = (contact) => {
    if (isTelegram) {
      return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-';
    } else if (isWhatsApp) {
      return contact.name || '-';
    }
    return '-';
  };

  const getContactUsername = (contact) => {
    if (isTelegram && contact.username) {
      return (
        <a href={`https://t.me/${contact.username}`} target="_blank" rel="noopener noreferrer">
          @{contact.username}
        </a>
      );
    } else if (isWhatsApp && contact.isAdmin) {
      return <Badge bg="warning">Admin</Badge>;
    }
    return '-';
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          {selectedChannel ? getChannelIcon(selectedChannel.channelType) : <FaUsers className="me-2" />}
          {getStepTitle()}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Step 1: Select Channel */}
        {step === STEPS.SELECT_CHANNEL && (
          <>
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="me-2" />
                Loading channels...
              </div>
            ) : channels.length === 0 ? (
              <Alert variant="warning">
                No Telegram or WhatsApp channels found. Please create a channel first in the Channels page.
              </Alert>
            ) : (
              <>
                <p className="text-muted mb-3">
                  Select a connected channel to import prospects from:
                </p>
                <ListGroup>
                  {channels.map((channel) => (
                    <ListGroup.Item
                      key={`${channel.channelType}-${channel.id}`}
                      action
                      onClick={() => handleSelectChannel(channel)}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div>
                        {getChannelIcon(channel.channelType)}
                        <strong>{channel.name}</strong>
                        <Badge
                          bg={channel.channelType === 'TELEGRAM' ? 'primary' : 'success'}
                          className="ms-2"
                        >
                          {channel.channelType === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}
                        </Badge>
                        {!channel.isActive && (
                          <Badge bg="secondary" className="ms-2">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <FaArrowRight className="text-muted" />
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </>
            )}
          </>
        )}

        {/* Step 2: Select Group */}
        {step === STEPS.SELECT_GROUP && (
          <>
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="me-2" />
                Loading groups...
              </div>
            ) : groups.length === 0 ? (
              <Alert variant="warning">
                No groups found. Make sure you are a member of at least one group.
              </Alert>
            ) : (
              <>
                <p className="text-muted mb-3">Select a group to import contacts from:</p>
                <ListGroup>
                  {groups.map((group) => (
                    <ListGroup.Item
                      key={group.id}
                      action
                      onClick={() => handleSelectGroup(group)}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <FaUsers className="me-2 text-primary" />
                        <strong>{group.name}</strong>
                        {group.type && (
                          <Badge bg={group.type === 'channel' ? 'info' : 'secondary'} className="ms-2">
                            {group.type}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted">
                        {(group.participantsCount > 0 || group.participantCount > 0) && (
                          <span>{group.participantsCount || group.participantCount} members</span>
                        )}
                        <FaArrowRight className="ms-2" />
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </>
            )}
          </>
        )}

        {/* Step 3: Select Contacts */}
        {step === STEPS.SELECT_CONTACTS && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <Form.Check
                type="checkbox"
                label={`Select All (${selectedContacts.length}/${contacts.length})`}
                checked={selectedContacts.length === contacts.length}
                onChange={toggleAll}
              />
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => {
                  setStep(STEPS.SELECT_GROUP);
                  setContacts([]);
                  setSelectedContacts([]);
                }}
              >
                <FaArrowLeft className="me-1" /> Back to Groups
              </Button>
            </div>

            {contacts.length === 0 ? (
              <Alert variant="warning">
                No contacts found in this group. You may need admin access to view participants.
              </Alert>
            ) : (
              <Table striped bordered hover size="sm" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Name</th>
                    <th>{isTelegram ? 'Username' : 'Role'}</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 100).map((contact, index) => (
                    <tr
                      key={contact.id}
                      className={selectedContacts.includes(index) ? '' : 'text-muted'}
                    >
                      <td>
                        <Form.Check
                          type="checkbox"
                          checked={selectedContacts.includes(index)}
                          onChange={() => toggleContact(index)}
                        />
                      </td>
                      <td>
                        <strong>{getContactName(contact)}</strong>
                      </td>
                      <td>{getContactUsername(contact)}</td>
                      <td>{contact.phone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {contacts.length > 100 && (
              <Alert variant="info">
                Showing first 100 of {contacts.length} contacts. All selected contacts will be
                imported.
              </Alert>
            )}
          </>
        )}

        {/* Step 4: Name Group */}
        {step === STEPS.NAME_GROUP && (
          <>
            <p className="text-muted mb-3">
              Give this prospect group a memorable name to easily identify it later.
            </p>
            <Form.Group className="mb-3">
              <Form.Label>Group Name *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Marketing Leads Jan 2024"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                autoFocus
              />
              <Form.Text className="text-muted">
                This name will appear in your prospect groups list and campaign recipient selection.
              </Form.Text>
            </Form.Group>

            <Alert variant="info">
              <strong>Summary:</strong>
              <br />
              Channel: {selectedChannel?.name} ({isTelegram ? 'Telegram' : 'WhatsApp'})
              <br />
              Group: {selectedGroup?.name}
              <br />
              Contacts to Import: {selectedContacts.length}
            </Alert>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>

        {step === STEPS.SELECT_CONTACTS && (
          <Button
            variant="primary"
            onClick={handleProceedToName}
            disabled={loading || selectedContacts.length === 0}
          >
            <FaArrowRight className="me-2" />
            Continue ({selectedContacts.length} selected)
          </Button>
        )}

        {step === STEPS.NAME_GROUP && (
          <>
            <Button
              variant="outline-secondary"
              onClick={() => setStep(STEPS.SELECT_CONTACTS)}
              disabled={loading}
            >
              <FaArrowLeft className="me-1" /> Back
            </Button>
            <Button
              variant="success"
              onClick={handleImport}
              disabled={loading || !customName.trim()}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Importing...
                </>
              ) : (
                <>
                  <FaDownload className="me-2" />
                  Import {selectedContacts.length} Prospects
                </>
              )}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default ProspectImportModal;
