import { useState, useEffect } from 'react';
import { Modal, Form, Button, Table, Alert, Badge, Spinner, ListGroup } from 'react-bootstrap';
import { FaTelegram, FaUsers, FaDownload, FaArrowRight, FaArrowLeft } from 'react-icons/fa';
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
  const [telegramGroups, setTelegramGroups] = useState([]);
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
    setTelegramGroups([]);
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
      const response = await api.get('/channels?channelType=TELEGRAM');
      setChannels(response.data.data);
    } catch (err) {
      setError('Failed to load Telegram channels');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChannel = async (channel) => {
    setSelectedChannel(channel);
    setLoading(true);
    setError(null);

    try {
      // Check if channel is connected
      const statusResponse = await api.get(`/channels/${channel.id}/telegram/status`);
      const { status, sessionKey } = statusResponse.data.data;

      if (status !== 'CONNECTED') {
        setError('This Telegram channel is not connected. Please connect it first in Channel settings.');
        return;
      }

      // Fetch groups
      const groupsResponse = await api.get(`/telegram-prospects/telegram-groups?channelConfigId=${channel.id}`);
      setTelegramGroups(groupsResponse.data.data);
      setStep(STEPS.SELECT_GROUP);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load Telegram groups');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGroup = async (group) => {
    setSelectedGroup(group);
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/telegram-prospects/telegram-groups/${group.id}/contacts?channelConfigId=${selectedChannel.id}`
      );
      const fetchedContacts = response.data.data;
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

      // Get session key from channel status
      const statusResponse = await api.get(`/channels/${selectedChannel.id}/telegram/status`);
      const { sessionKey } = statusResponse.data.data;

      const response = await api.post('/telegram-prospects/groups', {
        channelConfigId: selectedChannel.id,
        sessionKey,
        telegramGroupId: selectedGroup.id,
        telegramGroupName: selectedGroup.name,
        contacts: contactsToImport,
        customName: customName.trim(),
      });

      const { importedCount } = response.data.data;
      toast.success(`Imported ${importedCount} prospects as "${customName.trim()}"`);

      handleClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to import prospects');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case STEPS.SELECT_CHANNEL:
        return 'Select Telegram Channel';
      case STEPS.SELECT_GROUP:
        return 'Select Telegram Group';
      case STEPS.SELECT_CONTACTS:
        return `Select Contacts from ${selectedGroup?.name}`;
      case STEPS.NAME_GROUP:
        return 'Name Your Prospect Group';
      default:
        return 'Import Prospects';
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <FaTelegram className="me-2 text-primary" />
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
                No Telegram channels found. Please create a Telegram channel first in the Channels page.
              </Alert>
            ) : (
              <>
                <p className="text-muted mb-3">
                  Select a connected Telegram channel to import prospects from:
                </p>
                <ListGroup>
                  {channels.map((channel) => (
                    <ListGroup.Item
                      key={channel.id}
                      action
                      onClick={() => handleSelectChannel(channel)}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <FaTelegram className="me-2 text-primary" />
                        <strong>{channel.name}</strong>
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
            ) : telegramGroups.length === 0 ? (
              <Alert variant="warning">
                No groups found. Make sure you are a member of at least one group or channel.
              </Alert>
            ) : (
              <>
                <p className="text-muted mb-3">Select a group to import contacts from:</p>
                <ListGroup>
                  {telegramGroups.map((group) => (
                    <ListGroup.Item
                      key={group.id}
                      action
                      onClick={() => handleSelectGroup(group)}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <FaUsers className="me-2 text-primary" />
                        <strong>{group.name}</strong>
                        <Badge bg={group.type === 'channel' ? 'info' : 'secondary'} className="ms-2">
                          {group.type}
                        </Badge>
                      </div>
                      <div className="text-muted">
                        {group.participantsCount > 0 && <span>{group.participantsCount} members</span>}
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
                    <th>Username</th>
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
                        <strong>
                          {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}
                        </strong>
                      </td>
                      <td>
                        {contact.username ? (
                          <a
                            href={`https://t.me/${contact.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            @{contact.username}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
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
              Channel: {selectedChannel?.name}
              <br />
              Telegram Group: {selectedGroup?.name}
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
