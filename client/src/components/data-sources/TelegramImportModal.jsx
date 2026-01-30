import { useState } from 'react';
import { Modal, Form, Button, Table, Alert, Badge, Spinner, ListGroup } from 'react-bootstrap';
import { FaTelegram, FaUsers, FaDownload, FaArrowRight, FaArrowLeft, FaLock, FaPhone, FaKey } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

const STEPS = {
  CREDENTIALS: 1,
  CODE: 2,
  PASSWORD: 3,
  GROUPS: 4,
  CONTACTS: 5,
};

function TelegramImportModal({ show, onHide, onSuccess }) {
  const [step, setStep] = useState(STEPS.CREDENTIALS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auth data
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sessionKey, setSessionKey] = useState(null);

  // Groups and contacts
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);

  const resetForm = () => {
    setStep(STEPS.CREDENTIALS);
    setApiId('');
    setApiHash('');
    setPhoneNumber('');
    setCode('');
    setPassword('');
    setSessionKey(null);
    setGroups([]);
    setSelectedGroup(null);
    setContacts([]);
    setSelectedContacts([]);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onHide();
  };

  // Step 1: Start authentication
  const handleStartAuth = async () => {
    if (!apiId || !apiHash || !phoneNumber) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/telegram/auth/start', {
        apiId,
        apiHash,
        phoneNumber,
      });

      const { status, sessionKey: key, message } = response.data.data;
      setSessionKey(key);

      if (status === 'authorized') {
        toast.success('Already authenticated!');
        await fetchGroups(key);
        setStep(STEPS.GROUPS);
      } else if (status === 'code_required') {
        toast.success(message);
        setStep(STEPS.CODE);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to start authentication');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify code
  const handleVerifyCode = async () => {
    if (!code) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/telegram/auth/verify-code', {
        sessionKey,
        code,
      });

      console.log('Telegram verify-code response:', response.data);
      const { status, message } = response.data.data;
      console.log('Telegram verify status:', status, 'message:', message);

      if (status === 'authorized') {
        toast.success('Authentication successful!');
        await fetchGroups(sessionKey);
        setStep(STEPS.GROUPS);
      } else if (status === 'password_required') {
        console.log('Transitioning to PASSWORD step');
        toast(message, { icon: '🔐' });
        setStep(STEPS.PASSWORD);
      } else {
        console.log('Unknown status:', status);
      }
    } catch (err) {
      console.error('Telegram verify-code error:', err);
      setError(err.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify 2FA password
  const handleVerifyPassword = async () => {
    if (!password) {
      setError('Please enter your 2FA password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/telegram/auth/verify-password', {
        sessionKey,
        password,
      });

      const { status } = response.data.data;

      if (status === 'authorized') {
        toast.success('Authentication successful!');
        await fetchGroups(sessionKey);
        setStep(STEPS.GROUPS);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  // Fetch groups
  const fetchGroups = async (key) => {
    setLoading(true);
    try {
      const response = await api.get('/telegram/groups', {
        params: { sessionKey: key },
      });
      setGroups(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Select group and fetch contacts
  const handleSelectGroup = async (group) => {
    setSelectedGroup(group);
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/telegram/groups/${group.id}/contacts`, {
        params: { sessionKey },
      });
      const fetchedContacts = response.data.data;
      setContacts(fetchedContacts);
      setSelectedContacts(fetchedContacts.map((_, i) => i)); // Select all by default
      setStep(STEPS.CONTACTS);
      toast.success(`Found ${fetchedContacts.length} contacts`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Import contacts
  const handleImport = async () => {
    if (selectedContacts.length === 0) {
      setError('Please select at least one contact to import');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const contactsToImport = selectedContacts.map(i => contacts[i]);

      const response = await api.post('/telegram/import', {
        sessionKey,
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        contacts: contactsToImport,
      });

      const { importedCount, totalContacts } = response.data.data;
      toast.success(`Imported ${importedCount} contacts from ${selectedGroup.name}`);

      handleClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to import contacts');
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (index) => {
    setSelectedContacts(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((_, i) => i));
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case STEPS.CREDENTIALS:
        return 'Telegram API Credentials';
      case STEPS.CODE:
        return 'Enter Verification Code';
      case STEPS.PASSWORD:
        return 'Two-Factor Authentication';
      case STEPS.GROUPS:
        return 'Select Group';
      case STEPS.CONTACTS:
        return `Contacts from ${selectedGroup?.name}`;
      default:
        return 'Telegram Import';
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

        {/* Step 1: API Credentials */}
        {step === STEPS.CREDENTIALS && (
          <>
            <Alert variant="info">
              <strong>How to get Telegram API credentials:</strong>
              <ol className="mb-0 mt-2">
                <li>Go to <a href="https://my.telegram.org/auth" target="_blank" rel="noopener noreferrer">my.telegram.org</a></li>
                <li>Log in with your phone number</li>
                <li>Go to "API development tools"</li>
                <li>Create a new application to get API ID and Hash</li>
              </ol>
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label><FaKey className="me-1" /> API ID *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., 12345678"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label><FaKey className="me-1" /> API Hash *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., a1b2c3d4e5f6..."
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label><FaPhone className="me-1" /> Phone Number *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., +91XXXXXXXXXX (with country code)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <Form.Text className="text-muted">
                Include country code (e.g., +91 for India)
              </Form.Text>
            </Form.Group>
          </>
        )}

        {/* Step 2: Verification Code */}
        {step === STEPS.CODE && (
          <>
            <Alert variant="info">
              A verification code has been sent to your Telegram app. Please enter it below.
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label><FaLock className="me-1" /> Verification Code *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., 12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </Form.Group>
          </>
        )}

        {/* Step 3: 2FA Password */}
        {step === STEPS.PASSWORD && (
          <>
            <Alert variant="warning">
              Your account has two-factor authentication enabled. Please enter your password.
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label><FaLock className="me-1" /> 2FA Password *</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter your 2FA password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Form.Group>
          </>
        )}

        {/* Step 4: Group Selection */}
        {step === STEPS.GROUPS && (
          <>
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="me-2" />
                Loading groups...
              </div>
            ) : groups.length === 0 ? (
              <Alert variant="warning">
                No groups found. Make sure you are a member of at least one group or channel.
              </Alert>
            ) : (
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
                      <Badge bg={group.type === 'channel' ? 'info' : 'secondary'} className="ms-2">
                        {group.type}
                      </Badge>
                    </div>
                    <div className="text-muted">
                      {group.participantsCount > 0 && (
                        <span>{group.participantsCount} members</span>
                      )}
                      <FaArrowRight className="ms-2" />
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </>
        )}

        {/* Step 5: Contact Preview */}
        {step === STEPS.CONTACTS && (
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
                  setStep(STEPS.GROUPS);
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
                    <tr key={contact.id} className={selectedContacts.includes(index) ? '' : 'text-muted'}>
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
                          <a href={`https://t.me/${contact.username}`} target="_blank" rel="noopener noreferrer">
                            @{contact.username}
                          </a>
                        ) : '-'}
                      </td>
                      <td>{contact.phone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {contacts.length > 100 && (
              <Alert variant="info">
                Showing first 100 of {contacts.length} contacts. All selected contacts will be imported.
              </Alert>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>

        {step === STEPS.CREDENTIALS && (
          <Button
            variant="primary"
            onClick={handleStartAuth}
            disabled={loading || !apiId || !apiHash || !phoneNumber}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Connecting...
              </>
            ) : (
              <>
                <FaArrowRight className="me-2" />
                Continue
              </>
            )}
          </Button>
        )}

        {step === STEPS.CODE && (
          <Button
            variant="primary"
            onClick={handleVerifyCode}
            disabled={loading || !code}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Verifying...
              </>
            ) : (
              <>
                <FaArrowRight className="me-2" />
                Verify Code
              </>
            )}
          </Button>
        )}

        {step === STEPS.PASSWORD && (
          <Button
            variant="primary"
            onClick={handleVerifyPassword}
            disabled={loading || !password}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Verifying...
              </>
            ) : (
              <>
                <FaArrowRight className="me-2" />
                Verify Password
              </>
            )}
          </Button>
        )}

        {step === STEPS.CONTACTS && (
          <Button
            variant="success"
            onClick={handleImport}
            disabled={loading || selectedContacts.length === 0}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Importing...
              </>
            ) : (
              <>
                <FaDownload className="me-2" />
                Import {selectedContacts.length} Contacts
              </>
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default TelegramImportModal;
