import { useState, useEffect } from 'react';
import { Button, Badge, Spinner, Alert, Card, Form, InputGroup } from 'react-bootstrap';
import { FaTelegram, FaCheckCircle, FaTimesCircle, FaSync, FaTrash, FaKey, FaPhone, FaLock, FaCog } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * TelegramConnect - UI for managing Telegram channel connection
 *
 * CONNECTION MODEL:
 * -----------------
 * Telegram requires a persistent TCP connection (MTProto protocol).
 * Credentials are stored encrypted in DB for auto-reconnect on server restart.
 *
 * Stored in DB (encrypted):
 * - apiId, apiHash: App credentials from my.telegram.org
 * - phoneNumber: User's phone number
 * - sessionString: Auth tokens (like a "remember me" cookie)
 *
 * Actions:
 * - Connect: First-time setup (phone → code → 2FA → connected)
 * - Reconnect: Quick reconnect using saved session (no code needed)
 * - Disconnect: Closes connection, keeps session (can reconnect quickly)
 * - Delete Session: Full logout, clears session (fresh login required)
 *
 * Auto-reconnect: Server automatically reconnects on startup using saved sessions.
 */
const STEPS = {
  PHONE: 1,
  CODE: 2,
  PASSWORD: 3,
};

function TelegramConnect({ channelId, onConnected, onDisconnected }) {
  const [status, setStatus] = useState('checking'); // checking, disconnected, connecting, connected
  const [step, setStep] = useState(STEPS.PHONE);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [error, setError] = useState(null);

  // Auth data
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sessionKey, setSessionKey] = useState(null);
  const [hasStoredPhone, setHasStoredPhone] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    replyPolling: { enabled: true, intervalMinutes: 5 },
    autoConvert: { enabled: false },
  });

  useEffect(() => {
    checkStatus();
    fetchChannelSettings();
  }, [channelId]);

  const fetchChannelSettings = async () => {
    try {
      const response = await api.get(`/channels/${channelId}`);
      const channelSettings = response.data.data?.settings || {};
      setSettings({
        replyPolling: {
          enabled: channelSettings.replyPolling?.enabled !== false,
          intervalMinutes: channelSettings.replyPolling?.intervalMinutes || 5,
        },
        autoConvert: {
          enabled: channelSettings.autoConvert?.enabled || false,
        },
      });
    } catch (err) {
      console.error('Failed to fetch channel settings:', err);
    }
  };

  const checkStatus = async (retryCount = 0) => {
    setStatus('checking');
    try {
      const response = await api.get(`/channels/${channelId}/telegram/status`);
      const data = response.data.data;

      // Store whether we have a saved phone number
      setHasStoredPhone(!!data.hasPhoneNumber);

      if (data.status === 'CONNECTED') {
        setStatus('connected');
        setSessionKey(data.sessionKey);
        onConnected?.();
      } else if (data.hasSession && data.hasCredentials && retryCount < 2) {
        // Session exists but not connected - the backend tried to reconnect
        // Give it another try after a short delay
        setStatus('reconnecting');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return checkStatus(retryCount + 1);
      } else {
        setStatus('disconnected');
        // If we have stored phone, we just need to retry reconnect
        // Otherwise show phone input
        setStep(STEPS.PHONE);
      }
    } catch (err) {
      setStatus('disconnected');
      setStep(STEPS.PHONE);
    }
  };

  const handleQuickReconnect = async () => {
    // Try to reconnect using saved credentials (phone already stored in DB)
    setConnecting(true);
    setError(null);

    try {
      // The backend will use stored phoneNumber from credentials
      const response = await api.post(`/channels/${channelId}/telegram/reconnect`);
      const { status: connStatus, sessionKey: key } = response.data.data;

      if (connStatus === 'connected') {
        setSessionKey(key);
        setStatus('connected');
        toast.success('Telegram reconnected successfully');
        onConnected?.();
      } else {
        // Session expired, need to re-authenticate
        setHasStoredPhone(false);
        toast.error('Session expired. Please enter your phone number again.');
      }
    } catch (err) {
      // Fallback to showing phone form
      setHasStoredPhone(false);
      setError(err.response?.data?.error?.message || 'Failed to reconnect. Please enter phone number.');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!phoneNumber) {
      setError('Please enter your phone number');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await api.post(`/channels/${channelId}/telegram/connect`, {
        phoneNumber,
      });

      const { status: connStatus, sessionKey: key, message } = response.data.data;
      setSessionKey(key);

      if (connStatus === 'connected') {
        setStatus('connected');
        toast.success('Telegram connected successfully');
        onConnected?.();
      } else if (connStatus === 'code_required') {
        setStep(STEPS.CODE);
        toast.success(message || 'Verification code sent to your Telegram app');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code) {
      setError('Please enter the verification code');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await api.post(`/channels/${channelId}/telegram/verify-code`, {
        sessionKey,
        code,
      });

      const { status: connStatus, message } = response.data.data;

      if (connStatus === 'connected') {
        setStatus('connected');
        toast.success('Telegram connected successfully');
        onConnected?.();
      } else if (connStatus === 'password_required') {
        setStep(STEPS.PASSWORD);
        toast(message || 'Please enter your 2FA password', { icon: '\uD83D\uDD10' });
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setConnecting(false);
    }
  };

  const handleVerifyPassword = async () => {
    if (!password) {
      setError('Please enter your 2FA password');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await api.post(`/channels/${channelId}/telegram/verify-password`, {
        sessionKey,
        password,
      });

      const { status: connStatus } = response.data.data;

      if (connStatus === 'connected') {
        setStatus('connected');
        toast.success('Telegram connected successfully');
        onConnected?.();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid password');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post(`/channels/${channelId}/telegram/disconnect`);
      setStatus('disconnected');
      setStep(STEPS.PHONE);
      setPhoneNumber('');
      setCode('');
      setPassword('');
      toast.success('Telegram disconnected');
      onDisconnected?.();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!window.confirm('Are you sure you want to delete this Telegram session? You will need to re-authenticate to reconnect.')) {
      return;
    }

    setDeletingSession(true);
    try {
      await api.delete(`/channels/${channelId}/telegram/session`);
      setStatus('disconnected');
      setStep(STEPS.PHONE);
      setPhoneNumber('');
      setCode('');
      setPassword('');
      setSessionKey(null);
      toast.success('Telegram session deleted successfully');
      onDisconnected?.();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete session');
    } finally {
      setDeletingSession(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.patch(`/channels/${channelId}`, { settings });
      toast.success('Settings saved');
      setShowSettings(false);
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  const handleRefresh = () => {
    checkStatus();
  };

  return (
    <Card className="mt-3">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <div>
          <FaTelegram className="text-primary me-2" size={20} />
          <span>Telegram Connection</span>
        </div>
        {status === 'connected' && (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <FaCog className="me-1" /> Settings
          </Button>
        )}
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {(status === 'checking' || status === 'reconnecting') && (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" className="me-2" />
            {status === 'reconnecting' ? 'Reconnecting to Telegram...' : 'Checking connection status...'}
          </div>
        )}

        {status === 'disconnected' && (
          <>
            {step === STEPS.PHONE && (
              <div className="py-3">
                <FaTimesCircle className="text-muted d-block mx-auto mb-3" size={48} />
                <p className="text-muted text-center mb-3">
                  {hasStoredPhone ? 'Telegram needs to reconnect' : 'Telegram is not connected'}
                </p>

                {hasStoredPhone ? (
                  // Quick reconnect - phone already saved
                  <>
                    <Alert variant="info" className="small text-center">
                      Your credentials are saved. Click to reconnect.
                    </Alert>
                    <div className="text-center">
                      <Button
                        variant="primary"
                        onClick={handleQuickReconnect}
                        disabled={connecting}
                      >
                        {connecting ? (
                          <>
                            <Spinner size="sm" className="me-2" />
                            Reconnecting...
                          </>
                        ) : (
                          <>
                            <FaSync className="me-2" />
                            Reconnect
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  // First time or session expired - need phone
                  <>
                    <Alert variant="info" className="small">
                      Enter your phone number to connect Telegram.
                    </Alert>

                    <Form.Group className="mb-3">
                      <Form.Label><FaPhone className="me-1" /> Phone Number</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g., +91XXXXXXXXXX (with country code)"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={connecting}
                      />
                      <Form.Text className="text-muted">
                        Enter the phone number linked to your Telegram account
                      </Form.Text>
                    </Form.Group>

                    <div className="text-center">
                      <Button
                        variant="primary"
                        onClick={handleConnect}
                        disabled={connecting || !phoneNumber}
                      >
                        {connecting ? (
                          <>
                            <Spinner size="sm" className="me-2" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <FaTelegram className="me-2" />
                            Connect Telegram
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === STEPS.CODE && (
              <div className="py-3">
                <Alert variant="info">
                  A verification code has been sent to your Telegram app. Please enter it below.
                </Alert>

                <Form.Group className="mb-3">
                  <Form.Label><FaKey className="me-1" /> Verification Code</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., 12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={connecting}
                    autoFocus
                  />
                </Form.Group>

                <div className="text-center">
                  <Button
                    variant="secondary"
                    className="me-2"
                    onClick={() => setStep(STEPS.PHONE)}
                    disabled={connecting}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleVerifyCode}
                    disabled={connecting || !code}
                  >
                    {connecting ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Code'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {step === STEPS.PASSWORD && (
              <div className="py-3">
                <Alert variant="warning">
                  Your account has two-factor authentication enabled. Please enter your password.
                </Alert>

                <Form.Group className="mb-3">
                  <Form.Label><FaLock className="me-1" /> 2FA Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Enter your 2FA password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={connecting}
                    autoFocus
                  />
                </Form.Group>

                <div className="text-center">
                  <Button
                    variant="secondary"
                    className="me-2"
                    onClick={() => setStep(STEPS.CODE)}
                    disabled={connecting}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleVerifyPassword}
                    disabled={connecting || !password}
                  >
                    {connecting ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Password'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {status === 'connected' && (
          <div className="text-center py-3">
            <FaCheckCircle className="text-success mb-3" size={48} />
            <p className="mb-2">
              <Badge bg="success" className="px-3 py-2">
                <FaTelegram className="me-1" /> Connected
              </Badge>
            </p>

            {showSettings && (
              <div className="text-start border rounded p-3 mt-3 mb-3">
                <h6>Reply Polling Settings</h6>
                <Form.Check
                  type="switch"
                  id="replyPolling"
                  label="Enable reply polling"
                  checked={settings.replyPolling?.enabled !== false}
                  onChange={(e) => setSettings({
                    ...settings,
                    replyPolling: { ...settings.replyPolling, enabled: e.target.checked },
                  })}
                  className="mb-2"
                />
                <Form.Group className="mb-3">
                  <Form.Label>Poll interval (minutes)</Form.Label>
                  <Form.Select
                    value={settings.replyPolling?.intervalMinutes || 5}
                    onChange={(e) => setSettings({
                      ...settings,
                      replyPolling: { ...settings.replyPolling, intervalMinutes: parseInt(e.target.value) },
                    })}
                    disabled={!settings.replyPolling?.enabled}
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </Form.Select>
                </Form.Group>

                <h6>Auto-Convert Settings</h6>
                <Form.Check
                  type="switch"
                  id="autoConvert"
                  label="Auto-convert prospects to leads on reply"
                  checked={settings.autoConvert?.enabled || false}
                  onChange={(e) => setSettings({
                    ...settings,
                    autoConvert: { enabled: e.target.checked },
                  })}
                  className="mb-3"
                />

                <Button variant="primary" size="sm" onClick={handleSaveSettings}>
                  Save Settings
                </Button>
              </div>
            )}

            <div className="d-flex justify-content-center gap-2">
              <Button variant="outline-secondary" size="sm" onClick={handleRefresh} disabled={disconnecting || deletingSession}>
                <FaSync className="me-1" /> Refresh
              </Button>
              <Button variant="outline-danger" size="sm" onClick={handleDisconnect} disabled={disconnecting || deletingSession}>
                {disconnecting ? (
                  <>
                    <Spinner size="sm" className="me-1" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect'
                )}
              </Button>
            </div>
            <p className="text-muted small mt-2 mb-0">
              Disconnect closes the connection but keeps the session for auto-reconnect.
            </p>
            <div className="mt-3 pt-2 border-top">
              <Button
                variant="link"
                size="sm"
                className="text-danger p-0"
                onClick={handleDeleteSession}
                disabled={disconnecting || deletingSession}
              >
                {deletingSession ? (
                  <>
                    <Spinner size="sm" className="me-1" />
                    Deleting Session...
                  </>
                ) : (
                  <>
                    <FaTrash className="me-1" />
                    Delete Session
                  </>
                )}
              </Button>
              <p className="text-muted small mt-1 mb-0">
                Permanently removes session. You must re-authenticate to reconnect.
              </p>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default TelegramConnect;
