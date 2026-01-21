import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge } from 'react-bootstrap';
import { FaPlus, FaDatabase, FaPlay, FaEdit, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const TYPE_COLORS = {
  PLAYWRIGHT: 'primary',
  API: 'success',
  RSS: 'info',
  MANUAL: 'secondary',
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

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await api.get('/data-sources');
      setSources(response.data.data);
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (id) => {
    try {
      await api.post(`/data-sources/${id}/run`);
      toast.success('Scrape job queued');
      fetchSources();
    } catch (error) {
      console.error('Failed to trigger run:', error);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Data Sources</h1>
        <Button variant="primary">
          <FaPlus className="me-2" />
          Add Source
        </Button>
      </div>

      <Card>
        {sources.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaDatabase size={48} className="text-muted mb-3" />
            <h5>No data sources configured</h5>
            <p className="text-muted">Set up scrapers, APIs, or RSS feeds to automatically collect leads.</p>
            <Button variant="primary">Add Data Source</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>URL</th>
                <th>Last Run</th>
                <th>Status</th>
                <th>Leads</th>
                <th>Active</th>
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
                      {source.type}
                    </Badge>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: '200px' }}>
                    {source.url}
                  </td>
                  <td>
                    {source.lastRunAt
                      ? new Date(source.lastRunAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    {source.lastStatus && (
                      <Badge bg={STATUS_COLORS[source.lastStatus]}>
                        {source.lastStatus}
                      </Badge>
                    )}
                  </td>
                  <td>{source._count?.leads || 0}</td>
                  <td>
                    <Badge bg={source.isActive ? 'success' : 'secondary'}>
                      {source.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="outline-success"
                      size="sm"
                      className="me-1"
                      onClick={() => handleRun(source.id)}
                      title="Run now"
                    >
                      <FaPlay />
                    </Button>
                    <Button variant="outline-primary" size="sm" className="me-1">
                      <FaEdit />
                    </Button>
                    <Button variant="outline-danger" size="sm">
                      <FaTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default DataSourceList;
