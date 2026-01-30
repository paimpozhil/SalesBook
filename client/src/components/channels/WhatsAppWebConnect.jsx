import { useState, useEffect, useRef } from 'react';
import { Button, Badge, Spinner, Alert, Card } from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { FaWhatsapp, FaQrcode, FaCheckCircle, FaTimesCircle, FaSync, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * WhatsApp Web connection component
 * Handles QR code display and connection status for WhatsApp Web channels
 */
function WhatsAppWebConnect({ channelId, onConnected, onDisconnected }) {
  const [status, setStatus] = useState('checking'); // checking, disconnected, awaiting_scan, connected
  const [qrCode, setQrCode] = useState(null);
  const [qrImage, setQrImage] = useState(null); // Base64 image for headless mode
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const pollInterval = useRef(null);

  // Check connection status on mount
  useEffect(() => {
    checkStatus();
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [channelId]);

  const checkStatus = async () => {
    try {
      const response = await api.get(`/channels/${channelId}/whatsapp-web/status`);
      const { status: connStatus, profile: connProfile } = response.data.data;

      if (connStatus === 'CONNECTED') {
        setStatus('connected');
        setProfile(connProfile);
        setQrCode(null);
        setQrImage(null);
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
        }
        onConnected?.();
      } else {
        setStatus('disconnected');
        setProfile(null);
      }
    } catch (err) {
      // Silently set to disconnected - don't show error as this is normal
      setStatus('disconnected');
      setProfile(null);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    setQrCode(null);
    setQrImage(null);

    try {
      const response = await api.post(`/channels/${channelId}/whatsapp-web/connect`);
      const { status: connStatus, qr, qrImage: capturedQrImage, message, profile: connProfile } = response.data.data;

      if (connStatus === 'connected') {
        setStatus('connected');
        setProfile(connProfile);
        toast.success('WhatsApp Web connected successfully');
        onConnected?.();
      } else if (connStatus === 'awaiting_scan') {
        setStatus('awaiting_scan');
        setQrCode(qr);
        setQrImage(capturedQrImage); // Captured QR image for headless mode
        toast.success('QR code ready - scan with your phone');
        // Start polling for status
        startPolling();
      } else {
        setError(message || 'Failed to initialize connection');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to connect WhatsApp Web');
      toast.error('Failed to connect WhatsApp Web');
    } finally {
      setConnecting(false);
    }
  };

  const startPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }

    pollInterval.current = setInterval(async () => {
      try {
        const response = await api.get(`/channels/${channelId}/whatsapp-web/status`);
        const { status: connStatus, profile: connProfile } = response.data.data;

        if (connStatus === 'CONNECTED') {
          setStatus('connected');
          setProfile(connProfile);
          setQrCode(null);
          setQrImage(null);
          clearInterval(pollInterval.current);
          pollInterval.current = null;
          toast.success('WhatsApp Web connected!');
          onConnected?.();
        }
      } catch (err) {
        // Keep polling on error
      }
    }, 3000);

    // Stop polling after 2 minutes (QR codes expire)
    setTimeout(() => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
        if (status === 'awaiting_scan') {
          setError('QR code expired. Please try again.');
          setStatus('disconnected');
          setQrCode(null);
          setQrImage(null);
        }
      }
    }, 120000);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post(`/channels/${channelId}/whatsapp-web/disconnect`);
      setStatus('disconnected');
      setProfile(null);
      setQrCode(null);
      setQrImage(null);
      toast.success('WhatsApp Web disconnected');
      onDisconnected?.();
    } catch (err) {
      console.error('WhatsApp disconnect error:', err);
      toast.error(err.response?.data?.error?.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!window.confirm('Are you sure you want to delete this WhatsApp session? You will need to scan the QR code again to reconnect.')) {
      return;
    }

    setDeletingSession(true);
    try {
      await api.delete(`/channels/${channelId}/whatsapp-web/session`);
      setStatus('disconnected');
      setProfile(null);
      setQrCode(null);
      setQrImage(null);
      toast.success('WhatsApp session deleted successfully');
      onDisconnected?.();
    } catch (err) {
      console.error('WhatsApp delete session error:', err);
      toast.error(err.response?.data?.error?.message || 'Failed to delete session');
    } finally {
      setDeletingSession(false);
    }
  };

  const handleRefresh = () => {
    setStatus('checking');
    checkStatus();
  };

  return (
    <Card className="mt-3">
      <Card.Header className="d-flex align-items-center">
        <FaWhatsapp className="text-success me-2" size={20} />
        <span>WhatsApp Web Connection</span>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {status === 'checking' && (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" className="me-2" />
            Checking connection status...
          </div>
        )}

        {status === 'disconnected' && (
          <div className="text-center py-3">
            <FaTimesCircle className="text-muted mb-3" size={48} />
            <p className="text-muted mb-3">WhatsApp Web is not connected</p>
            <Button
              variant="success"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Opening Browser...
                </>
              ) : (
                <>
                  <FaQrcode className="me-2" />
                  Connect WhatsApp
                </>
              )}
            </Button>
            <p className="text-muted small mt-3">
              This will open a browser window for QR code scanning
            </p>
          </div>
        )}

        {status === 'awaiting_scan' && (qrCode || qrImage) && (
          <div className="text-center py-3">
            <h6 className="mb-3">Scan this QR code with WhatsApp</h6>
            <div className="d-inline-block p-3 bg-white rounded shadow-sm mb-3">
              {qrImage ? (
                // Display captured QR image (for headless mode / production)
                <img
                  src={qrImage}
                  alt="WhatsApp QR Code"
                  style={{ width: 256, height: 256 }}
                />
              ) : qrCode ? (
                // Fall back to QRCodeSVG (for non-headless mode)
                <QRCodeSVG value={qrCode} size={256} level="M" />
              ) : null}
            </div>
            <p className="text-muted small">
              Open WhatsApp on your phone &rarr; Menu &rarr; Linked Devices &rarr; Link a Device
            </p>
            <div className="mt-3">
              <Spinner animation="border" size="sm" className="me-2" />
              Waiting for scan...
            </div>
          </div>
        )}

        {status === 'connected' && (
          <div className="text-center py-3">
            <FaCheckCircle className="text-success mb-3" size={48} />
            <p className="mb-2">
              <Badge bg="success" className="px-3 py-2">
                <FaWhatsapp className="me-1" /> Connected
              </Badge>
            </p>
            {profile && (
              <div className="text-muted small mb-3">
                <p className="mb-1">
                  <strong>Phone:</strong> +{profile.phoneNumber}
                </p>
                {profile.name && (
                  <p className="mb-1">
                    <strong>Name:</strong> {profile.name}
                  </p>
                )}
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
              Disconnect closes the browser but keeps session. Campaigns can auto-reconnect.
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
                Permanently removes session. You must scan QR again. Stops all campaigns.
              </p>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default WhatsAppWebConnect;
