import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Dropdown } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaTelegram, FaWhatsapp, FaPlus, FaEye, FaTrash, FaUsers, FaSync, FaEllipsisV } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ProspectImportModal from '../../components/prospects/ProspectImportModal';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  PENDING: 'secondary',
  MESSAGED: 'info',
  REPLIED: 'success',
  CONVERTED: 'primary',
};

function ProspectGroupList() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pollingGroup, setPollingGroup] = useState(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      // Fetch both Telegram and WhatsApp prospect groups
      const [telegramResponse, whatsappResponse] = await Promise.all([
        api.get('/telegram-prospects/groups'),
        api.get('/whatsapp-prospects/groups'),
      ]);

      // Add type to each group for identification
      const telegramGroups = telegramResponse.data.data.map((g) => ({
        ...g,
        type: 'telegram',
        sourceName: g.telegramGroupName,
      }));

      const whatsappGroups = whatsappResponse.data.data.map((g) => ({
        ...g,
        type: 'whatsapp',
        sourceName: g.whatsappGroupName,
      }));

      // Combine and sort by creation date
      const allGroups = [...telegramGroups, ...whatsappGroups].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setGroups(allGroups);
    } catch (error) {
      console.error('Failed to fetch prospect groups:', error);
      toast.error('Failed to load prospect groups');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (group) => {
    if (!window.confirm(`Are you sure you want to delete "${group.name}" and all its prospects?`)) {
      return;
    }

    try {
      const endpoint =
        group.type === 'telegram'
          ? `/telegram-prospects/groups/${group.id}`
          : `/whatsapp-prospects/groups/${group.id}`;

      await api.delete(endpoint);
      toast.success('Prospect group deleted');
      fetchGroups();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete group');
    }
  };

  const handlePollReplies = async (group) => {
    setPollingGroup(group.id);
    try {
      const endpoint =
        group.type === 'telegram' ? '/telegram-prospects/poll-replies' : '/whatsapp-prospects/poll-replies';

      const response = await api.post(endpoint, {
        channelConfigId: group.channelConfigId,
      });

      const { repliesFound, message } = response.data.data;

      if (message) {
        // WhatsApp returns a message about limited support
        toast(message, { icon: '\u2139\uFE0F', duration: 5000 });
      } else if (repliesFound > 0) {
        toast.success(`Found ${repliesFound} new replies!`);
        fetchGroups();
      } else {
        toast('No new replies found', { icon: '\u2139\uFE0F' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to poll replies');
    } finally {
      setPollingGroup(null);
    }
  };

  const getTypeIcon = (type) => {
    return type === 'telegram' ? (
      <FaTelegram className="me-1 text-primary" />
    ) : (
      <FaWhatsapp className="me-1 text-success" />
    );
  };

  const getTypeBadge = (type) => {
    return type === 'telegram' ? (
      <Badge bg="primary">Telegram</Badge>
    ) : (
      <Badge bg="success">WhatsApp</Badge>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">
            <FaUsers className="me-2" />
            Prospects
          </h2>
          <p className="text-muted mb-0">
            Import contacts from Telegram or WhatsApp groups, send messages, and convert engaged prospects to leads.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowImportModal(true)}>
          <FaPlus className="me-2" />
          Import Prospects
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <FaUsers className="text-muted mb-3" size={48} />
            <h5>No prospect groups yet</h5>
            <p className="text-muted">
              Import contacts from your Telegram or WhatsApp groups to start reaching out to prospects.
            </p>
            <Button variant="primary" onClick={() => setShowImportModal(true)}>
              <FaPlus className="me-2" />
              Import Your First Prospects
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="p-0">
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th>Group Name</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Channel</th>
                  <th>Prospects</th>
                  <th>Status Breakdown</th>
                  <th>Created</th>
                  <th style={{ width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.type}-${group.id}`}>
                    <td>
                      <Link
                        to={`/prospects/${group.type}/${group.id}`}
                        className="fw-bold text-decoration-none"
                      >
                        {group.name}
                      </Link>
                    </td>
                    <td>{getTypeBadge(group.type)}</td>
                    <td>
                      <small className="text-muted">
                        {getTypeIcon(group.type)}
                        {group.sourceName || 'Unknown'}
                      </small>
                    </td>
                    <td>
                      <small>{group.channelConfig?.name || '-'}</small>
                    </td>
                    <td>
                      <Badge bg="secondary">{group.prospectCount}</Badge>
                    </td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        {group.stats?.pending > 0 && (
                          <Badge bg={STATUS_COLORS.PENDING} title="Pending">
                            {group.stats.pending} Pending
                          </Badge>
                        )}
                        {group.stats?.messaged > 0 && (
                          <Badge bg={STATUS_COLORS.MESSAGED} title="Messaged">
                            {group.stats.messaged} Messaged
                          </Badge>
                        )}
                        {group.stats?.replied > 0 && (
                          <Badge bg={STATUS_COLORS.REPLIED} title="Replied">
                            {group.stats.replied} Replied
                          </Badge>
                        )}
                        {group.stats?.converted > 0 && (
                          <Badge bg={STATUS_COLORS.CONVERTED} title="Converted">
                            {group.stats.converted} Converted
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <small className="text-muted">
                        {new Date(group.createdAt).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      <Dropdown align="end">
                        <Dropdown.Toggle
                          variant="link"
                          className="text-muted p-0"
                          id={`dropdown-${group.type}-${group.id}`}
                        >
                          <FaEllipsisV />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                          <Dropdown.Item as={Link} to={`/prospects/${group.type}/${group.id}`}>
                            <FaEye className="me-2" /> View Prospects
                          </Dropdown.Item>
                          <Dropdown.Item
                            onClick={() => handlePollReplies(group)}
                            disabled={pollingGroup === group.id}
                          >
                            <FaSync className={`me-2 ${pollingGroup === group.id ? 'fa-spin' : ''}`} />
                            {pollingGroup === group.id ? 'Checking...' : 'Check for Replies'}
                          </Dropdown.Item>
                          <Dropdown.Divider />
                          <Dropdown.Item className="text-danger" onClick={() => handleDelete(group)}>
                            <FaTrash className="me-2" /> Delete Group
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      <ProspectImportModal
        show={showImportModal}
        onHide={() => setShowImportModal(false)}
        onSuccess={() => {
          setShowImportModal(false);
          fetchGroups();
        }}
      />
    </div>
  );
}

export default ProspectGroupList;
