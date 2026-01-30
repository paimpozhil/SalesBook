import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Dropdown, ButtonGroup } from 'react-bootstrap';
import { FaPlus, FaDatabase, FaTrash, FaFileAlt, FaFileCode, FaTelegram } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AddDataSourceModal from '../../components/data-sources/AddDataSourceModal';
import TelegramImportModal from '../../components/data-sources/TelegramImportModal';

const TYPE_COLORS = {
  PLAYWRIGHT: 'primary',
  API: 'success',
  RSS: 'info',
  MANUAL: 'secondary',
  JSON: 'warning',
  CSV: 'dark',
};

const TYPE_ICONS = {
  JSON: <FaFileCode className="me-1" />,
  CSV: <FaFileAlt className="me-1" />,
};

const STATUS_COLORS = {
  SUCCESS: 'success',
  FAILED: 'danger',
  RUNNING: 'warning',
  PENDING: 'secondary',
};

function DataSourceList() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await api.get('/data-sources');
      setSources(response.data.data);
    } catch (error) {
      console.error('Failed to fetch sources:', error);
      toast.error('Failed to load data sources');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await api.delete(`/data-sources/${id}`);
      toast.success('Data source deleted');
      fetchSources();
    } catch (error) {
      console.error('Failed to delete source:', error);
      toast.error('Failed to delete data source');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Data Sources</h1>
        <Dropdown as={ButtonGroup}>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            <FaPlus className="me-2" />
            Import Data
          </Button>
          <Dropdown.Toggle split variant="primary" />
          <Dropdown.Menu align="end">
            <Dropdown.Item onClick={() => setShowAddModal(true)}>
              <FaFileCode className="me-2" />
              Import from JSON
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setShowTelegramModal(true)}>
              <FaTelegram className="me-2" />
              Import from Telegram
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <Card>
        {sources.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaDatabase size={48} className="text-muted mb-3" />
            <h5>No data sources yet</h5>
            <p className="text-muted">Import leads from JSON or CSV files to get started.</p>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              Import Data
            </Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>File / Source</th>
                <th>Records</th>
                <th>Leads</th>
                <th>Uploaded By</th>
                <th>Imported</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                  </td>
                  <td>
                    <Badge bg={TYPE_COLORS[source.type]}>
                      {TYPE_ICONS[source.type]}
                      {source.type}
                    </Badge>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: '200px' }}>
                    {source.fileName ? (
                      <span className="text-muted" title={source.fileName}>
                        {source.fileName}
                        {source.fileSize && (
                          <span className="ms-1 small">({formatFileSize(source.fileSize)})</span>
                        )}
                      </span>
                    ) : source.url ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.url}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{source.recordCount || '-'}</td>
                  <td>{source._count?.leads || 0}</td>
                  <td>{source.createdBy?.name || '-'}</td>
                  <td>
                    {source.lastRunAt
                      ? new Date(source.lastRunAt).toLocaleDateString()
                      : source.createdAt
                        ? new Date(source.createdAt).toLocaleDateString()
                        : '-'}
                  </td>
                  <td>
                    {source.lastStatus ? (
                      <Badge bg={STATUS_COLORS[source.lastStatus]}>
                        {source.lastStatus}
                      </Badge>
                    ) : (
                      <Badge bg="secondary">-</Badge>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title="Delete"
                      onClick={() => handleDelete(source.id, source.name)}
                    >
                      <FaTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <AddDataSourceModal
        show={showAddModal}
        onHide={() => setShowAddModal(false)}
        onSuccess={fetchSources}
      />

      <TelegramImportModal
        show={showTelegramModal}
        onHide={() => setShowTelegramModal(false)}
        onSuccess={fetchSources}
      />
    </div>
  );
}

export default DataSourceList;
