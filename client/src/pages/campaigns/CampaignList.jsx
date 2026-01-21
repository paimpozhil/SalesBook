import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaBullhorn, FaPlay, FaPause } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
};

function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await api.get('/campaigns');
      setCampaigns(response.data.data);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Campaigns</h1>
        <Button variant="primary">
          <FaPlus className="me-2" />
          Create Campaign
        </Button>
      </div>

      <Card>
        {campaigns.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaBullhorn size={48} className="text-muted mb-3" />
            <h5>No campaigns yet</h5>
            <p className="text-muted">Create your first outreach campaign to start engaging with leads.</p>
            <Button variant="primary">Create Campaign</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Recipients</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <strong>{campaign.name}</strong>
                  </td>
                  <td>{campaign.type}</td>
                  <td>
                    <Badge bg={STATUS_COLORS[campaign.status]}>
                      {campaign.status}
                    </Badge>
                  </td>
                  <td>{campaign._count?.steps || 0}</td>
                  <td>{campaign._count?.recipients || 0}</td>
                  <td>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                  <td>
                    {campaign.status === 'DRAFT' && (
                      <Button variant="outline-success" size="sm" className="me-1">
                        <FaPlay />
                      </Button>
                    )}
                    {campaign.status === 'ACTIVE' && (
                      <Button variant="outline-warning" size="sm">
                        <FaPause />
                      </Button>
                    )}
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

export default CampaignList;
